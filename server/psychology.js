import express from 'express'
import { getPool } from './db.js'
import { requireAuth } from './campus.js'
import { nowLima } from './attendance.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export const PSY_REASONS = ['Emocional', 'Conductual', 'Académico', 'Familiar', 'Social', 'Convivencia escolar', 'Orientación vocacional', 'Otro']
export const PSY_REFERRALS = ['Docente / tutor', 'Padre o madre de familia', 'Auxiliar', 'Dirección', 'Iniciativa del estudiante', 'Psicología', 'Otro']
export const PSY_RISKS = ['Bajo', 'Medio', 'Alto']
export const PSY_CASE_STATUS = ['Abierto', 'En seguimiento', 'Derivado', 'Cerrado']
export const PSY_SESSION_TYPES = ['Individual', 'Familiar', 'Grupal', 'Con docente / tutor']
export const PSY_SESSION_STATUS = ['Programada', 'Realizada', 'No asistió', 'Cancelada']
export const PSY_INSTITUTIONS = ['Centro de Salud Mental Comunitario', 'Centro de salud / posta', 'Hospital', 'DEMUNA', 'Centro Emergencia Mujer (CEM)', 'Policía / Fiscalía', 'UGEL', 'Psicólogo o psiquiatra particular', 'Otro']
export const PSY_REFERRAL_STATUS = ['Pendiente', 'En atención', 'Atendida', 'Sin respuesta']

/**
 * Psychological care: confidential, so only coordination (admin) and the psychology role work in it.
 * Dirección can read it, like the rest of the panel; every other role is kept out.
 */
export function psychologyAccess(req, res, next) {
  const role = req.user.role
  if (role === 'admin' || role === 'psicologo') return next()
  if (role === 'director') {
    if (req.method === 'GET') return next()
    return res.status(403).json({ ok: false, error: 'Tu rol (Dirección) es de solo consulta.' })
  }
  return res.status(403).json({ ok: false, error: 'No tienes permiso para el módulo de atención psicológica.' })
}

const text = (value, max) => String(value ?? '').trim().slice(0, max)
const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))

const CASE_SELECT = `SELECT c.*, DATE_FORMAT(c.opened_on, '%Y-%m-%d') AS opened, DATE_FORMAT(c.closed_on, '%Y-%m-%d') AS closed,
    s.code AS student_code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo,
    u.name AS created_by_name,
    (SELECT COUNT(*) FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Realizada') AS sessions_done,
    (SELECT DATE_FORMAT(MAX(x.date), '%Y-%m-%d') FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Realizada') AS last_session,
    (SELECT CONCAT(DATE_FORMAT(MIN(CONCAT(x.date, ' ', x.time)), '%Y-%m-%d %H:%i')) FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Programada') AS next_session
  FROM psych_cases c
  JOIN students s ON s.id = c.student_id
  LEFT JOIN users u ON u.id = c.created_by`

const SESSION_SELECT = `SELECT x.*, DATE_FORMAT(x.date, '%Y-%m-%d') AS day, TIME_FORMAT(x.time, '%H:%i') AS hour,
    c.code AS case_code, c.reason, c.risk_level, s.id AS student_id, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo,
    u.name AS created_by_name
  FROM psych_sessions x
  JOIN psych_cases c ON c.id = x.case_id
  JOIN students s ON s.id = c.student_id
  LEFT JOIN users u ON u.id = x.created_by`

const studentOf = (row) => ({
  id: row.student_id,
  code: row.student_code,
  name: `${row.last_names}, ${row.first_names}`,
  level: row.level,
  grade: row.grade,
  section: row.section,
  photo: row.photo,
})

function mapCase(row) {
  return {
    id: row.id,
    code: row.code,
    student: studentOf(row),
    openedOn: row.opened,
    closedOn: row.closed,
    reason: row.reason,
    referredBy: row.referred_by,
    referrerName: row.referrer_name,
    description: row.description,
    riskLevel: row.risk_level,
    status: row.status,
    createdBy: row.created_by_name || '',
    sessionsDone: Number(row.sessions_done || 0),
    lastSession: row.last_session,
    nextSession: row.next_session,
  }
}

