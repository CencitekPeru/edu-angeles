import express from 'express'
import { getPool } from './db.js'
import { requireAdmin, requireAuth } from './campus.js'
import { nowLima } from './attendance.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export const ACTIVITY_TYPES = ['Cívica', 'Académica', 'Cultural', 'Deportiva', 'Ambiental', 'Gestión del riesgo', 'Religiosa', 'Reunión institucional', 'Escuela de padres', 'Salida / visita de estudio', 'Capacitación', 'Otra']
export const ACTIVITY_LEVELS = ['Institucional', 'Primaria', 'Secundaria']
export const ACTIVITY_STATUS = ['Planificada', 'En preparación', 'En ejecución', 'Realizada', 'Postergada', 'Cancelada']
export const TASK_STATUS = ['Pendiente', 'En proceso', 'Completada']
export const RESOURCE_CATEGORIES = ['Material', 'Equipo', 'Ambiente', 'Presupuesto', 'Transporte', 'Alimentación', 'Otro']
export const RESOURCE_STATUS = ['Solicitado', 'Aprobado', 'Entregado', 'No disponible']

const text = (value, max) => String(value ?? '').trim().slice(0, max)
const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))
const money = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN
}
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error })

/** Levels whose staff an activity needs: both for the whole school, otherwise just its own. */
export const staffLevels = (level) => (level === 'Primaria' ? ['Primaria'] : level === 'Secundaria' ? ['Secundaria'] : ['Secundaria', 'Primaria'])

/** Lead teacher and supporting teachers per level: { Secundaria: { lead, support: [] }, Primaria: {...} }. */
function parseStaff(value) {
  let raw = value
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const staff = {}
  for (const level of ['Secundaria', 'Primaria']) {
    const entry = raw && typeof raw === 'object' ? raw[level] : null
    if (!entry || typeof entry !== 'object') continue
    const lead = text(entry.lead, 160)
    const support = [...new Set((Array.isArray(entry.support) ? entry.support : []).map((name) => text(name, 160)).filter((name) => name && name !== lead))].slice(0, 20)
    if (lead || support.length) staff[level] = { lead, support }
  }
  return staff
}

/* ------------------------------------------------------------- activities */

const ACTIVITY_SELECT = `SELECT a.*, DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_day, DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_day,
    TIME_FORMAT(a.start_time, '%H:%i') AS start_hour, TIME_FORMAT(a.end_time, '%H:%i') AS end_hour,
    c.name AS commission_name, c.coordinator AS commission_coordinator, u.name AS created_by_name,
    (SELECT COUNT(*) FROM activity_tasks t WHERE t.activity_id = a.id) AS tasks_total,
    (SELECT COUNT(*) FROM activity_tasks t WHERE t.activity_id = a.id AND t.status = 'Completada') AS tasks_done,
    (SELECT COUNT(*) FROM activity_tasks t WHERE t.activity_id = a.id AND t.status <> 'Completada' AND t.due_date < ?) AS tasks_overdue,
    (SELECT COUNT(*) FROM activity_resources r WHERE r.activity_id = a.id) AS resources_total,
    (SELECT COALESCE(SUM(r.estimated_cost * r.quantity), 0) FROM activity_resources r WHERE r.activity_id = a.id AND r.status <> 'No disponible') AS resources_cost,
    (SELECT COUNT(*) FROM activity_reports p WHERE p.activity_id = a.id) AS has_report
  FROM activities a
  LEFT JOIN commissions c ON c.id = a.commission_id
  LEFT JOIN users u ON u.id = a.created_by`

function mapActivity(row) {
  const total = Number(row.tasks_total || 0)
  const done = Number(row.tasks_done || 0)
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type,
    description: row.description || '',
    objective: row.objective || '',
    startDate: row.start_day,
    endDate: row.end_day || row.start_day,
    startTime: row.start_hour || '',
    endTime: row.end_hour || '',
    place: row.place || '',
    level: row.level,
    audience: row.audience || '',
    commissionId: row.commission_id,
    commissionName: row.commission_name || '',
    commissionCoordinator: row.commission_coordinator || '',
    responsible: row.responsible || '',
    staff: parseStaff(row.staff),
    status: row.status,
    budget: row.budget === null ? null : Number(row.budget),
    createdBy: row.created_by_name || '',
    tasks: { total, done, overdue: Number(row.tasks_overdue || 0), progress: total ? Math.round((done / total) * 100) : null },
    resources: { total: Number(row.resources_total || 0), cost: Number(row.resources_cost || 0) },
    hasReport: Number(row.has_report || 0) > 0,
  }
}

