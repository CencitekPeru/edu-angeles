import express from 'express'
import { getPool } from './db.js'
import { requireAdmin, requireAuth } from './campus.js'
import { nowLima } from './attendance.js'
import { FINE_STATUS, GUARDIAN_ATTENDANCE, MEETING_STATUS, MEETING_TYPES } from '../src/lib/guardianMeetings.js'

/**
 * Control de inasistencias y deudas de padres y apoderados:
 * convocatorias (reuniones, asambleas…) → asistencia de los apoderados registrados en la matrícula (por DNI)
 * → multas por inasistencia, con su pago o exoneración. The debt is shown when a guardian is looked up and in the parent portal.
 */

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const text = (value, max) => String(value ?? '').trim().slice(0, max)
const oneOf = (list, value, fallback = '') => (list.includes(value) ? value : fallback)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error })
const day = (value) => (value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : '')
const money = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) && number >= 0 && number <= 10000 ? Math.round(number * 100) / 100 : null
}

/* ------------------------------------------------------------- meetings */

const MEETING_SELECT = `SELECT m.*, DATE_FORMAT(m.date, '%Y-%m-%d') AS day, TIME_FORMAT(m.start_time, '%H:%i') AS hour, u.name AS created_by_name,
    (SELECT COUNT(*) FROM guardian_meeting_attendance a WHERE a.meeting_id = m.id AND a.status IN ('presente', 'tardanza')) AS attended,
    (SELECT COUNT(*) FROM guardian_meeting_attendance a WHERE a.meeting_id = m.id AND a.status = 'falta') AS absent,
    (SELECT COUNT(*) FROM guardian_meeting_attendance a WHERE a.meeting_id = m.id AND a.status = 'justificado') AS justified,
    (SELECT COUNT(*) FROM guardian_fines f WHERE f.meeting_id = m.id) AS fines,
    (SELECT COALESCE(SUM(f.amount), 0) FROM guardian_fines f WHERE f.meeting_id = m.id AND f.status = 'Pendiente') AS pending_amount
  FROM guardian_meetings m LEFT JOIN users u ON u.id = m.created_by`

const mapMeeting = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  description: row.description || '',
  date: row.day,
  time: row.hour || '',
  place: row.place || '',
  level: row.scope_level || '',
  grade: row.scope_grade || '',
  section: row.scope_section || '',
  fineAmount: Number(row.fine_amount || 0),
  status: row.status,
  closed: Boolean(row.attendance_closed),
  createdBy: row.created_by_name || '',
  stats: { attended: Number(row.attended || 0), absent: Number(row.absent || 0), justified: Number(row.justified || 0), fines: Number(row.fines || 0), pending: Number(row.pending_amount || 0) },
})

function meetingInput(body) {
  const input = {
    title: text(body.title, 200),
    type: oneOf(MEETING_TYPES, body.type),
    description: text(body.description, 1000),
    date: isDate(body.date) ? body.date : '',
    time: isTime(body.time) ? body.time : null,
    place: text(body.place, 160),
    level: text(body.level, 20),
    grade: body.level ? text(body.grade, 10) : '',
    section: body.level && body.grade ? text(body.section, 5) : '',
    fineAmount: money(body.fineAmount),
    status: oneOf(MEETING_STATUS, body.status, 'Programada'),
  }
  if (input.title.length < 4) return { error: 'Escribe el tema o título de la convocatoria.' }
  if (!input.type) return { error: 'Selecciona el tipo de convocatoria.' }
  if (!input.date) return { error: 'Indica la fecha de la convocatoria.' }
  if (input.fineAmount === null) return { error: 'El monto de la multa no es válido.' }
  return input
}

