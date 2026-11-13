import express from 'express'
import { getPool } from './db.js'
import { requireAuth } from './campus.js'
import { nowLima } from './attendance.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export const PSY_REASONS = ['Académico', 'Dificultades de aprendizaje', 'Conductual', 'Convivencia escolar', 'Socioemocional', 'Emocional', 'Familiar', 'Social', 'Orientación vocacional', 'Otro']
export const PSY_REFERRALS = ['Docente / tutor', 'Padre o madre de familia', 'Auxiliar', 'Dirección', 'Iniciativa del estudiante', 'Psicología', 'Otro']
export const PSY_RISKS = ['Bajo', 'Medio', 'Alto']
export const PSY_CASE_STATUS = ['En seguimiento', 'Pendiente', 'Cerrado']
export const PSY_SESSION_TYPES = ['Individual', 'Seguimiento', 'Familiar', 'Grupal', 'Con docente / tutor']
export const PSY_SESSION_STATUS = ['Programada', 'Realizada', 'No asistió', 'Reprogramada', 'Cancelada']
export const PSY_MODALITIES = ['Presencial', 'Virtual']
export const PSY_REFERRAL_MOTIVES = ['Dificultades de aprendizaje', 'Problemas de convivencia', 'Conducta disruptiva', 'Atención emocional', 'Atención especializada', 'Evaluación externa', 'Situación familiar', 'Otro']
export const PSY_INTERNAL_AREAS = ['Tutoría', 'Coordinación de Convivencia', 'Coordinación Académica', 'Coordinación de Tutoría y Orientación Educativa', 'Dirección', 'Subdirección', 'Otra área interna']
export const PSY_EXTERNAL_INSTITUTIONS = ['Centro de Salud (MINSA)', 'Centro de Salud Mental Comunitario', 'Hospital', 'DEMUNA', 'Centro Emergencia Mujer (CEM)', 'Policía / Fiscalía', 'UGEL – Servicio de Inclusión', 'Psicólogo o psiquiatra particular', 'Otra institución']
export const PSY_REFERRAL_STATUS = ['En proceso', 'Atendida', 'No atendida']

/**
 * Psychological care is confidential: by default only Coordinación and the Psicología role use it and
 * Dirección can read it, but the effective levels come from each user's permissions.
 */
export function psychologyAccess(_req, _res, next) {
  // Access is decided by the user's permissions, checked in requireAuth (see src/lib/accessModel.js).
  next()
}

/** History is kept: only coordination may delete records (to fix a mistake). */
function adminOnly(req, res, next) {
  if (req.user.role === 'admin') return next()
  return res.status(403).json({ ok: false, error: 'El historial se conserva: solo Coordinación CIST puede eliminar registros.' })
}

const text = (value, max) => String(value ?? '').trim().slice(0, max)
const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))
const minutes = (time) => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m }
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error })

const studentOf = (row) => ({
  id: row.student_id,
  code: row.student_code,
  dni: row.student_dni || '',
  name: `${row.last_names}, ${row.first_names}`,
  level: row.level,
  grade: row.grade,
  section: row.section,
  photo: row.photo,
})
const STUDENT_COLUMNS = 's.id AS student_id, s.code AS student_code, s.dni AS student_dni, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo'

/* ------------------------------------------------------------------ cases */

const CASE_SELECT = `SELECT c.*, DATE_FORMAT(c.opened_on, '%Y-%m-%d') AS opened, DATE_FORMAT(c.closed_on, '%Y-%m-%d') AS closed,
    ${STUDENT_COLUMNS}, u.name AS created_by_name,
    (SELECT COUNT(*) FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Realizada') AS sessions_done,
    (SELECT DATE_FORMAT(MAX(x.date), '%Y-%m-%d') FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Realizada') AS last_session,
    (SELECT DATE_FORMAT(MIN(TIMESTAMP(x.date, x.time)), '%Y-%m-%d %H:%i') FROM psych_sessions x WHERE x.case_id = c.id AND x.status = 'Programada') AS next_session
  FROM psych_cases c
  JOIN students s ON s.id = c.student_id
  LEFT JOIN users u ON u.id = c.created_by`

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
    description: row.description || '',
    objective: row.objective || '',
    initialActions: row.initial_actions || '',
    riskLevel: row.risk_level,
    status: row.status,
    adminReason: row.admin_reason || '',
    adminNotes: row.admin_notes || '',
    createdBy: row.created_by_name || '',
    sessionsDone: Number(row.sessions_done || 0),
    lastSession: row.last_session,
    nextSession: row.next_session,
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
    objective: text(body.objective, 1000),
    initialActions: text(body.initialActions, 2000),
    riskLevel: oneOf(PSY_RISKS, body.riskLevel, 'Bajo'),
    status: oneOf(PSY_CASE_STATUS, body.status, 'Pendiente'),
  }
}

