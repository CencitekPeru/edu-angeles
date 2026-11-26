import express from 'express'
import { getPool } from './db.js'
import { requireAuth } from './campus.js'
import { addDays, nowLima, parseISODate, toISODate, toMinutes } from '../src/lib/time.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export const CLASS_ATTENDANCE = ['asistio', 'no_asistio']
const KINDS = ['request', 'fixed']
/** How many days back a teacher may still mark a class. */
const WINDOW_DAYS = 30

/** A class can be marked once it has started (Lima time). */
function hasStarted(date, startTime, now = nowLima()) {
  return date < now.date || (date === now.date && toMinutes(startTime) <= now.minutes)
}

function windowStart(now = nowLima()) {
  return toISODate(addDays(now.date, -WINDOW_DAYS))
}

const time = (value) => String(value).slice(0, 5)
const day = (value) => (value instanceof Date ? toISODate(value) : String(value).slice(0, 10))

export async function ensureClassAttendance() {
  await getPool().query(`CREATE TABLE IF NOT EXISTS class_attendance (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT UNSIGNED NOT NULL,
    kind ENUM('request', 'fixed') NOT NULL,
    ref_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('asistio', 'no_asistio') NOT NULL,
    note VARCHAR(255) NOT NULL DEFAULT '',
    marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_class_attendance (kind, ref_id, date),
    INDEX idx_class_attendance_teacher (teacher_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}

/** Approved reservations and fixed-schedule classes of a teacher from `from` to today, with their attendance mark. */
async function teacherClasses(teacherId) {
  const db = getPool()
  const now = nowLima()
  const from = windowStart(now)
  const [[requests], [fixed], [marks]] = await Promise.all([
    db.query(
      `SELECT r.id, r.date, r.start_time, r.end_time, r.grade, r.section, r.purpose, rooms.name AS room_name
       FROM requests r LEFT JOIN rooms ON rooms.id = r.room_id
       WHERE r.teacher_id = ? AND r.status = 'approved' AND r.date BETWEEN ? AND ?`,
      [teacherId, from, now.date],
    ),
    db.query(
      `SELECT f.id, f.weekday, f.start_time, f.end_time, f.grade, f.section, f.purpose, rooms.name AS room_name
       FROM fixed_schedules f LEFT JOIN rooms ON rooms.id = f.room_id
       WHERE f.teacher_id = ?`,
      [teacherId],
    ),
    db.query(
      `SELECT kind, ref_id, DATE_FORMAT(date, '%Y-%m-%d') AS day, status, note, marked_at
       FROM class_attendance WHERE teacher_id = ? AND date BETWEEN ? AND ?`,
      [teacherId, from, now.date],
    ),
  ])
  const markOf = new Map(marks.map((row) => [`${row.kind}:${row.ref_id}:${row.day}`, row]))
  const items = []
  const push = (kind, row, date) => {
    const mark = markOf.get(`${kind}:${row.id}:${date}`)
    const startTime = time(row.start_time)
    items.push({
      key: `${kind}:${row.id}:${date}`,
      kind,
      refId: row.id,
      date,
      startTime,
      endTime: time(row.end_time),
      grade: row.grade,
      section: row.section,
      purpose: row.purpose,
      roomName: row.room_name || '',
      status: mark?.status || '',
      note: mark?.note || '',
      markedAt: mark?.marked_at ? new Date(mark.marked_at).toISOString() : '',
      canMark: hasStarted(date, startTime, now),
    })
  }
  for (const row of requests) push('request', row, day(row.date))
  for (let cursor = from; cursor <= now.date; cursor = toISODate(addDays(cursor, 1))) {
    const weekday = parseISODate(cursor).getDay()
    for (const row of fixed) if (Number(row.weekday) === weekday) push('fixed', row, cursor)
  }
  return items.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
}

export function classAttendanceRouter() {
  const router = express.Router()

  router.get('/api/my-classes', requireAuth, wrap(async (req, res) => {
    res.json({ ok: true, windowDays: WINDOW_DAYS, items: await teacherClasses(req.user.id) })
  }))

  router.post('/api/my-classes/attendance', requireAuth, wrap(async (req, res) => {
    const body = req.body || {}
    const kind = String(body.kind || '')
    const refId = Number(body.refId)
    const date = String(body.date || '')
    const status = body.status ? String(body.status) : ''
    const note = String(body.note || '').trim().slice(0, 255)
    if (!KINDS.includes(kind) || !refId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'Clase no válida.' })
    }
    if (status && !CLASS_ATTENDANCE.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Marca no válida.' })
    }
    const db = getPool()
    const now = nowLima()
    if (date < windowStart(now)) {
      return res.status(400).json({ ok: false, error: `Solo puedes marcar clases de los últimos ${WINDOW_DAYS} días.` })
    }

    let startTime
    if (kind === 'request') {
      const [rows] = await db.query(
        `SELECT start_time, DATE_FORMAT(date, '%Y-%m-%d') AS day, status FROM requests WHERE id = ? AND teacher_id = ?`,
        [refId, req.user.id],
      )
      const row = rows[0]
      if (!row || row.day !== date) return res.status(404).json({ ok: false, error: 'No se encontró tu reserva.' })
      if (row.status !== 'approved') return res.status(400).json({ ok: false, error: 'Solo se marcan reservas aprobadas.' })
      startTime = time(row.start_time)
    } else {
      const [rows] = await db.query('SELECT start_time, weekday FROM fixed_schedules WHERE id = ? AND teacher_id = ?', [refId, req.user.id])
      const row = rows[0]
      if (!row || Number(row.weekday) !== parseISODate(date).getDay()) {
        return res.status(404).json({ ok: false, error: 'No se encontró tu horario fijo para ese día.' })
      }
      startTime = time(row.start_time)
    }
    if (!hasStarted(date, startTime, now)) {
      return res.status(400).json({ ok: false, error: 'Podrás marcar la asistencia cuando empiece la clase.' })
    }

    if (status) {
      await db.query(
        `INSERT INTO class_attendance (teacher_id, kind, ref_id, date, status, note) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note)`,
        [req.user.id, kind, refId, date, status, note],
      )
    } else {
      await db.query('DELETE FROM class_attendance WHERE kind = ? AND ref_id = ? AND date = ? AND teacher_id = ?', [kind, refId, date, req.user.id])
    }
    res.json({ ok: true, items: await teacherClasses(req.user.id) })
  }))

  return router
}
