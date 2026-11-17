import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { getPool } from './db.js'
import { requireAdmin, requireAuth } from './campus.js'
import { nowLima } from './attendance.js'
import {
  ADMIN_DOC_STATUS, ADMIN_DOC_TYPES, APPROVAL_TYPES, AREAS, CONFORMATION_TYPES, DOC_KINDS, ENTITIES, EXTERNAL_DOC_STATUS, EXTERNAL_DOC_TYPES,
  INSTRUMENT_STATUS, INSTRUMENT_TYPES, MEMBER_CONDITIONS, MEMBER_LEVELS, MEMBER_POSITIONS, ORG_SCOPES, ORG_STATUS,
} from '../src/lib/documents.js'

/**
 * Gestión documental: management instruments (PEI, PCI, PAT, RI), institutional organization (committees,
 * commissions and members), documents from outside entities (UGEL, DRE, MINEDU…) and internal administrative documents.
 * PDFs are kept outside the public uploads folder and are only served to signed-in users with access to the module.
 */

const fileDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'document-files')
fs.mkdirSync(fileDir, { recursive: true })

const MAX_MB = 50
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: fileDir,
    filename: (_req, _file, done) => done(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    const pdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '')
    done(pdf ? null : Object.assign(new Error('Solo se aceptan archivos PDF.'), { status: 400 }), pdf)
  },
}).single('file')

/** Multer with a friendly message for files that are too large or not PDF. */
function withFile(req, res, next) {
  pdfUpload(req, res, (error) => {
    if (!error) {
      // The name and type come from the browser: check that the content really is a PDF.
      if (!req.file) return next()
      const head = Buffer.alloc(5)
      const handle = fs.openSync(req.file.path, 'r')
      fs.readSync(handle, head, 0, 5, 0)
      fs.closeSync(handle)
      if (head.toString('latin1') === '%PDF-') return next()
      discard(req)
      return res.status(400).json({ ok: false, error: 'El archivo no es un PDF válido.' })
    }
    const message = error.code === 'LIMIT_FILE_SIZE' ? `El archivo supera el tamaño máximo de ${MAX_MB} MB.` : error.message || 'No se pudo subir el archivo.'
    res.status(400).json({ ok: false, error: message })
  })
}

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const text = (value, max) => String(value ?? '').trim().slice(0, max)
const oneOf = (list, value, fallback = '') => (list.includes(value) ? value : fallback)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const dateOrNull = (value) => (isDate(value) ? value : null)
const year = (value) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 2000 && number <= 2100 ? number : null
}
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error })

/** Form fields arrive as a JSON string named `data` (multipart, next to the PDF) or as a plain JSON body. */
function bodyOf(req) {
  if (typeof req.body?.data !== 'string') return req.body || {}
  try { return JSON.parse(req.body.data) } catch { return {} }
}

const removeFile = (stored) => {
  if (!stored) return
  const full = path.join(fileDir, path.basename(stored))
  fs.promises.unlink(full).catch(() => {})
}
/** Drops the file just uploaded when the request is rejected. */
const discard = (req) => removeFile(req.file?.filename)

const fileOf = (row) => (row.file_path ? { name: row.file_name || 'documento.pdf', size: Number(row.file_size || 0) } : null)

/* -------------------------------------------------------------- records */

const RECORD_SELECT = `SELECT d.*, DATE_FORMAT(d.issue_date, '%Y-%m-%d') AS issue_day, DATE_FORMAT(d.received_date, '%Y-%m-%d') AS received_day,
    DATE_FORMAT(d.deadline, '%Y-%m-%d') AS deadline_day, DATE_FORMAT(d.attended_date, '%Y-%m-%d') AS attended_day,
    DATE_FORMAT(d.created_at, '%Y-%m-%d') AS created_day, u.name AS created_by_name,
    (SELECT COUNT(*) FROM doc_tracking t WHERE t.record_id = d.id) AS tracking_count
  FROM doc_records d LEFT JOIN users u ON u.id = d.created_by`

