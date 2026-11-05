import bcrypt from 'bcryptjs'
import express from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { getPool } from './db.js'
import { getSetting, isDate, mapRecord, nowLima, schoolDays } from './attendance.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

/* Simple in-memory rate limiter (per key, sliding window). */
const hits = new Map()
function limited(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((time) => now - time < windowMs)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 5000) for (const [entry, times] of hits) if (!times.some((time) => now - time < windowMs)) hits.delete(entry)
  return list.length > max
}

async function requireGuardian(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (payload.kind !== 'guardian') return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
    const [rows] = await getPool().query('SELECT * FROM guardians WHERE id = ? AND active = 1', [payload.sub])
    if (!rows[0]) return res.status(401).json({ ok: false, error: 'Tu sesión ya no es válida.' })
    req.guardian = rows[0]
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'Tu sesión expiró. Ingresa de nuevo.' })
  }
}

const mapGuardian = (row) => ({ id: row.id, dni: row.dni, name: row.name || 'Apoderado', phone: row.phone || '' })

function mapChild(row) {
  return {
    id: row.id,
    code: row.code,
    firstNames: row.first_names,
    lastNames: row.last_names,
    fullName: `${row.first_names} ${row.last_names}`,
    level: row.level,
    grade: row.grade,
    section: row.section,
    photo: row.photo || null,
    today: row.today_status ? { status: row.today_status, time: row.today_time ? String(row.today_time).slice(0, 5) : '', justified: Boolean(row.today_justified) } : null,
  }
}

/** Attendance of one student between two dates, including implicit absences on school days. */
export async function studentHistory(student, from, to) {
  const { date: today, time: now } = nowLima()
  const end = to > today ? today : to
  const enrolled = String(student.created_at).slice(0, 10)
  const start = from < enrolled ? enrolled : from
  const [records] = await getPool().query(
    `SELECT a.*, s.code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo
      FROM attendance a JOIN students s ON s.id = a.student_id
      WHERE a.student_id = ? AND a.date BETWEEN ? AND ?`,
    [student.id, start, end],
  )
  const byDay = new Map(records.map((row) => [String(row.date).slice(0, 10), mapRecord(row)]))
  const lateAfter = await getSetting('attendance_late_after', '07:45')
  const rows = []
  if (start <= end) {
    for (const day of schoolDays(start, end)) {
      const record = byDay.get(day)
      if (record) rows.push(record)
      else if (day !== today || now > lateAfter) {
        rows.push(mapRecord({ ...student, student_id: student.id, id: null, date: day, time: null, status: 'inasistencia', justified: 0, method: 'sistema', note: '' }))
      }
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date))
  const totals = { total: rows.length, presente: 0, tardanza: 0, inasistencia: 0, justificadas: 0 }
  for (const row of rows) {
    totals[row.status] += 1
    if (row.justified) totals.justificadas += 1
  }
  return { from: start, to: end, records: rows, totals, lateAfter }
}

function monthStart(date) {
  return `${date.slice(0, 8)}01`
}

function minusDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

const CHILD_SELECT = `SELECT s.*, a.status AS today_status, a.time AS today_time, a.justified AS today_justified
  FROM guardian_students gs
  JOIN students s ON s.id = gs.student_id AND s.active = 1
  LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?`

/** Links (or unlinks) a student with the guardian identified by DNI, creating the guardian account if needed. */
export async function linkGuardian(connection, studentId, { dni, name, phone }) {
  await connection.query('DELETE FROM guardian_students WHERE student_id = ?', [studentId])
  if (!dni) return null
  const [existing] = await connection.query('SELECT * FROM guardians WHERE dni = ?', [dni])
  let guardianId = existing[0]?.id
  if (guardianId) {
    await connection.query(
      'UPDATE guardians SET name = IF(? <> \'\', ?, name), phone = IF(? <> \'\', ?, phone), active = 1 WHERE id = ?',
      [name, name, phone, phone, guardianId],
    )
  } else {
    // The initial access key is the guardian's own DNI; the portal forces a change on first login.
    const [created] = await connection.query(
      'INSERT INTO guardians (dni, name, phone, password_hash, must_change) VALUES (?, ?, ?, ?, 1)',
      [dni, name, phone, bcrypt.hashSync(dni, 10)],
    )
    guardianId = created.insertId
  }
  await connection.query('INSERT IGNORE INTO guardian_students (guardian_id, student_id) VALUES (?, ?)', [guardianId, studentId])
  return guardianId
}