function activityInput(body) {
  const level = oneOf(ACTIVITY_LEVELS, body.level, 'Institucional')
  const allStaff = parseStaff(body.staff)
  const staff = Object.fromEntries(staffLevels(level).filter((item) => allStaff[item]).map((item) => [item, allStaff[item]]))
  const leads = staffLevels(level).map((item) => staff[item]?.lead).filter(Boolean)
  return {
    staff,
    hasStaff: body.staff !== undefined,
    title: text(body.title, 200),
    type: oneOf(ACTIVITY_TYPES, body.type, ''),
    description: text(body.description, 4000),
    objective: text(body.objective, 2000),
    startDate: isDate(body.startDate) ? body.startDate : '',
    endDate: isDate(body.endDate) ? body.endDate : '',
    startTime: isTime(body.startTime) ? body.startTime : '',
    endTime: isTime(body.endTime) ? body.endTime : '',
    place: text(body.place, 160),
    level,
    audience: text(body.audience, 160),
    commissionId: Number(body.commissionId) || null,
    responsible: leads.length ? text(leads.join(' / '), 160) : text(body.responsible, 160),
    status: oneOf(ACTIVITY_STATUS, body.status, 'Planificada'),
    budget: money(body.budget),
  }
}

function activityError(input) {
  if (input.title.length < 3) return 'Escribe el nombre de la actividad.'
  if (!input.type) return 'Selecciona el tipo de actividad.'
  if (!input.startDate) return 'Indica la fecha de la actividad.'
  if (input.endDate && input.endDate < input.startDate) return 'La fecha de fin no puede ser anterior a la de inicio.'
  if (input.startTime && input.endTime && (!input.endDate || input.endDate === input.startDate) && input.endTime <= input.startTime) return 'La hora de fin debe ser posterior a la de inicio.'
  if (Number.isNaN(input.budget)) return 'El presupuesto debe ser un número igual o mayor que cero.'
  if (input.hasStaff) {
    if (!input.commissionId) return 'Selecciona el comité de gestión.'
    const missing = staffLevels(input.level).find((level) => !input.staff[level]?.lead)
    if (missing) return `Selecciona el responsable principal del nivel ${missing}.`
  }
  if (!input.commissionId && !input.responsible) return 'Indica la comisión o la persona responsable.'
  return null
}

async function nextCode(db) {
  const [rows] = await db.query("SELECT code FROM activities WHERE code LIKE 'ACT-%' ORDER BY CAST(SUBSTRING(code, 5) AS UNSIGNED) DESC LIMIT 1")
  const last = rows[0] ? Number(String(rows[0].code).slice(4)) || 0 : 0
  return `ACT-${String(last + 1).padStart(4, '0')}`
}

/* ------------------------------------------------------- tasks / resources */

const TASK_SELECT = `SELECT t.*, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_day, DATE_FORMAT(t.completed_on, '%Y-%m-%d') AS completed_day,
    a.code AS activity_code, a.title AS activity_title, DATE_FORMAT(a.start_date, '%Y-%m-%d') AS activity_date, a.status AS activity_status
  FROM activity_tasks t JOIN activities a ON a.id = t.activity_id`

const mapTask = (row) => ({
  id: row.id,
  activityId: row.activity_id,
  activityCode: row.activity_code,
  activityTitle: row.activity_title,
  activityDate: row.activity_date,
  activityStatus: row.activity_status,
  title: row.title,
  responsible: row.responsible || '',
  dueDate: row.due_day || '',
  status: row.status,
  notes: row.notes || '',
  completedOn: row.completed_day || '',
})

const RESOURCE_SELECT = `SELECT r.*, a.code AS activity_code, a.title AS activity_title, DATE_FORMAT(a.start_date, '%Y-%m-%d') AS activity_date
  FROM activity_resources r JOIN activities a ON a.id = r.activity_id`

const mapResource = (row) => ({
  id: row.id,
  activityId: row.activity_id,
  activityCode: row.activity_code,
  activityTitle: row.activity_title,
  activityDate: row.activity_date,
  category: row.category,
  description: row.description,
  quantity: Number(row.quantity),
  unit: row.unit || '',
  estimatedCost: row.estimated_cost === null ? null : Number(row.estimated_cost),
  status: row.status,
  provider: row.provider || '',
  notes: row.notes || '',
})