/** Guardians called to a meeting: those with an active student in its scope (level / grade / section). */
async function scopeGuardians(db, meeting) {
  const where = ['g.active = 1']
  const params = []
  if (meeting.scope_level) { where.push('s.level = ?'); params.push(meeting.scope_level) }
  if (meeting.scope_grade) { where.push('s.grade = ?'); params.push(meeting.scope_grade) }
  if (meeting.scope_section) { where.push('s.section = ?'); params.push(meeting.scope_section) }
  const [rows] = await db.query(
    `SELECT g.id, g.dni, g.name, g.phone,
       GROUP_CONCAT(CONCAT(s.last_names, ', ', s.first_names, ' (', s.level, ' ', s.grade, ' ', s.section, ')') ORDER BY s.last_names SEPARATOR '; ') AS students
     FROM guardians g
     JOIN guardian_students gs ON gs.guardian_id = g.id
     JOIN students s ON s.id = gs.student_id AND s.active = 1
     WHERE ${where.join(' AND ')}
     GROUP BY g.id ORDER BY g.name`,
    params,
  )
  return rows
}

/** Keeps the fine of one guardian in step with their attendance once the meeting is closed. */
async function syncFine(db, meeting, guardianId, status, userId) {
  if (!meeting.attendance_closed) return
  if (status === 'falta' && Number(meeting.fine_amount) > 0) {
    await db.query(
      `INSERT IGNORE INTO guardian_fines (guardian_id, meeting_id, concept, amount, status, issued_on, created_by)
       VALUES (?, ?, ?, ?, 'Pendiente', ?, ?)`,
      [guardianId, meeting.id, `Inasistencia: ${meeting.title}`, meeting.fine_amount, day(meeting.date), userId],
    )
  } else {
    // A corrected absence drops its unpaid fine (paid or waived fines are kept as history).
    await db.query("DELETE FROM guardian_fines WHERE meeting_id = ? AND guardian_id = ? AND status = 'Pendiente'", [meeting.id, guardianId])
  }
}

async function findMeeting(db, id) {
  const [rows] = await db.query('SELECT * FROM guardian_meetings WHERE id = ?', [id])
  return rows[0] || null
}

/* ---------------------------------------------------------------- fines */

const FINE_SELECT = `SELECT f.*, DATE_FORMAT(f.issued_on, '%Y-%m-%d') AS issued_day, DATE_FORMAT(f.paid_on, '%Y-%m-%d') AS paid_day,
    g.dni, g.name AS guardian_name, g.phone, m.title AS meeting_title, DATE_FORMAT(m.date, '%Y-%m-%d') AS meeting_day, m.type AS meeting_type,
    (SELECT GROUP_CONCAT(CONCAT(s.last_names, ', ', s.first_names, ' (', s.grade, ' ', s.section, ')') SEPARATOR '; ')
       FROM guardian_students gs JOIN students s ON s.id = gs.student_id AND s.active = 1 WHERE gs.guardian_id = g.id) AS students,
    u.name AS updated_by_name
  FROM guardian_fines f
  JOIN guardians g ON g.id = f.guardian_id
  LEFT JOIN guardian_meetings m ON m.id = f.meeting_id
  LEFT JOIN users u ON u.id = COALESCE(f.updated_by, f.created_by)`

const mapFine = (row) => ({
  id: row.id,
  guardian: { id: row.guardian_id, dni: row.dni, name: row.guardian_name || 'Apoderado', phone: row.phone || '', students: row.students || '' },
  meeting: row.meeting_id ? { id: row.meeting_id, title: row.meeting_title, date: row.meeting_day, type: row.meeting_type } : null,
  concept: row.concept,
  amount: Number(row.amount),
  status: row.status,
  issuedOn: row.issued_day,
  paidOn: row.paid_day || '',
  receipt: row.receipt || '',
  note: row.note || '',
  updatedBy: row.updated_by_name || '',
})

/** Fines of a guardian and what they owe. Also used by the parent portal. */
export async function guardianDebt(guardianId) {
  const [rows] = await getPool().query(`${FINE_SELECT} WHERE f.guardian_id = ? ORDER BY f.status = 'Pendiente' DESC, f.issued_on DESC, f.id DESC`, [guardianId])
  const fines = rows.map(mapFine)
  const pending = fines.filter((fine) => fine.status === 'Pendiente')
  return { fines, pendingCount: pending.length, pendingAmount: Math.round(pending.reduce((total, fine) => total + fine.amount, 0) * 100) / 100 }
}