async function nextCode(db, table, prefix) {
  const [rows] = await db.query(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY CAST(SUBSTRING(code, ?) AS UNSIGNED) DESC LIMIT 1`, [`${prefix}-%`, prefix.length + 2])
  const last = rows[0] ? Number(String(rows[0].code).slice(prefix.length + 1)) || 0 : 0
  return `${prefix}-${String(last + 1).padStart(4, '0')}`
}

const activeCaseOf = async (db, studentId) => {
  const [rows] = await db.query("SELECT id, code FROM psych_cases WHERE student_id = ? AND status <> 'Cerrado' ORDER BY id DESC LIMIT 1", [studentId])
  return rows[0] || null
}

/* ------------------------------------------- sessions: attentions + appointments */

const SESSION_SELECT = `SELECT x.*, DATE_FORMAT(x.date, '%Y-%m-%d') AS day, TIME_FORMAT(x.time, '%H:%i') AS hour, TIME_FORMAT(x.end_time, '%H:%i') AS end_hour,
    c.code AS case_code, c.status AS case_status, c.reason AS case_reason, c.risk_level AS case_risk,
    ${STUDENT_COLUMNS}, u.name AS created_by_name,
    (SELECT COUNT(*) FROM psych_sessions y WHERE y.case_id = x.case_id AND y.status NOT IN ('Reprogramada', 'Cancelada')
       AND TIMESTAMP(y.date, y.time) <= TIMESTAMP(x.date, x.time)) AS ordinal,
    (SELECT DATE_FORMAT(MIN(TIMESTAMP(y.date, y.time)), '%Y-%m-%d %H:%i') FROM psych_sessions y
       WHERE y.case_id = x.case_id AND y.status = 'Programada' AND TIMESTAMP(y.date, y.time) > TIMESTAMP(x.date, x.time)) AS next_one
  FROM psych_sessions x
  JOIN students s ON s.id = x.student_id
  LEFT JOIN psych_cases c ON c.id = x.case_id
  LEFT JOIN users u ON u.id = x.created_by`

function mapSession(row) {
  return {
    id: row.id,
    origin: row.origin,
    caseId: row.case_id,
    caseCode: row.case_code || '',
    caseStatus: row.case_status || '',
    ordinal: row.case_id ? Number(row.ordinal || 0) : null,
    student: studentOf(row),
    date: row.day,
    time: row.hour,
    endTime: row.end_hour || '',
    type: row.type,
    modality: row.modality || '',
    status: row.status,
    topic: row.topic || '',
    reason: row.reason || row.case_reason || '',
    referredBy: row.referred_by || '',
    referrerName: row.referrer_name || '',
    riskLevel: row.risk_level || row.case_risk || '',
    notes: row.notes || '',
    agreements: row.agreements || '',
    adminReason: row.admin_reason || '',
    adminNotes: row.admin_notes || '',
    nextAppointment: row.next_one || '',
    createdBy: row.created_by_name || '',
  }
}

function timesError(input) {
  if (!input.date || !input.time) return 'Indica la fecha y la hora de inicio.'
  if (input.endTime && minutes(input.endTime) <= minutes(input.time)) return 'La hora de fin debe ser posterior a la hora de inicio.'
  return null
}

/** Another scheduled appointment whose time overlaps (without an end time an appointment counts as 1 hour). */
async function overlapping(db, input, excludeId = null) {
  const end = input.endTime || `${String(Math.floor((minutes(input.time) + 60) / 60) % 24).padStart(2, '0')}:${String((minutes(input.time) + 60) % 60).padStart(2, '0')}`
  const [rows] = await db.query(
    `SELECT x.id, TIME_FORMAT(x.time, '%H:%i') AS hour, s.first_names, s.last_names FROM psych_sessions x JOIN students s ON s.id = x.student_id
      WHERE x.date = ? AND x.status = 'Programada' AND x.id <> ?
        AND x.time < ? AND COALESCE(x.end_time, ADDTIME(x.time, '01:00:00')) > ? LIMIT 1`,
    [input.date, excludeId || 0, end, input.time],
  )
  return rows[0] || null
}

/* -------------------------------------------------------------- referrals */

const REFERRAL_SELECT = `SELECT r.*, DATE_FORMAT(r.date, '%Y-%m-%d') AS day, DATE_FORMAT(r.deadline, '%Y-%m-%d') AS deadline_day,
    c.code AS case_code, ${STUDENT_COLUMNS}, u.name AS created_by_name
  FROM psych_referrals r
  JOIN students s ON s.id = r.student_id
  LEFT JOIN psych_cases c ON c.id = r.case_id
  LEFT JOIN users u ON u.id = r.created_by`

function mapReferral(row) {
  return {
    id: row.id,
    code: row.code,
    caseId: row.case_id,
    caseCode: row.case_code || '',
    student: studentOf(row),
    date: row.day,
    motive: row.motive || '',
    destinationType: row.destination_type || 'externa',
    institution: row.institution,
    specialist: row.specialist || '',
    reason: row.reason || '',
    objective: row.objective || '',
    status: row.status,
    deadline: row.deadline_day || '',
    response: row.response || '',
    createdBy: row.created_by_name || '',
  }
}

function referralInput(body) {
  const destinationType = body.destinationType === 'interna' ? 'interna' : 'externa'
  return {
    studentId: Number(body.studentId) || null,
    caseId: Number(body.caseId) || null,
    date: isDate(body.date) ? body.date : nowLima().date,
    motive: oneOf(PSY_REFERRAL_MOTIVES, body.motive, ''),
    destinationType,
    institution: oneOf(destinationType === 'interna' ? PSY_INTERNAL_AREAS : PSY_EXTERNAL_INSTITUTIONS, body.institution, ''),
    specialist: text(body.specialist, 160),
    reason: text(body.reason, 2000),
    objective: text(body.objective, 1000),
    status: oneOf(PSY_REFERRAL_STATUS, body.status, 'En proceso'),
    deadline: isDate(body.deadline) ? body.deadline : null,
    response: text(body.response, 3000),
  }
}

function referralError(input) {
  if (!input.studentId) return 'Selecciona el estudiante.'
  if (!input.motive) return 'Selecciona el motivo de la derivación.'
  if (!input.institution) return 'Selecciona el área o institución de destino.'
  if (input.reason.length < 3) return 'Describe la situación que motiva la derivación.'
  if (input.objective.length < 3) return 'Indica el objetivo de la derivación.'
  return null
}

/* ------------------------------------------------------------------ router */

export function psychologyRouter() {
  const router = express.Router()
  router.use('/api/psychology', requireAuth, psychologyAccess)

  router.get('/api/psychology/options', (_req, res) => {
    res.json({
      ok: true, reasons: PSY_REASONS, referrals: PSY_REFERRALS, risks: PSY_RISKS, caseStatus: PSY_CASE_STATUS, sessionTypes: PSY_SESSION_TYPES,
      sessionStatus: PSY_SESSION_STATUS, modalities: PSY_MODALITIES, referralMotives: PSY_REFERRAL_MOTIVES, internalAreas: PSY_INTERNAL_AREAS,
      externalInstitutions: PSY_EXTERNAL_INSTITUTIONS, referralStatus: PSY_REFERRAL_STATUS,
    })
  })

  /** Light student list for the forms (the attendance student API is not open to this role). */
  router.get('/api/psychology/students', wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT s.id, s.code, s.dni, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo,
              (SELECT c.id FROM psych_cases c WHERE c.student_id = s.id AND c.status <> 'Cerrado' ORDER BY c.id DESC LIMIT 1) AS active_case_id,
              (SELECT c.code FROM psych_cases c WHERE c.student_id = s.id AND c.status <> 'Cerrado' ORDER BY c.id DESC LIMIT 1) AS active_case_code
         FROM students s WHERE s.active = 1 ORDER BY s.last_names, s.first_names`,
    )
    res.json({
      ok: true,
      students: rows.map((row) => ({
        id: row.id, code: row.code, dni: row.dni || '', name: `${row.last_names}, ${row.first_names}`, level: row.level, grade: row.grade, section: row.section,
        photo: row.photo, activeCase: row.active_case_id ? { id: row.active_case_id, code: row.active_case_code } : null,
      })),
    })
  }))

  /** Everything recorded for one student: attentions, cases, appointments and referrals. */
  router.get('/api/psychology/students/:id/history', wrap(async (req, res) => {
    const db = getPool()
    const [students] = await db.query('SELECT id, code, dni, first_names, last_names, level, grade, section, photo, gender, DATE_FORMAT(birth_date, \'%Y-%m-%d\') AS birth, guardian, phone FROM students WHERE id = ?', [req.params.id])
    if (!students.length) return bad(res, 'El estudiante no existe.', 404)
    const s = students[0]
    const [sessions] = await db.query(`${SESSION_SELECT} WHERE x.student_id = ? ORDER BY x.date DESC, x.time DESC`, [req.params.id])
    const [cases] = await db.query(`${CASE_SELECT} WHERE c.student_id = ? ORDER BY c.opened_on DESC`, [req.params.id])
    const [referrals] = await db.query(`${REFERRAL_SELECT} WHERE r.student_id = ? ORDER BY r.date DESC`, [req.params.id])
    res.json({
      ok: true,
      student: { id: s.id, code: s.code, dni: s.dni || '', name: `${s.last_names}, ${s.first_names}`, level: s.level, grade: s.grade, section: s.section, photo: s.photo, gender: s.gender || '', birthDate: s.birth || '', guardian: s.guardian || '', phone: s.phone || '' },
      sessions: sessions.map(mapSession),
      cases: cases.map(mapCase),
      referrals: referrals.map(mapReferral),
    })
  }))

  /* ----------------------------------------------------------- attentions */

  /** Attentions = interventions actually carried out (sessions with status «Realizada»), punctual or within a case. */
  router.get('/api/psychology/attentions', wrap(async (req, res) => {
    const where = ["x.status = 'Realizada'"]
    const params = []
    if (isDate(req.query.from)) { where.push('x.date >= ?'); params.push(req.query.from) }
    if (isDate(req.query.to)) { where.push('x.date <= ?'); params.push(req.query.to) }
    const [rows] = await getPool().query(`${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY x.date DESC, x.time DESC`, params)
    res.json({ ok: true, attentions: rows.map(mapSession) })
  }))

  /**
   * Registers an intervention. «Atención puntual» is saved on its own; «con seguimiento» is linked to the
   * student's active case, or opens a new one when there is none.
   */
  router.post('/api/psychology/attentions', wrap(async (req, res) => {
    const body = req.body
    const input = {
      studentId: Number(body.studentId) || null,
      date: isDate(body.date) ? body.date : '',
      time: isTime(body.startTime) ? body.startTime : '',
      endTime: isTime(body.endTime) ? body.endTime : '',
      reason: oneOf(PSY_REASONS, body.reason, ''),
      referredBy: oneOf(PSY_REFERRALS, body.referredBy, ''),
      referrerName: text(body.referrerName, 160),
      riskLevel: oneOf(PSY_RISKS, body.riskLevel, ''),
      type: oneOf(PSY_SESSION_TYPES, body.type, 'Individual'),
      description: text(body.description, 6000),
      agreements: text(body.agreements, 3000),
      adminReason: text(body.adminReason, 160),
      adminNotes: text(body.adminNotes, 500),
      followUp: Boolean(body.followUp),
    }
    if (!input.studentId) return bad(res, 'Selecciona el estudiante.')
    if (!input.endTime) return bad(res, 'Indica la hora de fin de la atención.')
    const timeError = timesError(input)
    if (timeError) return bad(res, timeError)
    if (input.date > nowLima().date) return bad(res, 'La fecha de atención no puede ser futura: registra solo intervenciones ya realizadas. Para una sesión futura usa «Programar cita».')
    if (!input.reason) return bad(res, 'Selecciona el motivo de la atención.')
    if (!input.referredBy) return bad(res, 'Indica quién derivó al estudiante.')
    if (!input.riskLevel) return bad(res, 'Selecciona el nivel de riesgo.')
    if (input.description.length < 3) return bad(res, 'Describe la situación atendida.')
    if (input.agreements.length < 3) return bad(res, 'Registra los acuerdos u orientaciones brindadas.')

    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [students] = await connection.query('SELECT id FROM students WHERE id = ? AND active = 1', [input.studentId])
      if (!students.length) { await connection.rollback(); return bad(res, 'El estudiante no existe o está inactivo.') }
      let caseId = null
      let caseCode = ''
      let caseCreated = false
      if (input.followUp) {
        const active = await activeCaseOf(connection, input.studentId)
        if (active) {
          caseId = active.id
          caseCode = active.code
          await connection.query("UPDATE psych_cases SET status = 'En seguimiento' WHERE id = ? AND status = 'Pendiente'", [caseId])
        } else {
          caseCode = await nextCode(connection, 'psych_cases', 'AP')
          const [created] = await connection.query(
            `INSERT INTO psych_cases (code, student_id, opened_on, reason, referred_by, referrer_name, description, risk_level, status, created_by, admin_reason, admin_notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'En seguimiento', ?, ?, ?)`,
            [caseCode, input.studentId, input.date, input.reason, input.referredBy, input.referrerName, input.description, input.riskLevel, req.user.id, input.adminReason, input.adminNotes],
          )
          caseId = created.insertId
          caseCreated = true
        }
      }
      const [inserted] = await connection.query(
        `INSERT INTO psych_sessions (case_id, student_id, origin, date, time, end_time, type, status, reason, referred_by, referrer_name, risk_level, notes, agreements, admin_reason, admin_notes, created_by)
         VALUES (?, ?, 'atencion', ?, ?, ?, ?, 'Realizada', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseId, input.studentId, input.date, input.time, input.endTime, input.type, input.reason, input.referredBy, input.referrerName, input.riskLevel,
          input.description, input.agreements, input.adminReason, input.adminNotes, req.user.id],
      )
      await connection.commit()
      res.status(201).json({ ok: true, id: inserted.insertId, caseId, caseCode, caseCreated })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  /** Corrects an attention (the student and whether it belongs to a case are kept). */
  router.patch('/api/psychology/attentions/:id', wrap(async (req, res) => {
    const body = req.body
    const input = {
      date: isDate(body.date) ? body.date : '',
      time: isTime(body.startTime) ? body.startTime : '',
      endTime: isTime(body.endTime) ? body.endTime : '',
      reason: oneOf(PSY_REASONS, body.reason, ''),
      referredBy: oneOf(PSY_REFERRALS, body.referredBy, ''),
      referrerName: text(body.referrerName, 160),
      riskLevel: oneOf(PSY_RISKS, body.riskLevel, ''),
      type: oneOf(PSY_SESSION_TYPES, body.type, 'Individual'),
      description: text(body.description, 6000),
      agreements: text(body.agreements, 3000),
      adminReason: text(body.adminReason, 160),
      adminNotes: text(body.adminNotes, 500),
    }
    const timeError = timesError(input)
    if (timeError) return bad(res, timeError)
    if (input.date > nowLima().date) return bad(res, 'La fecha de atención no puede ser futura.')
    if (!input.reason || !input.referredBy || !input.riskLevel) return bad(res, 'Completa el motivo, quién deriva y el nivel de riesgo.')
    if (input.description.length < 3 || input.agreements.length < 3) return bad(res, 'Completa la descripción y los acuerdos de la atención.')
    const [result] = await getPool().query(
      `UPDATE psych_sessions SET date = ?, time = ?, end_time = ?, type = ?, reason = ?, referred_by = ?, referrer_name = ?, risk_level = ?, notes = ?, agreements = ?,
         admin_reason = ?, admin_notes = ? WHERE id = ? AND status = 'Realizada'`,
      [input.date, input.time, input.endTime || null, input.type, input.reason, input.referredBy, input.referrerName, input.riskLevel, input.description,
        input.agreements, input.adminReason, input.adminNotes, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'La atención ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ---------------------------------------------------------------- cases */

  router.get('/api/psychology/cases', wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${CASE_SELECT} ORDER BY FIELD(c.status, 'En seguimiento', 'Pendiente', 'Cerrado'), c.opened_on DESC, c.id DESC`)
    res.json({ ok: true, cases: rows.map(mapCase) })
  }))

  router.get('/api/psychology/cases/:id', wrap(async (req, res) => {
    const [rows] = await getPool().query(`${CASE_SELECT} WHERE c.id = ?`, [req.params.id])
    if (!rows.length) return bad(res, 'El caso ya no existe.', 404)
    const [sessions] = await getPool().query(`${SESSION_SELECT} WHERE x.case_id = ? ORDER BY x.date DESC, x.time DESC`, [req.params.id])
    const [referrals] = await getPool().query(`${REFERRAL_SELECT} WHERE r.case_id = ? ORDER BY r.date DESC, r.id DESC`, [req.params.id])
    res.json({ ok: true, case: mapCase(rows[0]), sessions: sessions.map(mapSession), referrals: referrals.map(mapReferral) })
  }))

  router.post('/api/psychology/cases', wrap(async (req, res) => {
    const input = caseInput(req.body)
    if (!input.studentId) return bad(res, 'Selecciona el estudiante.')
    if (!input.reason) return bad(res, 'Selecciona el motivo del caso.')
    if (!input.referredBy) return bad(res, 'Indica quién derivó el caso.')
    if (input.description.length < 3) return bad(res, 'Describe la situación que origina el caso.')
    if (input.objective.length < 3) return bad(res, 'Indica el objetivo del seguimiento.')
    if (input.initialActions.length < 3) return bad(res, 'Registra las acciones iniciales o acuerdos.')
    const db = getPool()
    const [student] = await db.query('SELECT id FROM students WHERE id = ? AND active = 1', [input.studentId])
    if (!student.length) return bad(res, 'El estudiante no existe o está inactivo.')
    const open = await activeCaseOf(db, input.studentId)
    if (open) return bad(res, `El estudiante ya tiene un caso activo (${open.code}). Agrega las sesiones a ese caso.`, 409)
    const code = await nextCode(db, 'psych_cases', 'AP')
    const [created] = await db.query(
      `INSERT INTO psych_cases (code, student_id, opened_on, reason, referred_by, referrer_name, description, objective, initial_actions, risk_level, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [code, input.studentId, input.openedOn, input.reason, input.referredBy, input.referrerName, input.description, input.objective, input.initialActions, input.riskLevel, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/psychology/cases/:id', wrap(async (req, res) => {
    const input = caseInput(req.body)
    if (!input.reason || !input.referredBy) return bad(res, 'Completa el motivo y quién derivó el caso.')
    const db = getPool()
    if (input.status !== 'Cerrado') {
      const [rows] = await db.query('SELECT student_id FROM psych_cases WHERE id = ?', [req.params.id])
      const other = rows[0] && await activeCaseOf(db, rows[0].student_id)
      if (other && String(other.id) !== String(req.params.id)) return bad(res, `El estudiante ya tiene otro caso activo (${other.code}). Ciérralo antes de reabrir este.`, 409)
    }
    const [result] = await db.query(
      `UPDATE psych_cases SET opened_on = ?, reason = ?, referred_by = ?, referrer_name = ?, description = ?, objective = ?, initial_actions = ?, risk_level = ?, status = ?,
         closed_on = IF(? = 'Cerrado', COALESCE(closed_on, ?), NULL)
       WHERE id = ?`,
      [input.openedOn, input.reason, input.referredBy, input.referrerName, input.description, input.objective, input.initialActions, input.riskLevel, input.status,
        input.status, nowLima().date, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'El caso ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/psychology/cases/:id', adminOnly, wrap(async (req, res) => {
    const db = getPool()
    // Attentions keep existing as punctual ones; only the case and its scheduled appointments go.
    await db.query("DELETE FROM psych_sessions WHERE case_id = ? AND status <> 'Realizada'", [req.params.id])
    await db.query('UPDATE psych_sessions SET case_id = NULL WHERE case_id = ?', [req.params.id])
    await db.query('UPDATE psych_referrals SET case_id = NULL WHERE case_id = ?', [req.params.id])
    const [result] = await db.query('DELETE FROM psych_cases WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'El caso ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ------------------------------------------------------- appointments */

  /** Appointments and sessions linked to a case (follow-up), in a period. */
  router.get('/api/psychology/sessions', wrap(async (req, res) => {
    const where = ['x.case_id IS NOT NULL']
    const params = []
    if (isDate(req.query.from)) { where.push('x.date >= ?'); params.push(req.query.from) }
    if (isDate(req.query.to)) { where.push('x.date <= ?'); params.push(req.query.to) }
    if (PSY_SESSION_STATUS.includes(req.query.status)) { where.push('x.status = ?'); params.push(req.query.status) }
    const [rows] = await getPool().query(`${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY x.date, x.time`, params)
    res.json({ ok: true, sessions: rows.map(mapSession) })
  }))

  function appointmentInput(body) {
    return {
      date: isDate(body.date) ? body.date : '',
      time: isTime(body.startTime || body.time) ? (body.startTime || body.time) : '',
      endTime: isTime(body.endTime) ? body.endTime : '',
      type: oneOf(PSY_SESSION_TYPES, body.type, 'Seguimiento'),
      modality: oneOf(PSY_MODALITIES, body.modality, 'Presencial'),
      status: oneOf(PSY_SESSION_STATUS, body.status, 'Programada'),
      topic: text(body.topic, 255),
      notes: text(body.notes, 6000),
      agreements: text(body.agreements, 3000),
    }
  }

  async function appointmentError(db, input, excludeId = null) {
    const timeError = timesError(input)
    if (timeError) return timeError
    if (!input.endTime) return 'Indica la hora de fin de la cita.'
    if (input.topic.length < 3) return 'Escribe el motivo o tema de la sesión.'
    if (input.status === 'Realizada' && input.date > nowLima().date) return 'No marques como «Realizada» una cita que todavía no ocurre.'
    if (input.status === 'Programada') {
      const clash = await overlapping(db, input, excludeId)
      if (clash) return `Ya hay una cita programada a las ${clash.hour} con ${clash.last_names}, ${clash.first_names} que se cruza con este horario.`
    }
    return null
  }

  router.post('/api/psychology/cases/:id/sessions', wrap(async (req, res) => {
    const input = appointmentInput(req.body)
    const db = getPool()
    const [cases] = await db.query('SELECT student_id, status FROM psych_cases WHERE id = ?', [req.params.id])
    if (!cases.length) return bad(res, 'El caso ya no existe.', 404)
    if (cases[0].status === 'Cerrado') return bad(res, 'El caso está cerrado. Para retomarlo, reábrelo con una justificación antes de programar citas.', 409)
    const error = await appointmentError(db, input)
    if (error) return bad(res, error, error.startsWith('Ya hay') ? 409 : 400)
    const [created] = await db.query(
      `INSERT INTO psych_sessions (case_id, student_id, origin, date, time, end_time, type, modality, status, topic, notes, agreements, created_by)
       VALUES (?, ?, 'cita', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, cases[0].student_id, input.date, input.time, input.endTime, input.type, input.modality, input.status, input.topic, input.notes, input.agreements, req.user.id],
    )
    if (input.status === 'Realizada') await db.query("UPDATE psych_cases SET status = 'En seguimiento' WHERE id = ? AND status = 'Pendiente'", [req.params.id])
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/psychology/sessions/:id', wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT origin, case_id FROM psych_sessions WHERE id = ?', [req.params.id])
    if (!rows.length) return bad(res, 'La sesión ya no existe.', 404)
    const input = appointmentInput(req.body)
    const error = await appointmentError(db, input, req.params.id)
    if (error) return bad(res, error, error.startsWith('Ya hay') ? 409 : 400)
    await db.query(
      'UPDATE psych_sessions SET date = ?, time = ?, end_time = ?, type = ?, modality = ?, status = ?, topic = ?, notes = ?, agreements = ? WHERE id = ?',
      [input.date, input.time, input.endTime, input.type, input.modality, input.status, input.topic, input.notes, input.agreements, req.params.id],
    )
    if (input.status === 'Realizada' && rows[0].case_id) await db.query("UPDATE psych_cases SET status = 'En seguimiento' WHERE id = ? AND status = 'Pendiente'", [rows[0].case_id])
    res.json({ ok: true })
  }))

  /** Moves an appointment: the original is kept as «Reprogramada» and a new one is scheduled. */
  router.post('/api/psychology/sessions/:id/reschedule', wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT * FROM psych_sessions WHERE id = ?', [req.params.id])
    if (!rows.length) return bad(res, 'La cita ya no existe.', 404)
    const old = rows[0]
    if (old.status !== 'Programada') return bad(res, 'Solo se puede reprogramar una cita que está «Programada».')
    const input = { date: isDate(req.body.date) ? req.body.date : '', time: isTime(req.body.startTime) ? req.body.startTime : '', endTime: isTime(req.body.endTime) ? req.body.endTime : '' }
    const timeError = timesError(input) || (!input.endTime && 'Indica la hora de fin de la cita.')
    if (timeError) return bad(res, timeError)
    if (input.date < nowLima().date) return bad(res, 'La nueva fecha no puede ser pasada.')
    const clash = await overlapping(db, input, old.id)
    if (clash) return bad(res, `Ya hay una cita programada a las ${clash.hour} que se cruza con este horario.`, 409)
    await db.query("UPDATE psych_sessions SET status = 'Reprogramada' WHERE id = ?", [old.id])
    const [created] = await db.query(
      `INSERT INTO psych_sessions (case_id, student_id, origin, date, time, end_time, type, modality, status, topic, notes, agreements, rescheduled_from, created_by)
       VALUES (?, ?, 'cita', ?, ?, ?, ?, ?, 'Programada', ?, ?, ?, ?, ?)`,
      [old.case_id, old.student_id, input.date, input.time, input.endTime, old.type, old.modality, old.topic, old.notes, old.agreements, old.id, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.delete('/api/psychology/sessions/:id', adminOnly, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM psych_sessions WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La sesión ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ------------------------------------------------------------ referrals */

  router.get('/api/psychology/referrals', wrap(async (req, res) => {
    const where = []
    const params = []
    if (isDate(req.query.from)) { where.push('r.date >= ?'); params.push(req.query.from) }
    if (isDate(req.query.to)) { where.push('r.date <= ?'); params.push(req.query.to) }
    if (PSY_REFERRAL_STATUS.includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status) }
    const [rows] = await getPool().query(`${REFERRAL_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY r.date DESC, r.id DESC`, params)
    res.json({ ok: true, referrals: rows.map(mapReferral) })
  }))

  router.post('/api/psychology/referrals', wrap(async (req, res) => {
    const input = referralInput(req.body)
    const error = referralError(input)
    if (error) return bad(res, error)
    const db = getPool()
    const [students] = await db.query('SELECT id FROM students WHERE id = ?', [input.studentId])
    if (!students.length) return bad(res, 'El estudiante no existe.')
    if (input.caseId) {
      const [cases] = await db.query('SELECT student_id FROM psych_cases WHERE id = ?', [input.caseId])
      if (!cases.length || cases[0].student_id !== input.studentId) return bad(res, 'El caso seleccionado no pertenece al estudiante.')
    }
    const code = await nextCode(db, 'psych_referrals', 'DE')
    const [created] = await db.query(
      `INSERT INTO psych_referrals (code, student_id, case_id, date, motive, destination_type, institution, specialist, reason, objective, status, deadline, response, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.studentId, input.caseId, input.date, input.motive, input.destinationType, input.institution, input.specialist, input.reason, input.objective,
        input.status, input.deadline, input.response, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/psychology/referrals/:id', wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT student_id FROM psych_referrals WHERE id = ?', [req.params.id])
    if (!rows.length) return bad(res, 'La derivación ya no existe.', 404)
    const input = referralInput({ ...req.body, studentId: rows[0].student_id })
    const error = referralError(input)
    if (error) return bad(res, error)
    await db.query(
      `UPDATE psych_referrals SET case_id = ?, date = ?, motive = ?, destination_type = ?, institution = ?, specialist = ?, reason = ?, objective = ?, status = ?, deadline = ?, response = ?
        WHERE id = ?`,
      [input.caseId, input.date, input.motive, input.destinationType, input.institution, input.specialist, input.reason, input.objective, input.status,
        input.deadline, input.response, req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/psychology/referrals/:id', adminOnly, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM psych_referrals WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La derivación ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* --------------------------------------------------------------- reports */

  /** Raw data of a period for the reports page (it aggregates and filters by level/grade/section). */
  router.get('/api/psychology/report', wrap(async (req, res) => {
    if (!isDate(req.query.from) || !isDate(req.query.to)) return bad(res, 'Indica el periodo del reporte.')
    const db = getPool()
    const period = [req.query.from, req.query.to]
    const [sessions] = await db.query(`${SESSION_SELECT} WHERE x.date BETWEEN ? AND ? ORDER BY x.date DESC, x.time DESC`, period)
    const [cases] = await db.query(`${CASE_SELECT} WHERE c.opened_on <= ? AND (c.closed_on IS NULL OR c.closed_on >= ?) ORDER BY c.opened_on DESC`, [req.query.to, req.query.from])
    const [referrals] = await db.query(`${REFERRAL_SELECT} WHERE r.date BETWEEN ? AND ? ORDER BY r.date DESC`, period)
    res.json({ ok: true, sessions: sessions.map(mapSession), cases: cases.map(mapCase), referrals: referrals.map(mapReferral) })
  }))

  /**
   * Administrative report: one row per attention or appointment in the period, with the student's data,
   * the case follow-up (appointments, referral, guardian contact) and the student's school attendance in
   * the month of the attention. Clinical notes are never included.
   */
  router.get('/api/psychology/export', wrap(async (req, res) => {
    if (!isDate(req.query.from) || !isDate(req.query.to)) return bad(res, 'Indica el periodo del reporte.')
    const db = getPool()
    const { date: today } = nowLima()
    const [rows] = await db.query(
      `SELECT x.id AS attention_id, DATE_FORMAT(x.date, '%Y-%m-%d') AS day, TIME_FORMAT(x.time, '%H:%i') AS hour, x.type, x.status AS attention_status,
              u.name AS psychologist, x.case_id, COALESCE(NULLIF(x.reason, ''), c.reason) AS reason,
              COALESCE(NULLIF(x.admin_reason, ''), c.admin_reason) AS admin_reason, COALESCE(NULLIF(x.admin_notes, ''), c.admin_notes) AS admin_notes,
              c.status AS case_status,
              s.id AS student_id, s.code AS student_code, s.dni, s.first_names, s.last_names, DATE_FORMAT(s.birth_date, '%Y-%m-%d') AS birth,
              s.level, s.grade, s.section, s.shift, s.guardian, s.guardian_relationship, s.phone, s.phone_alt, s.guardian_email
         FROM psych_sessions x
         JOIN students s ON s.id = x.student_id
         LEFT JOIN psych_cases c ON c.id = x.case_id
         LEFT JOIN users u ON u.id = x.created_by
        WHERE x.date BETWEEN ? AND ? AND x.status <> 'Reprogramada'
        ORDER BY x.date, x.time`,
      [req.query.from, req.query.to],
    )
    if (!rows.length) return res.json({ ok: true, rows: [] })
    const caseIds = [...new Set(rows.map((row) => row.case_id).filter(Boolean))]
    const studentIds = [...new Set(rows.map((row) => row.student_id))]
    const [counts] = caseIds.length ? await db.query(
      `SELECT case_id, SUM(status NOT IN ('Cancelada', 'Reprogramada')) AS scheduled, SUM(status = 'Realizada') AS attended, SUM(status = 'No asistió') AS missed,
              MIN(IF(status = 'Programada' AND date >= ?, CONCAT(DATE_FORMAT(date, '%Y-%m-%d'), ' ', TIME_FORMAT(time, '%H:%i')), NULL)) AS next_one,
              MAX(IF(status = 'Realizada' AND type = 'Familiar', DATE_FORMAT(date, '%Y-%m-%d'), NULL)) AS guardian_contact
         FROM psych_sessions WHERE case_id IN (?) GROUP BY case_id`,
      [today, caseIds],
    ) : [[]]
    const [familyPunctual] = await db.query(
      `SELECT student_id, MAX(DATE_FORMAT(date, '%Y-%m-%d')) AS contact FROM psych_sessions
        WHERE student_id IN (?) AND status = 'Realizada' AND type = 'Familiar' GROUP BY student_id`,
      [studentIds],
    )
    const [referrals] = await db.query(
      `SELECT r.student_id, r.institution, r.status FROM psych_referrals r
         JOIN (SELECT student_id, MAX(id) AS id FROM psych_referrals WHERE student_id IN (?) GROUP BY student_id) last ON last.id = r.id`,
      [studentIds],
    )
    const [school] = await db.query(
      `SELECT student_id, DATE_FORMAT(date, '%Y-%m') AS month, SUM(status = 'presente') AS present, SUM(status = 'tardanza') AS late, SUM(status = 'inasistencia') AS absent
         FROM attendance WHERE student_id IN (?) GROUP BY student_id, DATE_FORMAT(date, '%Y-%m')`,
      [studentIds],
    )
    const byCase = new Map(counts.map((row) => [row.case_id, row]))
    const familyOf = new Map(familyPunctual.map((row) => [row.student_id, row.contact]))
    const referralOf = new Map(referrals.map((row) => [row.student_id, row]))
    const schoolOf = new Map(school.map((row) => [`${row.student_id}|${row.month}`, row]))
    const ageAt = (birth, on) => {
      if (!birth) return ''
      const [by, bm, bd] = birth.split('-').map(Number)
      const [y, m, d] = on.split('-').map(Number)
      return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
    }
    const attended = { Realizada: 'Sí', 'No asistió': 'No' }
    res.json({
      ok: true,
      rows: rows.map((row) => {
        const totals = row.case_id ? byCase.get(row.case_id) || {} : { scheduled: row.attention_status === 'Realizada' ? 1 : 0, attended: row.attention_status === 'Realizada' ? 1 : 0, missed: 0 }
        const contact = totals.guardian_contact || familyOf.get(row.student_id) || ''
        const referral = referralOf.get(row.student_id)
        const month = row.day.slice(0, 7)
        const schoolMonth = schoolOf.get(`${row.student_id}|${month}`) || {}
        return {
          attentionId: row.attention_id,
          studentId: row.student_id,
          studentCode: row.student_code,
          fullName: `${row.last_names}, ${row.first_names}`,
          dni: row.dni || '',
          birthDate: row.birth || '',
          age: ageAt(row.birth, row.day),
          level: row.level,
          grade: row.grade,
          section: row.section,
          shift: row.shift || '',
          guardian: row.guardian || '',
          relationship: row.guardian_relationship || '',
          phone: row.phone || '',
          phoneAlt: row.phone_alt || '',
          guardianEmail: row.guardian_email || '',
          date: row.day,
          time: row.hour,
          attentionCode: `AT-${String(row.attention_id).padStart(5, '0')}`,
          type: row.case_id ? row.type : `${row.type} (puntual)`,
          category: row.reason || '',
          adminReason: row.admin_reason || '',
          attentionStatus: row.attention_status,
          psychologist: row.psychologist || '',
          attended: attended[row.attention_status] || '—',
          scheduled: Number(totals.scheduled || 0),
          attendedCount: Number(totals.attended || 0),
          missedCount: Number(totals.missed || 0),
          nextAppointment: totals.next_one || '',
          followUp: row.case_status || 'Atención puntual',
          referred: referral ? 'Sí' : 'No',
          referralDestination: referral?.institution || '',
          referralStatus: referral?.status || '',
          guardianContact: contact ? 'Sí' : 'No',
          contactDate: contact,
          adminNotes: row.admin_notes || '',
          schoolPresent: Number(schoolMonth.present || 0),
          schoolLate: Number(schoolMonth.late || 0),
          schoolAbsent: Number(schoolMonth.absent || 0),
          reportMonth: month.slice(5),
          reportYear: month.slice(0, 4),
        }
      }),
    })
  }))

  return router
}

/* --------------------------------------------------------------- schema */

async function addColumns(db, table, columns) {
  for (const [name, type] of columns) {
    const [existing] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name])
    if (!existing.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
  }
}

async function makeNullable(db, table, column) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column])
  if (rows[0]?.Null === 'NO') await db.query(`ALTER TABLE ${table} MODIFY ${column} INT UNSIGNED NULL`)
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
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_psych_cases_student (student_id),
    INDEX idx_psych_cases_status (status),
    CONSTRAINT fk_psych_cases_student FOREIGN KEY (student_id) REFERENCES students(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await addColumns(db, 'psych_cases', [
    ['admin_reason', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['admin_notes', "VARCHAR(500) NOT NULL DEFAULT ''"],
    ['objective', 'TEXT NULL'],
    ['initial_actions', 'TEXT NULL'],
  ])
  // Case statuses of the manual: En seguimiento / Pendiente / Cerrado.
  await db.query("UPDATE psych_cases SET status = 'Pendiente' WHERE status = 'Abierto'")
  await db.query("UPDATE psych_cases SET status = 'En seguimiento' WHERE status = 'Derivado'")

  await db.query(`CREATE TABLE IF NOT EXISTS psych_sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id INT UNSIGNED NULL,
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
  // An attention can be punctual (no case), so sessions point to the student directly.
  await makeNullable(db, 'psych_sessions', 'case_id')
  await addColumns(db, 'psych_sessions', [
    ['student_id', 'INT UNSIGNED NULL'],
    ['origin', "VARCHAR(10) NOT NULL DEFAULT 'cita'"],
    ['end_time', 'TIME NULL'],
    ['modality', "VARCHAR(12) NOT NULL DEFAULT ''"],
    ['topic', "VARCHAR(255) NOT NULL DEFAULT ''"],
    ['reason', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['referred_by', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['referrer_name', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['risk_level', "VARCHAR(10) NOT NULL DEFAULT ''"],
    ['admin_reason', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['admin_notes', "VARCHAR(500) NOT NULL DEFAULT ''"],
    ['rescheduled_from', 'INT UNSIGNED NULL'],
  ])
  await db.query('UPDATE psych_sessions x JOIN psych_cases c ON c.id = x.case_id SET x.student_id = c.student_id WHERE x.student_id IS NULL')
  const [sessionIndex] = await db.query("SHOW INDEX FROM psych_sessions WHERE Key_name = 'idx_psych_sessions_student'")
  if (!sessionIndex.length) await db.query('ALTER TABLE psych_sessions ADD INDEX idx_psych_sessions_student (student_id)')

  await db.query(`CREATE TABLE IF NOT EXISTS psych_referrals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id INT UNSIGNED NULL,
    date DATE NOT NULL,
    institution VARCHAR(80) NOT NULL,
    specialist VARCHAR(160) NOT NULL DEFAULT '',
    reason TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'En proceso',
    response TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_psych_referrals_status (status),
    CONSTRAINT fk_psych_referrals_case FOREIGN KEY (case_id) REFERENCES psych_cases(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // A referral may exist without a case: it belongs to the student and carries its own code.
  await makeNullable(db, 'psych_referrals', 'case_id')
  await addColumns(db, 'psych_referrals', [
    ['code', 'VARCHAR(20) NULL'],
    ['student_id', 'INT UNSIGNED NULL'],
    ['motive', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['destination_type', "VARCHAR(10) NOT NULL DEFAULT 'externa'"],
    ['objective', 'TEXT NULL'],
    ['deadline', 'DATE NULL'],
  ])
  await db.query('UPDATE psych_referrals r JOIN psych_cases c ON c.id = r.case_id SET r.student_id = c.student_id WHERE r.student_id IS NULL')
  await db.query("UPDATE psych_referrals SET code = CONCAT('DE-', LPAD(id, 4, '0')) WHERE code IS NULL OR code = ''")
  await db.query("UPDATE psych_referrals SET status = 'En proceso' WHERE status IN ('Pendiente', 'En atención')")
  await db.query("UPDATE psych_referrals SET status = 'No atendida' WHERE status = 'Sin respuesta'")
  const [referralIndex] = await db.query("SHOW INDEX FROM psych_referrals WHERE Key_name = 'idx_psych_referrals_student'")
  if (!referralIndex.length) await db.query('ALTER TABLE psych_referrals ADD INDEX idx_psych_referrals_student (student_id)')
}