const REPORT_SELECT = `SELECT p.*, DATE_FORMAT(p.report_date, '%Y-%m-%d') AS report_day, u.name AS created_by_name,
    a.code AS activity_code, a.title AS activity_title, a.type AS activity_type, DATE_FORMAT(a.start_date, '%Y-%m-%d') AS activity_date, a.level AS activity_level
  FROM activity_reports p JOIN activities a ON a.id = p.activity_id LEFT JOIN users u ON u.id = p.created_by`

const mapReport = (row) => ({
  id: row.id,
  activityId: row.activity_id,
  activityCode: row.activity_code,
  activityTitle: row.activity_title,
  activityType: row.activity_type,
  activityDate: row.activity_date,
  activityLevel: row.activity_level,
  reportDate: row.report_day,
  participants: row.participants === null ? null : Number(row.participants),
  summary: row.summary || '',
  achievements: row.achievements || '',
  difficulties: row.difficulties || '',
  recommendations: row.recommendations || '',
  evidence: row.evidence || '',
  createdBy: row.created_by_name || '',
})

/* ------------------------------------------------------------- commissions */

function parseMembers(value) {
  try {
    const list = JSON.parse(value || '[]')
    return Array.isArray(list) ? list.map((item) => ({ name: text(item.name, 160), role: text(item.role, 80) })).filter((item) => item.name) : []
  } catch {
    return []
  }
}

const mapCommission = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  coordinator: row.coordinator || '',
  members: parseMembers(row.members),
  active: Boolean(row.active),
  activities: Number(row.activities || 0),
  upcoming: Number(row.upcoming || 0),
})

/* ------------------------------------------------------------------ router */

