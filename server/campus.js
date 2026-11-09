import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { config } from './config.js'
import { getPool, mapUser } from './db.js'
import { GRADES, SECTIONS } from '../src/lib/reservations.js'

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, done) => {
      const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '.jpg'
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, done) => {
    done(null, /^image\//.test(file.mimetype))
  },
})

const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, done) => {
      const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' }[file.mimetype] || '.bin'
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, done) => {
    done(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype))
  },
})

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, done) => {
      const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype]
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`)
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
  },
})

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

/**
 * Renames a simple catalog row (id + unique name). `cascade` lists text columns that store the
 * name instead of the id, so they are updated in the same transaction.
 */
async function renameCatalogItem(req, res, { table, where = '', label, notFound, duplicate, cascade = [] }) {
  const name = String(req.body.name || '').replace(/\s+/g, ' ').trim()
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'Escribe un nombre de al menos 3 caracteres.' })
  if (name.length > 120) return res.status(400).json({ ok: false, error: 'El nombre admite hasta 120 caracteres.' })
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(`SELECT id, name FROM ${table} WHERE id = ? ${where} FOR UPDATE`, [req.params.id])
    if (!rows.length) {
      await connection.rollback()
      return res.status(404).json({ ok: false, error: notFound })
    }
    const [existing] = await connection.query(`SELECT id FROM ${table} WHERE LOWER(name) = LOWER(?) AND id <> ?`, [name, req.params.id])
    if (existing.length) {
      await connection.rollback()
      return res.status(409).json({ ok: false, error: duplicate })
    }
    await connection.query(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, req.params.id])
    for (const [cascadeTable, column] of cascade) {
      await connection.query(`UPDATE ${cascadeTable} SET ${column} = ? WHERE ${column} = ?`, [name, rows[0].name])
    }
    await connection.commit()
    res.json({ ok: true, item: { id: Number(req.params.id), name }, label })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export function campusRouter() {
  const router = express.Router()
  router.use('/api/uploads', express.static(uploadDir))

  router.get('/api/rooms', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      'SELECT id, name FROM rooms WHERE is_computer_room = 1 ORDER BY name',
    )
    res.json({ ok: true, rooms: rows })
  }))

  router.post('/api/rooms', requireAuth, requireAdmin, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim()
    if (name.length < 3) return res.status(400).json({ ok: false, error: 'Escribe un nombre de al menos 3 caracteres.' })
    if (name.length > 120) return res.status(400).json({ ok: false, error: 'El nombre admite hasta 120 caracteres.' })
    const [existing] = await getPool().query('SELECT id FROM rooms WHERE LOWER(name) = LOWER(?)', [name])
    if (existing.length) return res.status(409).json({ ok: false, error: 'Ya existe una sala con ese nombre.' })
    const [created] = await getPool().query(
      'INSERT INTO rooms (name, is_computer_room) VALUES (?, 1)',
      [name],
    )
    res.status(201).json({ ok: true, room: { id: created.insertId, name } })
  }))

  router.put('/api/rooms/:id', requireAuth, requireAdmin, wrap((req, res) => renameCatalogItem(req, res, {
    table: 'rooms', where: 'AND is_computer_room = 1', label: 'Sala',
    notFound: 'La sala de cómputo ya no existe.', duplicate: 'Ya existe una sala con ese nombre.',
  })))

  router.delete('/api/rooms/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [rooms] = await connection.query(
        'SELECT id, name FROM rooms WHERE id = ? AND is_computer_room = 1 FOR UPDATE',
        [req.params.id],
      )
      if (!rooms.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'La sala de cómputo ya no existe.' })
      }
      const [[requests]] = await connection.query(
        'SELECT COUNT(*) AS total FROM requests WHERE room_id = ?',
        [req.params.id],
      )
      const [[schedules]] = await connection.query(
        'SELECT COUNT(*) AS total FROM fixed_schedules WHERE room_id = ?',
        [req.params.id],
      )
      const total = Number(requests.total) + Number(schedules.total)
      if (total > 0) {
        await connection.rollback()
        return res.status(409).json({
          ok: false,
          error: `No se puede eliminar "${rooms[0].name}" porque tiene ${total} ${total === 1 ? 'reserva u horario fijo asociado' : 'reservas u horarios fijos asociados'}.`,
        })
      }
      await connection.query('DELETE FROM rooms WHERE id = ?', [req.params.id])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.get('/api/fixed-schedules', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT f.*, u.name AS teacher_name, r.name AS room_name
       FROM fixed_schedules f
       JOIN users u ON u.id = f.teacher_id
       JOIN rooms r ON r.id = f.room_id
       ORDER BY f.weekday, f.start_time`,
    )
    res.json({ ok: true, schedules: rows.map(mapFixed) })
  }))

  router.post('/api/fixed-schedules', requireAuth, requireAdmin, wrap(async (req, res) => {
    const body = req.body || {}
    if (!GRADES.includes(String(body.grade || '')) || !SECTIONS.includes(String(body.section || ''))) {
      return res.status(400).json({ ok: false, error: 'Selecciona un grado del 1° al 6° y una sección válida.' })
    }
    const [rooms] = await getPool().query(
      'SELECT id FROM rooms WHERE id = ? AND is_computer_room = 1',
      [body.roomId],
    )
    if (!rooms.length) return res.status(400).json({ ok: false, error: 'Selecciona una sala exclusiva de cómputo.' })
    await getPool().query(
      `INSERT INTO fixed_schedules (teacher_id, room_id, weekday, start_time, end_time, grade, section, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.teacherId, body.roomId, body.weekday, body.startTime, body.endTime, body.grade, body.section, String(body.purpose || '').trim()],
    )
    res.status(201).json({ ok: true })
  }))

  router.patch('/api/fixed-schedules/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const body = req.body || {}
    if (!GRADES.includes(String(body.grade || '')) || !SECTIONS.includes(String(body.section || ''))) {
      return res.status(400).json({ ok: false, error: 'Selecciona un grado del 1° al 6° y una sección válida.' })
    }
    const [rooms] = await getPool().query(
      'SELECT id FROM rooms WHERE id = ? AND is_computer_room = 1',
      [body.roomId],
    )
    if (!rooms.length) return res.status(400).json({ ok: false, error: 'Selecciona una sala exclusiva de cómputo.' })
    const [result] = await getPool().query(
      `UPDATE fixed_schedules
       SET teacher_id = ?, room_id = ?, weekday = ?, start_time = ?, end_time = ?, grade = ?, section = ?, purpose = ?
       WHERE id = ?`,
      [body.teacherId, body.roomId, body.weekday, body.startTime, body.endTime, body.grade, body.section, String(body.purpose || '').trim(), req.params.id],
    )
    if (!result.affectedRows) {
      const [existing] = await getPool().query('SELECT id FROM fixed_schedules WHERE id = ?', [req.params.id])
      if (!existing.length) return res.status(404).json({ ok: false, error: 'El horario fijo ya no existe.' })
    }
    res.json({ ok: true })
  }))

  router.delete('/api/fixed-schedules/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM fixed_schedules WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.get('/api/categories', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query('SELECT id, name FROM categories ORDER BY name')
    res.json({ ok: true, categories: rows })
  }))
  router.post('/api/categories', requireAuth, requireAdmin, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim()
    if (name.length < 3) return res.status(400).json({ ok: false, error: 'Escribe la categoría.' })
    await getPool().query('INSERT INTO categories (name) VALUES (?)', [name])
    res.status(201).json({ ok: true })
  }))
  router.put('/api/categories/:id', requireAuth, requireAdmin, wrap((req, res) => renameCatalogItem(req, res, {
    table: 'categories', label: 'Categoría',
    notFound: 'La categoría ya no existe.', duplicate: 'Ya existe una categoría con ese nombre.',
    cascade: [['material_inventory', 'category']],
  })))
  router.delete('/api/categories/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [categories] = await connection.query('SELECT id, name FROM categories WHERE id = ? FOR UPDATE', [req.params.id])
      if (!categories.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'La categoría ya no existe.' })
      }
      const [references] = await connection.query(
        'SELECT COUNT(*) AS total FROM equipment WHERE category_id = ?',
        [req.params.id],
      )
      const total = Number(references[0].total)
      if (total > 0) {
        await connection.rollback()
        return res.status(409).json({
          ok: false,
          error: `No se puede quitar la categoría "${categories[0].name}" porque está vinculada a ${total} ${total === 1 ? 'equipo' : 'equipos'} del inventario.`,
        })
      }
      await connection.query('DELETE FROM categories WHERE id = ?', [req.params.id])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.get('/api/patrimonial-codes', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query('SELECT id, code, description FROM patrimonial_codes ORDER BY description, code')
    res.json({ ok: true, codes: rows })
  }))
  router.post('/api/patrimonial-codes', requireAuth, requireAdmin, wrap(async (req, res) => {
    const code = String(req.body.code || '').replace(/\s+/g, '').trim()
    const description = String(req.body.description || '').replace(/\s+/g, ' ').trim().toUpperCase()
    if (!/^[0-9-]{6,20}$/.test(code)) return res.status(400).json({ ok: false, error: 'Escribe un código patrimonial válido (solo números).' })
    if (description.length < 3 || description.length > 255) return res.status(400).json({ ok: false, error: 'Escribe la descripción del bien.' })
    const [existing] = await getPool().query('SELECT id, description FROM patrimonial_codes WHERE code = ?', [code])
    if (existing.length) return res.status(409).json({ ok: false, error: `El código ${code} ya está registrado (${existing[0].description}).` })
    const [result] = await getPool().query('INSERT INTO patrimonial_codes (code, description) VALUES (?, ?)', [code, description])
    res.status(201).json({ ok: true, code: { id: result.insertId, code, description } })
  }))
  router.put('/api/patrimonial-codes/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const code = String(req.body.code || '').replace(/\s+/g, '').trim()
    const description = String(req.body.description || '').replace(/\s+/g, ' ').trim().toUpperCase()
    if (!/^[0-9-]{6,20}$/.test(code)) return res.status(400).json({ ok: false, error: 'Escribe un código patrimonial válido (solo números).' })
    if (description.length < 3 || description.length > 255) return res.status(400).json({ ok: false, error: 'Escribe la descripción del bien.' })
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query('SELECT id, code FROM patrimonial_codes WHERE id = ? FOR UPDATE', [req.params.id])
      if (!rows.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'El código ya no existe.' })
      }
      const [existing] = await connection.query('SELECT description FROM patrimonial_codes WHERE code = ? AND id <> ?', [code, req.params.id])
      if (existing.length) {
        await connection.rollback()
        return res.status(409).json({ ok: false, error: `El código ${code} ya está registrado (${existing[0].description}).` })
      }
      await connection.query('UPDATE patrimonial_codes SET code = ?, description = ? WHERE id = ?', [code, description, req.params.id])
      if (rows[0].code !== code) {
        await connection.query('UPDATE equipment SET patrimonial = ? WHERE patrimonial = ?', [code, rows[0].code])
        await connection.query('UPDATE material_inventory SET cod_minedu = ? WHERE cod_minedu = ?', [code, rows[0].code])
      }
      await connection.commit()
      res.json({ ok: true, code: { id: Number(req.params.id), code, description } })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))
  router.post('/api/patrimonial-codes/import', requireAuth, requireAdmin, wrap(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 5000) : []
    if (!items.length) return res.status(400).json({ ok: false, error: 'El archivo no tiene códigos para importar.' })
    const errors = []
    const rows = []
    const repeated = duplicateLines(items, [['code', 'código patrimonial']])
    items.forEach((raw, index) => {
      const line = Number(raw.row) || index + 1
      const problems = [...(repeated.get(line) || [])]
      const code = String(raw.code ?? '').replace(/\s+/g, '').trim()
      const description = String(raw.description ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
      if (!code) problems.push('falta el código patrimonial')
      else if (!/^[0-9-]{6,20}$/.test(code)) problems.push(`código «${code}» no válido (solo números, de 6 a 20 dígitos)`)
      if (!description) problems.push('falta la descripción')
      else if (description.length < 3) problems.push('la descripción es muy corta')
      else if (description.length > 255) problems.push('la descripción admite hasta 255 caracteres')
      if (problems.length) errors.push(`Fila ${line}: ${problems.join(', ')}.`)
      else rows.push({ code, description })
    })

    const connection = await getPool().getConnection()
    let created = 0
    let updated = 0
    let unchanged = 0
    try {
      await connection.beginTransaction()
      const [current] = await connection.query('SELECT id, code, description FROM patrimonial_codes')
      const byCode = new Map(current.map((item) => [item.code, item]))
      for (const { code, description } of rows) {
        const existing = byCode.get(code)
        if (!existing) {
          await connection.query('INSERT INTO patrimonial_codes (code, description) VALUES (?, ?)', [code, description])
          created += 1
        } else if (existing.description !== description) {
          await connection.query('UPDATE patrimonial_codes SET description = ? WHERE id = ?', [description, existing.id])
          updated += 1
        } else {
          unchanged += 1
        }
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    res.json({ ok: true, created, updated, unchanged, skipped: errors.length, errors })
  }))
  router.delete('/api/patrimonial-codes/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM patrimonial_codes WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'El código ya no existe.' })
    res.json({ ok: true })
  }))

  router.get('/api/places', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query('SELECT id, name FROM places ORDER BY name')
    res.json({ ok: true, places: rows })
  }))
  router.post('/api/places', requireAuth, requireAdmin, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim()
    if (name.length < 3) return res.status(400).json({ ok: false, error: 'Escribe el ambiente.' })
    await getPool().query('INSERT INTO places (name) VALUES (?)', [name])
    res.status(201).json({ ok: true })
  }))
  router.put('/api/places/:id', requireAuth, requireAdmin, wrap((req, res) => renameCatalogItem(req, res, {
    table: 'places', label: 'Ambiente',
    notFound: 'El ambiente ya no existe.', duplicate: 'Ya existe un ambiente con ese nombre.',
    cascade: [['material_inventory', 'place']],
  })))
  router.delete('/api/places/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [places] = await connection.query('SELECT id, name FROM places WHERE id = ? FOR UPDATE', [req.params.id])
      if (!places.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'El ambiente ya no existe.' })
      }
      const [references] = await connection.query(
        'SELECT COUNT(*) AS total FROM equipment WHERE place_id = ?',
        [req.params.id],
      )
      const total = Number(references[0].total)
      if (total > 0) {
        await connection.rollback()
        return res.status(409).json({
          ok: false,
          error: `No se puede quitar el ambiente "${places[0].name}" porque está asignado a ${total} ${total === 1 ? 'equipo' : 'equipos'} del inventario.`,
        })
      }
      await connection.query('DELETE FROM places WHERE id = ?', [req.params.id])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.get('/api/materials', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT id, name, cod_minedu AS codMinedu, category, quantity, unit, place, state, notes, updated_at AS updatedAt,
        level, type, color, dimensions, operational_state AS operationalState, DATE_FORMAT(registered_on, '%Y-%m-%d') AS registeredOn
       FROM material_inventory ORDER BY name`,
    )
    res.json({
      ok: true,
      materials: rows.map((row) => ({ ...row, quantity: Number(row.quantity) })),
    })
  }))

  router.post('/api/materials', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = materialInput(req.body)
    const error = validateMaterial(input)
    if (error) return res.status(400).json({ ok: false, error })
    if (await findByIdentifier(getPool(), 'material_inventory', 'cod_minedu', input.codMinedu)) {
      return res.status(409).json({ ok: false, error: `El código patrimonial ${input.codMinedu} ya está registrado en otro bien.` })
    }
    const [created] = await getPool().query(
      `INSERT INTO material_inventory (name, cod_minedu, category, quantity, unit, place, state, notes, level, type, color, dimensions, operational_state, registered_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
      [input.name, input.codMinedu, input.category, input.quantity, input.unit, input.place, input.state, input.notes, input.level, input.type, input.color, input.dimensions, input.operationalState, input.registeredOn],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/materials/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = materialInput(req.body)
    const error = validateMaterial(input)
    if (error) return res.status(400).json({ ok: false, error })
    if (await findByIdentifier(getPool(), 'material_inventory', 'cod_minedu', input.codMinedu, req.params.id)) {
      return res.status(409).json({ ok: false, error: `El código patrimonial ${input.codMinedu} ya está registrado en otro bien.` })
    }
    const [result] = await getPool().query(
      `UPDATE material_inventory
       SET name = ?, cod_minedu = ?, category = ?, quantity = ?, unit = ?, place = ?, state = ?, notes = ?,
           level = ?, type = ?, color = ?, dimensions = ?, operational_state = ?, registered_on = COALESCE(?, registered_on)
       WHERE id = ?`,
      [input.name, input.codMinedu, input.category, input.quantity, input.unit, input.place, input.state, input.notes, input.level, input.type, input.color, input.dimensions, input.operationalState, input.registeredOn, req.params.id],
    )
    if (!result.affectedRows) {
      const [rows] = await getPool().query('SELECT id FROM material_inventory WHERE id = ?', [req.params.id])
      if (!rows.length) return res.status(404).json({ ok: false, error: 'El material ya no existe.' })
    }
    res.json({ ok: true })
  }))

  router.post('/api/materials/import', requireAuth, requireAdmin, wrap(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 3000) : []
    if (!items.length) return res.status(400).json({ ok: false, error: 'El archivo no tiene bienes para importar.' })
    const pool = getPool()
    const [categories] = await pool.query('SELECT name FROM categories')
    const [places] = await pool.query('SELECT name FROM places')
    const norm = (value) => String(value || '').trim().toLowerCase()
    const byName = (list, value) => list.find((item) => norm(item.name) === norm(value))?.name
    const pick = (list, value, fallback) => list.find((item) => norm(item) === norm(value)) || (String(value || '').trim() ? null : fallback)

    const errors = []
    const rows = []
    const repeated = duplicateLines(items, [['codMinedu', 'código patrimonial']])
    items.forEach((raw, index) => {
      const line = Number(raw.row) || index + 1
      const problems = [...(repeated.get(line) || [])]
      if (!String(raw.codMinedu || '').trim()) problems.push('falta el código patrimonial')
      const category = String(raw.category || '').trim() ? byName(categories, raw.category) : ''
      if (!String(raw.category || '').trim()) problems.push('falta la categoría')
      else if (!category) problems.push(`categoría «${raw.category}» no existe`)
      const place = String(raw.place || '').trim() ? byName(places, raw.place) : ''
      if (String(raw.place || '').trim() && !place) problems.push(`ambiente «${raw.place}» no existe`)
      const level = pick(['Primaria', 'Secundaria', 'Ambos'], raw.level, '')
      if (level === null) problems.push(`nivel «${raw.level}» no válido`)
      const state = pick(['Bueno', 'Regular', 'Malo'], raw.state, 'Bueno')
      if (!state) problems.push(`estado físico «${raw.state}» no válido`)
      const operationalState = pick(['Operativo', 'Con fallas', 'Inoperativo'], raw.operationalState, 'Operativo')
      if (!operationalState) problems.push(`estado operativo «${raw.operationalState}» no válido`)
      if (raw.registeredOn && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.registeredOn))) problems.push('fecha de registro no válida')
      const input = materialInput({ ...raw, category, place, level, state, operationalState })
      if (!problems.length) {
        const error = validateMaterial(input)
        if (error) problems.push(error.replace(/\.$/, '').toLowerCase())
      }
      if (problems.length) {
        errors.push(`Fila ${line}: ${problems.join(', ')}.`)
        return
      }
      rows.push(input)
    })

    const connection = await pool.getConnection()
    let created = 0
    let updated = 0
    try {
      await connection.beginTransaction()
      for (const input of rows) {
        const existingId = await findByIdentifier(connection, 'material_inventory', 'cod_minedu', input.codMinedu)
        const existing = existingId ? [{ id: existingId }] : []
        const values = [input.name, input.codMinedu, input.category, input.quantity, input.unit, input.place, input.state, input.notes, input.level, input.type, input.color, input.dimensions, input.operationalState, input.registeredOn]
        if (existing[0]) {
          await connection.query(
            `UPDATE material_inventory
             SET name = ?, cod_minedu = ?, category = ?, quantity = ?, unit = ?, place = ?, state = ?, notes = ?,
                 level = ?, type = ?, color = ?, dimensions = ?, operational_state = ?, registered_on = COALESCE(?, registered_on)
             WHERE id = ?`,
            [...values, existing[0].id],
          )
          updated += 1
        } else {
          await connection.query(
            `INSERT INTO material_inventory (name, cod_minedu, category, quantity, unit, place, state, notes, level, type, color, dimensions, operational_state, registered_on)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
            values,
          )
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
    res.json({ ok: true, created, updated, skipped: errors.length, errors: errors.slice(0, 200) })
  }))

  router.delete('/api/materials/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [result] = await getPool().query('DELETE FROM material_inventory WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'El material ya no existe.' })
    res.json({ ok: true })
  }))

  router.get('/api/equipment', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${equipmentSql()} ORDER BY e.code`)
    res.json({ ok: true, equipment: rows.map(mapEquipment).filter((item) => matchesEquipment(item, req.query)) })
  }))

  router.get('/api/equipment/:id', requireAuth, wrap(async (req, res) => {
    const equipment = await oneEquipment(req.params.id)
    if (!equipment) return res.status(404).json({ ok: false, error: 'Equipo no encontrado.' })
    const [photos] = await getPool().query('SELECT id, path FROM equipment_photos WHERE equipment_id = ?', [req.params.id])
    const [maintenance] = await getPool().query(
      `${maintenanceSql()} WHERE m.equipment_id = ? ORDER BY m.scheduled_date DESC`,
      [req.params.id],
    )
    const [incidents] = await getPool().query(
      `${incidentSql()} WHERE i.equipment_id = ? ORDER BY i.reported_on DESC`,
      [req.params.id],
    )
    res.json({
      ok: true,
      equipment: { ...equipment, photos },
      maintenance: maintenance.map(mapMaintenance),
      incidents: incidents.map(mapIncident),
    })
  }))

  router.post('/api/equipment', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = equipmentInput(req.body)
    if (!input.name || !input.brand) return res.status(400).json({ ok: false, error: 'Nombre y marca son obligatorios.' })
    const repeatedIdentifier = await equipmentIdentifierInUse(input)
    if (repeatedIdentifier) return res.status(409).json({ ok: false, error: repeatedIdentifier })
    const code = input.code || await nextCode('equipment', 'EQ-', 3)
    const [duplicate] = await getPool().query('SELECT id FROM equipment WHERE code = ?', [code])
    if (duplicate.length) return res.status(409).json({ ok: false, error: `El código interno ${code} ya está en uso.` })
    const [created] = await getPool().query(
      `INSERT INTO equipment (code, ${EQUIPMENT_COLUMNS}) VALUES (?, ${EQUIPMENT_MARKS})`,
      [code, ...equipmentValues(input)],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  /**
   * Bulk import from the Excel template. Rows are matched to existing equipment by
   * COD MINEDU (patrimonial) or serial number and updated; otherwise they are created.
   */
  router.post('/api/equipment/import', requireAuth, requireAdmin, wrap(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 3000) : []
    if (!items.length) return res.status(400).json({ ok: false, error: 'El archivo no tiene equipos para importar.' })
    const pool = getPool()
    const [categories] = await pool.query('SELECT id, name FROM categories')
    const [places] = await pool.query('SELECT id, name FROM places')
    const [people] = await pool.query('SELECT id, name, email, dni FROM users WHERE active = 1')
    const norm = (value) => String(value || '').trim().toLowerCase()
    const byName = (list, value) => list.find((item) => norm(item.name) === norm(value))
    const findPerson = (value) => {
      const text = norm(value)
      return people.find((item) => norm(item.email) === text || String(item.dni || '') === text || norm(item.name) === text)
    }
    const PHYSICAL = ['Bueno', 'Regular', 'Malo']
    const OPERATIONAL = ['Operativo', 'Con fallas', 'Inoperativo']
    const pick = (list, value, fallback) => list.find((item) => norm(item) === norm(value)) || (value ? null : fallback)

    const errors = []
    const rows = []
    const repeated = duplicateLines(items, [['patrimonial', 'COD MINEDU'], ['serial', 'N.° de serie']])
    items.forEach((raw, index) => {
      const line = Number(raw.row) || index + 1
      const problems = [...(repeated.get(line) || [])]
      const input = equipmentInput(raw)
      if (!input.patrimonial) problems.push('falta el COD MINEDU')
      if (!input.name) problems.push('falta la denominación')
      if (!input.brand) problems.push('falta la marca')
      let categoryId = null
      if (String(raw.category || '').trim()) {
        categoryId = byName(categories, raw.category)?.id
        if (!categoryId) problems.push(`categoría «${raw.category}» no existe`)
      }
      let placeId = null
      if (String(raw.place || '').trim()) {
        placeId = byName(places, raw.place)?.id
        if (!placeId) problems.push(`ambiente «${raw.place}» no existe`)
      }
      let responsibleId = null
      if (String(raw.responsible || '').trim()) {
        responsibleId = findPerson(raw.responsible)?.id
        if (!responsibleId) problems.push(`responsable «${raw.responsible}» no encontrado`)
      }
      const physicalState = pick(PHYSICAL, raw.physicalState, 'Bueno')
      if (!physicalState) problems.push(`estado físico «${raw.physicalState}» no válido`)
      const operationalState = pick(OPERATIONAL, raw.operationalState, 'Operativo')
      if (!operationalState) problems.push(`estado operativo «${raw.operationalState}» no válido`)
      if (raw.registeredOn && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.registeredOn))) problems.push('fecha de registro no válida')
      if (raw.level && !['Primaria', 'Secundaria', 'Ambos'].includes(raw.level)) problems.push(`nivel «${raw.level}» no válido`)
      if (problems.length) {
        errors.push(`Fila ${line}: ${problems.join(', ')}.`)
        return
      }
      rows.push({ ...input, line, categoryId, placeId, responsibleId, physicalState, operationalState })
    })

    const connection = await pool.getConnection()
    let created = 0
    let updated = 0
    try {
      await connection.beginTransaction()
      const [last] = await connection.query("SELECT code FROM equipment WHERE code LIKE 'EQ-%' ORDER BY id DESC LIMIT 1")
      let sequence = last[0] ? Number(String(last[0].code).slice(3)) || 0 : 0
      for (const input of rows) {
        const byCode = await findByIdentifier(connection, 'equipment', 'patrimonial', input.patrimonial)
        const bySerial = await findByIdentifier(connection, 'equipment', 'serial', input.serial)
        if (byCode && bySerial && byCode !== bySerial) {
          errors.push(`Fila ${input.line}: el COD MINEDU y el N.° de serie pertenecen a equipos distintos.`)
          continue
        }
        const existingId = byCode || bySerial
        const existing = existingId ? [{ id: existingId }] : []
        const values = equipmentValues(input)
        if (existing[0]) {
          await connection.query(
            `UPDATE equipment SET ${EQUIPMENT_SET} WHERE id = ?`,
            [...values, existing[0].id],
          )
          updated += 1
        } else {
          sequence += 1
          await connection.query(
            `INSERT INTO equipment (code, ${EQUIPMENT_COLUMNS}) VALUES (?, ${EQUIPMENT_MARKS})`,
            [`EQ-${String(sequence).padStart(3, '0')}`, ...values],
          )
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
    res.json({ ok: true, created, updated, skipped: errors.length, errors: errors.slice(0, 200) })
  }))

  router.patch('/api/equipment/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = equipmentInput(req.body)
    if (!input.name || !input.brand) return res.status(400).json({ ok: false, error: 'Denominación y marca son obligatorias.' })
    const repeatedIdentifier = await equipmentIdentifierInUse(input, req.params.id)
    if (repeatedIdentifier) return res.status(409).json({ ok: false, error: repeatedIdentifier })
    if (input.code) {
      const [duplicate] = await getPool().query('SELECT id FROM equipment WHERE code = ? AND id <> ?', [input.code, req.params.id])
      if (duplicate.length) return res.status(409).json({ ok: false, error: `El código interno ${input.code} ya está en uso.` })
    }
    await getPool().query(
      `UPDATE equipment SET ${EQUIPMENT_SET}, code = COALESCE(NULLIF(?, ''), code) WHERE id = ?`,
      [...equipmentValues(input), input.code, req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/equipment/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [equipment] = await connection.query(
        'SELECT id, name FROM equipment WHERE id = ? FOR UPDATE',
        [req.params.id],
      )
      if (!equipment.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'El equipo ya no existe.' })
      }
      const [references] = await connection.query(
        `SELECT
           (SELECT COUNT(*) FROM maintenance WHERE equipment_id = ?) AS maintenance,
           (SELECT COUNT(*) FROM incidents WHERE equipment_id = ?) AS incidents,
           (SELECT COUNT(*) FROM parts WHERE equipment_id = ?) AS parts,
           (SELECT COUNT(*) FROM documents WHERE equipment_id = ?) AS documents`,
        [req.params.id, req.params.id, req.params.id, req.params.id],
      )
      const linked = [
        ['mantenimiento', Number(references[0].maintenance)],
        ['incidencia', Number(references[0].incidents)],
        ['repuesto', Number(references[0].parts)],
        ['documento', Number(references[0].documents)],
      ].filter(([, count]) => count > 0)
      if (linked.length) {
        await connection.rollback()
        const details = linked.map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`).join(', ')
        return res.status(409).json({
          ok: false,
          error: `No se puede eliminar "${equipment[0].name}" porque conserva registros vinculados: ${details}. Elimina o reasigna esos registros antes de continuar.`,
        })
      }
      await connection.query('DELETE FROM equipment_photos WHERE equipment_id = ?', [req.params.id])
      await connection.query('DELETE FROM equipment WHERE id = ?', [req.params.id])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.post('/api/equipment/:id/photos', requireAuth, requireAdmin, upload.array('photos', 6), wrap(async (req, res) => {
    const files = req.files || []
    if (files.length !== 1) {
      await removeUploadedFiles(files)
      return res.status(400).json({ ok: false, error: 'Cada equipo solo puede tener una fotografía.' })
    }

    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [equipment] = await connection.query('SELECT id FROM equipment WHERE id = ? FOR UPDATE', [req.params.id])
      if (!equipment.length) {
        await connection.rollback()
        await removeUploadedFiles(files)
        return res.status(404).json({ ok: false, error: 'Equipo no encontrado.' })
      }
      const [photos] = await connection.query(
        'SELECT id FROM equipment_photos WHERE equipment_id = ?',
        [req.params.id],
      )
      if (photos.length) {
        await connection.rollback()
        await removeUploadedFiles(files)
        return res.status(409).json({
          ok: false,
          error: 'Este equipo ya tiene una fotografía. Elimínala antes de cargar otra.',
        })
      }
      await connection.query(
        'INSERT INTO equipment_photos (equipment_id, path) VALUES (?, ?)',
        [req.params.id, `/api/uploads/${files[0].filename}`],
      )
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      await removeUploadedFiles(files)
      throw error
    } finally {
      connection.release()
    }
  }))

  /** Uses an image published on the internet (http/https link) instead of uploading a file. */
  router.post('/api/equipment/:id/photo-url', requireAuth, requireAdmin, wrap(async (req, res) => {
    const url = String(req.body.url || '').trim()
    let parsed = null
    try { parsed = new URL(url) } catch { parsed = null }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || url.length > 1024) {
      return res.status(400).json({ ok: false, error: 'Escribe un enlace de imagen válido que empiece con http:// o https://.' })
    }
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [equipment] = await connection.query('SELECT id FROM equipment WHERE id = ? FOR UPDATE', [req.params.id])
      if (!equipment.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'Equipo no encontrado.' })
      }
      const [photos] = await connection.query('SELECT id FROM equipment_photos WHERE equipment_id = ?', [req.params.id])
      if (photos.length) {
        await connection.rollback()
        return res.status(409).json({ ok: false, error: 'Este equipo ya tiene una fotografía. Elimínala antes de cargar otra.' })
      }
      await connection.query('INSERT INTO equipment_photos (equipment_id, path) VALUES (?, ?)', [req.params.id, parsed.href])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.delete('/api/equipment/:id/photos/:photoId', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [photos] = await getPool().query(
      'SELECT id, path FROM equipment_photos WHERE id = ? AND equipment_id = ?',
      [req.params.photoId, req.params.id],
    )
    if (!photos.length) return res.status(404).json({ ok: false, error: 'La fotografía no existe para este equipo.' })

    // Images given as a link live elsewhere: only the reference is removed.
    const uploaded = photos[0].path.startsWith('/api/uploads/')
    const filePath = uploaded ? path.join(uploadDir, path.basename(photos[0].path)) : null
    if (filePath && path.dirname(path.resolve(filePath)) !== path.resolve(uploadDir)) {
      return res.status(400).json({ ok: false, error: 'La ruta de la fotografía no es válida.' })
    }
    await getPool().query(
      'DELETE FROM equipment_photos WHERE id = ? AND equipment_id = ?',
      [req.params.photoId, req.params.id],
    )
    if (filePath) {
      try {
        await fs.promises.unlink(filePath)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    res.json({ ok: true })
  }))

  router.get('/api/maintenance', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${maintenanceSql()} ORDER BY m.scheduled_date DESC, m.start_time`)
    res.json({ ok: true, maintenance: rows.map(mapMaintenance).filter((item) => matchesMaintenance(item, req.query)) })
  }))

  router.post('/api/maintenance', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = maintenanceInput(req.body)
    const problem = maintenanceProblem(input)
    if (problem) return res.status(400).json({ ok: false, error: problem })
    const code = await nextCode('maintenance', `MNT-${new Date().getFullYear()}-`, 3)
    const [created] = await getPool().query(
      `INSERT INTO maintenance (code, ${MAINTENANCE_COLUMNS.join(', ')}) VALUES (?, ${MAINTENANCE_COLUMNS.map(() => '?').join(', ')})`,
      [code, ...maintenanceValues(input)],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/maintenance/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = maintenanceInput(req.body)
    const problem = maintenanceProblem(input)
    if (problem) return res.status(400).json({ ok: false, error: problem })
    await getPool().query(
      `UPDATE maintenance SET ${MAINTENANCE_COLUMNS.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
      [...maintenanceValues(input), req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/maintenance/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const connection = await getPool().getConnection()
    try {
      await connection.beginTransaction()
      const [records] = await connection.query(
        'SELECT id, code FROM maintenance WHERE id = ? FOR UPDATE',
        [req.params.id],
      )
      if (!records.length) {
        await connection.rollback()
        return res.status(404).json({ ok: false, error: 'El mantenimiento ya no existe.' })
      }
      await connection.query('UPDATE parts SET maintenance_id = NULL WHERE maintenance_id = ?', [req.params.id])
      await connection.query('DELETE FROM maintenance_photos WHERE maintenance_id = ?', [req.params.id])
      await connection.query('DELETE FROM maintenance WHERE id = ?', [req.params.id])
      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }))

  router.get('/api/maintenance/:id', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${maintenanceSql()} WHERE m.id = ?`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Mantenimiento no encontrado.' })
    const [photos] = await getPool().query('SELECT id, path, file_name AS fileName FROM maintenance_photos WHERE maintenance_id = ? ORDER BY id', [req.params.id])
    res.json({ ok: true, maintenance: mapMaintenance(rows[0]), photos })
  }))

  router.delete('/api/maintenance/:id/photos/:photoId', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM maintenance_photos WHERE id = ? AND maintenance_id = ?', [req.params.photoId, req.params.id])
    res.json({ ok: true })
  }))

  router.post('/api/maintenance/:id/photos', requireAuth, requireAdmin, evidenceUpload.array('photos', 6), wrap(async (req, res) => {
    for (const file of req.files || []) {
      await getPool().query('INSERT INTO maintenance_photos (maintenance_id, path, file_name) VALUES (?, ?, ?)', [req.params.id, `/api/uploads/${file.filename}`, String(file.originalname || '').slice(0, 255)])
    }
    res.json({ ok: true })
  }))

  router.get('/api/incidents', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${incidentSql()} ORDER BY COALESCE(i.detected_at, i.reported_on) DESC, i.id DESC`)
    const incidents = rows.map(mapIncident).filter((item) => matchesIncident(item, req.query))
    res.json({ ok: true, incidents: req.user.role === 'admin' ? incidents : incidents })
  }))

  router.get('/api/incidents/:id', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${incidentSql()} WHERE i.id = ?`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada.' })
    const [photos] = await getPool().query(
      'SELECT id, kind, path, file_name AS fileName FROM incident_photos WHERE incident_id = ? ORDER BY id',
      [req.params.id],
    )
    res.json({
      ok: true,
      incident: mapIncident(rows[0]),
      photos: {
        before: photos.filter((photo) => photo.kind === 'before'),
        after: photos.filter((photo) => photo.kind === 'after'),
      },
    })
  }))

  router.post('/api/incidents', requireAuth, wrap(async (req, res) => {
    const input = incidentInput(req.body)
    const problem = incidentProblem(input)
    if (problem) return res.status(400).json({ ok: false, error: problem })
    if (req.user.role !== 'admin') {
      input.status = 'pendiente'
      input.assigneeId = null
      input.solution = ''
    }
    const code = await nextCode('incidents', `INC-${new Date().getFullYear()}-`, 3)
    const [created] = await getPool().query(
      `INSERT INTO incidents (code, ${INCIDENT_COLUMNS.join(', ')}) VALUES (?, ${INCIDENT_COLUMNS.map(() => '?').join(', ')})`,
      [code, ...incidentValues(input)],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/incidents/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = incidentInput(req.body)
    const problem = incidentProblem(input)
    if (problem) return res.status(400).json({ ok: false, error: problem })
    await getPool().query(
      `UPDATE incidents SET ${INCIDENT_COLUMNS.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
      [...incidentValues(input), req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/incidents/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM incident_photos WHERE incident_id = ?', [req.params.id])
    await getPool().query('DELETE FROM incidents WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.post('/api/incidents/:id/photos', requireAuth, evidenceUpload.array('photos', 6), wrap(async (req, res) => {
    const kind = req.body.kind === 'after' ? 'after' : 'before'
    for (const file of req.files || []) {
      await getPool().query(
        'INSERT INTO incident_photos (incident_id, kind, path, file_name) VALUES (?, ?, ?, ?)',
        [req.params.id, kind, `/api/uploads/${file.filename}`, String(file.originalname || '').slice(0, 255)],
      )
    }
    res.json({ ok: true })
  }))

  router.delete('/api/incidents/:id/photos/:photoId', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM incident_photos WHERE id = ? AND incident_id = ?', [req.params.photoId, req.params.id])
    res.json({ ok: true })
  }))

  router.post('/api/profile/photo', requireAuth, profileUpload.array('photos', 1), wrap(async (req, res) => {
    const file = req.files?.[0]
    if (!file) return res.status(400).json({ ok: false, error: 'Selecciona una imagen válida.' })
    const profilePhoto = `/api/uploads/${file.filename}`
    await getPool().query('UPDATE users SET profile_photo = ? WHERE id = ?', [profilePhoto, req.user.id])
    const [rows] = await getPool().query(
      'SELECT id, name, email, dni, profile_photo, role, subject, active FROM users WHERE id = ?',
      [req.user.id],
    )
    res.json({ ok: true, user: mapUser(rows[0]) })
  }))

  router.get('/api/parts', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT p.*, e.code AS equipment_code, e.name AS equipment_name, m.code AS maintenance_code
       FROM parts p
       LEFT JOIN equipment e ON e.id = p.equipment_id
       LEFT JOIN maintenance m ON m.id = p.maintenance_id
       ORDER BY p.id DESC`,
    )
    res.json({ ok: true, parts: rows.map(mapPart) })
  }))

  router.post('/api/parts', requireAuth, requireAdmin, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim()
    if (name.length < 2) return res.status(400).json({ ok: false, error: 'Nombra el repuesto o material.' })
    await getPool().query(
      'INSERT INTO parts (name, equipment_id, quantity, unit, maintenance_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [name, req.body.equipmentId || null, Number(req.body.quantity) || 1, req.body.unit || 'unidad', req.body.maintenanceId || null, String(req.body.notes || '').trim()],
    )
    res.status(201).json({ ok: true })
  }))

  router.delete('/api/parts/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM parts WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.get('/api/documents', requireAuth, wrap(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT d.*, e.code AS equipment_code FROM documents d LEFT JOIN equipment e ON e.id = d.equipment_id ORDER BY d.id DESC`,
    )
    res.json({ ok: true, documents: rows })
  }))

  router.post('/api/documents', requireAuth, requireAdmin, wrap(async (req, res) => {
    const title = String(req.body.title || '').trim()
    if (title.length < 4) return res.status(400).json({ ok: false, error: 'Escribe el título del documento.' })
    await getPool().query(
      'INSERT INTO documents (title, kind, equipment_id, notes) VALUES (?, ?, ?, ?)',
      [title, req.body.kind || 'Ficha técnica', req.body.equipmentId || null, String(req.body.notes || '').trim()],
    )
    res.status(201).json({ ok: true })
  }))

  router.delete('/api/documents/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM documents WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  const REPORT_KINDS = ['inventario', 'incidencias', 'mantenimientos', 'reservas', 'resumen']

  router.get('/api/reports', requireAuth, requireRoles('admin', 'director'), wrap(async (_req, res) => {
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM report_logs')
    const [rows] = await getPool().query(
      `SELECT r.id, r.kind, r.params, r.summary, r.created_at, u.name AS user_name
        FROM report_logs r LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.id DESC LIMIT 50`,
    )
    res.json({
      ok: true,
      total: Number(total),
      reports: rows.map((row) => ({
        id: row.id,
        code: `REP-${String(row.id).padStart(4, '0')}`,
        kind: row.kind,
        params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
        summary: row.summary,
        user: row.user_name || '—',
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    })
  }))

  router.post('/api/reports', requireAuth, requireRoles('admin', 'director'), wrap(async (req, res) => {
    const kind = String(req.body.kind || '')
    if (!REPORT_KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Tipo de reporte no válido.' })
    const params = req.body.params && typeof req.body.params === 'object' ? req.body.params : {}
    const summary = String(req.body.summary || '').slice(0, 255)
    const [created] = await getPool().query(
      'INSERT INTO report_logs (kind, params, summary, user_id) VALUES (?, ?, ?, ?)',
      [kind, JSON.stringify(params), summary, req.user.id],
    )
    res.status(201).json({ ok: true, id: created.insertId, code: `REP-${String(created.insertId).padStart(4, '0')}` })
  }))

  router.delete('/api/reports/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM report_logs WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.get('/api/summary', requireAuth, wrap(async (_req, res) => {
    const [maintenance] = await getPool().query('SELECT status, COUNT(*) AS total FROM maintenance GROUP BY status')
    const [incidents] = await getPool().query('SELECT status, priority, COUNT(*) AS total FROM incidents GROUP BY status, priority')
    const [equipment] = await getPool().query('SELECT operational_state AS state, COUNT(*) AS total FROM equipment GROUP BY operational_state')
    const counts = Object.fromEntries(maintenance.map((row) => [row.status, Number(row.total)]))
    res.json({
      ok: true,
      maintenance: {
        programados: counts.Programado || 0,
        realizados: counts.Realizado || 0,
        proceso: counts['En proceso'] || 0,
        pendientes: counts.Pendiente || 0,
      },
      incidents: incidents.map((row) => ({ status: row.status, priority: row.priority, total: Number(row.total) })),
      equipment: equipment.map((row) => ({ state: row.state, total: Number(row.total) })),
    })
  }))

  return router
}

/** Adds the extended inventory fields and seeds the institution's categories and locations. */
/** Incidents can now refer to furniture and keep location, reporter and evidence details. */
/** Maintenance can target furniture and keeps priority, location, checklist and evidence names. */
async function migrateMaintenanceFields(db) {
  const [equipmentColumn] = await db.query("SHOW COLUMNS FROM maintenance LIKE 'equipment_id'")
  if (equipmentColumn[0]?.Null === 'NO') await db.query('ALTER TABLE maintenance MODIFY equipment_id INT UNSIGNED NULL')
  const columns = [
    ['asset_kind', "VARCHAR(20) NOT NULL DEFAULT 'tecnologico'"],
    ['material_id', 'INT UNSIGNED NULL'],
    ['priority', "VARCHAR(20) NOT NULL DEFAULT 'media'"],
    ['level', "VARCHAR(20) NOT NULL DEFAULT ''"],
    ['place_name', "VARCHAR(120) NOT NULL DEFAULT ''"],
    ['place_detail', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['executed_date', 'DATE NULL'],
    ['checklist', 'TEXT NULL'],
    ['other_activity', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['responsible_label', "VARCHAR(120) NOT NULL DEFAULT ''"],
  ]
  for (const [name, type] of columns) {
    const [existing] = await db.query('SHOW COLUMNS FROM maintenance LIKE ?', [name])
    if (!existing.length) await db.query(`ALTER TABLE maintenance ADD COLUMN ${name} ${type}`)
  }
  const [fileColumn] = await db.query("SHOW COLUMNS FROM maintenance_photos LIKE 'file_name'")
  if (!fileColumn.length) await db.query("ALTER TABLE maintenance_photos ADD COLUMN file_name VARCHAR(255) NOT NULL DEFAULT ''")
}

async function migrateIncidentFields(db) {
  const [equipmentColumn] = await db.query("SHOW COLUMNS FROM incidents LIKE 'equipment_id'")
  if (equipmentColumn[0]?.Null === 'NO') await db.query('ALTER TABLE incidents MODIFY equipment_id INT UNSIGNED NULL')
  const columns = [
    ['asset_kind', "VARCHAR(20) NOT NULL DEFAULT 'tecnologico'"],
    ['material_id', 'INT UNSIGNED NULL'],
    ['level', "VARCHAR(20) NOT NULL DEFAULT ''"],
    ['place_name', "VARCHAR(120) NOT NULL DEFAULT ''"],
    ['place_detail', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['incident_type', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['detected_at', 'DATETIME NULL'],
    ['reported_by_role', "VARCHAR(40) NOT NULL DEFAULT ''"],
    ['reporter_name', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['initial_state', "VARCHAR(40) NOT NULL DEFAULT ''"],
    ['observations', "VARCHAR(200) NOT NULL DEFAULT ''"],
  ]
  for (const [name, type] of columns) {
    const [existing] = await db.query('SHOW COLUMNS FROM incidents LIKE ?', [name])
    if (!existing.length) await db.query(`ALTER TABLE incidents ADD COLUMN ${name} ${type}`)
  }
  const [fileColumn] = await db.query("SHOW COLUMNS FROM incident_photos LIKE 'file_name'")
  if (!fileColumn.length) await db.query("ALTER TABLE incident_photos ADD COLUMN file_name VARCHAR(255) NOT NULL DEFAULT ''")
}

async function migrateInventoryFields(db) {
  const addColumns = async (table, columns) => {
    for (const [name, type] of columns) {
      const [existing] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name])
      if (!existing.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
  }
  await addColumns('equipment', [
    ['level', "VARCHAR(20) NOT NULL DEFAULT ''"],
    ['color', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['dimensions', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['place_detail', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['responsible_role', "VARCHAR(160) NOT NULL DEFAULT ''"],
    ['assignment_type', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['use_condition', "VARCHAR(40) NOT NULL DEFAULT ''"],
    ['accessories', 'TEXT NULL'],
    ['acquisition_date', 'DATE NULL'],
    ['acquisition_origin', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['document_number', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['useful_life', 'SMALLINT UNSIGNED NULL'],
    ['warranty_start', 'DATE NULL'],
    ['warranty_end', 'DATE NULL'],
    ['inventory_status', "VARCHAR(40) NOT NULL DEFAULT 'Activo'"],
    ['patrimonial_condition', "VARCHAR(40) NOT NULL DEFAULT ''"],
  ])
  await addColumns('material_inventory', [
    ['level', "VARCHAR(20) NOT NULL DEFAULT ''"],
    ['type', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['color', "VARCHAR(60) NOT NULL DEFAULT ''"],
    ['dimensions', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['operational_state', "VARCHAR(40) NOT NULL DEFAULT 'Operativo'"],
    ['registered_on', 'DATE NULL'],
  ])
  for (const name of ['Equipo informático', 'Bienes mobiliarios']) {
    await db.query('INSERT IGNORE INTO categories (name) VALUES (?)', [name])
  }
  const classrooms = []
  for (const level of ['Primaria', 'Secundaria']) {
    for (const grade of [1, 2, 3, 4, 5]) for (const section of ['A', 'B', 'C']) classrooms.push(`${level} ${grade}${section}`)
  }
  const places = [
    'Sala 1', 'Sala 2', 'Banda', 'Biblioteca', 'Biblioteca 1', 'Biblioteca 2', 'Depósito', 'Qaliwarma',
    'Aula funcional de arte 01', 'Aula funcional de arte 02', 'Laboratorio de física 01', 'Laboratorio de física 02', 'Tópico',
    'Sala de coordinadores 01', 'Sala de coordinadores 02', 'Sala de coordinadores Jhon', 'Subdirección secundaria',
    'Subdirección primaria', 'Sala de profesores', 'Dirección', 'AULAC1', 'AULACN2', 'Laboratorio primaria', ...classrooms,
  ]
  for (const name of places) await db.query('INSERT IGNORE INTO places (name) VALUES (?)', [name])
}

/** Comparable form of an identifier (patrimonial code, serial): no spaces, case-insensitive. */
const identifierKey = (value) => String(value ?? '').replace(/\s+/g, '').toLowerCase()

/** Id of another row of `table` whose `column` has the same identifier, or null. */
export async function findByIdentifier(db, table, column, value, excludeId = null) {
  const key = identifierKey(value)
  if (!key) return null
  const [rows] = await db.query(
    `SELECT id FROM ${table} WHERE LOWER(REPLACE(${column}, ' ', '')) = ?${excludeId ? ' AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [key, excludeId] : [key],
  )
  return rows[0]?.id ?? null
}

/** Error message when another equipment already uses this COD MINEDU or serial, else null. */
async function equipmentIdentifierInUse(input, excludeId = null) {
  const db = getPool()
  if (await findByIdentifier(db, 'equipment', 'patrimonial', input.patrimonial, excludeId)) {
    return `El COD MINEDU ${input.patrimonial} ya está registrado en otro equipo.`
  }
  if (await findByIdentifier(db, 'equipment', 'serial', input.serial, excludeId)) {
    return `El N.° de serie ${input.serial} ya está registrado en otro equipo.`
  }
  return null
}

/** Records of an import whose identifiers repeat inside the same file: line -> problems. */
function duplicateLines(items, fields) {
  const seen = Object.fromEntries(fields.map(([field]) => [field, new Map()]))
  const repeated = new Map()
  items.forEach((raw, index) => {
    const line = Number(raw.row) || index + 1
    const problems = []
    for (const [field, label] of fields) {
      const key = identifierKey(raw[field])
      if (!key) continue
      if (seen[field].has(key)) problems.push(`${label} repetido en el archivo (fila ${seen[field].get(key)})`)
      else seen[field].set(key, line)
    }
    if (problems.length) repeated.set(line, problems)
  })
  return repeated
}

/** Official patrimonial codes (catálogo SBN/MINEDU) of the institution's assets. */
const PATRIMONIAL_CODES = [
  ['746437120137', 'ESCRITORIO DE MADERA 1.20 m X 60 cm X 75 cm'],
  ['746488310001', 'SILLON GIRATORIO (OTROS)'],
  ['746459830001', 'MODULO DE COMPUTO (OTROS)'],
  ['746481190001', 'SILLA FIJA DE MADERA'],
  ['746406600002', 'ARMARIO DE METAL DE 2 PUERTAS'],
  ['746441180269', 'ESTANTE DE MADERA 40 cm X 80 m X 1.80 m'],
  ['746473050136', 'PIZARRA ACRILICA DE 4.20 m X 1.20 m'],
  ['462252150001', 'ESTABILIZADOR'],
  ['746466950029', 'PANTALLA ECRAN ELÉCTRICO 1.80 m X 2.20 m'],
  ['952259820001', 'PARARRAYOS'],
  ['140400031299', 'SOFTWARE DE CONTROL DE ACCESOS'],
  ['746450680555', 'MESA DE METAL 50 cm X 60 cm X 68 cm'],
  ['952278340018', 'SISTEMA DE PROYECCION MULTIMEDIA - PROYECTOR MULTIMEDIA 2700 lm'],
  ['746481870001', 'SILLA FIJA DE METAL'],
  ['536499500011', 'VITRINA METALICA PARA INSTRUMENTAL QUIRURGICO - ACERO INOXIDABLE 2 CUERPOS'],
  ['112283660001', 'VENTILADOR ELECTRICO PARA PARED'],
  ['746450680116', 'MESA DE METAL DE ACERO INOXIDABLE'],
  ['746466950001', 'PANTALLA ECRAN'],
  ['746449320155', 'MESA DE MADERA PARA ALUMNO 1° Y 2° GRADO EDUCACION SECUNDARIA'],
  ['746449320156', 'MESA DE MADERA PARA ALUMNO 3° A 5° GRADO EDUCACION SECUNDARIA'],
  ['746481190045', 'SILLA FIJA DE MADERA PARA ALUMNO 3° A 6° GRADO EDUCACION PRIMARIA'],
  ['746449320153', 'MESA DE MADERA PARA ALUMNO 1° Y 2° GRADO EDUCACION PRIMARIA'],
  ['746449320154', 'MESA DE MADERA PARA ALUMNO 3° A 6° GRADO EDUCACION PRIMARIA'],
  ['746449320431', 'MESA DE MADERA PARA ALUMNO 3° A 4° GRADO EDUCACIÓN SECUNDARIA 50 cm x 60 cm x 72 cm'],
  ['746450680556', 'MESA DE METAL 50 cm X 60 cm X 75 cm'],
  ['746481190046', 'SILLA FIJA DE MADERA PARA ALUMNO 1° y 2° GRADO EDUCACION SECUNDARIA'],
  ['746481190150', 'SILLA FIJA DE MADERA PARA ALUMNO 3° y 4° GRADO EDUCACION SECUNDARIA 41 cm x 44 cm x 84 cm'],
  ['746481190047', 'SILLA FIJA DE MADERA PARA ALUMNO 3° A 5° GRADO EDUCACION SECUNDARIA'],
  ['746481190149', 'SILLA FIJA DE MADERA PARA ALUMNO DE 5° GRADO EDUCACION SECUNDARIA'],
  ['676454340030', 'RACK DE TECHO PARA PROYECTOR'],
  ['952254910008', 'MICROFONO ALAMBRICO'],
  ['742208530001', 'CAMARA FOTOGRAFICA'],
  ['746481870091', 'SILLA FIJA DE METAL APILABLE PARA NIÑO'],
  ['740841000001', 'IMPRESORA LASER'],
  ['746403890002', 'ARCHIVADOR DE METAL DE 4 GAVETAS'],
]

/** Catalog of patrimonial codes the inventory forms pick from; seeded once with the institution's list. */
async function ensurePatrimonialCodes(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS patrimonial_codes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  const [count] = await db.query('SELECT COUNT(*) AS total FROM patrimonial_codes')
  if (Number(count[0].total)) return
  for (const [code, description] of PATRIMONIAL_CODES) {
    await db.query('INSERT IGNORE INTO patrimonial_codes (code, description) VALUES (?, ?)', [code, description])
  }
}

export async function ensureCampus() {
  const db = getPool()
  await db.query(`CREATE TABLE IF NOT EXISTS rooms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    is_computer_room TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`)
  const [roomTypeColumn] = await db.query("SHOW COLUMNS FROM rooms LIKE 'is_computer_room'")
  if (!roomTypeColumn.length) {
    await db.query('ALTER TABLE rooms ADD COLUMN is_computer_room TINYINT(1) NOT NULL DEFAULT 0')
  }
  await db.query(`CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS places (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS material_inventory (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    cod_minedu VARCHAR(80) NOT NULL DEFAULT '',
    category VARCHAR(100) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 0,
    unit VARCHAR(40) NOT NULL DEFAULT 'unidad',
    place VARCHAR(120) NOT NULL DEFAULT '',
    state ENUM('Bueno', 'Regular', 'Malo') NOT NULL DEFAULT 'Bueno',
    notes TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_material_inventory_name (name),
    INDEX idx_material_inventory_category (category)
  ) ENGINE=InnoDB`)
  const [materialCodColumn] = await db.query("SHOW COLUMNS FROM material_inventory LIKE 'cod_minedu'")
  if (!materialCodColumn.length) {
    await db.query("ALTER TABLE material_inventory ADD COLUMN cod_minedu VARCHAR(80) NOT NULL DEFAULT '' AFTER name")
  }
  await db.query(`CREATE TABLE IF NOT EXISTS equipment (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    category_id INT UNSIGNED NULL,
    type VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    brand VARCHAR(80) NOT NULL,
    model VARCHAR(80) NOT NULL DEFAULT '',
    serial VARCHAR(80) NOT NULL DEFAULT '',
    patrimonial VARCHAR(80) NOT NULL DEFAULT '',
    mac VARCHAR(40) NOT NULL DEFAULT '',
    processor VARCHAR(80) NOT NULL DEFAULT '',
    ram VARCHAR(40) NOT NULL DEFAULT '',
    storage VARCHAR(40) NOT NULL DEFAULT '',
    os_name VARCHAR(80) NOT NULL DEFAULT '',
    place_id INT UNSIGNED NULL,
    responsible_id INT UNSIGNED NULL,
    physical_state VARCHAR(40) NOT NULL DEFAULT 'Bueno',
    operational_state VARCHAR(40) NOT NULL DEFAULT 'Operativo',
    registered_on DATE NOT NULL,
    notes VARCHAR(500) NOT NULL DEFAULT '',
    CONSTRAINT fk_equipment_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT fk_equipment_place FOREIGN KEY (place_id) REFERENCES places(id),
    CONSTRAINT fk_equipment_user FOREIGN KEY (responsible_id) REFERENCES users(id)
  ) ENGINE=InnoDB`)
  await migrateInventoryFields(db)
  await ensurePatrimonialCodes(db)
  await db.query(`CREATE TABLE IF NOT EXISTS equipment_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT UNSIGNED NOT NULL,
    path VARCHAR(255) NOT NULL,
    CONSTRAINT fk_equipment_photo FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
  // The image can also be an internet link, which may be longer than a local path.
  const [photoPath] = await db.query("SHOW COLUMNS FROM equipment_photos LIKE 'path'")
  if (photoPath[0] && /varchar\((\d+)\)/i.test(photoPath[0].Type) && Number(/varchar\((\d+)\)/i.exec(photoPath[0].Type)[1]) < 1024) {
    await db.query('ALTER TABLE equipment_photos MODIFY path VARCHAR(1024) NOT NULL')
  }
  await db.query(`CREATE TABLE IF NOT EXISTS maintenance (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    equipment_id INT UNSIGNED NOT NULL,
    scheduled_date DATE NOT NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    type VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL,
    activities TEXT NOT NULL,
    notes VARCHAR(500) NOT NULL DEFAULT '',
    responsible_id INT UNSIGNED NULL,
    next_date DATE NULL,
    CONSTRAINT fk_maintenance_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
    CONSTRAINT fk_maintenance_user FOREIGN KEY (responsible_id) REFERENCES users(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS maintenance_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    maintenance_id INT UNSIGNED NOT NULL,
    path VARCHAR(255) NOT NULL,
    CONSTRAINT fk_maintenance_photo FOREIGN KEY (maintenance_id) REFERENCES maintenance(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS incidents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    equipment_id INT UNSIGNED NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(40) NOT NULL,
    assignee_id INT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    description VARCHAR(800) NOT NULL DEFAULT '',
    solution VARCHAR(800) NOT NULL DEFAULT '',
    reported_on DATE NOT NULL,
    CONSTRAINT fk_incident_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
    CONSTRAINT fk_incident_user FOREIGN KEY (assignee_id) REFERENCES users(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS incident_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    incident_id INT UNSIGNED NOT NULL,
    kind ENUM('before', 'after') NOT NULL,
    path VARCHAR(255) NOT NULL,
    CONSTRAINT fk_incident_photo FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
  await migrateIncidentFields(db)
  await migrateMaintenanceFields(db)
  await db.query(`CREATE TABLE IF NOT EXISTS parts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    equipment_id INT UNSIGNED NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit VARCHAR(40) NOT NULL DEFAULT 'unidad',
    maintenance_id INT UNSIGNED NULL,
    notes VARCHAR(300) NOT NULL DEFAULT '',
    CONSTRAINT fk_part_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
    CONSTRAINT fk_part_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    kind VARCHAR(80) NOT NULL,
    equipment_id INT UNSIGNED NULL,
    notes VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_document_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS report_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(40) NOT NULL,
    params JSON NOT NULL,
    summary VARCHAR(255) NOT NULL DEFAULT '',
    user_id INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_report_logs_created (created_at)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS fixed_schedules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT UNSIGNED NOT NULL,
    room_id INT UNSIGNED NOT NULL,
    weekday TINYINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grade VARCHAR(40) NOT NULL,
    section VARCHAR(40) NOT NULL,
    purpose VARCHAR(180) NOT NULL,
    CONSTRAINT fk_fixed_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
    CONSTRAINT fk_fixed_room FOREIGN KEY (room_id) REFERENCES rooms(id)
  ) ENGINE=InnoDB`)

  const [column] = await db.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'room_id'`,
  )
  if (!column[0].total) {
    await db.query('ALTER TABLE requests ADD COLUMN room_id INT UNSIGNED NULL')
    await db.query('ALTER TABLE requests ADD CONSTRAINT fk_requests_room FOREIGN KEY (room_id) REFERENCES rooms(id)')
  }

  const [legacyLab] = await db.query("SELECT id FROM rooms WHERE name = 'Sala de cómputo' LIMIT 1")
  const [firstComputerRoom] = await db.query("SELECT id FROM rooms WHERE name = 'Aula de cómputo 1' LIMIT 1")
  if (legacyLab.length && !firstComputerRoom.length) {
    await db.query('UPDATE rooms SET name = ?, is_computer_room = 1 WHERE id = ?', ['Aula de cómputo 1', legacyLab[0].id])
    const [secondComputerRoom] = await db.query("SELECT id FROM rooms WHERE name = 'Aula de cómputo 2' LIMIT 1")
    if (!secondComputerRoom.length) {
      await db.query("INSERT INTO rooms (name, is_computer_room) VALUES ('Aula de cómputo 2', 1)")
    }
  } else if (legacyLab.length && firstComputerRoom.length) {
    await db.query('UPDATE requests SET room_id = ? WHERE room_id = ?', [firstComputerRoom[0].id, legacyLab[0].id])
    await db.query('UPDATE fixed_schedules SET room_id = ? WHERE room_id = ?', [firstComputerRoom[0].id, legacyLab[0].id])
    await db.query('DELETE FROM rooms WHERE id = ?', [legacyLab[0].id])
  }
  await db.query(
    "UPDATE rooms SET is_computer_room = 1 WHERE name IN ('Aula de cómputo 1', 'Aula de cómputo 2')",
  )
  const [computerRoomCount] = await db.query('SELECT COUNT(*) AS total FROM rooms WHERE is_computer_room = 1')
  if (process.env.NODE_ENV !== 'production' && Number(computerRoomCount[0].total) === 0) {
    await db.query("INSERT INTO rooms (name, is_computer_room) VALUES ('Aula de cómputo 1', 1)")
    await db.query("INSERT INTO rooms (name, is_computer_room) VALUES ('Aula de cómputo 2', 1)")
  }
  const [lab] = await db.query("SELECT id FROM rooms WHERE name = 'Aula de cómputo 1' LIMIT 1")
  if (lab[0]) await db.query('UPDATE requests SET room_id = ? WHERE room_id IS NULL', [lab[0].id])

  const [categories] = await db.query('SELECT COUNT(*) AS total FROM categories')
  if (process.env.NODE_ENV !== 'production' && !categories[0].total) {
    for (const name of ['Equipo informático', 'Equipo multimedia', 'Impresora', 'Red']) {
      await db.query('INSERT INTO categories (name) VALUES (?)', [name])
    }
  }
  const [places] = await db.query('SELECT COUNT(*) AS total FROM places')
  if (process.env.NODE_ENV !== 'production' && !places[0].total) {
    for (const name of ['Aula de Innovación', 'Dirección', 'Aula 1', 'Aula 2', 'Sala de Redes', 'Sala de cómputo']) {
      await db.query('INSERT INTO places (name) VALUES (?)', [name])
    }
  }

  const [equipmentCount] = await db.query('SELECT COUNT(*) AS total FROM equipment')
  if (process.env.NODE_ENV !== 'production' && !equipmentCount[0].total) {
    await seedCampus(db, lab[0]?.id)
  }
}

async function seedCampus(db, labId) {
  const [users] = await db.query('SELECT id, email, name FROM users')
  const idOf = (email) => users.find((user) => user.email === email)?.id || null
  const [categories] = await db.query('SELECT id, name FROM categories')
  const [places] = await db.query('SELECT id, name FROM places')
  const category = (name) => categories.find((item) => item.name === name)?.id
  const place = (name) => places.find((item) => item.name === name)?.id
  const admin = idOf('admin@colegio.edu')
  const rows = [
    ['EQ-001', category('Equipo informático'), 'Computadora de escritorio', 'PC de laboratorio 01', 'Dell', 'OptiPlex 3080', 'ABC12345XYZ', '742215080001', 'AC:B5:7D:2E:4F:6A', 'Intel Core i5-10500', '8 GB', '256 GB SSD', 'Windows 10 Pro', place('Aula de Innovación'), admin, 'Bueno', 'Operativo', 'Equipo en buen estado, funcionando correctamente.'],
    ['EQ-002', category('Equipo multimedia'), 'Proyector', 'Proyector multimedia', 'Epson', 'EB-X500', 'EPS998812', '742215080014', '', '', '', '', '', place('Aula de Innovación'), admin, 'Regular', 'Operativo', 'La lámpara pierde brillo después de dos horas.'],
    ['EQ-003', category('Impresora'), 'Impresora', 'Impresora administrativa', 'HP', 'LaserJet Pro M404', 'HP441290', '742215080022', '', '', '', '', '', place('Dirección'), admin, 'Bueno', 'Con fallas', 'Atasco frecuente en la bandeja 1.'],
    ['EQ-004', category('Equipo informático'), 'Laptop', 'Laptop docente', 'Lenovo', 'ThinkPad E14', 'LNV22011', '742215080031', '', 'Ryzen 5', '8 GB', '256 GB SSD', 'Windows 11', place('Aula 1'), idOf('ana.torres@colegio.edu'), 'Bueno', 'Operativo', 'Asignada al área de informática.'],
    ['EQ-005', category('Red'), 'Router', 'Router principal', 'MikroTik', 'hAP ac3', 'MK10092', '742215080040', 'B8:69:F4:11:20:01', '', '', '', '', place('Sala de Redes'), admin, 'Bueno', 'Operativo', 'Enlace principal del pabellón.'],
  ]
  for (const row of rows) {
    await db.query(
      `INSERT INTO equipment (code, category_id, type, name, brand, model, serial, patrimonial, mac, processor, ram, storage, os_name, place_id, responsible_id, physical_state, operational_state, registered_on, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
      row,
    )
  }
  const [equipment] = await db.query('SELECT id, code FROM equipment')
  const eq = (code) => equipment.find((item) => item.code === code).id
  await db.query(
    `INSERT INTO maintenance (code, equipment_id, scheduled_date, start_time, end_time, type, status, activities, notes, responsible_id, next_date) VALUES
     ('MNT-2026-001', ?, '2026-10-22', '09:00', '10:30', 'Preventivo', 'Realizado', 'Limpieza interna y externa. Revisión de ventiladores. Verificación de disco y memoria. Actualización de sistema y antivirus.', 'Equipo en buen estado, funcionando correctamente.', ?, '2027-01-22'),
     ('MNT-2026-002', ?, '2026-10-20', '08:00', '09:00', 'Correctivo', 'En proceso', 'Revisión de la lámpara y limpieza del lente.', 'Se pidió lámpara de reemplazo.', ?, NULL),
     ('MNT-2026-003', ?, '2026-10-18', '11:00', '12:00', 'Preventivo', 'Realizado', 'Limpieza de rodillos y prueba de impresión.', '', ?, '2027-01-18'),
     ('MNT-2026-004', ?, '2026-10-25', '14:00', '15:00', 'Preventivo', 'Pendiente', 'Mantenimiento programado de la laptop docente.', '', ?, NULL),
     ('MNT-2026-005', ?, '2026-10-24', '10:00', '11:00', 'Preventivo', 'Programado', 'Revisión del router principal y respaldo de la configuración.', '', ?, '2027-04-24')`,
    [eq('EQ-001'), admin, eq('EQ-002'), admin, eq('EQ-003'), admin, eq('EQ-004'), admin, eq('EQ-005'), admin],
  )
  await db.query(
    `INSERT INTO incidents (code, equipment_id, priority, status, assignee_id, title, description, solution, reported_on) VALUES
     ('INC-2026-001', ?, 'alta', 'en_proceso', ?, 'La imagen del proyector se apaga', 'Durante las clases de la tarde el proyector pierde imagen a los 20 minutos.', 'Se limpió el filtro y se solicitó el cambio de lámpara.', '2026-09-12'),
     ('INC-2026-002', ?, 'media', 'resuelta', ?, 'El control remoto no responde', 'Los docentes no podían cambiar la fuente de video.', 'Se reemplazó la batería y se dejó un control de reserva.', '2026-06-03'),
     ('INC-2026-003', ?, 'baja', 'pendiente', ?, 'Atasco de papel en dirección', 'La impresora se detiene con hojas arrugadas.', '', '2026-10-18')`,
    [eq('EQ-002'), admin, eq('EQ-002'), admin, eq('EQ-003'), admin],
  )
  await db.query(
    `INSERT INTO parts (name, equipment_id, quantity, unit, notes) VALUES
     ('Lámpara de proyector Epson', ?, 1, 'unidad', 'Pendiente de instalación en EQ-002.'),
     ('Tóner HP 76A', ?, 2, 'unidad', 'Stock de dirección.'),
     ('Pasta térmica', NULL, 4, 'sobre', 'Para el mantenimiento preventivo de las PC.')`,
    [eq('EQ-002'), eq('EQ-003')],
  )
  await db.query(
    `INSERT INTO documents (title, kind, equipment_id, notes) VALUES
     ('Ficha técnica OptiPlex 3080', 'Ficha técnica', ?, 'Manual de servicio y especificaciones.'),
     ('Protocolo de mantenimiento preventivo', 'Protocolo', NULL, 'Rutina trimestral del aula de innovación.'),
     ('Informe de incidencias del proyector', 'Reporte', ?, 'Consolidado de fallas del EQ-002 en el año.')`,
    [eq('EQ-001'), eq('EQ-002')],
  )
  if (labId && idOf('maria.lopez@colegio.edu')) {
    const fixed = [
      [idOf('maria.lopez@colegio.edu'), labId, 1, '08:00', '09:30', '3°', 'A', 'Horario fijo de Matemáticas'],
      [idOf('maria.lopez@colegio.edu'), labId, 3, '08:00', '09:30', '3°', 'A', 'Horario fijo de Matemáticas'],
      [idOf('carlos.ruiz@colegio.edu'), labId, 2, '10:00', '11:30', '4°', 'B', 'Horario fijo de Ciencias'],
      [idOf('carlos.ruiz@colegio.edu'), labId, 4, '10:00', '11:30', '4°', 'B', 'Horario fijo de Ciencias'],
      [idOf('ana.torres@colegio.edu'), labId, 5, '07:30', '09:00', '6°', 'A', 'Horario fijo de Informática'],
    ]
    for (const row of fixed) {
      await db.query(
        `INSERT INTO fixed_schedules (teacher_id, room_id, weekday, start_time, end_time, grade, section, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row,
      )
    }
  }
}

function equipmentSql() {
  return `SELECT e.*, c.name AS category_name, p.name AS place_name, u.name AS responsible_name
    FROM equipment e
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN places p ON p.id = e.place_id
    LEFT JOIN users u ON u.id = e.responsible_id`
}

function maintenanceSql() {
  return `SELECT m.*, e.code AS equipment_code, e.name AS equipment_name, e.brand, e.model, e.serial, e.type AS equipment_type,
      e.patrimonial AS equipment_patrimonial, c.name AS category_name, p.name AS place_name_equipment, u.name AS responsible_name,
      mi.name AS material_name, mi.cod_minedu AS material_code, mi.type AS material_type, mi.category AS material_category, mi.place AS material_place
    FROM maintenance m
    LEFT JOIN equipment e ON e.id = m.equipment_id
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN places p ON p.id = e.place_id
    LEFT JOIN material_inventory mi ON mi.id = m.material_id
    LEFT JOIN users u ON u.id = m.responsible_id`
}

function incidentSql() {
  return `SELECT i.*, e.code AS equipment_code, e.name AS equipment_name, e.mac AS equipment_mac, e.serial AS equipment_serial,
      e.patrimonial AS equipment_patrimonial, e.type AS equipment_type, e.brand AS equipment_brand, e.model AS equipment_model,
      c.name AS equipment_category, p.name AS place_name_equipment,
      m.name AS material_name, m.cod_minedu AS material_code, m.type AS material_type, m.category AS material_category, m.place AS material_place,
      u.name AS assignee_name
    FROM incidents i
    LEFT JOIN equipment e ON e.id = i.equipment_id
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN places p ON p.id = e.place_id
    LEFT JOIN material_inventory m ON m.id = i.material_id
    LEFT JOIN users u ON u.id = i.assignee_id`
}

async function removeUploadedFiles(files) {
  for (const file of files) {
    try {
      await fs.promises.unlink(file.path)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

async function oneEquipment(id) {
  const [rows] = await getPool().query(`${equipmentSql()} WHERE e.id = ?`, [id])
  return rows[0] ? mapEquipment(rows[0]) : null
}

function mapEquipment(row) {
  return {
    id: row.id,
    code: row.code,
    categoryId: row.category_id,
    category: row.category_name || '',
    type: row.type,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    patrimonial: row.patrimonial,
    mac: row.mac,
    processor: row.processor,
    ram: row.ram,
    storage: row.storage,
    os: row.os_name,
    placeId: row.place_id,
    place: row.place_name || '',
    responsibleId: row.responsible_id,
    responsible: row.responsible_name || '',
    physicalState: row.physical_state,
    operationalState: row.operational_state,
    registeredOn: String(row.registered_on).slice(0, 10),
    notes: row.notes || '',
    level: row.level || '',
    color: row.color || '',
    dimensions: row.dimensions || '',
    placeDetail: row.place_detail || '',
    responsibleRole: row.responsible_role || '',
    assignmentType: row.assignment_type || '',
    useCondition: row.use_condition || '',
    accessories: parseJsonList(row.accessories),
    acquisitionDate: row.acquisition_date ? String(row.acquisition_date).slice(0, 10) : '',
    acquisitionOrigin: row.acquisition_origin || '',
    documentNumber: row.document_number || '',
    usefulLife: row.useful_life || '',
    warrantyStart: row.warranty_start ? String(row.warranty_start).slice(0, 10) : '',
    warrantyEnd: row.warranty_end ? String(row.warranty_end).slice(0, 10) : '',
    inventoryStatus: row.inventory_status || 'Activo',
    patrimonialCondition: row.patrimonial_condition || '',
  }
}

function parseJsonList(value) {
  if (!value) return []
  try {
    const list = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function mapMaintenance(row) {
  const furniture = row.asset_kind === 'mobiliario'
  return {
    id: row.id,
    code: row.code,
    assetKind: furniture ? 'mobiliario' : 'tecnologico',
    equipmentId: row.equipment_id,
    materialId: row.material_id,
    equipmentCode: furniture ? (row.material_code || 'Mobiliario') : row.equipment_code,
    equipmentName: furniture ? row.material_name : row.equipment_name,
    patrimonial: furniture ? (row.material_code || '') : (row.equipment_patrimonial || ''),
    brand: row.brand || '',
    model: row.model || '',
    serial: row.serial || '',
    typeName: furniture ? (row.material_type || '') : (row.equipment_type || ''),
    category: furniture ? (row.material_category || '') : (row.category_name || ''),
    place: row.place_name || (furniture ? row.material_place : row.place_name_equipment) || '',
    placeDetail: row.place_detail || '',
    level: row.level || '',
    priority: row.priority || 'media',
    date: String(row.scheduled_date).slice(0, 10),
    executedDate: row.executed_date ? String(row.executed_date).slice(0, 10) : '',
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    type: row.type,
    status: row.status,
    activities: row.activities || '',
    checklist: parseJsonList(row.checklist),
    otherActivity: row.other_activity || '',
    notes: row.notes || '',
    responsibleId: row.responsible_id,
    responsible: row.responsible_name || row.responsible_label || '',
    responsibleLabel: row.responsible_label || '',
    nextDate: row.next_date ? String(row.next_date).slice(0, 10) : '',
  }
}

function mapIncident(row) {
  const furniture = row.asset_kind === 'mobiliario'
  return {
    id: row.id,
    code: row.code,
    assetKind: furniture ? 'mobiliario' : 'tecnologico',
    equipmentId: row.equipment_id,
    materialId: row.material_id,
    equipmentCode: furniture ? (row.material_code || 'Mobiliario') : row.equipment_code,
    equipmentName: furniture ? row.material_name : row.equipment_name,
    equipmentMac: row.equipment_mac || '',
    equipmentSerial: row.equipment_serial || '',
    patrimonial: furniture ? (row.material_code || '') : (row.equipment_patrimonial || ''),
    assetType: furniture ? (row.material_type || '') : (row.equipment_type || ''),
    brand: row.equipment_brand || '',
    model: row.equipment_model || '',
    category: furniture ? (row.material_category || '') : (row.equipment_category || ''),
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id,
    assignee: row.assignee_name || '',
    title: row.title,
    description: row.description || '',
    solution: row.solution || '',
    reportedOn: String(row.reported_on).slice(0, 10),
    place: row.place_name || (furniture ? row.material_place : row.place_name_equipment) || '',
    placeDetail: row.place_detail || '',
    level: row.level || '',
    incidentType: row.incident_type || row.title || '',
    detectedAt: row.detected_at ? String(row.detected_at).slice(0, 16).replace(' ', 'T') : `${String(row.reported_on).slice(0, 10)}T00:00`,
    reportedByRole: row.reported_by_role || '',
    reporterName: row.reporter_name || '',
    initialState: row.initial_state || '',
    observations: row.observations || '',
  }
}

function mapPart(row) {
  return {
    id: row.id,
    name: row.name,
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_code || '',
    equipmentName: row.equipment_name || '',
    quantity: row.quantity,
    unit: row.unit,
    maintenanceId: row.maintenance_id,
    maintenanceCode: row.maintenance_code || '',
    notes: row.notes || '',
  }
}

function mapFixed(row) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    roomId: row.room_id,
    roomName: row.room_name,
    weekday: row.weekday,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    grade: row.grade,
    section: row.section,
    purpose: row.purpose,
  }
}

/** Equipment columns written on create/update/import, paired with the API field name. */
const EQUIPMENT_FIELDS = [
  ['category_id', 'categoryId'], ['type', 'type'], ['name', 'name'], ['brand', 'brand'], ['model', 'model'],
  ['serial', 'serial'], ['patrimonial', 'patrimonial'], ['mac', 'mac'], ['processor', 'processor'], ['ram', 'ram'],
  ['storage', 'storage'], ['os_name', 'os'], ['place_id', 'placeId'], ['responsible_id', 'responsibleId'],
  ['physical_state', 'physicalState'], ['operational_state', 'operationalState'], ['registered_on', 'registeredOn'], ['notes', 'notes'],
  ['level', 'level'], ['color', 'color'], ['dimensions', 'dimensions'], ['place_detail', 'placeDetail'],
  ['responsible_role', 'responsibleRole'], ['assignment_type', 'assignmentType'], ['use_condition', 'useCondition'],
  ['accessories', 'accessories'], ['acquisition_date', 'acquisitionDate'], ['acquisition_origin', 'acquisitionOrigin'],
  ['document_number', 'documentNumber'], ['useful_life', 'usefulLife'], ['warranty_start', 'warrantyStart'],
  ['warranty_end', 'warrantyEnd'], ['inventory_status', 'inventoryStatus'], ['patrimonial_condition', 'patrimonialCondition'],
]
const EQUIPMENT_COLUMNS = EQUIPMENT_FIELDS.map(([column]) => column).join(', ')
const EQUIPMENT_SET = EQUIPMENT_FIELDS.map(([column]) => `${column} = ?`).join(', ')
const EQUIPMENT_MARKS = EQUIPMENT_FIELDS.map(() => '?').join(', ')
const equipmentValues = (input) => EQUIPMENT_FIELDS.map(([, field]) => input[field])

const optionalDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null)
const text = (value, max) => String(value ?? '').trim().slice(0, max)

function equipmentInput(body) {
  return {
    code: String(body.code || '').trim(),
    categoryId: body.categoryId || null,
    type: String(body.type || 'Computadora de escritorio'),
    name: String(body.name || '').trim(),
    brand: String(body.brand || '').trim(),
    model: String(body.model || '').trim(),
    serial: String(body.serial || '').trim(),
    patrimonial: String(body.patrimonial || '').trim(),
    mac: String(body.mac || '').trim(),
    processor: String(body.processor || '').trim(),
    ram: String(body.ram || '').trim(),
    storage: String(body.storage || '').trim(),
    os: String(body.os || '').trim(),
    placeId: body.placeId || null,
    responsibleId: body.responsibleId || null,
    physicalState: body.physicalState || 'Bueno',
    operationalState: body.operationalState || 'Operativo',
    registeredOn: body.registeredOn || new Date().toISOString().slice(0, 10),
    notes: String(body.notes || '').trim().slice(0, 500),
    level: ['Primaria', 'Secundaria', 'Ambos'].includes(body.level) ? body.level : '',
    color: text(body.color, 60),
    dimensions: text(body.dimensions, 80),
    placeDetail: text(body.placeDetail, 160),
    responsibleRole: text(body.responsibleRole, 160),
    assignmentType: text(body.assignmentType, 60),
    useCondition: text(body.useCondition, 40),
    accessories: Array.isArray(body.accessories) ? JSON.stringify(body.accessories.slice(0, 30)) : (typeof body.accessories === 'string' && body.accessories.startsWith('[') ? body.accessories : null),
    acquisitionDate: optionalDate(body.acquisitionDate),
    acquisitionOrigin: text(body.acquisitionOrigin, 60),
    documentNumber: text(body.documentNumber, 80),
    usefulLife: Number.isInteger(Number(body.usefulLife)) && Number(body.usefulLife) > 0 && Number(body.usefulLife) < 100 ? Number(body.usefulLife) : null,
    warrantyStart: optionalDate(body.warrantyStart),
    warrantyEnd: optionalDate(body.warrantyEnd),
    inventoryStatus: text(body.inventoryStatus, 40) || 'Activo',
    patrimonialCondition: text(body.patrimonialCondition, 40),
  }
}

function materialInput(body = {}) {
  body = body || {}
  return {
    name: String(body.name || '').trim(),
    codMinedu: String(body.codMinedu || '').trim(),
    category: String(body.category || '').trim(),
    quantity: body.quantity === '' || body.quantity == null ? 1 : Number(body.quantity),
    unit: String(body.unit || '').trim() || 'unidad',
    level: ['Primaria', 'Secundaria', 'Ambos'].includes(body.level) ? body.level : '',
    type: String(body.type || '').trim().slice(0, 80),
    color: String(body.color || '').trim().slice(0, 60),
    dimensions: String(body.dimensions || '').trim().slice(0, 80),
    operationalState: ['Operativo', 'Con fallas', 'Inoperativo'].includes(body.operationalState) ? body.operationalState : 'Operativo',
    registeredOn: /^\d{4}-\d{2}-\d{2}$/.test(String(body.registeredOn || '')) ? body.registeredOn : null,
    place: String(body.place || '').trim(),
    state: String(body.state || ''),
    notes: String(body.notes || '').trim(),
  }
}

function validateMaterial(input) {
  if (!input.name || !input.category || !input.unit) {
    return 'Nombre, categoría y unidad son obligatorios.'
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > 4294967295) {
    return 'La cantidad debe ser un número entero igual o mayor que cero.'
  }
  if (!['Bueno', 'Regular', 'Malo'].includes(input.state)) {
    return 'Selecciona un estado válido.'
  }
  if (input.name.length > 160 || input.codMinedu.length > 80 || input.category.length > 100 || input.unit.length > 40 || input.place.length > 120) {
    return 'Revisa la longitud de los campos del material.'
  }
  return ''
}

function maintenanceInput(body) {
  const furniture = body.assetKind === 'mobiliario'
  const time = (value) => (/^\d{2}:\d{2}/.test(String(value || '')) ? String(value).slice(0, 5) : null)
  const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null)
  const checklist = Array.isArray(body.checklist) ? body.checklist.map((item) => String(item).slice(0, 80)).slice(0, 12) : []
  return {
    assetKind: furniture ? 'mobiliario' : 'tecnologico',
    equipmentId: furniture ? null : (body.equipmentId || null),
    materialId: furniture ? (body.materialId || null) : null,
    scheduledDate: date(body.scheduledDate || body.date),
    executedDate: date(body.executedDate),
    startTime: time(body.startTime),
    endTime: time(body.endTime),
    type: body.type === 'Correctivo' ? 'Correctivo' : 'Preventivo',
    priority: ['alta', 'media', 'baja'].includes(body.priority) ? body.priority : 'media',
    status: ['Programado', 'En proceso', 'Realizado', 'Pendiente'].includes(body.status) ? body.status : 'Programado',
    activities: String(body.activities || '').trim().slice(0, 1000),
    checklist: JSON.stringify(checklist),
    otherActivity: String(body.otherActivity || '').trim().slice(0, 160),
    notes: String(body.notes || '').trim().slice(0, 500),
    responsibleId: body.responsibleId || null,
    responsibleLabel: body.responsibleId ? '' : String(body.responsibleLabel || '').trim().slice(0, 120),
    level: ['Primaria', 'Secundaria', 'Ambos'].includes(body.level) ? body.level : '',
    placeName: String(body.place || '').trim().slice(0, 120),
    placeDetail: String(body.placeDetail || '').trim().slice(0, 160),
    nextDate: date(body.nextDate),
  }
}

function maintenanceProblem(input) {
  if (input.assetKind === 'tecnologico' && !input.equipmentId) return 'Selecciona el bien tecnológico del inventario.'
  if (input.assetKind === 'mobiliario' && !input.materialId) return 'Selecciona el bien mobiliario del inventario.'
  if (!input.scheduledDate) return 'Indica la fecha programada.'
  if (input.startTime && input.endTime && input.endTime <= input.startTime) return 'La hora de fin debe ser posterior a la de inicio.'
  if (input.activities.length < 8) return 'Describe el mantenimiento (mínimo 8 caracteres).'
  if (!input.responsibleId && !input.responsibleLabel) return 'Indica el responsable del mantenimiento.'
  return ''
}

const MAINTENANCE_COLUMNS = ['asset_kind', 'equipment_id', 'material_id', 'scheduled_date', 'executed_date', 'start_time', 'end_time', 'type', 'priority', 'status',
  'activities', 'checklist', 'other_activity', 'notes', 'responsible_id', 'responsible_label', 'level', 'place_name', 'place_detail', 'next_date']
const maintenanceValues = (input) => [input.assetKind, input.equipmentId, input.materialId, input.scheduledDate, input.executedDate, input.startTime, input.endTime,
  input.type, input.priority, input.status, input.activities, input.checklist, input.otherActivity, input.notes, input.responsibleId, input.responsibleLabel,
  input.level, input.placeName, input.placeDetail, input.nextDate]

function incidentInput(body) {
  const detected = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(body.detectedAt || '')) ? String(body.detectedAt).slice(0, 16) : ''
  const incidentType = String(body.incidentType || body.title || '').trim().slice(0, 80)
  return {
    assetKind: body.assetKind === 'mobiliario' ? 'mobiliario' : 'tecnologico',
    equipmentId: body.assetKind === 'mobiliario' ? null : (body.equipmentId || null),
    materialId: body.assetKind === 'mobiliario' ? (body.materialId || null) : null,
    priority: ['alta', 'media', 'baja'].includes(body.priority) ? body.priority : 'media',
    status: ['registrada', 'pendiente', 'en_proceso', 'resuelta'].includes(body.status) ? body.status : 'pendiente',
    assigneeId: body.assigneeId || null,
    title: (String(body.title || '').trim() || incidentType).slice(0, 180),
    description: String(body.description || '').trim().slice(0, 800),
    solution: String(body.solution || '').trim().slice(0, 800),
    reportedOn: detected ? detected.slice(0, 10) : (body.reportedOn || new Date().toISOString().slice(0, 10)),
    level: ['Primaria', 'Secundaria', 'Ambos'].includes(body.level) ? body.level : '',
    placeName: String(body.place || '').trim().slice(0, 120),
    placeDetail: String(body.placeDetail || '').trim().slice(0, 160),
    incidentType,
    detectedAt: detected ? `${detected.replace('T', ' ')}:00` : null,
    reportedByRole: String(body.reportedByRole || '').trim().slice(0, 40),
    reporterName: String(body.reporterName || '').trim().slice(0, 160),
    initialState: ['Operativo', 'Con fallas', 'Inoperativo'].includes(body.initialState) ? body.initialState : '',
    observations: String(body.observations || '').trim().slice(0, 200),
  }
}

function incidentProblem(input) {
  if (input.assetKind === 'tecnologico' && !input.equipmentId) return 'Selecciona el bien tecnológico del inventario.'
  if (input.assetKind === 'mobiliario' && !input.materialId) return 'Selecciona el bien mobiliario del inventario.'
  if (!input.incidentType) return 'Selecciona el tipo de incidencia.'
  if (input.description.length < 8) return 'Describe el problema (mínimo 8 caracteres).'
  return ''
}

const INCIDENT_COLUMNS = ['asset_kind', 'equipment_id', 'material_id', 'priority', 'status', 'assignee_id', 'title', 'description', 'solution', 'reported_on',
  'level', 'place_name', 'place_detail', 'incident_type', 'detected_at', 'reported_by_role', 'reporter_name', 'initial_state', 'observations']
const incidentValues = (input) => [input.assetKind, input.equipmentId, input.materialId, input.priority, input.status, input.assigneeId, input.title,
  input.description, input.solution, input.reportedOn, input.level, input.placeName, input.placeDetail, input.incidentType, input.detectedAt,
  input.reportedByRole, input.reporterName, input.initialState, input.observations]

function matchesEquipment(item, query) {
  const q = String(query.q || '').toLowerCase()
  if (q && !`${item.code} ${item.name} ${item.serial} ${item.brand} ${item.model} ${item.mac}`.toLowerCase().includes(q)) return false
  if (query.category && item.category !== query.category) return false
  if (query.place && item.place !== query.place) return false
  if (query.state && item.operationalState !== query.state) return false
  return true
}

function matchesMaintenance(item, query) {
  const q = String(query.q || '').toLowerCase()
  if (q && !`${item.code} ${item.equipmentName} ${item.patrimonial} ${item.activities} ${item.responsible}`.toLowerCase().includes(q)) return false
  if (query.status && item.status !== query.status) return false
  if (query.type && item.type !== query.type) return false
  if (query.category && item.category !== query.category) return false
  if (query.place && item.place !== query.place) return false
  if (query.level && item.level !== query.level && item.level !== 'Ambos') return false
  if (query.from && item.date < query.from) return false
  if (query.to && item.date > query.to) return false
  return true
}

function matchesIncident(item, query) {
  const q = String(query.q || '').toLowerCase()
  if (q && !`${item.code} ${item.title} ${item.description} ${item.equipmentCode} ${item.equipmentName} ${item.patrimonial} ${item.assignee}`.toLowerCase().includes(q)) return false
  if (query.status === 'pendiente' && !['pendiente', 'registrada'].includes(item.status)) return false
  if (query.status && query.status !== 'pendiente' && item.status !== query.status) return false
  if (query.priority && item.priority !== query.priority) return false
  if (query.place && item.place !== query.place) return false
  if (query.level && item.level !== query.level && item.level !== 'Ambos') return false
  if (query.from && item.reportedOn < query.from) return false
  if (query.to && item.reportedOn > query.to) return false
  if (query.equipmentId && Number(item.equipmentId) !== Number(query.equipmentId)) return false
  return true
}

async function nextCode(table, prefix, size) {
  const [rows] = await getPool().query(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY id DESC LIMIT 1`, [`${prefix}%`])
  const last = rows[0] ? Number(String(rows[0].code).slice(prefix.length)) : 0
  return `${prefix}${String(last + 1).padStart(size, '0')}`
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (payload.kind === 'guardian') return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
    const [rows] = await getPool().query(
      'SELECT id, name, email, dni, profile_photo, role, subject, active FROM users WHERE id = ? AND active = 1',
      [payload.sub],
    )
    if (!rows[0]) return res.status(401).json({ ok: false, error: 'Tu sesión ya no es válida.' })
    req.user = mapUser(rows[0])
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'Inicia sesión de nuevo.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: req.user.role === 'director' ? 'Tu rol (Dirección) es de solo consulta.' : 'Solo coordinación puede hacer esto.' })
  next()
}

/** Allows the request only for the given roles. */
export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: 'No tienes permiso para esta sección.' })
    next()
  }
}