/** Instruments past their last year and pending documents past their deadline show as «Vencido» / «No vigente». */
function displayStatus(row, today) {
  if (row.kind === 'instrumento' && row.status === 'Vigente' && row.end_year && Number(row.end_year) < Number(today.slice(0, 4))) return 'No vigente'
  if (row.kind !== 'instrumento' && ['Recibido', 'En seguimiento', 'En trámite'].includes(row.status) && row.deadline_day && row.deadline_day < today) return 'Vencido'
  return row.status
}

function mapRecord(row, today) {
  return {
    id: row.id,
    kind: row.kind,
    docType: row.doc_type,
    number: row.number || '',
    title: row.title,
    description: row.description || '',
    issueDate: row.issue_day || '',
    receivedDate: row.received_day || '',
    deadline: row.deadline_day || '',
    attendedDate: row.attended_day || '',
    status: row.status,
    displayStatus: displayStatus(row, today),
    entity: row.entity || '',
    area: row.area || '',
    sender: row.sender || '',
    senderRole: row.sender_role || '',
    responsible: row.responsible || '',
    responsibleRole: row.responsible_role || '',
    approvalType: row.approval_type || '',
    startYear: row.start_year,
    endYear: row.end_year,
    version: row.version || '',
    actions: row.actions || '',
    file: fileOf(row),
    createdOn: row.created_day,
    createdBy: row.created_by_name || '',
    trackingCount: Number(row.tracking_count || 0),
  }
}

/** Validated fields of a record, per kind; returns { error } when something required is missing. */
function recordInput(kind, body) {
  const base = {
    number: text(body.number, 80),
    title: text(body.title, 300),
    description: text(body.description, 500),
    issueDate: dateOrNull(body.issueDate),
    receivedDate: null,
    deadline: null,
    attendedDate: dateOrNull(body.attendedDate),
    entity: '',
    area: text(body.area, 120),
    sender: '',
    senderRole: '',
    responsible: text(body.responsible, 160),
    responsibleRole: text(body.responsibleRole, 120),
    approvalType: '',
    startYear: null,
    endYear: null,
    version: '',
    actions: text(body.actions, 500),
  }
  if (kind === 'instrumento') {
    const input = {
      ...base,
      docType: oneOf(INSTRUMENT_TYPES, body.docType),
      status: oneOf(INSTRUMENT_STATUS, body.status, 'Vigente'),
      approvalType: oneOf(APPROVAL_TYPES, body.approvalType, APPROVAL_TYPES[0]),
      description: text(body.description, 300),
      startYear: year(body.startYear),
      endYear: year(body.endYear),
      version: text(body.version, 20) || 'v1.0',
      attendedDate: null,
      actions: '',
    }
    if (!input.docType) return { error: 'Selecciona el tipo de instrumento.' }
    if (input.title.length < 5) return { error: 'Escribe el título del instrumento.' }
    if (!input.number) return { error: 'Indica el número de resolución o documento de aprobación.' }
    if (!input.issueDate) return { error: 'Indica la fecha de aprobación.' }
    if (!input.startYear || !input.endYear) return { error: 'Indica el año de inicio y de fin de la vigencia.' }
    if (input.endYear < input.startYear) return { error: 'El año de fin no puede ser anterior al de inicio.' }
    if (!input.responsible) return { error: 'Indica el responsable principal.' }
    return input
  }
  if (kind === 'externo') {
    const input = {
      ...base,
      docType: oneOf(EXTERNAL_DOC_TYPES, body.docType),
      status: oneOf(EXTERNAL_DOC_STATUS, body.status, 'Recibido'),
      title: text(body.title, 300),
      entity: oneOf(ENTITIES, body.entity),
      sender: text(body.sender, 160),
      senderRole: text(body.senderRole, 120),
      receivedDate: dateOrNull(body.receivedDate),
      deadline: dateOrNull(body.deadline),
    }
    if (!input.docType) return { error: 'Selecciona el tipo de documento.' }
    if (!input.number) return { error: 'Indica el número de documento.' }
    if (!input.issueDate) return { error: 'Indica la fecha de emisión.' }
    if (input.title.length < 5) return { error: 'Escribe el asunto del documento.' }
    if (!input.entity) return { error: 'Selecciona la entidad remitente.' }
    if (!input.responsible) return { error: 'Indica el responsable de atención.' }
    if (!input.receivedDate) return { error: 'Indica la fecha de recepción.' }
    if (input.deadline && input.deadline < input.receivedDate) return { error: 'El plazo de atención no puede ser anterior a la recepción.' }
    return input
  }
  const input = {
    ...base,
    docType: oneOf(ADMIN_DOC_TYPES, body.docType),
    status: oneOf(ADMIN_DOC_STATUS, body.status, 'En trámite'),
    receivedDate: dateOrNull(body.receivedDate),
    deadline: dateOrNull(body.deadline),
    area: oneOf(AREAS, body.area),
  }
  if (!input.docType) return { error: 'Selecciona el tipo de documento.' }
  if (!input.number) return { error: 'Indica el número de documento.' }
  if (!input.issueDate) return { error: 'Indica la fecha del documento.' }
  if (input.title.length < 5) return { error: 'Escribe el asunto del documento.' }
  if (!input.area) return { error: 'Selecciona el área o dependencia.' }
  if (!input.responsible) return { error: 'Indica el responsable de elaboración.' }
  if (!input.receivedDate) return { error: 'Indica la fecha de registro.' }
  if (input.actions.length < 5) return { error: 'Describe las acciones realizadas o el contenido del documento.' }
  return input
}