function mapSession(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    caseCode: row.case_code,
    reason: row.reason,
    riskLevel: row.risk_level,
    student: { id: row.student_id, name: `${row.last_names}, ${row.first_names}`, level: row.level, grade: row.grade, section: row.section, photo: row.photo },
    date: row.day,
    time: row.hour,
    type: row.type,
    status: row.status,
    notes: row.notes,
    agreements: row.agreements,
    createdBy: row.created_by_name || '',
  }
}

const REFERRAL_SELECT = `SELECT r.*, DATE_FORMAT(r.date, '%Y-%m-%d') AS day,
    c.code AS case_code, c.reason AS case_reason, c.risk_level, s.id AS student_id, s.first_names, s.last_names, s.level, s.grade, s.section,
    u.name AS created_by_name
  FROM psych_referrals r
  JOIN psych_cases c ON c.id = r.case_id
  JOIN students s ON s.id = c.student_id
  LEFT JOIN users u ON u.id = r.created_by`

function mapReferral(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    caseCode: row.case_code,
    caseReason: row.case_reason,
    riskLevel: row.risk_level,
    student: { id: row.student_id, name: `${row.last_names}, ${row.first_names}`, level: row.level, grade: row.grade, section: row.section },
    date: row.day,
    institution: row.institution,
    specialist: row.specialist,
    reason: row.reason,
    status: row.status,
    response: row.response,
    createdBy: row.created_by_name || '',
  }
}

function referralInput(body) {
  return {
    date: isDate(body.date) ? body.date : nowLima().date,
    institution: oneOf(PSY_INSTITUTIONS, body.institution, ''),
    specialist: text(body.specialist, 160),
    reason: text(body.reason, 2000),
    status: oneOf(PSY_REFERRAL_STATUS, body.status, 'Pendiente'),
    response: text(body.response, 3000),
  }
}

function caseInput(body) {
  return {
    studentId: Number(body.studentId) || null,
    openedOn: isDate(body.openedOn) ? body.openedOn : nowLima().date,
    reason: oneOf(PSY_REASONS, body.reason, ''),
    referredBy: oneOf(PSY_REFERRALS, body.referredBy, ''),
    referrerName: text(body.referrerName, 160),
    description: text(body.description, 4000),
    riskLevel: oneOf(PSY_RISKS, body.riskLevel, 'Bajo'),
    status: oneOf(PSY_CASE_STATUS, body.status, 'Abierto'),
  }
}

function sessionInput(body) {
  return {
    date: isDate(body.date) ? body.date : '',
    time: isTime(body.time) ? body.time : '',
    type: oneOf(PSY_SESSION_TYPES, body.type, 'Individual'),
    status: oneOf(PSY_SESSION_STATUS, body.status, 'Programada'),
    notes: text(body.notes, 6000),
    agreements: text(body.agreements, 3000),
  }
}

async function nextCaseCode(db) {
  const [rows] = await db.query("SELECT code FROM psych_cases WHERE code LIKE 'AP-%' ORDER BY id DESC LIMIT 1")
  const last = rows[0] ? Number(String(rows[0].code).slice(3)) || 0 : 0
  return `AP-${String(last + 1).padStart(4, '0')}`
}

async function oneCase(id) {
  const [rows] = await getPool().query(`${CASE_SELECT} WHERE c.id = ?`, [id])
  return rows[0] ? mapCase(rows[0]) : null
}

