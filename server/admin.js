import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import mysql from 'mysql2/promise'
import { config } from './config.js'
import { getPool } from './db.js'
import { ensureCampus, requireAdmin, requireAuth } from './campus.js'

const backupDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backups')
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

/** Word the admin must type to confirm a cleanup. */
export const CLEAN_CONFIRMATION = 'LIMPIAR'
/** Word the admin must type to confirm an import (it replaces the current data). */
export const IMPORT_CONFIRMATION = 'IMPORTAR'

const sqlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
})

/** Text of an uploaded dump: UTF-8 (with or without BOM) or UTF-16, as some Windows tools save it. */
function decodeDump(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le')
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le')
  // UTF-16 without BOM: every other byte of the ASCII text is zero.
  const sample = buffer.subarray(0, 200)
  if (sample.length > 10 && sample.filter((byte, index) => index % 2 === 1 && byte === 0).length > sample.length / 4) return buffer.toString('utf16le')
  return buffer.toString('utf8').replace(/^﻿/, '')
}

/**
 * Splits a dump into statements, reading it character by character so that `;`, quotes and comment
 * marks inside strings are respected. Plain comments are dropped; MySQL's `/*! ... *\/` hints are kept.
 */
function splitSql(sql) {
  const statements = []
  let current = ''
  let quote = ''
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]
    if (quote) {
      current += char
      if (char === '\\' && quote !== '`') { current += next ?? ''; i += 1 }
      else if (char === quote) {
        if (next === quote) { current += next; i += 1 } else quote = ''
      }
      continue
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; current += char; continue }
    if ((char === '-' && next === '-' && /\s/.test(sql[i + 2] ?? ' ')) || char === '#') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      current += '\n'
      continue
    }
    if (char === '/' && next === '*' && sql[i + 2] !== '!') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 1
      current += ' '
      continue
    }
    if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) statements.push(current.trim())
  // Never let a dump switch or drop databases: it is always loaded into the system's own database.
  return statements.filter((statement) => !/^(USE|CREATE\s+(DATABASE|SCHEMA)|DROP\s+(DATABASE|SCHEMA)|DELIMITER)\b/i.test(statement))
}

/**
 * Makes a dump from another MySQL version load on this server (e.g. a MySQL 8 dump on XAMPP's MariaDB):
 * collations and character sets the server does not know are replaced by equivalent ones, and
 * MySQL-8-only table options are dropped. Only structure statements are touched, never the data.
 */
async function adaptToServer(connection, statements) {
  const [collations] = await connection.query('SHOW COLLATION')
  const [charsets] = await connection.query('SHOW CHARACTER SET')
  const knownCollations = new Set(collations.map((row) => row.Collation.toLowerCase()))
  const knownCharsets = new Set(charsets.map((row) => row.Charset.toLowerCase()))
  const charsetFor = (name) => {
    const lower = name.toLowerCase()
    if (knownCharsets.has(lower)) return lower
    if (lower === 'utf8mb3' && knownCharsets.has('utf8')) return 'utf8'
    if (lower === 'utf8' && knownCharsets.has('utf8mb3')) return 'utf8mb3'
    return lower
  }
  const collationFor = (name) => {
    const lower = name.toLowerCase()
    if (knownCollations.has(lower)) return lower
    const [prefix, ...rest] = lower.split('_')
    const charset = charsetFor(prefix)
    return [`${charset}_${rest.join('_')}`, `${charset}_unicode_ci`, `${charset}_general_ci`].find((item) => knownCollations.has(item)) || lower
  }
  const jsonColumns = []
  const adapted = statements.map((statement) => {
    if (/^(INSERT|REPLACE)\b/i.test(statement)) return statement
    // JSON columns are created as plain text so that values exported badly by older versions still load;
    // they are repaired right after the data is in (see repairJsonColumns).
    const table = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^\s`(]+)`?/i.exec(statement)?.[1]
    if (table) {
      statement = statement.replace(/`([^`]+)`\s+json\b/gi, (_match, column) => {
        jsonColumns.push({ table, column })
        return `\`${column}\` longtext`
      })
    }
    return statement
      // MySQL 8 table options inside version comments (MariaDB would try to run them).
      .replace(/\/\*!80\d{3}[^*]*\*\//g, '')
      .replace(/\b(utf8mb4|utf8mb3|utf8)_[a-z0-9_]+\b/gi, (match) => collationFor(match))
      .replace(/\butf8mb3\b(?!_)/gi, (match) => charsetFor(match))
  })
  return { statements: adapted, jsonColumns }
}