const RECORD_COLUMNS = ['doc_type', 'number', 'title', 'description', 'issue_date', 'received_date', 'deadline', 'attended_date', 'status', 'entity', 'area',
  'sender', 'sender_role', 'responsible', 'responsible_role', 'approval_type', 'start_year', 'end_year', 'version', 'actions']
const recordValues = (input) => [input.docType, input.number, input.title, input.description, input.issueDate, input.receivedDate, input.deadline, input.attendedDate,
  input.status, input.entity, input.area, input.sender, input.senderRole, input.responsible, input.responsibleRole, input.approvalType, input.startYear, input.endYear,
  input.version, input.actions]

/* -------------------------------------------------------- organization */

function parseMembers(value) {
  let list = value
  if (typeof list === 'string') {
    try { list = JSON.parse(list || '[]') } catch { list = [] }
  }
  return (Array.isArray(list) ? list : []).map((item) => ({
    name: text(item?.name, 160),
    userId: Number(item?.userId) || null,
    position: oneOf(MEMBER_POSITIONS, item?.position, 'Miembro'),
    condition: oneOf(MEMBER_CONDITIONS, item?.condition, 'Titular'),
    level: oneOf(MEMBER_LEVELS, item?.level, MEMBER_LEVELS[0]),
  })).filter((item) => item.name).slice(0, 60)
}

const ORG_SELECT = `SELECT o.*, DATE_FORMAT(o.doc_date, '%Y-%m-%d') AS doc_day, DATE_FORMAT(o.valid_from, '%Y-%m-%d') AS from_day,
    DATE_FORMAT(o.valid_to, '%Y-%m-%d') AS to_day, DATE_FORMAT(o.created_at, '%Y-%m-%d') AS created_day, u.name AS created_by_name
  FROM doc_organizations o LEFT JOIN users u ON u.id = o.created_by`

const mapOrganization = (row) => ({
  id: row.id,
  committee: row.committee,
  commission: row.commission,
  objective: row.objective || '',
  status: row.status,
  year: row.school_year,
  scope: row.scope,
  members: parseMembers(row.members),
  docType: row.doc_type,
  docNumber: row.doc_number || '',
  docDate: row.doc_day || '',
  validFrom: row.from_day || '',
  validTo: row.to_day || '',
  file: fileOf(row),
  createdOn: row.created_day,
  createdBy: row.created_by_name || '',
})

