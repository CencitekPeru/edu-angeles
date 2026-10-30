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

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

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
      'SELECT id, name, cod_minedu AS codMinedu, category, quantity, unit, place, state, notes, updated_at AS updatedAt FROM material_inventory ORDER BY name',
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
    const [created] = await getPool().query(
      `INSERT INTO material_inventory (name, cod_minedu, category, quantity, unit, place, state, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.name, input.codMinedu, input.category, input.quantity, input.unit, input.place, input.state, input.notes],
    )
    res.status(201).json({ ok: true, id: created.insertId })
  }))

  router.patch('/api/materials/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = materialInput(req.body)
    const error = validateMaterial(input)
    if (error) return res.status(400).json({ ok: false, error })
    const [result] = await getPool().query(
      `UPDATE material_inventory
       SET name = ?, cod_minedu = ?, category = ?, quantity = ?, unit = ?, place = ?, state = ?, notes = ?
       WHERE id = ?`,
      [input.name, input.codMinedu, input.category, input.quantity, input.unit, input.place, input.state, input.notes, req.params.id],
    )
    if (!result.affectedRows) {
      const [rows] = await getPool().query('SELECT id FROM material_inventory WHERE id = ?', [req.params.id])
      if (!rows.length) return res.status(404).json({ ok: false, error: 'El material ya no existe.' })
    }
    res.json({ ok: true })
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
    const code = input.code || await nextCode('equipment', 'EQ-', 3)
    const [created] = await getPool().query(
      `INSERT INTO equipment
        (code, category_id, type, name, brand, model, serial, patrimonial, mac, processor, ram, storage, os_name, place_id, responsible_id, physical_state, operational_state, registered_on, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.categoryId, input.type, input.name, input.brand, input.model, input.serial, input.patrimonial, input.mac, input.processor, input.ram, input.storage, input.os, input.placeId, input.responsibleId, input.physicalState, input.operationalState, input.registeredOn, input.notes],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/equipment/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = equipmentInput(req.body)
    await getPool().query(
      `UPDATE equipment SET category_id=?, type=?, name=?, brand=?, model=?, serial=?, patrimonial=?, mac=?, processor=?, ram=?, storage=?, os_name=?, place_id=?, responsible_id=?, physical_state=?, operational_state=?, registered_on=?, notes=? WHERE id=?`,
      [input.categoryId, input.type, input.name, input.brand, input.model, input.serial, input.patrimonial, input.mac, input.processor, input.ram, input.storage, input.os, input.placeId, input.responsibleId, input.physicalState, input.operationalState, input.registeredOn, input.notes, req.params.id],
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

  router.delete('/api/equipment/:id/photos/:photoId', requireAuth, requireAdmin, wrap(async (req, res) => {
    const [photos] = await getPool().query(
      'SELECT id, path FROM equipment_photos WHERE id = ? AND equipment_id = ?',
      [req.params.photoId, req.params.id],
    )
    if (!photos.length) return res.status(404).json({ ok: false, error: 'La fotografía no existe para este equipo.' })

    const fileName = path.basename(photos[0].path)
    const filePath = path.join(uploadDir, fileName)
    if (path.dirname(path.resolve(filePath)) !== path.resolve(uploadDir)) {
      return res.status(400).json({ ok: false, error: 'La ruta de la fotografía no es válida.' })
    }
    await getPool().query(
      'DELETE FROM equipment_photos WHERE id = ? AND equipment_id = ?',
      [req.params.photoId, req.params.id],
    )
    try {
      await fs.promises.unlink(filePath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    res.json({ ok: true })
  }))

  router.get('/api/maintenance', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${maintenanceSql()} ORDER BY m.scheduled_date DESC, m.start_time`)
    res.json({ ok: true, maintenance: rows.map(mapMaintenance).filter((item) => matchesMaintenance(item, req.query)) })
  }))

  router.post('/api/maintenance', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = maintenanceInput(req.body)
    if (!input.equipmentId || !input.scheduledDate) return res.status(400).json({ ok: false, error: 'Elige el equipo y la fecha.' })
    const code = await nextCode('maintenance', `MNT-${new Date().getFullYear()}-`, 3)
    const [created] = await getPool().query(
      `INSERT INTO maintenance (code, equipment_id, scheduled_date, start_time, end_time, type, status, activities, notes, responsible_id, next_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.equipmentId, input.scheduledDate, input.startTime, input.endTime, input.type, input.status, input.activities, input.notes, input.responsibleId, input.nextDate || null],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/maintenance/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = maintenanceInput(req.body)
    await getPool().query(
      `UPDATE maintenance SET equipment_id=?, scheduled_date=?, start_time=?, end_time=?, type=?, status=?, activities=?, notes=?, responsible_id=?, next_date=? WHERE id=?`,
      [input.equipmentId, input.scheduledDate, input.startTime, input.endTime, input.type, input.status, input.activities, input.notes, input.responsibleId, input.nextDate || null, req.params.id],
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

  router.post('/api/maintenance/:id/photos', requireAuth, requireAdmin, upload.array('photos', 6), wrap(async (req, res) => {
    for (const file of req.files || []) {
      await getPool().query('INSERT INTO maintenance_photos (maintenance_id, path) VALUES (?, ?)', [req.params.id, `/api/uploads/${file.filename}`])
    }
    res.json({ ok: true })
  }))

  router.get('/api/incidents', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${incidentSql()} ORDER BY i.reported_on DESC, i.id DESC`)
    const incidents = rows.map(mapIncident).filter((item) => matchesIncident(item, req.query))
    res.json({ ok: true, incidents: req.user.role === 'admin' ? incidents : incidents })
  }))

  router.get('/api/incidents/:id', requireAuth, wrap(async (req, res) => {
    const [rows] = await getPool().query(`${incidentSql()} WHERE i.id = ?`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada.' })
    const [photos] = await getPool().query(
      'SELECT id, kind, path FROM incident_photos WHERE incident_id = ? ORDER BY id',
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
    if (!input.equipmentId || input.title.length < 8) return res.status(400).json({ ok: false, error: 'Vincula el equipo y describe la falla.' })
    const code = await nextCode('incidents', `INC-${new Date().getFullYear()}-`, 3)
    const [created] = await getPool().query(
      `INSERT INTO incidents (code, equipment_id, priority, status, assignee_id, title, description, solution, reported_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, input.equipmentId, input.priority, input.status, input.assigneeId, input.title, input.description, input.solution, input.reportedOn],
    )
    res.status(201).json({ ok: true, id: created.insertId, code })
  }))

  router.patch('/api/incidents/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const input = incidentInput(req.body)
    await getPool().query(
      `UPDATE incidents SET equipment_id=?, priority=?, status=?, assignee_id=?, title=?, description=?, solution=?, reported_on=? WHERE id=?`,
      [input.equipmentId, input.priority, input.status, input.assigneeId, input.title, input.description, input.solution, input.reportedOn, req.params.id],
    )
    res.json({ ok: true })
  }))

  router.delete('/api/incidents/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await getPool().query('DELETE FROM incident_photos WHERE incident_id = ?', [req.params.id])
    await getPool().query('DELETE FROM incidents WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }))

  router.post('/api/incidents/:id/photos', requireAuth, upload.array('photos', 6), wrap(async (req, res) => {
    const kind = req.body.kind === 'after' ? 'after' : 'before'
    for (const file of req.files || []) {
      await getPool().query(
        'INSERT INTO incident_photos (incident_id, kind, path) VALUES (?, ?, ?)',
        [req.params.id, kind, `/api/uploads/${file.filename}`],
      )
    }
    res.json({ ok: true })
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
  await db.query(`CREATE TABLE IF NOT EXISTS equipment_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT UNSIGNED NOT NULL,
    path VARCHAR(255) NOT NULL,
    CONSTRAINT fk_equipment_photo FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
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
  if (Number(computerRoomCount[0].total) === 0) {
    await db.query("INSERT INTO rooms (name, is_computer_room) VALUES ('Aula de cómputo 1', 1)")
    await db.query("INSERT INTO rooms (name, is_computer_room) VALUES ('Aula de cómputo 2', 1)")
  }
  const [lab] = await db.query("SELECT id FROM rooms WHERE name = 'Aula de cómputo 1' LIMIT 1")
  if (lab[0]) await db.query('UPDATE requests SET room_id = ? WHERE room_id IS NULL', [lab[0].id])

  const [categories] = await db.query('SELECT COUNT(*) AS total FROM categories')
  if (!categories[0].total) {
    for (const name of ['Equipo informático', 'Equipo multimedia', 'Impresora', 'Red']) {
      await db.query('INSERT INTO categories (name) VALUES (?)', [name])
    }
  }
  const [places] = await db.query('SELECT COUNT(*) AS total FROM places')
  if (!places[0].total) {
    for (const name of ['Aula de Innovación', 'Dirección', 'Aula 1', 'Aula 2', 'Sala de Redes', 'Sala de cómputo']) {
      await db.query('INSERT INTO places (name) VALUES (?)', [name])
    }
  }

  const [equipmentCount] = await db.query('SELECT COUNT(*) AS total FROM equipment')
  if (!equipmentCount[0].total) await seedCampus(db, lab[0]?.id)
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
      c.name AS category_name, p.name AS place_name, u.name AS responsible_name
    FROM maintenance m
    JOIN equipment e ON e.id = m.equipment_id
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN places p ON p.id = e.place_id
    LEFT JOIN users u ON u.id = m.responsible_id`
}

function incidentSql() {
  return `SELECT i.*, e.code AS equipment_code, e.name AS equipment_name, e.mac AS equipment_mac, e.serial AS equipment_serial, u.name AS assignee_name
    FROM incidents i
    JOIN equipment e ON e.id = i.equipment_id
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
  }
}

function mapMaintenance(row) {
  return {
    id: row.id,
    code: row.code,
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_code,
    equipmentName: row.equipment_name,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    typeName: row.equipment_type,
    category: row.category_name || '',
    place: row.place_name || '',
    date: String(row.scheduled_date).slice(0, 10),
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    type: row.type,
    status: row.status,
    activities: row.activities || '',
    notes: row.notes || '',
    responsibleId: row.responsible_id,
    responsible: row.responsible_name || '',
    nextDate: row.next_date ? String(row.next_date).slice(0, 10) : '',
  }
}

function mapIncident(row) {
  return {
    id: row.id,
    code: row.code,
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_code,
    equipmentName: row.equipment_name,
    equipmentMac: row.equipment_mac || '',
    equipmentSerial: row.equipment_serial || '',
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id,
    assignee: row.assignee_name || '',
    title: row.title,
    description: row.description || '',
    solution: row.solution || '',
    reportedOn: String(row.reported_on).slice(0, 10),
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
    notes: String(body.notes || '').trim(),
  }
}

function materialInput(body = {}) {
  body = body || {}
  return {
    name: String(body.name || '').trim(),
    codMinedu: String(body.codMinedu || '').trim(),
    category: String(body.category || '').trim(),
    quantity: Number(body.quantity),
    unit: String(body.unit || '').trim(),
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
  return {
    equipmentId: body.equipmentId || null,
    scheduledDate: body.scheduledDate || body.date,
    startTime: body.startTime || null,
    endTime: body.endTime || null,
    type: body.type || 'Preventivo',
    status: body.status || 'Programado',
    activities: String(body.activities || '').trim(),
    notes: String(body.notes || '').trim(),
    responsibleId: body.responsibleId || null,
    nextDate: body.nextDate || null,
  }
}

function incidentInput(body) {
  return {
    equipmentId: body.equipmentId || null,
    priority: body.priority || 'media',
    status: body.status || 'registrada',
    assigneeId: body.assigneeId || null,
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    solution: String(body.solution || '').trim(),
    reportedOn: body.reportedOn || new Date().toISOString().slice(0, 10),
  }
}

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
  if (q && !`${item.code} ${item.equipmentName} ${item.activities}`.toLowerCase().includes(q)) return false
  if (query.status && item.status !== query.status) return false
  if (query.category && item.category !== query.category) return false
  if (query.from && item.date < query.from) return false
  if (query.to && item.date > query.to) return false
  return true
}

function matchesIncident(item, query) {
  const q = String(query.q || '').toLowerCase()
  if (q && !`${item.code} ${item.title} ${item.equipmentCode} ${item.equipmentName} ${item.assignee}`.toLowerCase().includes(q)) return false
  if (query.status && item.status !== query.status) return false
  if (query.priority && item.priority !== query.priority) return false
  if (query.equipmentId && Number(item.equipmentId) !== Number(query.equipmentId)) return false
  return true
}

async function nextCode(table, prefix, size) {
  const [rows] = await getPool().query(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY id DESC LIMIT 1`, [`${prefix}%`])
  const last = rows[0] ? Number(String(rows[0].code).slice(prefix.length)) : 0
  return `${prefix}${String(last + 1).padStart(size, '0')}`
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ ok: false, error: 'Inicia sesión.' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const [rows] = await getPool().query(
      'SELECT id, name, email, role, subject, active FROM users WHERE id = ? AND active = 1',
      [payload.sub],
    )
    if (!rows[0]) return res.status(401).json({ ok: false, error: 'Tu sesión ya no es válida.' })
    req.user = mapUser(rows[0])
    next()
  } catch {
    return res.status(401).json({ ok: false, error: 'Inicia sesión de nuevo.' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Solo coordinación puede hacer esto.' })
  next()
}
