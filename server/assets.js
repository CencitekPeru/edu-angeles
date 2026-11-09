import express from 'express'
import { getPool } from './db.js'
import { findByIdentifier, requireAdmin, requireAuth } from './campus.js'
import { ASSET_KINDS, LEVEL_OPTIONS, OPERATIONAL_STATES, PHYSICAL_STATES } from '../src/lib/assetKinds.js'

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const text = (value, max) => String(value ?? '').trim().slice(0, max)

const SELECT = `SELECT id, kind, cod_minedu, name, level, category, type, brand, model, serial, color, dimensions, quantity, unit,
    place, state, operational_state, DATE_FORMAT(registered_on, '%Y-%m-%d') AS registered, notes, details
  FROM asset_items`

function mapItem(row) {
  let details = {}
  try { details = JSON.parse(row.details || '{}') || {} } catch { details = {} }
  return {
    id: row.id,
    kind: row.kind,
    codMinedu: row.cod_minedu,
    name: row.name,
    level: row.level,
    category: row.category,
    type: row.type,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    color: row.color,
    dimensions: row.dimensions,
    quantity: Number(row.quantity),
    unit: row.unit,
    place: row.place,
    state: row.state,
    operationalState: row.operational_state,
    registeredOn: row.registered,
    notes: row.notes || '',
    details,
  }
}

/** Cleans the body for a section: shared columns it doesn't use are left empty, details are whitelisted. */
function itemInput(body, kind) {
  const config = ASSET_KINDS[kind]
  const uses = (key) => config.common.includes(key)
  const details = {}
  for (const field of config.details) {
    const value = text(body.details?.[field.key], 160)
    if (field.options && value && !field.options.includes(value)) continue
    if (value) details[field.key] = field.upper ? value.toUpperCase() : value
  }
  const quantity = Number(body.quantity)
  return {
    codMinedu: text(body.codMinedu, 80),
    name: text(body.name, 160),
    level: LEVEL_OPTIONS.includes(body.level) ? body.level : '',
    category: text(body.category, 100),
    type: text(body.type, 80),
    brand: uses('brand') ? text(body.brand, 80) : '',
    model: uses('model') ? text(body.model, 80) : '',
    serial: uses('serial') ? text(body.serial, 80).toUpperCase() : '',
    color: uses('color') ? text(body.color, 60) : '',
    dimensions: uses('dimensions') ? text(body.dimensions, 80) : '',
    quantity: Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : NaN,
    unit: text(body.unit, 40) || 'unidad',
    place: text(body.place, 120),
    state: PHYSICAL_STATES.includes(body.state) ? body.state : '',
    operationalState: OPERATIONAL_STATES.includes(body.operationalState) ? body.operationalState : '',
    registeredOn: /^\d{4}-\d{2}-\d{2}$/.test(String(body.registeredOn || '')) ? body.registeredOn : null,
    notes: text(body.notes, 1000),
    details: JSON.stringify(details),
  }
}

function validate(input) {
  if (!input.level) return 'Selecciona el nivel (Primaria, Secundaria o Ambos).'
  if (!input.codMinedu) return 'Selecciona el código patrimonial.'
  if (input.name.length < 3) return 'Escribe la denominación del bien.'
  if (!input.place) return 'Selecciona la ubicación del bien.'
  if (Number.isNaN(input.quantity)) return 'La cantidad debe ser un número entero igual o mayor que cero.'
  if (!input.state) return 'Selecciona el estado físico.'
  if (!input.operationalState) return 'Selecciona el estado operativo.'
  return null
}

/** Message when another item already uses the patrimonial code or the serial, else null. */
async function identifierInUse(input, excludeId = null) {
  const db = getPool()
  if (await findByIdentifier(db, 'asset_items', 'cod_minedu', input.codMinedu, excludeId)) {
    return `El código patrimonial ${input.codMinedu} ya está registrado en otro bien.`
  }
  if (input.serial && await findByIdentifier(db, 'asset_items', 'serial', input.serial, excludeId)) {
    return `El número de serie ${input.serial} ya está registrado en otro bien.`
  }
  return null
}

const COLUMNS = 'cod_minedu, name, level, category, type, brand, model, serial, color, dimensions, quantity, unit, place, state, operational_state, registered_on, notes, details'
const values = (input) => [input.codMinedu, input.name, input.level, input.category, input.type, input.brand, input.model, input.serial, input.color,
  input.dimensions, input.quantity, input.unit, input.place, input.state, input.operationalState, input.registeredOn, input.notes, input.details]

export function assetsRouter() {
  const router = express.Router()

  router.get('/api/assets', requireAuth, wrap(async (req, res) => {
    if (!ASSET_KINDS[req.query.kind]) return res.status(400).json({ ok: false, error: 'Sección de inventario no válida.' })
    const [rows] = await getPool().query(`${SELECT} WHERE kind = ? ORDER BY name`, [req.query.kind])
    res.json({ ok: true, items: rows.map(mapItem) })
  }))

  router.post('/api/assets', requireAuth, requireAdmin, wrap(async (req, res) => {
    const kind = req.body.kind
    if (!ASSET_KINDS[kind]) return res.status(400).json({ ok: false, error: 'Sección de inventario no válida.' })
    const input = itemInput(req.body, kind)
    const error = validate(input) || await identifierInUse(input)
    if (error) return res.status(error.startsWith('El ') ? 409 : 400).json({ ok: false, error })
    const [created] = await getPool().query(
      `INSERT INTO asset_items (kind, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, ?)`,
      [kind, ...values(input)],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/assets/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [rows] = await getPool().query('SELECT kind FROM asset_items WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, error: 'El bien ya no existe.' })
    const input = itemInput(req.body, rows[0].kind)
    const error = validate(input) || await identifierInUse(input, req.params.id)
    if (error) return res.status(error.startsWith('El ') ? 409 : 400).json({ ok: false, error })
    await getPool().query(
      `UPDATE asset_items SET cod_minedu = ?, name = ?, level = ?, category = ?, type = ?, brand = ?, model = ?, serial = ?, color = ?, dimensions = ?,
         quantity = ?, unit = ?, place = ?, state = ?, operational_state = ?, registered_on = COALESCE(?, registered_on), notes = ?, details = ?
       WHERE id = ?`,
      [...values(input), req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/assets/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM asset_items WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'El bien ya no existe.' })
    res.json({ ok: true })
  }))

  return router
}

export async function ensureAssets() {
  await getPool().query(`CREATE TABLE IF NOT EXISTS asset_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    cod_minedu VARCHAR(80) NOT NULL DEFAULT '',
    name VARCHAR(160) NOT NULL,
    level VARCHAR(20) NOT NULL DEFAULT '',
    category VARCHAR(100) NOT NULL DEFAULT '',
    type VARCHAR(80) NOT NULL DEFAULT '',
    brand VARCHAR(80) NOT NULL DEFAULT '',
    model VARCHAR(80) NOT NULL DEFAULT '',
    serial VARCHAR(80) NOT NULL DEFAULT '',
    color VARCHAR(60) NOT NULL DEFAULT '',
    dimensions VARCHAR(80) NOT NULL DEFAULT '',
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit VARCHAR(40) NOT NULL DEFAULT 'unidad',
    place VARCHAR(120) NOT NULL DEFAULT '',
    state VARCHAR(20) NOT NULL DEFAULT 'Bueno',
    operational_state VARCHAR(40) NOT NULL DEFAULT 'Operativo',
    registered_on DATE NULL,
    notes TEXT NULL,
    details TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_asset_items_kind (kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