function organizationInput(body) {
  const input = {
    committee: text(body.committee, 160),
    commission: text(body.commission, 200),
    objective: text(body.objective, 300),
    status: oneOf(ORG_STATUS, body.status, 'Activo'),
    year: year(body.year),
    scope: oneOf(ORG_SCOPES, body.scope, ORG_SCOPES[0]),
    members: parseMembers(body.members),
    docType: oneOf(CONFORMATION_TYPES, body.docType, CONFORMATION_TYPES[0]),
    docNumber: text(body.docNumber, 80),
    docDate: dateOrNull(body.docDate),
    validFrom: dateOrNull(body.validFrom),
    validTo: dateOrNull(body.validTo),
  }
  if (input.committee.length < 3) return { error: 'Indica el comité de gestión.' }
  if (input.commission.length < 3) return { error: 'Indica la comisión de trabajo.' }
  if (input.objective.length < 5) return { error: 'Escribe la finalidad u objetivo de la comisión.' }
  if (!input.year) return { error: 'Indica el año escolar.' }
  if (!input.members.length) return { error: 'Agrega al menos un integrante a la comisión.' }
  if (!input.docNumber) return { error: 'Indica el número del documento de conformación.' }
  if (!input.docDate) return { error: 'Indica la fecha de emisión del documento.' }
  if (!input.validFrom || !input.validTo) return { error: 'Indica el inicio y el fin de la vigencia.' }
  if (input.validTo < input.validFrom) return { error: 'El fin de la vigencia no puede ser anterior al inicio.' }
  return input
}

/* ---------------------------------------------------------------- files */

