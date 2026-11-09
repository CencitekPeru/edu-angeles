import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { getPool } from './db.js'
import { requireAuth } from './campus.js'
import { linkGuardian } from './parents.js'

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const fileUpload = (allowed) => multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, done) => {
      const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '.bin'
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => done(null, allowed.includes(file.mimetype)),
})
const photoUpload = fileUpload(['image/jpeg', 'image/png', 'image/webp'])
const evidenceUpload = fileUpload(['image/jpeg', 'image/png', 'application/pdf'])

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export const LEVELS = ['Primaria', 'Secundaria']
export const GRADES = ['1°', '2°', '3°', '4°', '5°', '6°']
const STATUSES = ['presente', 'tardanza', 'inasistencia']
const TIME_ZONE = 'America/Lima'

/** Current date (YYYY-MM-DD) and time (HH:MM) in Peru, independent of the server's timezone. */
export function nowLima() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

export const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))

export function schoolDays(from, to) {
  const days = []
  const cursor = new Date(`${from}T12:00:00Z`)
  const end = new Date(`${to}T12:00:00Z`)
  let guard = 0
  while (cursor <= end && guard < 400) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    guard += 1
  }
  return days
}

function mapStudent(row) {
  return {
    id: row.id,
    code: row.code,
    dni: row.dni || '',
    firstNames: row.first_names,
    lastNames: row.last_names,
    fullName: `${row.last_names}, ${row.first_names}`,
    level: row.level,
    grade: row.grade,
    section: row.section,
    photo: row.photo || null,
    qrToken: row.qr_token,
    qrActive: Boolean(row.qr_active),
    qrGeneratedAt: row.qr_generated_at || null,
    guardian: row.guardian || '',
    guardianDni: row.guardian_dni || '',
    gender: row.gender || '',
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : '',
    shift: row.shift || '',
    guardianRelationship: row.guardian_relationship || '',
    phoneAlt: row.phone_alt || '',
    guardianEmail: row.guardian_email || '',
    phone: row.phone || '',
    today: row.today_status
      ? { status: row.today_status, time: row.today_time ? String(row.today_time).slice(0, 5) : '', justified: Boolean(row.today_justified) }
      : null,
  }
}

export function mapRecord(row) {
  return {
    id: row.id || null,
    studentId: row.student_id,
    code: row.code,
    fullName: `${row.last_names}, ${row.first_names}`,
    level: row.level,
    grade: row.grade,
    section: row.section,
    photo: row.photo || null,
    date: String(row.date).slice(0, 10),
    time: row.time ? String(row.time).slice(0, 5) : '',
    status: row.status,
    justified: Boolean(row.justified),
    method: row.method || 'sistema',
    note: row.note || '',
  }
}

function mapJustification(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    code: row.code,
    fullName: `${row.last_names}, ${row.first_names}`,
    level: row.level,
    grade: row.grade,
    section: row.section,
    photo: row.photo || null,
    date: String(row.date).slice(0, 10),
    type: row.type,
    reason: row.reason,
    description: row.description || '',
    evidence: row.evidence || null,
    evidenceName: row.evidence_name || '',
    status: row.status,
    createdBy: row.created_by_name || '',
    decidedBy: row.decided_by_name || '',
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
  }
}