/**
 * Turns a value exported as `key` = 'value', `key2` = 2 (an object escaped as SQL by older
 * versions of the export) back into JSON. Returns null when the text is not in that form.
 */
export function repairJson(text) {
  const pattern = /\s*`((?:[^`]|``)+)`\s*=\s*('(?:[^'\\]|\\.|'')*'|-?\d+(?:\.\d+)?|NULL|true|false)\s*(,|$)/giy
  const escapes = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a' }
  const result = {}
  let match
  let end = 0
  while ((match = pattern.exec(text))) {
    const [, key, raw, comma] = match
    let value
    if (raw.startsWith("'")) value = raw.slice(1, -1).replace(/''/g, "'").replace(/\\(.)/g, (_m, char) => escapes[char] ?? char)
    else if (/^null$/i.test(raw)) value = null
    else if (/^(true|false)$/i.test(raw)) value = raw.toLowerCase() === 'true'
    else value = Number(raw)
    result[key.replace(/``/g, '`')] = value
    end = pattern.lastIndex
    if (!comma) break
  }
  return end && end >= text.trimEnd().length ? JSON.stringify(result) : null
}

/** Fixes values of JSON columns that are not valid JSON (see repairJson); unrecoverable ones become {}. */
async function repairJsonColumns(connection, jsonColumns) {
  for (const { table, column } of jsonColumns) {
    const t = `\`${table}\``
    const c = `\`${column}\``
    const [rows] = await connection.query(`SELECT DISTINCT ${c} AS v FROM ${t} WHERE ${c} IS NOT NULL AND NOT JSON_VALID(${c})`)
    for (const { v } of rows) {
      await connection.query(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`, [repairJson(String(v)) || '{}', v])
    }
  }
}

/** Runs the statements in batches small enough for MySQL's packet limit. */
/** Drops every table and view of the system's database, leaving it empty for a full restore. */
async function dropEverything(connection) {
  const [rows] = await connection.query(
    'SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  )
  for (const row of rows.filter((item) => item.type === 'VIEW')) await connection.query(`DROP VIEW IF EXISTS \`${row.name}\``)
  for (const row of rows.filter((item) => item.type !== 'VIEW')) await connection.query(`DROP TABLE IF EXISTS \`${row.name}\``)
}

/**
 * Runs a dump. With `replace`, the current database is emptied first, so it ends up exactly
 * as the file describes (no leftover tables or rows from before).
 */
async function runSql(input, { replace = false } = {}) {
  let statements = input
  const connection = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' })
  try {
    const adapted = await adaptToServer(connection, statements)
    statements = adapted.statements
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    if (replace) await dropEverything(connection)
    let batch = []
    let size = 0
    const flush = async () => {
      if (!batch.length) return
      await connection.query(batch.join('\n'))
      batch = []
      size = 0
    }
    for (const statement of statements) {
      if (size + statement.length > 4 * 1024 * 1024) await flush()
      batch.push(`${statement};`)
      size += statement.length
    }
    await flush()
    await repairJsonColumns(connection, adapted.jsonColumns)
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await connection.end()
  }
}

/**
 * Data groups that can be cleaned. `requires` lists groups whose data points to this one,
 * so they are cleaned too (otherwise the foreign keys would be left pointing nowhere).
 * Users, roles and settings are never in a table list: users are handled separately.
 */
export const CLEAN_GROUPS = {
  soporte: { label: 'Incidencias y mantenimiento', tables: ['incident_photos', 'incidents', 'maintenance_photos', 'parts', 'maintenance'], requires: [] },
  inventario: { label: 'Inventario (todas las secciones de bienes)', tables: ['documents', 'equipment_photos', 'equipment', 'material_inventory', 'asset_items'], requires: ['soporte'] },
  reservas: { label: 'Reservas y horarios fijos', tables: ['requests', 'fixed_schedules'], requires: [] },
  asistencia: { label: 'Registros de asistencia', tables: ['attendance', 'attendance_audit', 'justifications'], requires: [] },
  psicologia: { label: 'Atención psicológica (casos, sesiones y derivaciones)', tables: ['psych_referrals', 'psych_sessions', 'psych_cases'], requires: [] },
  padres: { label: 'Reuniones de padres, asistencia y multas', tables: ['guardian_fines', 'guardian_meeting_attendance', 'guardian_meetings'], requires: [] },
  estudiantes: { label: 'Estudiantes y apoderados', tables: ['guardian_students', 'guardians', 'students'], requires: ['asistencia', 'psicologia', 'padres'] },
  actividades: { label: 'Gestión de actividades (actividades, tareas, recursos, informes y comisiones)', tables: ['activity_reports', 'activity_resources', 'activity_tasks', 'activities', 'commissions'], requires: [] },
  documental: { label: 'Gestión documental (instrumentos, organización y documentos; los PDF quedan en el servidor)', tables: ['doc_tracking', 'doc_records', 'doc_organizations'], requires: [] },
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

/**
 * Value as it must be written in a dump. JSON columns arrive as objects on MySQL 8; escaping an
 * object would produce `key` = 'value' pairs (invalid JSON), so they are written as JSON text.
 */
function sqlValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) return JSON.stringify(value)
  return value
}

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
      const values = rows.slice(start, start + 200).map((row) => `(${Object.values(row).map((value) => db.escape(sqlValue(value))).join(', ')})`)
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
        return [column, Buffer.isBuffer(value) ? value.toString('base64') : sqlValue(value)]
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

/** `afterImport` brings an imported (possibly older) database up to the current structure. */
export function adminRouter({ afterImport } = {}) {
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
    res.json({ ok: true, groups, tables: tables.size, totalRows, backups, confirmation: CLEAN_CONFIRMATION, importConfirmation: IMPORT_CONFIRMATION })
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

  /** Restores a .sql dump over the current database, after saving a backup of it on the server. */
  router.post('/api/admin/import', requireAuth, requireAdmin, sqlUpload.single('file'), wrap(async (req, res) => {
    if (String(req.body.confirmation || '').trim().toUpperCase() !== IMPORT_CONFIRMATION) {
      return res.status(400).json({ ok: false, error: `Escribe ${IMPORT_CONFIRMATION} para confirmar.` })
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Selecciona un archivo .sql.' })
    if (!/\.sql$/i.test(req.file.originalname || '')) return res.status(400).json({ ok: false, error: 'El archivo debe ser una copia de seguridad .sql.' })
    const statements = splitSql(decodeDump(req.file.buffer))
    if (!statements.some((statement) => /^(CREATE\s+TABLE|INSERT\b|REPLACE\b)/i.test(statement))) {
      return res.status(400).json({ ok: false, error: 'El archivo no contiene tablas ni datos para importar.' })
    }

    // The whole database is replaced by the file. If anything fails, the copy taken here is put back.
    const backup = await saveBackup('antes-de-importar')
    try {
      await runSql(statements, { replace: true })
    } catch (error) {
      console.error(error)
      const reason = error.sqlMessage || error.message
      let restored = false
      try {
        await runSql(splitSql(fs.readFileSync(path.join(backupDir, backup), 'utf8')), { replace: true })
        restored = true
      } catch (restoreError) {
        console.error(restoreError)
      }
      if (afterImport) await afterImport().catch((ensureError) => console.error(ensureError))
      return res.status(400).json({
        ok: false,
        error: restored
          ? `No se pudo importar por un error de MySQL (${reason}). La base de datos volvió a como estaba antes de importar.`
          : `No se pudo importar por un error de MySQL (${reason}) y tampoco se pudo restaurar automáticamente. Importa la copia ${backup} desde esta misma opción.`,
        backup,
        restored,
      })
    }
    if (afterImport) await afterImport()
    const [still] = await getPool().query('SELECT id FROM users WHERE id = ? AND active = 1', [req.user.id])
    res.json({ ok: true, statements: statements.length, backup, signedOut: !still.length })
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