/* --------------------------------------------------------------- router */

export function guardianMeetingsRouter() {
  const router = express.Router()

  /* ---- meetings */
  router.get('/api/parent-meetings', requireAuth, wrap(async (req, res) => {
    const year = /^\d{4}$/.test(String(req.query.year || '')) ? req.query.year : null
    const [rows] = await getPool().query(`${MEETING_SELECT}${year ? ' WHERE YEAR(m.date) = ?' : ''} ORDER BY m.date DESC, m.start_time DESC`, year ? [year] : [])
    res.json({ ok: true, today: nowLima().date, meetings: rows.map(mapMeeting) })
  }))

  router.post('/api/parent-meetings', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = meetingInput(req.body)
    if (input.error) return bad(res, input.error)
    const [created] = await getPool().query(
      `INSERT INTO guardian_meetings (title, type, description, date, start_time, place, scope_level, scope_grade, scope_section, fine_amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.title, input.type, input.description, input.date, input.time, input.place, input.level, input.grade, input.section, input.fineAmount, input.status, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/parent-meetings/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const meeting = await findMeeting(db, req.params.id)
    if (!meeting) return bad(res, 'La convocatoria ya no existe.', 404)
    const input = meetingInput(req.body)
    if (input.error) return bad(res, input.error)
    // Once attendance is closed the scope is fixed (the list of called guardians was already decided).
    const scopeChanged = meeting.scope_level !== input.level || meeting.scope_grade !== input.grade || meeting.scope_section !== input.section
    if (meeting.attendance_closed && scopeChanged) return bad(res, 'La asistencia ya fue cerrada: no se puede cambiar a quiénes se convocó.')
    await db.query(
      `UPDATE guardian_meetings SET title = ?, type = ?, description = ?, date = ?, start_time = ?, place = ?, scope_level = ?, scope_grade = ?, scope_section = ?,
         fine_amount = ?, status = ? WHERE id = ?`,
      [input.title, input.type, input.description, input.date, input.time, input.place, input.level, input.grade, input.section, input.fineAmount,
        meeting.attendance_closed ? 'Realizada' : input.status, req.params.id],
    )
    // A new amount updates the fines not paid yet.
    if (meeting.attendance_closed && Number(meeting.fine_amount) !== input.fineAmount) {
      if (input.fineAmount > 0) await db.query("UPDATE guardian_fines SET amount = ? WHERE meeting_id = ? AND status = 'Pendiente'", [input.fineAmount, req.params.id])
      else await db.query("DELETE FROM guardian_fines WHERE meeting_id = ? AND status = 'Pendiente'", [req.params.id])
    }
    res.json({ ok: true })
  }))

  router.delete('/api/parent-meetings/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const [kept] = await db.query("SELECT COUNT(*) AS total FROM guardian_fines WHERE meeting_id = ? AND status <> 'Pendiente'", [req.params.id])
    if (Number(kept[0].total)) return bad(res, 'La convocatoria tiene multas pagadas o exoneradas: no se puede eliminar para conservar el historial.', 409)
    await db.query('DELETE FROM guardian_fines WHERE meeting_id = ?', [req.params.id])
    await db.query('DELETE FROM guardian_meeting_attendance WHERE meeting_id = ?', [req.params.id])
    const [result] = await db.query('DELETE FROM guardian_meetings WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La convocatoria ya no existe.', 404)
    res.json({ ok: true })
  }))

  /** Called guardians with their attendance (plus anyone marked who is no longer in the scope). */
  router.get('/api/parent-meetings/:id/roster', requireAuth, wrap(async (req, res) => {
    const db = getPool()
    const meeting = await findMeeting(db, req.params.id)
    if (!meeting) return bad(res, 'La convocatoria ya no existe.', 404)
    const roster = await scopeGuardians(db, meeting)
    const [marks] = await db.query(
      `SELECT a.*, DATE_FORMAT(a.marked_at, '%H:%i') AS marked_hour, g.dni, g.name, g.phone
         FROM guardian_meeting_attendance a JOIN guardians g ON g.id = a.guardian_id WHERE a.meeting_id = ?`,
      [req.params.id],
    )
    const [fines] = await db.query('SELECT guardian_id, status FROM guardian_fines WHERE meeting_id = ?', [req.params.id])
    const byGuardian = new Map(marks.map((row) => [row.guardian_id, row]))
    const fineOf = new Map(fines.map((row) => [row.guardian_id, row.status]))
    const people = roster.map((row) => ({ ...row, mark: byGuardian.get(row.id) }))
    for (const mark of marks) if (!roster.some((row) => row.id === mark.guardian_id)) people.push({ id: mark.guardian_id, dni: mark.dni, name: mark.name, phone: mark.phone, students: '', mark })
    res.json({
      ok: true,
      meeting: mapMeeting({ ...meeting, day: day(meeting.date), hour: meeting.start_time ? String(meeting.start_time).slice(0, 5) : '' }),
      guardians: people.map((row) => ({
        id: row.id, dni: row.dni, name: row.name || 'Apoderado', phone: row.phone || '', students: row.students || '',
        status: row.mark?.status || null, note: row.mark?.note || '', markedAt: row.mark?.marked_hour || '', fine: fineOf.get(row.id) || null,
      })),
    })
  }))

  router.put('/api/parent-meetings/:id/attendance', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const meeting = await findMeeting(db, req.params.id)
    if (!meeting) return bad(res, 'La convocatoria ya no existe.', 404)
    if (meeting.status === 'Cancelada') return bad(res, 'La convocatoria está cancelada.')
    const status = oneOf(GUARDIAN_ATTENDANCE, req.body.status)
    const guardianId = Number(req.body.guardianId)
    if (!status || !guardianId) return bad(res, 'Indica el apoderado y su asistencia.')
    await db.query(
      `INSERT INTO guardian_meeting_attendance (meeting_id, guardian_id, status, note, marked_by) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), marked_by = VALUES(marked_by), marked_at = CURRENT_TIMESTAMP`,
      [meeting.id, guardianId, status, text(req.body.note, 255), req.user.id],
    )
    await syncFine(db, meeting, guardianId, status, req.user.id)
    res.json({ ok: true })
  }))

  /** Marks attendance by the guardian's DNI (typed or read from their ID card). */
  router.post('/api/parent-meetings/:id/attendance/dni', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const meeting = await findMeeting(db, req.params.id)
    if (!meeting) return bad(res, 'La convocatoria ya no existe.', 404)
    if (meeting.status === 'Cancelada') return bad(res, 'La convocatoria está cancelada.')
    const dni = String(req.body.dni || '').replace(/\D/g, '')
    if (!/^\d{8}$/.test(dni)) return bad(res, 'El DNI debe tener 8 dígitos.')
    const [found] = await db.query('SELECT id, name FROM guardians WHERE dni = ?', [dni])
    if (!found[0]) return bad(res, 'Ese DNI no está registrado como padre o apoderado de ningún estudiante. Regístralo en la ficha del estudiante (matrícula).', 404)
    const called = (await scopeGuardians(db, meeting)).some((row) => row.id === found[0].id)
    if (!called) return bad(res, `${found[0].name || 'El apoderado'} no está convocado a esta reunión (sus hijos no pertenecen al alcance de la convocatoria).`, 409)
    const status = oneOf(['presente', 'tardanza'], req.body.status, 'presente')
    await db.query(
      `INSERT INTO guardian_meeting_attendance (meeting_id, guardian_id, status, note, marked_by) VALUES (?, ?, ?, '', ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by), marked_at = CURRENT_TIMESTAMP`,
      [meeting.id, found[0].id, status, req.user.id],
    )
    await syncFine(db, meeting, found[0].id, status, req.user.id)
    res.json({ ok: true, guardian: { id: found[0].id, name: found[0].name || 'Apoderado' }, status })
  }))

  /** Ends the roll call: whoever was not marked is absent, and each absence gets its fine. */
  router.post('/api/parent-meetings/:id/close', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const meeting = await findMeeting(db, req.params.id)
    if (!meeting) return bad(res, 'La convocatoria ya no existe.', 404)
    if (meeting.status === 'Cancelada') return bad(res, 'La convocatoria está cancelada.')
    if (meeting.attendance_closed) return bad(res, 'La asistencia ya fue cerrada.')
    const roster = await scopeGuardians(db, meeting)
    for (const guardian of roster) {
      await db.query("INSERT IGNORE INTO guardian_meeting_attendance (meeting_id, guardian_id, status, note, marked_by) VALUES (?, ?, 'falta', 'Sin registro al cerrar la asistencia', ?)",
        [meeting.id, guardian.id, req.user.id])
    }
    await db.query("UPDATE guardian_meetings SET attendance_closed = 1, status = 'Realizada' WHERE id = ?", [meeting.id])
    const closed = { ...meeting, attendance_closed: 1 }
    const [absent] = await db.query("SELECT guardian_id FROM guardian_meeting_attendance WHERE meeting_id = ? AND status = 'falta'", [meeting.id])
    for (const row of absent) await syncFine(db, closed, row.guardian_id, 'falta', req.user.id)
    res.json({ ok: true, absent: absent.length, fines: Number(meeting.fine_amount) > 0 ? absent.length : 0 })
  }))

  /* ---- fines */
  router.get('/api/parent-fines', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${FINE_SELECT} ORDER BY f.status = 'Pendiente' DESC, f.issued_on DESC, f.id DESC`)
    res.json({ ok: true, fines: rows.map(mapFine) })
  }))

  /** Manual fine (another obligation agreed by the parents' association, for instance). */
  router.post('/api/parent-fines', requireAuth, requireAdmin, wrap(async (req, res) => {
    const dni = String(req.body.dni || '').replace(/\D/g, '')
    const concept = text(req.body.concept, 200)
    const amount = money(req.body.amount)
    const issuedOn = isDate(req.body.issuedOn) ? req.body.issuedOn : nowLima().date
    if (!/^\d{8}$/.test(dni)) return bad(res, 'El DNI debe tener 8 dígitos.')
    if (concept.length < 4) return bad(res, 'Describe el concepto de la multa.')
    if (!amount) return bad(res, 'Indica un monto mayor a cero.')
    const [found] = await getPool().query('SELECT id FROM guardians WHERE dni = ?', [dni])
    if (!found[0]) return bad(res, 'Ese DNI no está registrado como padre o apoderado.', 404)
    const [created] = await getPool().query(
      "INSERT INTO guardian_fines (guardian_id, concept, amount, status, issued_on, note, created_by) VALUES (?, ?, ?, 'Pendiente', ?, ?, ?)",
      [found[0].id, concept, amount, issuedOn, text(req.body.note, 255), req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  /** Payment, waiver or back to pending. */
  router.patch('/api/parent-fines/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const status = oneOf(FINE_STATUS, req.body.status)
    if (!status) return bad(res, 'Estado no válido.')
    const note = text(req.body.note, 255)
    const receipt = text(req.body.receipt, 60)
    const paidOn = isDate(req.body.paidOn) ? req.body.paidOn : nowLima().date
    if (status === 'Exonerada' && note.length < 4) return bad(res, 'Indica el motivo de la exoneración.')
    const [result] = await getPool().query(
      'UPDATE guardian_fines SET status = ?, paid_on = ?, receipt = ?, note = ?, updated_by = ? WHERE id = ?',
      [status, status === 'Pagada' ? paidOn : null, status === 'Pagada' ? receipt : '', note, req.user.id, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'La multa ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/parent-fines/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [rows] = await getPool().query('SELECT status FROM guardian_fines WHERE id = ?', [req.params.id])
    if (!rows[0]) return bad(res, 'La multa ya no existe.', 404)
    if (rows[0].status === 'Pagada') return bad(res, 'Una multa pagada no se elimina: se conserva como comprobante.', 409)
    await getPool().query('DELETE FROM guardian_fines WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  /* ---- lookup by DNI */
  router.get('/api/guardians/lookup', requireAuth, wrap(async (req, res) => {
    const dni = String(req.query.dni || '').replace(/\D/g, '')
    if (!/^\d{8}$/.test(dni)) return bad(res, 'El DNI debe tener 8 dígitos.')
    const db = getPool()
    const [rows] = await db.query('SELECT id, dni, name, phone, active FROM guardians WHERE dni = ?', [dni])
    const guardian = rows[0]
    if (!guardian) return bad(res, 'Ese DNI no está registrado como padre o apoderado. Se registra en la ficha del estudiante, durante la matrícula.', 404)
    const [students] = await db.query(
      `SELECT s.id, s.code, s.first_names, s.last_names, s.level, s.grade, s.section, s.photo, s.guardian_relationship
         FROM guardian_students gs JOIN students s ON s.id = gs.student_id AND s.active = 1 WHERE gs.guardian_id = ? ORDER BY s.last_names`,
      [guardian.id],
    )
    const [meetings] = await db.query(
      `SELECT m.id, m.title, m.type, DATE_FORMAT(m.date, '%Y-%m-%d') AS day, a.status, a.note
         FROM guardian_meeting_attendance a JOIN guardian_meetings m ON m.id = a.meeting_id WHERE a.guardian_id = ? ORDER BY m.date DESC LIMIT 50`,
      [guardian.id],
    )
    res.json({
      ok: true,
      guardian: { id: guardian.id, dni: guardian.dni, name: guardian.name || 'Apoderado', phone: guardian.phone || '', active: Boolean(guardian.active) },
      students: students.map((row) => ({ id: row.id, code: row.code, name: `${row.last_names}, ${row.first_names}`, level: row.level, grade: row.grade, section: row.section, photo: row.photo, relationship: row.guardian_relationship || '' })),
      meetings: meetings.map((row) => ({ id: row.id, title: row.title, type: row.type, date: row.day, status: row.status, note: row.note || '' })),
      ...(await guardianDebt(guardian.id)),
    })
  }))

  return router
}

export async function ensureGuardianMeetings() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS guardian_meetings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(40) NOT NULL,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    date DATE NOT NULL,
    start_time TIME NULL,
    place VARCHAR(160) NOT NULL DEFAULT '',
    scope_level VARCHAR(20) NOT NULL DEFAULT '',
    scope_grade VARCHAR(10) NOT NULL DEFAULT '',
    scope_section VARCHAR(5) NOT NULL DEFAULT '',
    fine_amount DECIMAL(8,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Programada',
    attendance_closed TINYINT(1) NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_guardian_meetings_date (date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS guardian_meeting_attendance (
    meeting_id INT UNSIGNED NOT NULL,
    guardian_id INT UNSIGNED NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(255) NOT NULL DEFAULT '',
    marked_by INT UNSIGNED NULL,
    marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (meeting_id, guardian_id),
    INDEX idx_gma_guardian (guardian_id),
    CONSTRAINT fk_gma_meeting FOREIGN KEY (meeting_id) REFERENCES guardian_meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_gma_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS guardian_fines (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guardian_id INT UNSIGNED NOT NULL,
    meeting_id INT UNSIGNED NULL,
    concept VARCHAR(200) NOT NULL,
    amount DECIMAL(8,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    issued_on DATE NOT NULL,
    paid_on DATE NULL,
    receipt VARCHAR(60) NOT NULL DEFAULT '',
    note VARCHAR(255) NOT NULL DEFAULT '',
    created_by INT UNSIGNED NULL,
    updated_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fine_meeting (meeting_id, guardian_id),
    INDEX idx_fines_guardian (guardian_id, status),
    CONSTRAINT fk_fines_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE,
    CONSTRAINT fk_fines_meeting FOREIGN KEY (meeting_id) REFERENCES guardian_meetings(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