/** Sends a stored PDF: inline to view it in the browser, or as an attachment to download it. */
function sendPdf(res, row, inline) {
  if (!row?.file_path) return bad(res, 'Este registro no tiene un documento adjunto.', 404)
  const full = path.join(fileDir, path.basename(row.file_path))
  if (!fs.existsSync(full)) return bad(res, 'El archivo ya no se encuentra en el servidor.', 404)
  const name = String(row.file_name || 'documento.pdf').replace(/["\\\r\n]/g, '')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
  res.sendFile(full)
}

/* --------------------------------------------------------------- router */

export function documentsRouter() {
  const router = express.Router()

  /* ---- records: instrumentos, externos, administrativos */
  router.get('/api/docs/records', requireAuth, wrap(async (req, res) => {
    const kind = oneOf(DOC_KINDS, req.query.kind)
    if (!kind) return bad(res, 'Sección no válida.')
    const { date } = nowLima()
    const [rows] = await getPool().query(`${RECORD_SELECT} WHERE d.kind = ? ORDER BY COALESCE(d.received_date, d.issue_date) DESC, d.id DESC`, [kind])
    res.json({ ok: true, today: date, records: rows.map((row) => mapRecord(row, date)) })
  }))

  router.post('/api/docs/records', requireAuth, requireAdmin, withFile, wrap(async (req, res) => {
    const body = bodyOf(req)
    const kind = oneOf(DOC_KINDS, body.kind)
    if (!kind) { discard(req); return bad(res, 'Sección no válida.') }
    const input = recordInput(kind, body)
    if (input.error) { discard(req); return bad(res, input.error) }
    const db = getPool()
    const [created] = await db.query(
      `INSERT INTO doc_records (kind, ${RECORD_COLUMNS.join(', ')}, file_path, file_name, file_size, created_by)
       VALUES (?, ${RECORD_COLUMNS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
      [kind, ...recordValues(input), req.file?.filename || null, req.file ? text(req.file.originalname, 255) : null, req.file?.size || null, req.user.id],
    )
    if (kind !== 'instrumento') {
      await db.query('INSERT INTO doc_tracking (record_id, status, note, created_by) VALUES (?, ?, ?, ?)',
        [created.insertId, input.status, kind === 'externo' ? 'Documento recibido y registrado.' : 'Documento registrado.', req.user.id])
    }
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/docs/records/:id', requireAuth, requireAdmin, withFile, wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT kind, status, file_path FROM doc_records WHERE id = ?', [req.params.id])
    const current = rows[0]
    if (!current) { discard(req); return bad(res, 'El registro ya no existe.', 404) }
    const body = bodyOf(req)
    const input = recordInput(current.kind, body)
    if (input.error) { discard(req); return bad(res, input.error) }
    // A new PDF replaces the old one; `removeFile` drops the attachment without replacing it.
    const replace = Boolean(req.file) || body.removeFile === true
    await db.query(
      `UPDATE doc_records SET ${RECORD_COLUMNS.map((column) => `${column} = ?`).join(', ')},
         file_path = IF(?, ?, file_path), file_name = IF(?, ?, file_name), file_size = IF(?, ?, file_size) WHERE id = ?`,
      [...recordValues(input), replace, req.file?.filename || null, replace, req.file ? text(req.file.originalname, 255) : null, replace, req.file?.size || null, req.params.id],
    )
    if (replace) removeFile(current.file_path)
    if (current.kind !== 'instrumento' && current.status !== input.status) {
      await db.query('INSERT INTO doc_tracking (record_id, status, note, created_by) VALUES (?, ?, ?, ?)',
        [req.params.id, input.status, `Estado cambiado de «${current.status}» a «${input.status}».`, req.user.id])
    }
    res.json({ ok: true })
  }))

  router.delete('/api/docs/records/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT file_path FROM doc_records WHERE id = ?', [req.params.id])
    if (!rows[0]) return bad(res, 'El registro ya no existe.', 404)
    await db.query('DELETE FROM doc_tracking WHERE record_id = ?', [req.params.id])
    await db.query('DELETE FROM doc_records WHERE id = ?', [req.params.id])
    removeFile(rows[0].file_path)
    res.json({ ok: true })
  }))

  router.get('/api/docs/records/:id/file', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query('SELECT file_path, file_name FROM doc_records WHERE id = ?', [req.params.id])
    if (!rows[0]) return bad(res, 'El registro ya no existe.', 404)
    sendPdf(res, rows[0], req.query.inline === '1')
  }))

  /* ---- follow-up of external and administrative documents */
  router.get('/api/docs/records/:id/tracking', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(
      `SELECT t.id, t.status, t.note, DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS created, u.name AS user_name
         FROM doc_tracking t LEFT JOIN users u ON u.id = t.created_by WHERE t.record_id = ? ORDER BY t.created_at, t.id`,
      [req.params.id],
    )
    res.json({ ok: true, tracking: rows.map((row) => ({ id: row.id, status: row.status, note: row.note, createdAt: row.created, user: row.user_name || '' })) })
  }))

  /** Adds a follow-up note; it can also move the document to a new status. */
  router.post('/api/docs/records/:id/tracking', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT kind, status FROM doc_records WHERE id = ?', [req.params.id])
    const current = rows[0]
    if (!current) return bad(res, 'El registro ya no existe.', 404)
    if (current.kind === 'instrumento') return bad(res, 'Los instrumentos de gestión no tienen seguimiento.')
    const note = text(req.body.note, 500)
    if (note.length < 3) return bad(res, 'Describe la acción de seguimiento.')
    const statuses = current.kind === 'externo' ? EXTERNAL_DOC_STATUS : ADMIN_DOC_STATUS
    const status = oneOf(statuses, req.body.status, current.status)
    await db.query('INSERT INTO doc_tracking (record_id, status, note, created_by) VALUES (?, ?, ?, ?)', [req.params.id, status, note, req.user.id])
    if (status !== current.status) {
      const { date } = nowLima()
      await db.query(`UPDATE doc_records SET status = ?, attended_date = IF(? = 'Atendido' AND attended_date IS NULL, ?, attended_date) WHERE id = ?`, [status, status, date, req.params.id])
    }
    res.status(201).json({ ok: true })
  }))

  /* ---- institutional organization */
  router.get('/api/docs/organizations', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(`${ORG_SELECT} ORDER BY o.school_year DESC, o.committee, o.commission`)
    res.json({ ok: true, organizations: rows.map(mapOrganization) })
  }))

  router.post('/api/docs/organizations', requireAuth, requireAdmin, withFile, wrap(async (req, res) => {
    const input = organizationInput(bodyOf(req))
    if (input.error) { discard(req); return bad(res, input.error) }
    const db = getPool()
    const [dup] = await db.query('SELECT id FROM doc_organizations WHERE committee = ? AND commission = ? AND school_year = ?', [input.committee, input.commission, input.year])
    if (dup.length) { discard(req); return bad(res, `La comisión «${input.commission}» ya está registrada en ese comité para ${input.year}.`, 409) }
    const [created] = await db.query(
      `INSERT INTO doc_organizations (committee, commission, objective, status, school_year, scope, members, doc_type, doc_number, doc_date, valid_from, valid_to, file_path, file_name, file_size, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.committee, input.commission, input.objective, input.status, input.year, input.scope, JSON.stringify(input.members), input.docType, input.docNumber, input.docDate,
        input.validFrom, input.validTo, req.file?.filename || null, req.file ? text(req.file.originalname, 255) : null, req.file?.size || null, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/docs/organizations/:id', requireAuth, requireAdmin, withFile, wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT file_path FROM doc_organizations WHERE id = ?', [req.params.id])
    if (!rows[0]) { discard(req); return bad(res, 'El registro ya no existe.', 404) }
    const body = bodyOf(req)
    const input = organizationInput(body)
    if (input.error) { discard(req); return bad(res, input.error) }
    const [dup] = await db.query('SELECT id FROM doc_organizations WHERE committee = ? AND commission = ? AND school_year = ? AND id <> ?', [input.committee, input.commission, input.year, req.params.id])
    if (dup.length) { discard(req); return bad(res, `La comisión «${input.commission}» ya está registrada en ese comité para ${input.year}.`, 409) }
    const replace = Boolean(req.file) || body.removeFile === true
    await db.query(
      `UPDATE doc_organizations SET committee = ?, commission = ?, objective = ?, status = ?, school_year = ?, scope = ?, members = ?, doc_type = ?, doc_number = ?,
         doc_date = ?, valid_from = ?, valid_to = ?, file_path = IF(?, ?, file_path), file_name = IF(?, ?, file_name), file_size = IF(?, ?, file_size) WHERE id = ?`,
      [input.committee, input.commission, input.objective, input.status, input.year, input.scope, JSON.stringify(input.members), input.docType, input.docNumber, input.docDate,
        input.validFrom, input.validTo, replace, req.file?.filename || null, replace, req.file ? text(req.file.originalname, 255) : null, replace, req.file?.size || null, req.params.id],
    )
    if (replace) removeFile(rows[0].file_path)
    res.json({ ok: true })
  }))

  router.delete('/api/docs/organizations/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const [rows] = await db.query('SELECT file_path FROM doc_organizations WHERE id = ?', [req.params.id])
    if (!rows[0]) return bad(res, 'El registro ya no existe.', 404)
    await db.query('DELETE FROM doc_organizations WHERE id = ?', [req.params.id])
    removeFile(rows[0].file_path)
    res.json({ ok: true })
  }))

  router.get('/api/docs/organizations/:id/file', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query('SELECT file_path, file_name FROM doc_organizations WHERE id = ?', [req.params.id])
    if (!rows[0]) return bad(res, 'El registro ya no existe.', 404)
    sendPdf(res, rows[0], req.query.inline === '1')
  }))

  return router
}