export function parentsRouter() {
  const router = express.Router()

  router.post('/api/parents/login', wrap(async (req, res) => {
    // Access is by the guardian's DNI only (institutional decision). Rate limits curb DNI guessing.
    const dni = String(req.body.dni || '').trim()
    if (!/^\d{8}$/.test(dni)) return res.status(400).json({ ok: false, error: 'El DNI debe tener 8 dígitos.' })
    if (limited(`login-ip:${req.ip}`, 15, 15 * 60 * 1000) || limited(`login:${req.ip}:${dni}`, 6, 15 * 60 * 1000)) {
      return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' })
    }
    const [rows] = await getPool().query('SELECT * FROM guardians WHERE dni = ?', [dni])
    const guardian = rows[0]
    if (!guardian) {
      return res.status(401).json({ ok: false, error: 'Ese DNI no está registrado como padre o apoderado. Comunícate con la institución.' })
    }
    if (!guardian.active) return res.status(403).json({ ok: false, error: 'Tu acceso está desactivado. Comunícate con la institución.' })
    await getPool().query('UPDATE guardians SET last_login = NOW() WHERE id = ?', [guardian.id])
    const token = jwt.sign({ sub: guardian.id, kind: 'guardian' }, config.jwtSecret, { expiresIn: req.body.remember ? '30d' : '12h' })
    res.json({ ok: true, token, guardian: mapGuardian(guardian) })
  }))

  router.get('/api/parents/me', requireGuardian, wrap(async (req, res) => {
    const [children] = await getPool().query(`${CHILD_SELECT} WHERE gs.guardian_id = ? ORDER BY s.last_names, s.first_names`, [nowLima().date, req.guardian.id])
    res.json({ ok: true, guardian: mapGuardian(req.guardian), children: children.map(mapChild) })
  }))

  router.get('/api/parents/students/:id/attendance', requireGuardian, wrap(async (req, res) => {
    const [rows] = await getPool().query(
      'SELECT s.* FROM guardian_students gs JOIN students s ON s.id = gs.student_id WHERE gs.guardian_id = ? AND s.id = ? AND s.active = 1',
      [req.guardian.id, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Estudiante no encontrado.' })
    const today = nowLima().date
    const to = isDate(req.query.to) ? req.query.to : today
    const from = isDate(req.query.from) ? req.query.from : monthStart(today)
    if (from > to) return res.status(400).json({ ok: false, error: 'La fecha inicial no puede ser posterior a la final.' })
    if (schoolDays(from, to).length > 200) return res.status(400).json({ ok: false, error: 'Elige un rango de hasta 200 días hábiles.' })
    const [justifications] = await getPool().query(
      'SELECT id, date, type, reason, status FROM justifications WHERE student_id = ? ORDER BY date DESC, id DESC LIMIT 20',
      [rows[0].id],
    )
    res.json({
      ok: true,
      ...(await studentHistory(rows[0], from, to)),
      justifications: justifications.map((row) => ({ ...row, date: String(row.date).slice(0, 10) })),
    })
  }))

  /** Quick lookup from the student's QR card: limited, read-only information. */
  router.post('/api/parents/qr', wrap(async (req, res) => {
    if (limited(`qr:${req.ip}`, 20, 60 * 1000)) return res.status(429).json({ ok: false, error: 'Demasiadas consultas. Espera un minuto.' })
    const token = String(req.body.token || '').trim()
    if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ ok: false, error: 'El código no corresponde a un carné de la institución.' })
    const [rows] = await getPool().query('SELECT * FROM students WHERE qr_token = ? AND active = 1', [token])
    const student = rows[0]
    if (!student) return res.status(404).json({ ok: false, error: 'Código QR no reconocido.' })
    if (!student.qr_active) return res.status(403).json({ ok: false, error: 'Este carné está desactivado. Comunícate con la institución.' })
    const today = nowLima().date
    const history = await studentHistory(student, minusDays(today, 30), today)
    res.json({
      ok: true,
      student: { firstNames: student.first_names, lastNames: student.last_names, level: student.level, grade: student.grade, section: student.section, code: student.code },
      ...history,
      records: history.records.slice(0, 10).map(({ date, time, status, justified }) => ({ date, time, status, justified })),
    })
  }))

  return router
}

export async function ensureParents() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS guardians (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dni VARCHAR(8) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    password_hash VARCHAR(100) NOT NULL,
    must_change TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    last_login DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS guardian_students (
    guardian_id INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (guardian_id, student_id),
    INDEX idx_guardian_students_student (student_id),
    CONSTRAINT fk_gs_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE,
    CONSTRAINT fk_gs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
}