export function activitiesRouter() {
  const router = express.Router()

  router.get('/api/activities/options', requireAuth, (_req, res) => {
    res.json({ ok: true, types: ACTIVITY_TYPES, levels: ACTIVITY_LEVELS, status: ACTIVITY_STATUS, taskStatus: TASK_STATUS, resourceCategories: RESOURCE_CATEGORIES, resourceStatus: RESOURCE_STATUS })
  })

  router.get('/api/activities', requireAuth, wrap(async (req, res) => {
    const { date } = nowLima()
    const where = []
    const params = [date]
    // An activity belongs to a period when its days overlap it.
    if (isDate(req.query.from)) { where.push('COALESCE(a.end_date, a.start_date) >= ?'); params.push(req.query.from) }
    if (isDate(req.query.to)) { where.push('a.start_date <= ?'); params.push(req.query.to) }
    const [rows] = await getPool().query(`${ACTIVITY_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY a.start_date, a.start_time`, params)
    res.json({ ok: true, today: date, activities: rows.map(mapActivity) })
  }))

  router.get('/api/activities/:id', requireAuth, wrap(async (req, res) => {
    const db = getPool()
    const { date } = nowLima()
    const [rows] = await db.query(`${ACTIVITY_SELECT} WHERE a.id = ?`, [date, req.params.id])
    if (!rows.length) return bad(res, 'La actividad ya no existe.', 404)
    const [tasks] = await db.query(`${TASK_SELECT} WHERE t.activity_id = ? ORDER BY t.status = 'Completada', t.due_date IS NULL, t.due_date, t.id`, [req.params.id])
    const [resources] = await db.query(`${RESOURCE_SELECT} WHERE r.activity_id = ? ORDER BY r.id`, [req.params.id])
    const [reports] = await db.query(`${REPORT_SELECT} WHERE p.activity_id = ?`, [req.params.id])
    res.json({ ok: true, activity: mapActivity(rows[0]), tasks: tasks.map(mapTask), resources: resources.map(mapResource), report: reports[0] ? mapReport(reports[0]) : null })
  }))

  router.post('/api/activities', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = activityInput(req.body)
    const error = activityError(input)
    if (error) return bad(res, error)
    const db = getPool()
    const code = await nextCode(db)
    const [created] = await db.query(
      `INSERT INTO activities (code, title, type, description, objective, start_date, end_date, start_time, end_time, place, level, audience, commission_id, responsible, staff, status, budget, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.title, input.type, input.description, input.objective, input.startDate, input.endDate || null, input.startTime || null, input.endTime || null,
        input.place, input.level, input.audience, input.commissionId, input.responsible, JSON.stringify(input.staff), input.status, input.budget, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/activities/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = activityInput(req.body)
    const error = activityError(input)
    if (error) return bad(res, error)
    const [result] = await getPool().query(
      `UPDATE activities SET title = ?, type = ?, description = ?, objective = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?, place = ?, level = ?,
         audience = ?, commission_id = ?, responsible = ?, staff = IF(?, ?, staff), status = ?, budget = ? WHERE id = ?`,
      [input.title, input.type, input.description, input.objective, input.startDate, input.endDate || null, input.startTime || null, input.endTime || null, input.place,
        input.level, input.audience, input.commissionId, input.responsible, input.hasStaff, JSON.stringify(input.staff), input.status, input.budget, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'La actividad ya no existe.', 404)
    res.json({ ok: true })
  }))

  /** Quick status change from the follow-up view. */
  router.patch('/api/activities/:id/status', requireAuth, requireAdmin, wrap(async (req, res) => {
    const status = oneOf(ACTIVITY_STATUS, req.body.status, '')
    if (!status) return bad(res, 'Estado no válido.')
    const [result] = await getPool().query('UPDATE activities SET status = ? WHERE id = ?', [status, req.params.id])
    if (!result.affectedRows) return bad(res, 'La actividad ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/activities/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM activities WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La actividad ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ---- tasks (seguimiento) */
  router.get('/api/activity-tasks', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${TASK_SELECT} ORDER BY t.status = 'Completada', t.due_date IS NULL, t.due_date, a.start_date`)
    res.json({ ok: true, tasks: rows.map(mapTask) })
  }))

  function taskInput(body) {
    return {
      title: text(body.title, 200),
      responsible: text(body.responsible, 160),
      dueDate: isDate(body.dueDate) ? body.dueDate : null,
      status: oneOf(TASK_STATUS, body.status, 'Pendiente'),
      notes: text(body.notes, 2000),
    }
  }

  router.post('/api/activities/:id/tasks', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = taskInput(req.body)
    if (input.title.length < 3) return bad(res, 'Describe la tarea.')
    if (!input.responsible) return bad(res, 'Indica el responsable de la tarea.')
    const [activities] = await getPool().query('SELECT id FROM activities WHERE id = ?', [req.params.id])
    if (!activities.length) return bad(res, 'La actividad ya no existe.', 404)
    const [created] = await getPool().query(
      'INSERT INTO activity_tasks (activity_id, title, responsible, due_date, status, notes, completed_on) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, input.title, input.responsible, input.dueDate, input.status, input.notes, input.status === 'Completada' ? nowLima().date : null],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/activity-tasks/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = taskInput(req.body)
    if (input.title.length < 3 || !input.responsible) return bad(res, 'Completa la tarea y su responsable.')
    const [result] = await getPool().query(
      `UPDATE activity_tasks SET title = ?, responsible = ?, due_date = ?, status = ?, notes = ?,
         completed_on = IF(? = 'Completada', COALESCE(completed_on, ?), NULL) WHERE id = ?`,
      [input.title, input.responsible, input.dueDate, input.status, input.notes, input.status, nowLima().date, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'La tarea ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/activity-tasks/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM activity_tasks WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La tarea ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ---- resources */
  router.get('/api/activity-resources', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${RESOURCE_SELECT} ORDER BY a.start_date DESC, r.id`)
    res.json({ ok: true, resources: rows.map(mapResource) })
  }))

  function resourceInput(body) {
    const quantity = Number(body.quantity)
    return {
      category: oneOf(RESOURCE_CATEGORIES, body.category, ''),
      description: text(body.description, 200),
      quantity: Number.isSafeInteger(quantity) && quantity > 0 ? quantity : NaN,
      unit: text(body.unit, 40) || 'unidad',
      estimatedCost: money(body.estimatedCost),
      status: oneOf(RESOURCE_STATUS, body.status, 'Solicitado'),
      provider: text(body.provider, 160),
      notes: text(body.notes, 1000),
    }
  }
  const resourceError = (input) => (!input.category ? 'Selecciona la categoría del recurso.'
    : input.description.length < 2 ? 'Describe el recurso.'
      : Number.isNaN(input.quantity) ? 'La cantidad debe ser un número entero mayor que cero.'
        : Number.isNaN(input.estimatedCost) ? 'El costo estimado debe ser un número igual o mayor que cero.' : null)

  router.post('/api/activities/:id/resources', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = resourceInput(req.body)
    const error = resourceError(input)
    if (error) return bad(res, error)
    const [activities] = await getPool().query('SELECT id FROM activities WHERE id = ?', [req.params.id])
    if (!activities.length) return bad(res, 'La actividad ya no existe.', 404)
    const [created] = await getPool().query(
      'INSERT INTO activity_resources (activity_id, category, description, quantity, unit, estimated_cost, status, provider, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, input.category, input.description, input.quantity, input.unit, input.estimatedCost, input.status, input.provider, input.notes],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/activity-resources/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = resourceInput(req.body)
    const error = resourceError(input)
    if (error) return bad(res, error)
    const [result] = await getPool().query(
      'UPDATE activity_resources SET category = ?, description = ?, quantity = ?, unit = ?, estimated_cost = ?, status = ?, provider = ?, notes = ? WHERE id = ?',
      [input.category, input.description, input.quantity, input.unit, input.estimatedCost, input.status, input.provider, input.notes, req.params.id],
    )
    if (!result.affectedRows) return bad(res, 'El recurso ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/activity-resources/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM activity_resources WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'El recurso ya no existe.', 404)
    res.json({ ok: true })
  }))

  /* ---- reports (one per activity) */
  router.get('/api/activity-reports', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${REPORT_SELECT} ORDER BY a.start_date DESC`)
    res.json({ ok: true, reports: rows.map(mapReport) })
  }))

  router.put('/api/activities/:id/report', requireAuth, requireAdmin, wrap(async (req, res) => {
    const body = req.body
    const participants = body.participants === '' || body.participants === null || body.participants === undefined ? null : Number(body.participants)
    const input = {
      reportDate: isDate(body.reportDate) ? body.reportDate : nowLima().date,
      participants: participants === null || (Number.isSafeInteger(participants) && participants >= 0) ? participants : NaN,
      summary: text(body.summary, 6000),
      achievements: text(body.achievements, 4000),
      difficulties: text(body.difficulties, 4000),
      recommendations: text(body.recommendations, 4000),
      evidence: text(body.evidence, 4000),
    }
    if (Number.isNaN(input.participants)) return bad(res, 'El número de participantes debe ser un entero igual o mayor que cero.')
    if (input.summary.length < 5) return bad(res, 'Describe cómo se desarrolló la actividad.')
    if (input.achievements.length < 3) return bad(res, 'Registra los logros alcanzados.')
    const db = getPool()
    const [activities] = await db.query('SELECT id, start_date, status FROM activities WHERE id = ?', [req.params.id])
    if (!activities.length) return bad(res, 'La actividad ya no existe.', 404)
    if (['Cancelada', 'Postergada'].includes(activities[0].status)) return bad(res, `La actividad está «${activities[0].status}»: no corresponde un informe de resultados.`)
    await db.query(
      `INSERT INTO activity_reports (activity_id, report_date, participants, summary, achievements, difficulties, recommendations, evidence, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE report_date = VALUES(report_date), participants = VALUES(participants), summary = VALUES(summary), achievements = VALUES(achievements),
         difficulties = VALUES(difficulties), recommendations = VALUES(recommendations), evidence = VALUES(evidence)`,
      [req.params.id, input.reportDate, input.participants, input.summary, input.achievements, input.difficulties, input.recommendations, input.evidence, req.user.id],
    )
    // A report means the activity took place.
    await db.query("UPDATE activities SET status = 'Realizada' WHERE id = ?", [req.params.id])
    res.json({ ok: true })
  }))

  router.delete('/api/activities/:id/report', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM activity_reports WHERE activity_id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La actividad no tiene informe.', 404)
    res.json({ ok: true })
  }))

  /* ---- commissions */
  router.get('/api/commissions', requireAuth, wrap(async (_req, res) => {
    const { date } = nowLima()
    const [rows] = await getPool().query(
      `SELECT c.*, (SELECT COUNT(*) FROM activities a WHERE a.commission_id = c.id) AS activities,
              (SELECT COUNT(*) FROM activities a WHERE a.commission_id = c.id AND COALESCE(a.end_date, a.start_date) >= ? AND a.status NOT IN ('Realizada', 'Cancelada')) AS upcoming
         FROM commissions c ORDER BY c.active DESC, c.name`,
      [date],
    )
    res.json({ ok: true, commissions: rows.map(mapCommission) })
  }))

  function commissionInput(body) {
    const members = Array.isArray(body.members) ? body.members.map((item) => ({ name: text(item?.name, 160), role: text(item?.role, 80) })).filter((item) => item.name).slice(0, 40) : []
    return { name: text(body.name, 160), description: text(body.description, 1000), coordinator: text(body.coordinator, 160), members, active: body.active === false ? 0 : 1 }
  }

  router.post('/api/commissions', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = commissionInput(req.body)
    if (input.name.length < 3) return bad(res, 'Escribe el nombre de la comisión.')
    if (!input.coordinator) return bad(res, 'Indica el coordinador(a) de la comisión.')
    const [dup] = await getPool().query('SELECT id FROM commissions WHERE name = ?', [input.name])
    if (dup.length) return bad(res, 'Ya existe una comisión con ese nombre.', 409)
    const [created] = await getPool().query('INSERT INTO commissions (name, description, coordinator, members, active) VALUES (?, ?, ?, ?, ?)',
      [input.name, input.description, input.coordinator, JSON.stringify(input.members), input.active])
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/commissions/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = commissionInput(req.body)
    if (input.name.length < 3 || !input.coordinator) return bad(res, 'Completa el nombre y el coordinador(a) de la comisión.')
    const [dup] = await getPool().query('SELECT id FROM commissions WHERE name = ? AND id <> ?', [input.name, req.params.id])
    if (dup.length) return bad(res, 'Ya existe una comisión con ese nombre.', 409)
    const [result] = await getPool().query('UPDATE commissions SET name = ?, description = ?, coordinator = ?, members = ?, active = ? WHERE id = ?',
      [input.name, input.description, input.coordinator, JSON.stringify(input.members), input.active, req.params.id])
    if (!result.affectedRows) return bad(res, 'La comisión ya no existe.', 404)
    res.json({ ok: true })
  }))

  router.delete('/api/commissions/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [used] = await getPool().query('SELECT COUNT(*) AS total FROM activities WHERE commission_id = ?', [req.params.id])
    if (Number(used[0].total)) return bad(res, `La comisión tiene ${used[0].total} actividad(es) a su cargo. Desactívala en lugar de eliminarla para conservar el historial.`, 409)
    const [result] = await getPool().query('DELETE FROM commissions WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return bad(res, 'La comisión ya no existe.', 404)
    res.json({ ok: true })
  }))

  return router
}