export async function ensureDocuments() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS doc_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    doc_type VARCHAR(60) NOT NULL,
    number VARCHAR(80) NOT NULL DEFAULT '',
    title VARCHAR(300) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    issue_date DATE NULL,
    received_date DATE NULL,
    deadline DATE NULL,
    attended_date DATE NULL,
    status VARCHAR(30) NOT NULL,
    entity VARCHAR(60) NOT NULL DEFAULT '',
    area VARCHAR(120) NOT NULL DEFAULT '',
    sender VARCHAR(160) NOT NULL DEFAULT '',
    sender_role VARCHAR(120) NOT NULL DEFAULT '',
    responsible VARCHAR(160) NOT NULL DEFAULT '',
    responsible_role VARCHAR(120) NOT NULL DEFAULT '',
    approval_type VARCHAR(60) NOT NULL DEFAULT '',
    start_year SMALLINT UNSIGNED NULL,
    end_year SMALLINT UNSIGNED NULL,
    version VARCHAR(20) NOT NULL DEFAULT '',
    actions VARCHAR(500) NOT NULL DEFAULT '',
    file_path VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_size INT UNSIGNED NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doc_records_kind (kind, received_date, issue_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS doc_tracking (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    record_id INT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL,
    note VARCHAR(500) NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_doc_tracking_record (record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS doc_organizations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    committee VARCHAR(160) NOT NULL,
    commission VARCHAR(200) NOT NULL,
    objective VARCHAR(300) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'Activo',
    school_year SMALLINT UNSIGNED NOT NULL,
    scope VARCHAR(40) NOT NULL,
    members TEXT NOT NULL,
    doc_type VARCHAR(60) NOT NULL,
    doc_number VARCHAR(80) NOT NULL DEFAULT '',
    doc_date DATE NULL,
    valid_from DATE NULL,
    valid_to DATE NULL,
    file_path VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_size INT UNSIGNED NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_doc_org_year (school_year)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
