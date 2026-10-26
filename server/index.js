import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { GRADES, SECTIONS, conflictingRequests, validateRequest } from '../src/lib/reservations.js'
import { formatLongDate, isPastEnd, parseISODate, rangesOverlap, toMinutes } from '../src/lib/time.js'
import { config } from './config.js'
import { campusRouter, ensureCampus } from './campus.js'
import { initDb, mapNotification, mapRequest, mapUser, pool, resetAndSeed } from './db.js'

const app = express()
const frontendDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
app.use(cors())
app.use(express.json())
app.use(campusRouter())

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ ok: true, database: config.db.database })
}))

app.get('/api/public/today', wrap(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT grade, section, start_time, end_time, status, date
     FROM requests
     WHERE date = CURDATE() AND status IN ('pending', 'approved')
     ORDER BY start_time`,
  )
  res.json({
    ok: true,
    items: rows.map((row) => ({
      date: String(row.date).slice(0, 10),
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
      grade: row.grade,
      section: row.section,
      status: row.status,
    })),
  })
}))

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const dni = String(req.body.dni || '').trim()
  if (!email || !dni) {
    return res.status(400).json({ ok: false, error: 'Ingresa tu correo y DNI.' })
  }
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email])
  const user = rows[0]
  const validCredential = user && (user.dni
    ? /^\d{8}$/.test(dni) && user.dni === dni
    : bcrypt.compareSync(dni, user.password_hash))
  if (!validCredential) {
    return res.status(401).json({ ok: false, error: 'Correo o DNI incorrectos.' })
  }
  if (!user.active) {
    return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada. Escribe a coordinación.' })
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' })
  res.json({ ok: true, token, user: mapUser(user) })
}))

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ?', [req.user.id])
  res.json({ ok: true, user: rows[0] ? mapUser(rows[0]) : req.user })
}))

app.get('/api/profile', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ?', [req.user.id])
  if (!rows[0]) return res.status(404).json({ ok: false, error: 'No se encontró el perfil.' })
  res.json({ ok: true, user: mapUser(rows[0]) })
}))

app.patch('/api/profile', requireAuth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const dni = String(req.body.dni || '').trim()
  if (name.length < 5) return res.status(400).json({ ok: false, error: 'Escribe nombre y apellido.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'El correo no es válido.' })
  }
  if (!/^\d{8}$/.test(dni)) {
    return res.status(400).json({ ok: false, error: 'El DNI debe tener exactamente 8 dígitos.' })
  }
  const [duplicateEmail] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id])
  if (duplicateEmail.length) return res.status(409).json({ ok: false, error: 'Ese correo ya está registrado.' })
  const [duplicateDni] = await pool.query('SELECT id FROM users WHERE dni = ? AND id <> ?', [dni, req.user.id])
  if (duplicateDni.length) return res.status(409).json({ ok: false, error: 'Ese DNI ya está asociado a otra cuenta.' })
  await pool.query('UPDATE users SET name = ?, email = ?, dni = ? WHERE id = ?', [name, email, dni, req.user.id])
  const [rows] = await pool.query('SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ?', [req.user.id])
  res.json({ ok: true, user: mapUser(rows[0]) })
}))

app.get('/api/bootstrap', requireAuth, wrap(async (req, res) => {
  const [users, requests, notifications] = await Promise.all([
    pool.query(`SELECT id, name, email, ${req.user.role === 'admin' ? 'dni, ' : ''}role, subject, active FROM users ORDER BY role DESC, name`),
    loadRequests(req.user),
    pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30',
      [req.user.id],
    ),
  ])
  res.json({
    ok: true,
    users: users[0].map(mapUser),
    requests,
    notifications: notifications[0].map(mapNotification),
  })
}))

app.post('/api/requests', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ ok: false, error: 'Tu cuenta no puede enviar solicitudes.' })
  }
  const input = normalizeInput(req.body)
  if (!GRADES.includes(input.grade) || !SECTIONS.includes(input.section)) {
    return res.status(400).json({ ok: false, error: 'Grado o grupo no válido.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const roomId = await resolveRoomId(input.roomId)
    input.roomId = roomId
    const [locked] = await connection.query(
      `SELECT * FROM requests WHERE date = ? AND room_id = ? AND status IN ('pending', 'approved') FOR UPDATE`,
      [input.date, roomId],
    )
    const [mine] = await connection.query(
      `SELECT * FROM requests WHERE teacher_id = ? AND date = ? AND status IN ('pending', 'approved')`,
      [req.user.id, input.date],
    )
    const visible = uniqueRows([...locked, ...mine]).map(mapRequest)
    const check = validateRequest(visible, input, { teacherId: req.user.id })
    const blocked = await fixedHits(connection, { date: input.date, startTime: input.startTime, endTime: input.endTime, roomId })
    if (!check.ok || blocked.length) {
      await connection.rollback()
      return res.status(400).json({
        ok: false,
        error: blocked.length
          ? `Ese horario ya está ocupado por el horario fijo de ${blocked[0].teacher_name}.`
          : firstError(check.errors),
        errors: check.errors,
        conflicts: check.conflicts,
      })
    }
    const [created] = await connection.query(
      `INSERT INTO requests
        (teacher_id, room_id, date, start_time, end_time, grade, section, students, purpose, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, roomId, input.date, input.startTime, input.endTime, input.grade, input.section, Number(input.students), input.purpose.trim(), (input.notes || '').trim()],
    )
    const when = `${formatLongDate(input.date)}, ${input.startTime}–${input.endTime}`
    await notify(connection, await adminIds(connection), {
      title: 'Nueva solicitud',
      body: `${req.user.name} pidió la sala el ${when}, ${input.grade} ${input.section}.`,
      href: '/admin/solicitudes',
    })
    await connection.commit()
    const request = await findRequest(created.insertId)
    res.status(201).json({ ok: true, request })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

app.post('/api/requests/:id/cancel', requireAuth, wrap(async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT * FROM requests WHERE id = ? FOR UPDATE', [req.params.id])
    const current = rows[0] ? mapRequest(rows[0]) : null
    if (!current) {
      await connection.rollback()
      return res.status(404).json({ ok: false, error: 'La solicitud ya no existe.' })
    }
    const isAdmin = req.user.role === 'admin'
    if (!isAdmin && current.teacherId !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({ ok: false, error: 'Solo puedes cancelar tus solicitudes.' })
    }
    if (current.status !== 'pending' && current.status !== 'approved') {
      await connection.rollback()
      return res.status(400).json({ ok: false, error: 'Esta solicitud ya no se puede cancelar.' })
    }
    if (current.status === 'approved' && isPastEnd(current.date, current.endTime)) {
      await connection.rollback()
      return res.status(400).json({ ok: false, error: 'La clase ya finalizó.' })
    }
    await connection.query(
      `UPDATE requests SET status = 'cancelled', decided_at = NOW() WHERE id = ?`,
      [current.id],
    )
    const when = `${formatLongDate(current.date)}, ${current.startTime}–${current.endTime}`
    if (isAdmin) {
      await notify(connection, [current.teacherId], {
        title: 'Horario liberado',
        body: `Coordinación canceló la reserva del ${when}.`,
        href: '/panel/solicitudes',
      })
    } else {
      await notify(connection, await adminIds(connection), {
        title: 'Solicitud cancelada',
        body: `${req.user.name} canceló el ${when}. El horario quedó libre.`,
        href: '/admin/solicitudes',
      })
    }
    await connection.commit()
    res.json({ ok: true })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

app.post('/api/requests/:id/decide', requireAuth, requireAdmin, wrap(async (req, res) => {
  const status = req.body.status
  const adminNote = String(req.body.adminNote || '').trim()
  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ ok: false, error: 'Decisión no válida.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT * FROM requests WHERE id = ? FOR UPDATE', [req.params.id])
    const current = rows[0] ? mapRequest(rows[0]) : null
    if (!current || current.status !== 'pending') {
      await connection.rollback()
      return res.status(400).json({ ok: false, error: 'Esta solicitud ya fue resuelta.' })
    }
    if (status === 'rejected' && !adminNote) {
      await connection.rollback()
      return res.status(400).json({ ok: false, error: 'Escribe el motivo del rechazo.' })
    }
    if (status === 'approved') {
      if (isPastEnd(current.date, current.endTime)) {
        await connection.rollback()
        return res.status(400).json({ ok: false, error: 'Ese horario ya pasó. Rechaza la solicitud.' })
      }
      const [locked] = await connection.query(
        `SELECT * FROM requests WHERE date = ? AND room_id = ? AND status IN ('pending', 'approved') FOR UPDATE`,
        [current.date, current.roomId],
      )
      const conflicts = conflictingRequests(locked.map(mapRequest), {
        date: current.date,
        start: current.startTime,
        end: current.endTime,
        ignoreId: current.id,
        roomId: current.roomId,
      })
      const blocked = await fixedHits(connection, {
        date: current.date,
        startTime: current.startTime,
        endTime: current.endTime,
        roomId: current.roomId,
      })
      if (blocked.length) {
        await connection.rollback()
        return res.status(409).json({
          ok: false,
          error: `Ese horario pertenece al horario fijo de ${blocked[0].teacher_name}.`,
        })
      }
      if (conflicts.length) {
        await connection.rollback()
        return res.status(409).json({
          ok: false,
          error: 'El horario se cruza con otra solicitud activa.',
          conflicts,
        })
      }
    }
    await connection.query(
      'UPDATE requests SET status = ?, admin_note = ?, decided_at = NOW() WHERE id = ?',
      [status, adminNote, current.id],
    )
    const when = `${formatLongDate(current.date)}, ${current.startTime}–${current.endTime}`
    await notify(connection, [current.teacherId], {
      title: status === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      body: status === 'approved'
        ? `Tu clase del ${when} quedó confirmada.`
        : `Tu pedido del ${when} fue rechazado. ${adminNote}`,
      href: '/panel/solicitudes',
    })
    await connection.commit()
    res.json({ ok: true })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

app.post('/api/users', requireAuth, requireAdmin, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const dni = String(req.body.dni || '').trim()
  const role = String(req.body.role || 'teacher')
  const subject = String(req.body.subject || (role === 'admin' ? 'Coordinación académica' : '')).trim()
  if (!['admin', 'teacher'].includes(role)) return res.status(400).json({ ok: false, error: 'El rol seleccionado no es válido.' })
  if (name.length < 5) return res.status(400).json({ ok: false, error: 'Escribe nombre y apellido.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'El correo no es válido.' })
  if (role === 'teacher' && subject.length < 3) return res.status(400).json({ ok: false, error: 'Indica el área o asignatura.' })
  if (!/^\d{8}$/.test(dni)) return res.status(400).json({ ok: false, error: 'El DNI debe tener exactamente 8 dígitos.' })
  const [dup] = await pool.query('SELECT id, email, dni FROM users WHERE email = ? OR dni = ?', [email, dni])
  if (dup.some((item) => item.email === email)) return res.status(409).json({ ok: false, error: 'Ese correo ya está registrado.' })
  if (dup.some((item) => item.dni === dni)) return res.status(409).json({ ok: false, error: 'Ese DNI ya está asociado a otra cuenta.' })
  const [created] = await pool.query(
    'INSERT INTO users (name, email, dni, password_hash, role, subject) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, dni, bcrypt.hashSync(randomBytes(32).toString('hex'), 10), role, subject],
  )
  const [rows] = await pool.query('SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ?', [created.insertId])
  const user = mapUser(rows[0])
  res.status(201).json({ ok: true, user, ...(role === 'teacher' ? { teacher: user } : {}) })
}))

app.patch('/api/users/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const subject = String(req.body.subject || '').trim()
  const dni = String(req.body.dni || '').trim()
  if (name.length < 5) return res.status(400).json({ ok: false, error: 'Escribe nombre y apellido.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'El correo no es válido.' })
  if (!/^\d{8}$/.test(dni)) return res.status(400).json({ ok: false, error: 'El DNI debe tener exactamente 8 dígitos.' })
  const [targets] = await pool.query('SELECT id, role FROM users WHERE id = ?', [req.params.id])
  const target = targets[0]
  if (!target) return res.status(404).json({ ok: false, error: 'El usuario no existe.' })
  if (target.role === 'teacher' && subject.length < 3) {
    return res.status(400).json({ ok: false, error: 'Indica el área o asignatura.' })
  }
  const [duplicateEmail] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.params.id])
  if (duplicateEmail.length) return res.status(409).json({ ok: false, error: 'Ese correo ya está registrado.' })
  const [duplicate] = await pool.query('SELECT id FROM users WHERE dni = ? AND id <> ?', [dni, req.params.id])
  if (duplicate.length) return res.status(409).json({ ok: false, error: 'Ese DNI ya está asociado a otra cuenta.' })
  const [result] = await pool.query(
    `UPDATE users SET name = ?, email = ?, subject = ?, dni = ? WHERE id = ?`,
    [name, email, target.role === 'teacher' ? subject : 'Coordinación académica', dni, req.params.id],
  )
  if (!result.affectedRows) {
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, error: 'El usuario no existe.' })
  }
  const [rows] = await pool.query('SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ?', [req.params.id])
  res.json({ ok: true, user: mapUser(rows[0]) })
}))

app.post('/api/users/:id/active', requireAuth, requireAdmin, wrap(async (req, res) => {
  const active = req.body.active ? 1 : 0
  const [result] = await pool.query(
    `UPDATE users SET active = ? WHERE id = ? AND role = 'teacher'`,
    [active, req.params.id],
  )
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Profesor no encontrado.' })
  res.json({ ok: true })
}))

app.delete('/api/users/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propia cuenta.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [users] = await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.params.id])
    if (!users.length) {
      await connection.rollback()
      return res.status(404).json({ ok: false, error: 'El usuario no existe.' })
    }
    const [references] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM requests WHERE teacher_id = ?) AS requests,
         (SELECT COUNT(*) FROM fixed_schedules WHERE teacher_id = ?) AS schedules`,
      [req.params.id, req.params.id],
    )
    if (Number(references[0].requests) > 0 || Number(references[0].schedules) > 0) {
      await connection.rollback()
      return res.status(409).json({
        ok: false,
        error: 'No se puede eliminar: el usuario tiene solicitudes u horarios fijos asociados. Desactiva la cuenta para conservar el historial.',
      })
    }
    await connection.query('UPDATE equipment SET responsible_id = NULL WHERE responsible_id = ?', [req.params.id])
    await connection.query('UPDATE maintenance SET responsible_id = NULL WHERE responsible_id = ?', [req.params.id])
    await connection.query('UPDATE incidents SET assignee_id = NULL WHERE assignee_id = ?', [req.params.id])
    await connection.query('DELETE FROM users WHERE id = ?', [req.params.id])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  res.json({ ok: true })
}))

app.post('/api/notifications/read', requireAuth, wrap(async (req, res) => {
  if (req.body.all) {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id])
  } else {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?',
      [req.body.id, req.user.id],
    )
  }
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30',
    [req.user.id],
  )
  res.json({ ok: true, notifications: rows.map(mapNotification) })
}))

app.post('/api/demo/reset', requireAuth, requireAdmin, wrap(async (_req, res) => {
  await resetAndSeed()
  await ensureCampus()
  res.json({ ok: true })
}))

app.use(express.static(frontendDirectory))
app.use((req, res, next) => {
  if (
    req.method !== 'GET'
    || req.path === '/api'
    || req.path.startsWith('/api/')
    || !req.accepts('html')
  ) {
    return next()
  }
  res.sendFile('index.html', { root: frontendDirectory }, next)
})

app.use((error, _req, res, _next) => {
  console.error(error)
  const connectionError = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'PROTOCOL_CONNECTION_LOST',
  ].includes(error?.code)
  res.status(500).json({
    ok: false,
    error: connectionError
      ? 'No hay conexión con el servidor MySQL configurado. Verifica el host, el puerto y el acceso de red.'
      : 'No se pudo completar la operación.',
  })
})

initDb()
  .then(async () => {
    await ensureCampus()
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`API de Nodo escuchando en el puerto ${config.port}`)
      console.log(`Base de datos ${config.db.database} en ${config.db.host}:${config.db.port}`)
    })
  })
  .catch((error) => {
    console.error('No se pudo preparar MySQL.')
    console.error(`Código del error: ${error.code || 'sin código'}`)
    if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'].includes(error.code)) {
      console.error('Verifica DB_HOST, DB_PORT y que el servicio MySQL permita conexiones desde esta aplicación.')
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('La base de datos indicada por DB_NAME no existe en ese servidor.')
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Verifica DB_USER y DB_PASSWORD en las variables de entorno del servicio.')
    } else {
      console.error('Verifica las credenciales y permisos de la base de datos configurada.')
    }
    process.exit(1)
  })

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const [rows] = await pool.query(
      'SELECT id, name, email, dni, role, subject, active FROM users WHERE id = ? AND active = 1',
      [payload.sub],
    )
    if (!rows[0]) return res.status(401).json({ ok: false, error: 'Tu sesión ya no es válida.' })
    req.user = mapUser(rows[0])
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'Inicia sesión de nuevo.' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Solo coordinación puede hacer esto.' })
  next()
}

async function loadRequests(user) {
  const sql = `SELECT r.*, rooms.name AS room_name
    FROM requests r LEFT JOIN rooms ON rooms.id = r.room_id`
  const [rows] = user.role === 'admin'
    ? await pool.query(`${sql} ORDER BY r.date, r.start_time`)
    : await pool.query(
      `${sql} WHERE r.status IN ('pending', 'approved') OR r.teacher_id = ? ORDER BY r.date, r.start_time`,
      [user.id],
    )
  return rows.map(mapRequest)
}

async function findRequest(id) {
  const [rows] = await pool.query(
    `SELECT r.*, rooms.name AS room_name FROM requests r LEFT JOIN rooms ON rooms.id = r.room_id WHERE r.id = ?`,
    [id],
  )
  return rows[0] ? mapRequest(rows[0]) : null
}

async function resolveRoomId(value) {
  const id = Number(value)
  if (id) {
    const [rows] = await pool.query('SELECT id FROM rooms WHERE id = ?', [id])
    if (rows[0]) return rows[0].id
  }
  const [fallback] = await pool.query(`SELECT id FROM rooms WHERE name = 'Sala de cómputo' LIMIT 1`)
  if (!fallback[0]) {
    const error = new Error('No hay salas registradas.')
    error.status = 400
    throw error
  }
  return fallback[0].id
}

async function fixedHits(connection, { date, startTime, endTime, roomId }) {
  const weekday = parseISODate(date).getDay()
  const [rows] = await connection.query(
    `SELECT f.start_time, f.end_time, u.name AS teacher_name
     FROM fixed_schedules f JOIN users u ON u.id = f.teacher_id
     WHERE f.room_id = ? AND f.weekday = ?`,
    [roomId, weekday],
  )
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  return rows.filter((row) => rangesOverlap(
    start,
    end,
    toMinutes(String(row.start_time).slice(0, 5)),
    toMinutes(String(row.end_time).slice(0, 5)),
  ))
}

async function adminIds(connection) {
  const [rows] = await connection.query(`SELECT id FROM users WHERE role = 'admin' AND active = 1`)
  return rows.map((row) => row.id)
}

async function notify(connection, userIds, note) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (!ids.length) return
  await connection.query(
    'INSERT INTO notifications (user_id, title, body, href) VALUES ?',
    [ids.map((id) => [id, note.title, note.body, note.href])],
  )
}

function normalizeInput(body) {
  return {
    roomId: body.roomId,
    date: String(body.date || ''),
    startTime: String(body.startTime || ''),
    endTime: String(body.endTime || ''),
    grade: String(body.grade || ''),
    section: String(body.section || ''),
    students: body.students,
    purpose: String(body.purpose || ''),
    notes: String(body.notes || ''),
  }
}

function firstError(errors) {
  return errors.overlap || errors.limit || errors.date || errors.endTime || errors.students || errors.purpose || errors.grade || errors.section || 'Revisa la solicitud.'
}

function uniqueRows(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}