export async function ensureActivities() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS commissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    coordinator VARCHAR(160) NOT NULL DEFAULT '',
    members TEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS activities (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(40) NOT NULL,
    description TEXT NULL,
    objective TEXT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    place VARCHAR(160) NOT NULL DEFAULT '',
    level VARCHAR(20) NOT NULL DEFAULT 'Institucional',
    audience VARCHAR(160) NOT NULL DEFAULT '',
    commission_id INT UNSIGNED NULL,
    responsible VARCHAR(160) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'Planificada',
    budget DECIMAL(10,2) NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activities_date (start_date),
    CONSTRAINT fk_activities_commission FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  const [staffColumn] = await db.query("SHOW COLUMNS FROM activities LIKE 'staff'")
  if (!staffColumn.length) await db.query('ALTER TABLE activities ADD COLUMN staff TEXT NULL AFTER responsible')
  await db.query(`CREATE TABLE IF NOT EXISTS activity_tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    activity_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    responsible VARCHAR(160) NOT NULL DEFAULT '',
    due_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    notes TEXT NULL,
    completed_on DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_tasks_due (due_date),
    CONSTRAINT fk_activity_tasks_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS activity_resources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    activity_id INT UNSIGNED NOT NULL,
    category VARCHAR(40) NOT NULL,
    description VARCHAR(200) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit VARCHAR(40) NOT NULL DEFAULT 'unidad',
    estimated_cost DECIMAL(10,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Solicitado',
    provider VARCHAR(160) NOT NULL DEFAULT '',
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_resources_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS activity_reports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    activity_id INT UNSIGNED NOT NULL UNIQUE,
    report_date DATE NOT NULL,
    participants INT UNSIGNED NULL,
    summary TEXT NULL,
    achievements TEXT NULL,
    difficulties TEXT NULL,
    recommendations TEXT NULL,
    evidence TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_reports_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
