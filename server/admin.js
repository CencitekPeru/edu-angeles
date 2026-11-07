import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getPool } from './db.js'
import { ensureCampus, requireAdmin, requireAuth } from './campus.js'

const backupDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backups')
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

/** Word the admin must type to confirm a cleanup. */
export const CLEAN_CONFIRMATION = 'LIMPIAR'

/**
 * Data groups that can be cleaned. `requires` lists groups whose data points to this one,
 * so they are cleaned too (otherwise the foreign keys would be left pointing nowhere).
 * Users, roles and settings are never in a table list: users are handled separately.
 */
export const CLEAN_GROUPS = {
  soporte: { label: 'Incidencias y mantenimiento', tables: ['incident_photos', 'incidents', 'maintenance_photos', 'parts', 'maintenance'], requires: [] },
  inventario: { label: 'Inventario (bienes tecnológicos y mobiliarios)', tables: ['documents', 'equipment_photos', 'equipment', 'material_inventory'], requires: ['soporte'] },
  reservas: { label: 'Reservas y horarios fijos', tables: ['requests', 'fixed_schedules'], requires: [] },
  asistencia: { label: 'Registros de asistencia', tables: ['attendance', 'attendance_audit', 'justifications'], requires: [] },
  psicologia: { label: 'Atención psicológica (casos, sesiones y derivaciones)', tables: ['psych_referrals', 'psych_sessions', 'psych_cases'], requires: [] },
  estudiantes: { label: 'Estudiantes y apoderados', tables: ['guardian_students', 'guardians', 'students'], requires: ['asistencia', 'psicologia'] },
  notificaciones: { label: 'Notificaciones e historial de reportes', tables: ['notifications', 'report_logs'], requires: [] },
  catalogos: { label: 'Catálogos (categorías, ambientes, salas y códigos patrimoniales)', tables: ['categories', 'places', 'patrimonial_codes', 'rooms'], requires: ['inventario', 'reservas'] },
  usuarios: { label: 'Usuarios (se conserva tu cuenta)', tables: [], requires: ['reservas'] },
}

/** Deletion order: children before parents, so foreign keys stay valid at every step. */
const DELETE_ORDER = Object.values(CLEAN_GROUPS).flatMap((group) => group.tables)

/** Expands the chosen groups with every group they depend on. */
export function expandGroups(chosen) {
  const result = new Set()
  const visit = (key) => {
    if (!CLEAN_GROUPS[key] || result.has(key)) return
    result.add(key)
    CLEAN_GROUPS[key].requires.forEach(visit)
  }
  chosen.forEach(visit)
  return [...result]
}

async function existingTables(db) {
  const [rows] = await db.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = ? ORDER BY TABLE_NAME', ['BASE TABLE'])
  return rows.map((row) => row.name)
}

async function countRows(db, table) {
  const [rows] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``)
  return Number(rows[0].total)
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')

/** Full SQL dump (structure + data) that can be restored from phpMyAdmin or the mysql client. */
export async function buildSqlDump() {
  const db = getPool()
  const tables = await existingTables(db)
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name')
  const lines = [
    '-- Copia de seguridad de la base de datos',
    `-- Base de datos: ${name}`,
    `-- Generado: ${new Date().toLocaleString('es-PE')}`,
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
    '',
  ]
  for (const table of tables) {
    const [[create]] = await db.query(`SHOW CREATE TABLE \`${table}\``)
    lines.push(`-- Tabla ${table}`, `DROP TABLE IF EXISTS \`${table}\`;`, `${create['Create Table']};`, '')
    const [rows] = await db.query({ sql: `SELECT * FROM \`${table}\``, dateStrings: true })
    if (!rows.length) continue
    const columns = Object.keys(rows[0]).map((column) => `\`${column}\``).join(', ')
    for (let start = 0; start < rows.length; start += 200) {
      const values = rows.slice(start, start + 200).map((row) => `(${Object.values(row).map((value) => db.escape(value)).join(', ')})`)
      lines.push(`INSERT INTO \`${table}\` (${columns}) VALUES\n${values.join(',\n')};`)
    }
    lines.push('')
  }
  lines.push('SET FOREIGN_KEY_CHECKS = 1;', '')
  return { name, sql: lines.join('\n') }
}