export function psychologyRouter() {
  const router = express.Router()
  router.use('/api/psychology', requireAuth, psychologyAccess)

  router.get('/api/psychology/options', (_req, res) => {
    res.json({ ok: true, reasons: PSY_REASONS, referrals: PSY_REFERRALS, risks: PSY_RISKS, caseStatus: PSY_CASE_STATUS, sessionTypes: PSY_SESSION_TYPES, sessionStatus: PSY_SESSION_STATUS, institutions: PSY_INSTITUTIONS, referralStatus: PSY_REFERRAL_STATUS })
  })

  /** Light student list for the case form (the attendance student API is not open to this role). */
  router.get('/api/psychology/students', wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT id, code, dni, first_names, last_names, level, grade, section, photo FROM students WHERE active = 1 ORDER BY last_names, first_names`,
    )
    res.json({
      ok: true,
      students: rows.map((row) => ({ id: row.id, code: row.code, dni: row.dni || '', name: `${row.last_names}, ${row.first_names}`, level: row.level, grade: row.grade, section: row.section, photo: row.photo })),
    })
  }))

  router.get('/api/psychology/summary', wrap(async (_req, res) => {
    const db = getPool()
    const { date } = nowLima()
    const [[cases]] = await db.query(
      `SELECT SUM(status <> 'Cerrado') AS open_cases, SUM(status <> 'Cerrado' AND risk_level = 'Alto') AS high_risk,
              SUM(status = 'Cerrado' AND closed_on >= DATE_FORMAT(?, '%Y-%m-01')) AS closed_month, COUNT(*) AS total
       FROM psych_cases`,
      [date],
    )
    const [[sessions]] = await db.query(
      `SELECT SUM(status = 'Realizada' AND date >= DATE_FORMAT(?, '%Y-%m-01')) AS done_month,
              SUM(status = 'Programada' AND date >= ?) AS scheduled
       FROM psych_sessions`,
      [date, date],
    )
    const [byReason] = await db.query("SELECT reason, COUNT(*) AS total FROM psych_cases WHERE status <> 'Cerrado' GROUP BY reason ORDER BY total DESC")
    const [upcoming] = await db.query(`${SESSION_SELECT} WHERE x.status = 'Programada' AND x.date >= ? ORDER BY x.date, x.time LIMIT 8`, [date])
    res.json({
      ok: true,
      today: date,
      stats: {
        openCases: Number(cases.open_cases || 0),
        highRisk: Number(cases.high_risk || 0),
        closedMonth: Number(cases.closed_month || 0),
        totalCases: Number(cases.total || 0),
        sessionsMonth: Number(sessions.done_month || 0),
        scheduled: Number(sessions.scheduled || 0),
      },
      byReason: byReason.map((row) => ({ reason: row.reason, total: Number(row.total) })),
      upcoming: upcoming.map(mapSession),
    })
  }))

  router.get('/api/psychology/cases', wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${CASE_SELECT} ORDER BY FIELD(c.status, 'Abierto', 'En seguimiento', 'Derivado', 'Cerrado'), FIELD(c.risk_level, 'Alto', 'Medio', 'Bajo'), c.opened_on DESC`)
    res.json({ ok: true, cases: rows.map(mapCase) })
  }))

  router.get('/api/psychology/cases/:id', wrap(async (req, res) => {
    const item = await oneCase(req.params.id)
    if (!item) return res.status(404).json({ ok: false, error: 'El caso ya no existe.' })
    const [sessions] = await getPool().query(`${SESSION_SELECT} WHERE x.case_id = ? ORDER BY x.date DESC, x.time DESC`, [req.params.id])
    const [referrals] = await getPool().query(`${REFERRAL_SELECT} WHERE r.case_id = ? ORDER BY r.date DESC, r.id DESC`, [req.params.id])
    res.json({ ok: true, case: item, sessions: sessions.map(mapSession), referrals: referrals.map(mapReferral) })
  }))

  router.post('/api/psychology/cases', wrap(async (req, res) => {
    const input = caseInput(req.body)
    if (!input.studentId) return res.status(400).json({ ok: false, error: 'Selecciona el estudiante.' })
    if (!input.reason) return res.status(400).json({ ok: false, error: 'Selecciona el motivo de la atención.' })
    if (!input.referredBy) return res.status(400).json({ ok: false, error: 'Indica quién deriva el caso.' })
    const db = getPool()
    const [student] = await db.query('SELECT id FROM students WHERE id = ? AND active = 1', [input.studentId])
    if (!student.length) return res.status(400).json({ ok: false, error: 'El estudiante no existe o está inactivo.' })
    const [open] = await db.query("SELECT code FROM psych_cases WHERE student_id = ? AND status <> 'Cerrado' LIMIT 1", [input.studentId])
    if (open.length) return res.status(409).json({ ok: false, error: `El estudiante ya tiene un caso abierto (${open[0].code}). Registra la atención como una nueva sesión de ese caso.` })
    const code = await nextCaseCode(db)
    const [created] = await db.query(
      `INSERT INTO psych_cases (code, student_id, opened_on, reason, referred_by, referrer_name, description, risk_level, status, closed_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.studentId, input.openedOn, input.reason, input.referredBy, input.referrerName, input.description, input.riskLevel, input.status,
        input.status === 'Cerrado' ? nowLima().date : null, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/psychology/cases/:id', wrap(async (req, res) => {
    const input = caseInput(req.body)
    if (!input.reason || !input.referredBy) return res.status(400).json({ ok: false, error: 'Completa el motivo y quién deriva el caso.' })
    const [result] = await getPool().query(
      `UPDATE psych_cases SET opened_on = ?, reason = ?, referred_by = ?, referrer_name = ?, description = ?, risk_level = ?, status = ?,
         closed_on = IF(? = 'Cerrado', COALESCE(closed_on, ?), NULL)
       WHERE id = ?`,
      [input.openedOn, input.reason, input.referredBy, input.referrerName, input.description, input.riskLevel, input.status, input.status, nowLima().date, req.params.id],
    )
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'El caso ya no existe.' })
    res.json({ ok: true })
  }))

  router.delete('/api/psychology/cases/:id', wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM psych_cases WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'El caso ya no existe.' })
    res.json({ ok: true })
  }))

  router.get('/api/psychology/sessions', wrap(async (req, res) => {
    const where = []
    const params = []
    if (isDate(req.query.from)) { where.push('x.date >= ?'); params.push(req.query.from) }
    if (isDate(req.query.to)) { where.push('x.date <= ?'); params.push(req.query.to) }
    if (PSY_SESSION_STATUS.includes(req.query.status)) { where.push('x.status = ?'); params.push(req.query.status) }
    const [rows] = await getPool().query(`${SESSION_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY x.date, x.time`, params)
    res.json({ ok: true, sessions: rows.map(mapSession) })
  }))

  router.post('/api/psychology/cases/:id/sessions', wrap(async (req, res) => {
    const input = sessionInput(req.body)
    if (!input.date || !input.time) return res.status(400).json({ ok: false, error: 'Indica la fecha y la hora de la sesión.' })
    const db = getPool()
    const [cases] = await db.query('SELECT status FROM psych_cases WHERE id = ?', [req.params.id])
    if (!cases.length) return res.status(404).json({ ok: false, error: 'El caso ya no existe.' })
    if (cases[0].status === 'Cerrado') return res.status(409).json({ ok: false, error: 'El caso está cerrado. Reábrelo para registrar nuevas sesiones.' })
    const [clash] = await db.query("SELECT id FROM psych_sessions WHERE date = ? AND time = ? AND status = 'Programada' LIMIT 1", [input.date, input.time])
    if (input.status === 'Programada' && clash.length) return res.status(409).json({ ok: false, error: 'Ya hay una cita programada en esa fecha y hora.' })
    const [created] = await db.query(
      'INSERT INTO psych_sessions (case_id, date, time, type, status, notes, agreements, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, input.date, input.time, input.type, input.status, input.notes, input.agreements, req.user.id],
    )
    // A first attended session moves a new case into follow-up.
    if (input.status === 'Realizada') await db.query("UPDATE psych_cases SET status = 'En seguimiento' WHERE id = ? AND status = 'Abierto'", [req.params.id])
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/psychology/sessions/:id', wrap(async (req, res) => {
    const input = sessionInput(req.body)
    if (!input.date || !input.time) return res.status(400).json({ ok: false, error: 'Indica la fecha y la hora de la sesión.' })
    const db = getPool()
    const [clash] = await db.query("SELECT id FROM psych_sessions WHERE date = ? AND time = ? AND status = 'Programada' AND id <> ? LIMIT 1", [input.date, input.time, req.params.id])
    if (input.status === 'Programada' && clash.length) return res.status(409).json({ ok: false, error: 'Ya hay una cita programada en esa fecha y hora.' })
    const [result] = await db.query(
      'UPDATE psych_sessions SET date = ?, time = ?, type = ?, status = ?, notes = ?, agreements = ? WHERE id = ?',
      [input.date, input.time, input.type, input.status, input.notes, input.agreements, req.params.id],
    )
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'La sesión ya no existe.' })
    if (input.status === 'Realizada') {
      await db.query("UPDATE psych_cases c JOIN psych_sessions x ON x.case_id = c.id SET c.status = 'En seguimiento' WHERE x.id = ? AND c.status = 'Abierto'", [req.params.id])
    }
    res.json({ ok: true })
  }))

  router.delete('/api/psychology/sessions/:id', wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM psych_sessions WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'La sesión ya no existe.' })
    res.json({ ok: true })
  }))

  /** Referrals of a case to an outside institution (health centre, DEMUNA, CEM…) and their follow-up. */
  router.get('/api/psychology/referrals', wrap(async (req, res) => {
    const where = []
    const params = []
    if (PSY_REFERRAL_STATUS.includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status) }
    const [rows] = await getPool().query(`${REFERRAL_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY FIELD(r.status, 'Pendiente', 'En atención', 'Sin respuesta', 'Atendida'), r.date DESC`, params)
    res.json({ ok: true, referrals: rows.map(mapReferral) })
  }))

  router.post('/api/psychology/cases/:id/referrals', wrap(async (req, res) => {
    const input = referralInput(req.body)
    if (!input.institution) return res.status(400).json({ ok: false, error: 'Selecciona la institución a la que se deriva.' })
    if (input.reason.length < 3) return res.status(400).json({ ok: false, error: 'Indica el motivo de la derivación.' })
    const db = getPool()
    const [cases] = await db.query('SELECT status FROM psych_cases WHERE id = ?', [req.params.id])
    if (!cases.length) return res.status(404).json({ ok: false, error: 'El caso ya no existe.' })
    const [created] = await db.query(
      'INSERT INTO psych_referrals (case_id, date, institution, specialist, reason, status, response, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, input.date, input.institution, input.specialist, input.reason, input.status, input.response, req.user.id],
    )
    // An active case that is referred out is marked as such.
    await db.query("UPDATE psych_cases SET status = 'Derivado' WHERE id = ? AND status IN ('Abierto', 'En seguimiento')", [req.params.id])
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/psychology/referrals/:id', wrap(async (req, res) => {
    const input = referralInput(req.body)
    if (!input.institution || input.reason.length < 3) return res.status(400).json({ ok: false, error: 'Completa la institución y el motivo de la derivación.' })
    const [result] = await getPool().query(
      'UPDATE psych_referrals SET date = ?, institution = ?, specialist = ?, reason = ?, status = ?, response = ? WHERE id = ?',
      [input.date, input.institution, input.specialist, input.reason, input.status, input.response, req.params.id],
    )
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'La derivación ya no existe.' })
    res.json({ ok: true })
  }))

  router.delete('/api/psychology/referrals/:id', wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM psych_referrals WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'La derivación ya no existe.' })
    res.json({ ok: true })
  }))

  return router
}

export async function ensurePsychology() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS psych_cases (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    student_id INT UNSIGNED NOT NULL,
    opened_on DATE NOT NULL,
    closed_on DATE NULL,
    reason VARCHAR(60) NOT NULL,
    referred_by VARCHAR(60) NOT NULL,
    referrer_name VARCHAR(160) NOT NULL DEFAULT '',
    description TEXT NULL,
    risk_level VARCHAR(10) NOT NULL DEFAULT 'Bajo',
    status VARCHAR(20) NOT NULL DEFAULT 'Abierto',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_psych_cases_student (student_id),
    INDEX idx_psych_cases_status (status),
    CONSTRAINT fk_psych_cases_student FOREIGN KEY (student_id) REFERENCES students(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS psych_sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'Individual',
    status VARCHAR(20) NOT NULL DEFAULT 'Programada',
    notes TEXT NULL,
    agreements TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_psych_sessions_date (date, time),
    CONSTRAINT fk_psych_sessions_case FOREIGN KEY (case_id) REFERENCES psych_cases(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS psych_referrals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    institution VARCHAR(80) NOT NULL,
    specialist VARCHAR(160) NOT NULL DEFAULT '',
    reason TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    response TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_psych_referrals_status (status),
    CONSTRAINT fk_psych_referrals_case FOREIGN KEY (case_id) REFERENCES psych_cases(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