function studentFilters(query, alias = 's') {
  const where = [`${alias}.active = 1`]
  const params = []
  if (LEVELS.includes(query.level)) { where.push(`${alias}.level = ?`); params.push(query.level) }
  if (GRADES.includes(query.grade)) { where.push(`${alias}.grade = ?`); params.push(query.grade) }
  if (query.section && query.section !== 'todos') { where.push(`${alias}.section = ?`); params.push(String(query.section)) }
  const q = String(query.q || '').trim()
  if (q) {
    where.push(`(${alias}.code LIKE ? OR ${alias}.dni LIKE ? OR CONCAT(${alias}.last_names, ' ', ${alias}.first_names) LIKE ? OR CONCAT(${alias}.first_names, ' ', ${alias}.last_names) LIKE ?)`)
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  return { where: where.join(' AND '), params }
}

export async function getSetting(key, fallback) {
  const [rows] = await getPool().query('SELECT v FROM app_settings WHERE k = ?', [key])
  return rows[0]?.v ?? fallback
}

async function audit(connection, { attendanceId, studentId, date, action, oldStatus, newStatus, reason, userId }) {
  await connection.query(
    `INSERT INTO attendance_audit (attendance_id, student_id, date, action, old_status, new_status, reason, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [attendanceId || null, studentId, date, action, oldStatus || null, newStatus || null, String(reason || '').slice(0, 300), userId],
  )
}

/** Inserts or updates the attendance record of a student on a date and logs the change. */
async function upsertAttendance(connection, { studentId, date, time, status, justified = false, method, note, userId, action }) {
  const [existing] = await connection.query('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [studentId, date])
  if (existing[0]) {
    await connection.query(
      'UPDATE attendance SET time = ?, status = ?, justified = ?, method = ?, note = ?, updated_by = ? WHERE id = ?',
      [time || null, status, justified ? 1 : 0, method, String(note || '').slice(0, 300), userId, existing[0].id],
    )
    await audit(connection, { attendanceId: existing[0].id, studentId, date, action, oldStatus: existing[0].status, newStatus: status, reason: note, userId })
    return existing[0].id
  }
  const [created] = await connection.query(
    'INSERT INTO attendance (student_id, date, time, status, justified, method, note, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [studentId, date, time || null, status, justified ? 1 : 0, method, String(note || '').slice(0, 300), userId, userId],
  )
  await audit(connection, { attendanceId: created.insertId, studentId, date, action, oldStatus: null, newStatus: status, reason: note, userId })
  return created.insertId
}

const STUDENT_SELECT = `SELECT s.*, a.status AS today_status, a.time AS today_time, a.justified AS today_justified,
    (SELECT g.dni FROM guardian_students gs JOIN guardians g ON g.id = gs.guardian_id WHERE gs.student_id = s.id LIMIT 1) AS guardian_dni
  FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?`

async function nextStudentCode(connection) {
  const [rows] = await connection.query("SELECT MAX(CAST(SUBSTRING(code, 5) AS UNSIGNED)) AS n FROM students WHERE code LIKE 'EST-%'")
  return `EST-${String(Number(rows[0].n || 0) + 1).padStart(4, '0')}`
}

export const GENDERS = ['Masculino', 'Femenino']
export const SHIFTS = ['Mañana', 'Tarde']

function normalizeShift(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return ''
  if (text.startsWith('m')) return 'Mañana'
  if (text.startsWith('t')) return 'Tarde'
  return null
}

/** «M», «hombre», «masculino»… → Masculino; «F», «mujer», «femenino»… → Femenino. */
function normalizeGender(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return ''
  if (/^(m|h|masc|hombre|var)/.test(text)) return 'Masculino'
  if (/^(f|fem|mujer)/.test(text)) return 'Femenino'
  return null
}

function validateStudent(body) {
  const data = {
    dni: String(body.dni || '').trim(),
    firstNames: String(body.firstNames || '').trim(),
    lastNames: String(body.lastNames || '').trim(),
    level: String(body.level || ''),
    grade: String(body.grade || ''),
    section: String(body.section || '').trim().toUpperCase(),
    guardian: String(body.guardian || '').trim(),
    phone: String(body.phone || '').trim(),
    guardianDni: String(body.guardianDni || '').replace(/\D/g, ''),
    gender: normalizeGender(body.gender),
    birthDate: String(body.birthDate || '').trim(),
    shift: normalizeShift(body.shift),
    guardianRelationship: String(body.guardianRelationship || '').trim().slice(0, 40),
    phoneAlt: String(body.phoneAlt || '').replace(/[^\d+\s-]/g, '').trim().slice(0, 30),
    guardianEmail: String(body.guardianEmail || '').trim().toLowerCase().slice(0, 120),
  }
  if (data.shift === null) return { error: 'Selecciona un turno válido (Mañana o Tarde).' }
  if (data.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.guardianEmail)) return { error: 'El correo del apoderado no es válido.' }
  if (data.gender === null) return { error: 'Selecciona un género válido (Masculino o Femenino).' }
  if (data.birthDate) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate) ? new Date(`${data.birthDate}T12:00:00Z`) : null
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.birthDate) return { error: 'La fecha de nacimiento no es válida.' }
    const age = (Date.now() - date.getTime()) / (365.25 * 86400000)
    if (age < 2 || age > 30) return { error: 'Revisa la fecha de nacimiento: la edad debe estar entre 2 y 30 años.' }
  }
  if (data.guardianDni && !/^\d{8}$/.test(data.guardianDni)) return { error: 'El DNI del apoderado debe tener 8 dígitos.' }
  if (data.dni && !/^\d{8}$/.test(data.dni)) return { error: 'El DNI debe tener 8 dígitos.' }
  if (data.firstNames.length < 2) return { error: 'Escribe los nombres del estudiante.' }
  if (data.lastNames.length < 2) return { error: 'Escribe los apellidos del estudiante.' }
  if (!LEVELS.includes(data.level)) return { error: 'Selecciona el nivel (Primaria o Secundaria).' }
  if (!GRADES.includes(data.grade) || (data.level === 'Secundaria' && data.grade === '6°')) return { error: 'Selecciona un grado válido.' }
  if (!/^[A-Z0-9]{1,6}$/.test(data.section)) return { error: 'Escribe una sección válida (por ejemplo A).' }
  return { data }
}

const guardianOf = (data) => ({ dni: data.guardianDni, name: data.guardian, phone: data.phone })

const newToken = () => crypto.randomBytes(12).toString('hex')

/** Attendance module: coordination and auxiliaries work in it; the director can only read. */
export function attendanceAccess(req, res, next) {
  const role = req.user.role
  if (role === 'admin' || role === 'auxiliar') return next()
  if (role === 'director') {
    if (req.method === 'GET') return next()
    return res.status(403).json({ ok: false, error: 'Tu rol (Dirección) es de solo consulta.' })
  }
  return res.status(403).json({ ok: false, error: 'No tienes permiso para el módulo de asistencia.' })
}

export function attendanceRouter() {
  const router = express.Router()
  router.use('/api/attendance', requireAuth, attendanceAccess)
  router.use('/api/students', requireAuth, attendanceAccess)
  router.use('/api/justifications', requireAuth, attendanceAccess)

  /* ---------- Settings ---------- */
  router.get('/api/attendance/settings', wrap(async (_req, res) => {
    res.json({ ok: true, lateAfter: await getSetting('attendance_late_after', '07:45') })
  }))

  router.patch('/api/attendance/settings', wrap(async (req, res) => {
    const lateAfter = String(req.body.lateAfter || '')
    if (!isTime(lateAfter)) return res.status(400).json({ ok: false, error: 'Indica una hora válida (HH:MM).' })
    await getPool().query('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['attendance_late_after', lateAfter])
    res.json({ ok: true, lateAfter })
  }))

  /* ---------- Students ---------- */
  router.get('/api/students', wrap(async (req, res) => {
    const { date } = nowLima()
    const { where, params } = studentFilters(req.query)
    const [rows] = await getPool().query(`${STUDENT_SELECT} WHERE ${where} ORDER BY s.last_names, s.first_names`, [date, ...params])
    const [counts] = await getPool().query(
      'SELECT level, COUNT(*) AS total, COUNT(DISTINCT CONCAT(level, grade, section)) AS sections, SUM(qr_active) AS qr FROM students WHERE active = 1 GROUP BY level',
    )
    const stats = { total: 0, Primaria: 0, Secundaria: 0, sections: 0, qrActive: 0 }
    for (const row of counts) {
      stats[row.level] = Number(row.total)
      stats.total += Number(row.total)
      stats.sections += Number(row.sections)
      stats.qrActive += Number(row.qr || 0)
    }
    res.json({ ok: true, students: rows.map(mapStudent), stats })
  }))

  router.post('/api/students', wrap(async (req, res) => {
    const { data, error } = validateStudent(req.body)
    if (error) return res.status(400).json({ ok: false, error })
    if (data.dni) {
      const [dup] = await getPool().query('SELECT id FROM students WHERE dni = ?', [data.dni])
      if (dup.length) return res.status(409).json({ ok: false, error: 'Ya existe un estudiante con ese DNI.' })
    }
    const code = await nextStudentCode(getPool())
    const [created] = await getPool().query(
      `INSERT INTO students (code, dni, first_names, last_names, level, grade, section, guardian, phone, gender, birth_date, shift, guardian_relationship, phone_alt, guardian_email, qr_token, qr_generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [code, data.dni || null, data.firstNames, data.lastNames, data.level, data.grade, data.section, data.guardian, data.phone, data.gender, data.birthDate || null, data.shift, data.guardianRelationship, data.phoneAlt, data.guardianEmail, newToken()],
    )
    await linkGuardian(getPool(), created.insertId, guardianOf(data))
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.post('/api/students/import', wrap(async (req, res) => {
    const rows = Array.isArray(req.body.students) ? req.body.students.slice(0, 3000) : []
    if (!rows.length) return res.status(400).json({ ok: false, error: 'El archivo no tiene estudiantes para importar.' })
    const connection = await getPool().getConnection()
    const errors = []
    let created = 0
    let updated = 0
    try {
      await connection.beginTransaction()
      for (const [index, raw] of rows.entries()) {
        const { data, error } = validateStudent(raw)
        if (error) { errors.push(`Fila ${Number(raw.row) || index + 1}: ${error}`); continue }
        const [existing] = data.dni ? await connection.query('SELECT id FROM students WHERE dni = ?', [data.dni]) : [[]]
        if (existing[0]) {
          await connection.query(
            `UPDATE students SET first_names = ?, last_names = ?, level = ?, grade = ?, section = ?, guardian = ?, phone = ?,
               gender = COALESCE(NULLIF(?, ''), gender), birth_date = COALESCE(?, birth_date), shift = COALESCE(NULLIF(?, ''), shift),
               guardian_relationship = COALESCE(NULLIF(?, ''), guardian_relationship), phone_alt = COALESCE(NULLIF(?, ''), phone_alt),
               guardian_email = COALESCE(NULLIF(?, ''), guardian_email), active = 1 WHERE id = ?`,
            [data.firstNames, data.lastNames, data.level, data.grade, data.section, data.guardian, data.phone, data.gender, data.birthDate || null,
              data.shift, data.guardianRelationship, data.phoneAlt, data.guardianEmail, existing[0].id],
          )
          if (data.guardianDni) await linkGuardian(connection, existing[0].id, guardianOf(data))
          updated += 1
        } else {
          const code = await nextStudentCode(connection)
          const [inserted] = await connection.query(
            `INSERT INTO students (code, dni, first_names, last_names, level, grade, section, guardian, phone, gender, birth_date, shift, guardian_relationship, phone_alt, guardian_email, qr_token, qr_generated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [code, data.dni || null, data.firstNames, data.lastNames, data.level, data.grade, data.section, data.guardian, data.phone, data.gender, data.birthDate || null, data.shift, data.guardianRelationship, data.phoneAlt, data.guardianEmail, newToken()],
          )
          if (data.guardianDni) await linkGuardian(connection, inserted.insertId, guardianOf(data))
          created += 1
        }
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    res.json({ ok: true, created, updated, errors: errors.slice(0, 50), skipped: errors.length })
  }))

  router.patch('/api/students/:id', wrap(async (req, res) => {
    const { data, error } = validateStudent(req.body)
    if (error) return res.status(400).json({ ok: false, error })
    if (data.dni) {
      const [dup] = await getPool().query('SELECT id FROM students WHERE dni = ? AND id <> ?', [data.dni, req.params.id])
      if (dup.length) return res.status(409).json({ ok: false, error: 'Ya existe otro estudiante con ese DNI.' })
    }
    await getPool().query(
      `UPDATE students SET dni = ?, first_names = ?, last_names = ?, level = ?, grade = ?, section = ?, guardian = ?, phone = ?, gender = ?, birth_date = ?,
         shift = ?, guardian_relationship = ?, phone_alt = ?, guardian_email = ? WHERE id = ?`,
      [data.dni || null, data.firstNames, data.lastNames, data.level, data.grade, data.section, data.guardian, data.phone, data.gender, data.birthDate || null,
        data.shift, data.guardianRelationship, data.phoneAlt, data.guardianEmail, req.params.id],
    )
    await linkGuardian(getPool(), req.params.id, guardianOf(data))
    res.json({ ok: true })
  }))

  router.delete('/api/students/:id', wrap(async (req, res) => {
    // Soft delete keeps the attendance history intact.
    await getPool().query('UPDATE students SET active = 0, qr_active = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.post('/api/students/:id/photo', photoUpload.array('photos', 1), wrap(async (req, res) => {
    const file = req.files?.[0]
    if (!file) return res.status(400).json({ ok: false, error: 'Sube una foto JPG, PNG o WEBP de hasta 5 MB.' })
    const photo = `/api/uploads/${file.filename}`
    await getPool().query('UPDATE students SET photo = ? WHERE id = ?', [photo, req.params.id])
    res.json({ ok: true, photo })
  }))

  router.post('/api/students/:id/qr', wrap(async (req, res) => {
    const action = String(req.body.action || '')
    if (action === 'regenerate') {
      await getPool().query('UPDATE students SET qr_token = ?, qr_active = 1, qr_generated_at = NOW() WHERE id = ?', [newToken(), req.params.id])
    } else if (action === 'activate' || action === 'deactivate') {
      await getPool().query('UPDATE students SET qr_active = ? WHERE id = ?', [action === 'activate' ? 1 : 0, req.params.id])
    } else {
      return res.status(400).json({ ok: false, error: 'Acción no válida.' })
    }
    const [rows] = await getPool().query(`${STUDENT_SELECT} WHERE s.id = ?`, [nowLima().date, req.params.id])
    res.json({ ok: true, student: rows[0] ? mapStudent(rows[0]) : null })
  }))

  router.post('/api/students/qr/generate-all', wrap(async (_req, res) => {
    const [rows] = await getPool().query('SELECT id FROM students WHERE active = 1 AND (qr_token IS NULL OR qr_token = \'\')')
    for (const row of rows) {
      await getPool().query('UPDATE students SET qr_token = ?, qr_active = 1, qr_generated_at = NOW() WHERE id = ?', [newToken(), row.id])
    }
    await getPool().query('UPDATE students SET qr_active = 1 WHERE active = 1')
    res.json({ ok: true, generated: rows.length })
  }))

  /* ---------- Attendance ---------- */
  router.get('/api/attendance/today', wrap(async (req, res) => {
    const date = isDate(req.query.date) ? req.query.date : nowLima().date
    const [byLevel] = await getPool().query(
      `SELECT s.level, COUNT(*) AS total,
          SUM(a.status = 'presente') AS presente, SUM(a.status = 'tardanza') AS tardanza, SUM(a.status = 'inasistencia') AS inasistencia
        FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
        WHERE s.active = 1 GROUP BY s.level`,
      [date],
    )
    const levels = LEVELS.map((level) => {
      const row = byLevel.find((item) => item.level === level) || {}
      const total = Number(row.total || 0)
      const present = Number(row.presente || 0)
      const late = Number(row.tardanza || 0)
      return { level, total, present, late, absent: Math.max(0, total - present - late), attended: present + late }
    })
    const [recent] = await getPool().query(
      `SELECT a.*, s.code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo
        FROM attendance a JOIN students s ON s.id = a.student_id
        WHERE a.date = ? AND a.status <> 'inasistencia'
        ORDER BY a.time DESC, a.id DESC LIMIT ?`,
      [date, Math.min(Number(req.query.limit) || 8, 50)],
    )
    const total = levels.reduce((sum, item) => sum + item.total, 0)
    const present = levels.reduce((sum, item) => sum + item.present, 0)
    const late = levels.reduce((sum, item) => sum + item.late, 0)
    res.json({
      ok: true,
      date,
      lateAfter: await getSetting('attendance_late_after', '07:45'),
      totals: { total, present, late, absent: Math.max(0, total - present - late) },
      levels,
      recent: recent.map(mapRecord),
    })
  }))

  router.post('/api/attendance/scan', wrap(async (req, res) => {
    const code = String(req.body.code || '').trim()
    if (!code) return res.status(400).json({ ok: false, error: 'No se recibió ningún código.' })
    const [rows] = await getPool().query('SELECT * FROM students WHERE active = 1 AND (qr_token = ? OR code = ? OR dni = ?) LIMIT 1', [code, code.toUpperCase(), code])
    const student = rows[0]
    if (!student) return res.status(404).json({ ok: false, error: 'Código no reconocido. Verifica el carné del estudiante.' })
    if (student.qr_token === code && !student.qr_active) {
      return res.status(403).json({ ok: false, error: `El QR de ${student.first_names} ${student.last_names} está desactivado.` })
    }
    const { date, time } = nowLima()
    const [existing] = await getPool().query('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [student.id, date])
    if (existing[0] && existing[0].status !== 'inasistencia') {
      return res.status(409).json({
        ok: false,
        duplicate: true,
        error: `${student.first_names} ${student.last_names} ya registró su ingreso hoy a las ${String(existing[0].time).slice(0, 5)}.`,
        record: mapRecord({ ...existing[0], ...student, id: existing[0].id }),
      })
    }
    const lateAfter = await getSetting('attendance_late_after', '07:45')
    const status = time > lateAfter ? 'tardanza' : 'presente'
    const connection = await getPool().getConnection()
    try {
      const id = await upsertAttendance(connection, { studentId: student.id, date, time, status, method: 'qr', note: '', userId: req.user.id, action: 'scan' })
      res.json({ ok: true, record: mapRecord({ ...student, id, student_id: student.id, date, time, status, method: 'qr' }) })
    } finally {
      connection.release()
    }
  }))

  router.post('/api/attendance/manual', wrap(async (req, res) => {
    const studentId = Number(req.body.studentId)
    const status = String(req.body.status || '')
    const { date: today, time: now } = nowLima()
    const date = isDate(req.body.date) ? req.body.date : today
    const time = status === 'inasistencia' ? null : (isTime(req.body.time) ? req.body.time : now)
    if (!studentId) return res.status(400).json({ ok: false, error: 'Selecciona un estudiante.' })
    if (!STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'Selecciona el tipo de asistencia.' })
    if (date > today) return res.status(400).json({ ok: false, error: 'No se puede registrar asistencia en fechas futuras.' })
    const connection = await getPool().getConnection()
    try {
      await upsertAttendance(connection, { studentId, date, time, status, method: 'manual', note: req.body.note, userId: req.user.id, action: 'manual' })
    } finally {
      connection.release()
    }
    res.json({ ok: true })
  }))

  router.post('/api/attendance/modify', evidenceUpload.array('photos', 1), wrap(async (req, res) => {
    const studentId = Number(req.body.studentId)
    const date = String(req.body.date || '')
    const type = String(req.body.type || '')
    const reason = String(req.body.reason || '').trim()
    const note = String(req.body.note || '').trim()
    if (!studentId || !isDate(date)) return res.status(400).json({ ok: false, error: 'Selecciona el estudiante y la fecha.' })
    if (date > nowLima().date) return res.status(400).json({ ok: false, error: 'No se puede modificar una fecha futura.' })
    const [current] = await getPool().query('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [studentId, date])
    let status
    let justified = false
    let time = current[0]?.time ? String(current[0].time).slice(0, 5) : null
    if (type === 'inasistencia_justificada') { status = 'inasistencia'; justified = true; time = null }
    else if (type === 'inasistencia_injustificada') { status = 'inasistencia'; time = null }
    else if (type === 'tardanza_justificada') { status = 'tardanza'; justified = true; time = isTime(req.body.time) ? req.body.time : time }
    else if (type === 'correccion') {
      status = String(req.body.status || '')
      if (!STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'Selecciona el estado corregido.' })
      time = status === 'inasistencia' ? null : (isTime(req.body.time) ? req.body.time : time)
      if (status !== 'inasistencia' && !time) return res.status(400).json({ ok: false, error: 'Indica la hora de ingreso.' })
    } else {
      return res.status(400).json({ ok: false, error: 'Selecciona el tipo de modificación.' })
    }
    if (status === 'tardanza' && !time) return res.status(400).json({ ok: false, error: 'Indica la hora de ingreso de la tardanza.' })
    if (justified && !reason) return res.status(400).json({ ok: false, error: 'Selecciona el motivo de la justificación.' })
    const file = req.files?.[0]
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      await upsertAttendance(connection, {
        studentId, date, time, status, justified, method: current[0]?.method || 'manual',
        note: [reason, note].filter(Boolean).join(' · '), userId: req.user.id, action: type,
      })
      if (justified) {
        await connection.query(
          `INSERT INTO justifications (student_id, date, type, reason, description, evidence, evidence_name, status, created_by, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'aprobada', ?, ?, NOW())`,
          [studentId, date, status, reason, note, file ? `/api/uploads/${file.filename}` : null, file?.originalname || '', req.user.id, req.user.id],
        )
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    res.json({ ok: true })
  }))

  router.get('/api/attendance/student/:id', wrap(async (req, res) => {
    const date = isDate(req.query.date) ? req.query.date : nowLima().date
    const [rows] = await getPool().query('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [req.params.id, date])
    res.json({ ok: true, record: rows[0] ? { status: rows[0].status, time: rows[0].time ? String(rows[0].time).slice(0, 5) : '', justified: Boolean(rows[0].justified), note: rows[0].note || '' } : null })
  }))

  /** Attendance history: real records plus implicit absences (school days without a record). */
  router.get('/api/attendance/history', wrap(async (req, res) => {
    const today = nowLima().date
    const to = isDate(req.query.to) && req.query.to < today ? req.query.to : today
    const from = isDate(req.query.from) ? req.query.from : to
    if (from > to) return res.status(400).json({ ok: false, error: 'La fecha inicial no puede ser posterior a la final.' })
    const days = schoolDays(from, to)
    if (days.length > 200) return res.status(400).json({ ok: false, error: 'Elige un rango de hasta 200 días hábiles.' })
    const { where, params } = studentFilters(req.query)
    const [students] = await getPool().query(`SELECT s.* FROM students s WHERE ${where}`, params)
    const [records] = await getPool().query(
      `SELECT a.*, s.code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo
        FROM attendance a JOIN students s ON s.id = a.student_id
        WHERE a.date BETWEEN ? AND ? AND ${where}`,
      [from, to, ...params],
    )
    const lateAfter = await getSetting('attendance_late_after', '07:45')
    const { time: nowTime } = nowLima()
    const byKey = new Map(records.map((row) => [`${row.student_id}|${String(row.date).slice(0, 10)}`, mapRecord(row)]))
    const rows = []
    for (const day of days) {
      // Today's absences only count once the late threshold has passed.
      if (day === today && nowTime <= lateAfter) {
        for (const record of records) if (String(record.date).slice(0, 10) === day) rows.push(byKey.get(`${record.student_id}|${day}`))
        continue
      }
      for (const student of students) {
        const record = byKey.get(`${student.id}|${day}`)
        // No implicit absences before the student was enrolled in the system.
        if (!record && day < String(student.created_at).slice(0, 10)) continue
        rows.push(record || mapRecord({ ...student, id: null, student_id: student.id, date: day, time: null, status: 'inasistencia', justified: 0, method: 'sistema', note: '' }))
      }
    }
    const status = String(req.query.status || '')
    const filtered = STATUSES.includes(status) ? rows.filter((row) => row.status === status) : rows
    filtered.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || a.fullName.localeCompare(b.fullName))
    const totals = { total: rows.length, presente: 0, tardanza: 0, inasistencia: 0 }
    for (const row of rows) totals[row.status] += 1
    res.json({ ok: true, from, to, days: days.length, totals, records: filtered })
  }))

  /* ---------- Justifications ---------- */
  router.get('/api/justifications', wrap(async (req, res) => {
    const { where, params } = studentFilters(req.query)
    const extra = []
    const extraParams = []
    if (isDate(req.query.from)) { extra.push('j.date >= ?'); extraParams.push(req.query.from) }
    if (isDate(req.query.to)) { extra.push('j.date <= ?'); extraParams.push(req.query.to) }
    const [rows] = await getPool().query(
      `SELECT j.*, s.code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo,
          cu.name AS created_by_name, du.name AS decided_by_name
        FROM justifications j
        JOIN students s ON s.id = j.student_id
        LEFT JOIN users cu ON cu.id = j.created_by
        LEFT JOIN users du ON du.id = j.decided_by
        WHERE ${where}${extra.length ? ` AND ${extra.join(' AND ')}` : ''}
        ORDER BY j.date DESC, j.id DESC`,
      [...params, ...extraParams],
    )
    const items = rows.map(mapJustification)
    const counts = { total: items.length, pendiente: 0, aprobada: 0, rechazada: 0 }
    for (const item of items) counts[item.status] += 1
    res.json({ ok: true, justifications: items, counts })
  }))

  router.post('/api/justifications', evidenceUpload.array('photos', 1), wrap(async (req, res) => {
    const studentId = Number(req.body.studentId)
    const date = String(req.body.date || '')
    const type = String(req.body.type || '')
    const reason = String(req.body.reason || '').trim()
    if (!studentId) return res.status(400).json({ ok: false, error: 'Selecciona un estudiante.' })
    if (!isDate(date) || date > nowLima().date) return res.status(400).json({ ok: false, error: 'Indica una fecha válida (no futura).' })
    if (!['inasistencia', 'tardanza'].includes(type)) return res.status(400).json({ ok: false, error: 'Selecciona el tipo (inasistencia o tardanza).' })
    if (reason.length < 3) return res.status(400).json({ ok: false, error: 'Indica el motivo.' })
    const file = req.files?.[0]
    const [created] = await getPool().query(
      `INSERT INTO justifications (student_id, date, type, reason, description, evidence, evidence_name, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [studentId, date, type, reason.slice(0, 120), String(req.body.description || '').slice(0, 1000), file ? `/api/uploads/${file.filename}` : null, file?.originalname || '', req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.post('/api/justifications/:id/decide', wrap(async (req, res) => {
    const status = String(req.body.status || '')
    if (!['aprobada', 'rechazada'].includes(status)) return res.status(400).json({ ok: false, error: 'Decisión no válida.' })
    const [rows] = await getPool().query('SELECT * FROM justifications WHERE id = ?', [req.params.id])
    const item = rows[0]
    if (!item) return res.status(404).json({ ok: false, error: 'Justificación no encontrada.' })
    if (item.status !== 'pendiente') return res.status(409).json({ ok: false, error: 'Esta justificación ya fue revisada.' })
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      await connection.query('UPDATE justifications SET status = ?, decided_by = ?, decided_at = NOW() WHERE id = ?', [status, req.user.id, item.id])
      if (status === 'aprobada') {
        const date = String(item.date).slice(0, 10)
        const [current] = await connection.query('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [item.student_id, date])
        const time = item.type === 'tardanza' ? (current[0]?.time ? String(current[0].time).slice(0, 5) : null) : null
        if (item.type === 'tardanza' && !time) {
          // A late arrival without a recorded time cannot be marked as justified tardiness; keep it as a justified absence instead.
          await upsertAttendance(connection, { studentId: item.student_id, date, time: null, status: 'inasistencia', justified: true, method: current[0]?.method || 'manual', note: `Justificado: ${item.reason}`, userId: req.user.id, action: 'justificacion' })
        } else {
          await upsertAttendance(connection, { studentId: item.student_id, date, time, status: item.type, justified: true, method: current[0]?.method || 'manual', note: `Justificado: ${item.reason}`, userId: req.user.id, action: 'justificacion' })
        }
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    res.json({ ok: true })
  }))

  return router
}

export async function ensureAttendance() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
    k VARCHAR(80) PRIMARY KEY,
    v VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    dni VARCHAR(8) NULL UNIQUE,
    first_names VARCHAR(120) NOT NULL,
    last_names VARCHAR(120) NOT NULL,
    level ENUM('Primaria', 'Secundaria') NOT NULL,
    grade VARCHAR(4) NOT NULL,
    section VARCHAR(6) NOT NULL,
    guardian VARCHAR(160) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    photo VARCHAR(255) NULL,
    qr_token VARCHAR(64) NOT NULL UNIQUE,
    qr_active TINYINT(1) NOT NULL DEFAULT 1,
    qr_generated_at DATETIME NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_students_class (level, grade, section),
    INDEX idx_students_name (last_names, first_names)
  ) ENGINE=InnoDB`)
  for (const [name, type] of [
    ['gender', "VARCHAR(12) NOT NULL DEFAULT ''"], ['birth_date', 'DATE NULL'], ['shift', "VARCHAR(10) NOT NULL DEFAULT ''"],
    ['guardian_relationship', "VARCHAR(40) NOT NULL DEFAULT ''"], ['phone_alt', "VARCHAR(30) NOT NULL DEFAULT ''"], ['guardian_email', "VARCHAR(120) NOT NULL DEFAULT ''"],
  ]) {
    const [existing] = await db.query('SHOW COLUMNS FROM students LIKE ?', [name])
    if (!existing.length) await db.query(`ALTER TABLE students ADD COLUMN ${name} ${type}`)
  }
  await db.query(`CREATE TABLE IF NOT EXISTS attendance (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    time TIME NULL,
    status ENUM('presente', 'tardanza', 'inasistencia') NOT NULL,
    justified TINYINT(1) NOT NULL DEFAULT 0,
    method ENUM('qr', 'manual', 'sistema') NOT NULL DEFAULT 'manual',
    note VARCHAR(300) NOT NULL DEFAULT '',
    created_by INT UNSIGNED NULL,
    updated_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_attendance_student_date (student_id, date),
    INDEX idx_attendance_date (date),
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_audit (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attendance_id INT UNSIGNED NULL,
    student_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    action VARCHAR(40) NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NULL,
    reason VARCHAR(300) NOT NULL DEFAULT '',
    user_id INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attendance_audit_student (student_id, date)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS justifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    type ENUM('inasistencia', 'tardanza') NOT NULL,
    reason VARCHAR(120) NOT NULL,
    description TEXT NULL,
    evidence VARCHAR(255) NULL,
    evidence_name VARCHAR(255) NOT NULL DEFAULT '',
    status ENUM('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
    created_by INT UNSIGNED NULL,
    decided_by INT UNSIGNED NULL,
    decided_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_justifications_status (status, date),
    CONSTRAINT fk_justification_student FOREIGN KEY (student_id) REFERENCES students(id)
  ) ENGINE=InnoDB`)
}