/** Every table in its own sheet, for reading the data in Excel. Password hashes are left out. */
async function buildWorkbook() {
  const { default: ExcelJS } = await import('exceljs')
  const db = getPool()
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()
  const summary = workbook.addWorksheet('Resumen')
  summary.columns = [{ header: 'Tabla', key: 'table', width: 28 }, { header: 'Registros', key: 'rows', width: 12 }]
  summary.getRow(1).font = { bold: true }
  for (const table of await existingTables(db)) {
    const [rows, fields] = await db.query({ sql: `SELECT * FROM \`${table}\``, dateStrings: true })
    const columns = fields.map((field) => field.name).filter((column) => !/password/i.test(column))
    summary.addRow({ table, rows: rows.length })
    const sheet = workbook.addWorksheet(table.slice(0, 31))
    sheet.columns = columns.map((column) => ({ header: column, key: column, width: Math.min(40, Math.max(12, column.length + 2)) }))
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    for (const row of rows) {
      sheet.addRow(Object.fromEntries(columns.map((column) => {
        const value = row[column]
        return [column, Buffer.isBuffer(value) ? value.toString('base64') : value]
      })))
    }
  }
  return workbook.xlsx.writeBuffer()
}

async function saveBackup(reason) {
  const { name, sql } = await buildSqlDump()
  fs.mkdirSync(backupDir, { recursive: true })
  const file = `${name}-${stamp()}-${reason}.sql`
  fs.writeFileSync(path.join(backupDir, file), sql, 'utf8')
  return file
}

export function adminRouter() {
  const router = express.Router()

  /** Record counts per cleanable group, for the settings page. */
  router.get('/api/admin/database', requireAuth, requireAdmin, wrap(async (req, res) => {
    const db = getPool()
    const tables = new Set(await existingTables(db))
    const groups = []
    for (const [key, group] of Object.entries(CLEAN_GROUPS)) {
      let total = 0
      for (const table of group.tables) if (tables.has(table)) total += await countRows(db, table)
      if (key === 'usuarios') {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM users WHERE id <> ?', [req.user.id])
        total = Number(rows[0].total)
      }
      groups.push({ key, label: group.label, total, requires: group.requires })
    }
    let totalRows = 0
    for (const table of tables) totalRows += await countRows(db, table)
    const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((file) => file.endsWith('.sql')).sort().reverse().slice(0, 10) : []
    res.json({ ok: true, groups, tables: tables.size, totalRows, backups, confirmation: CLEAN_CONFIRMATION })
  }))

  router.get('/api/admin/export.sql', requireAuth, requireAdmin, wrap(async (_req, res) => {
    const { name, sql } = await buildSqlDump()
    res.setHeader('Content-Type', 'application/sql; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp()}.sql"`)
    res.send(sql)
  }))

  router.get('/api/admin/export.xlsx', requireAuth, requireAdmin, wrap(async (_req, res) => {
    const buffer = await buildWorkbook()
    const [[{ name }]] = await getPool().query('SELECT DATABASE() AS name')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp()}.xlsx"`)
    res.send(Buffer.from(buffer))
  }))

  /** Deletes the chosen groups (plus what depends on them) after saving a backup on the server. */
  router.post('/api/admin/clean', requireAuth, requireAdmin, wrap(async (req, res) => {
    if (String(req.body.confirmation || '').trim().toUpperCase() !== CLEAN_CONFIRMATION) {
      return res.status(400).json({ ok: false, error: `Escribe ${CLEAN_CONFIRMATION} para confirmar.` })
    }
    const chosen = Array.isArray(req.body.groups) ? req.body.groups.filter((key) => CLEAN_GROUPS[key]) : []
    if (!chosen.length) return res.status(400).json({ ok: false, error: 'Selecciona al menos un módulo para limpiar.' })
    const groups = expandGroups(chosen)
    const db = getPool()
    const present = new Set(await existingTables(db))
    const tables = DELETE_ORDER.filter((table) => present.has(table) && groups.some((key) => CLEAN_GROUPS[key].tables.includes(table)))

    const backup = await saveBackup('antes-de-limpiar')
    const connection = await db.getConnection()
    let deleted = 0
    try {
      await connection.beginTransaction()
      for (const table of tables) {
        const [result] = await connection.query(`DELETE FROM \`${table}\``)
        deleted += result.affectedRows
      }
      if (groups.includes('usuarios')) {
        // Keep inventory and support records, just without a responsible person.
        await connection.query('UPDATE equipment SET responsible_id = NULL WHERE responsible_id <> ?', [req.user.id])
        await connection.query('UPDATE incidents SET assignee_id = NULL WHERE assignee_id <> ?', [req.user.id])
        await connection.query('UPDATE maintenance SET responsible_id = NULL WHERE responsible_id <> ?', [req.user.id])
        const [result] = await connection.query('DELETE FROM users WHERE id <> ?', [req.user.id])
        deleted += result.affectedRows
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    // Emptied tables start their ids again from 1 (DDL, so it runs after the commit).
    for (const table of tables) await db.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`)
    // Base catalogs (school categories, rooms, patrimonial codes) are restored to their initial values.
    if (groups.includes('catalogos')) await ensureCampus()
    res.json({ ok: true, deleted, groups, backup })
  }))

  return router
}
