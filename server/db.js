import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'
import { config } from './config.js'
import { upcomingWeekdays } from '../src/lib/time.js'

export let pool

export function getPool() {
  return pool
}

export async function initDb() {
  const { database, ...server } = config.db
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('El nombre de la base de datos no es válido.')
  }

  const bootstrap = await mysql.createConnection(server)
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await bootstrap.end()

  pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: 'utf8mb4',
  })

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      dni VARCHAR(8) NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'teacher') NOT NULL,
      subject VARCHAR(120) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)

  const [dniColumn] = await pool.query("SHOW COLUMNS FROM users LIKE 'dni'")
  if (!dniColumn.length) await pool.query('ALTER TABLE users ADD COLUMN dni VARCHAR(8) NULL AFTER email')
  const [dniIndex] = await pool.query("SHOW INDEX FROM users WHERE Key_name = 'uq_users_dni'")
  if (!dniIndex.length) await pool.query('ALTER TABLE users ADD UNIQUE INDEX uq_users_dni (dni)')
  for (const [email, dni] of [
    ['admin@colegio.edu', '12345678'],
    ['maria.lopez@colegio.edu', '23456789'],
    ['carlos.ruiz@colegio.edu', '34567890'],
    ['ana.torres@colegio.edu', '45678901'],
    ['diego.herrera@colegio.edu', '56789012'],
  ]) {
    await pool.query('UPDATE users SET dni = ? WHERE email = ? AND dni IS NULL', [dni, email])
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT UNSIGNED NOT NULL,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      grade VARCHAR(40) NOT NULL,
      section VARCHAR(40) NOT NULL,
      students INT UNSIGNED NOT NULL,
      purpose VARCHAR(180) NOT NULL,
      notes VARCHAR(240) NOT NULL DEFAULT '',
      status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
      admin_note VARCHAR(500) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME NULL,
      CONSTRAINT fk_requests_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
      INDEX idx_requests_date_status (date, status)
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(140) NOT NULL,
      body VARCHAR(400) NOT NULL,
      href VARCHAR(160) NOT NULL DEFAULT '',
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_notifications_user (user_id, read_at)
    ) ENGINE=InnoDB
  `)

  const [existing] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (existing[0].total === 0) await seed()
}

export async function resetAndSeed() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of ['incident_photos', 'incidents', 'maintenance_photos', 'maintenance', 'equipment_photos', 'parts', 'material_inventory', 'documents', 'fixed_schedules', 'notifications', 'requests', 'equipment', 'categories', 'places', 'rooms', 'users']) {
    await pool.query(`DELETE FROM ${table}`)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')
  await seed()
}

async function seed() {
  const password = {
    admin: bcrypt.hashSync('admin123', 10),
    teacher: bcrypt.hashSync('profesor123', 10),
  }
  const people = [
    ['Laura Méndez', 'admin@colegio.edu', '12345678', password.admin, 'admin', 'Coordinación académica'],
    ['María López', 'maria.lopez@colegio.edu', '23456789', password.teacher, 'teacher', 'Matemáticas'],
    ['Carlos Ruiz', 'carlos.ruiz@colegio.edu', '34567890', password.teacher, 'teacher', 'Ciencias naturales'],
    ['Ana Torres', 'ana.torres@colegio.edu', '45678901', password.teacher, 'teacher', 'Informática'],
    ['Diego Herrera', 'diego.herrera@colegio.edu', '56789012', password.teacher, 'teacher', 'Inglés'],
  ]
  for (const person of people) {
    await pool.query(
      'INSERT INTO users (name, email, dni, password_hash, role, subject) VALUES (?, ?, ?, ?, ?, ?)',
      person,
    )
  }

  const [users] = await pool.query('SELECT id, email FROM users')
  const idOf = (email) => users.find((user) => user.email === email).id
  const [d0, d1, d2] = upcomingWeekdays(3)
  const rows = [
    [idOf('maria.lopez@colegio.edu'), d0, '08:00', '09:30', '8°', 'A', 28, 'Ecuaciones lineales con hoja de cálculo', 'Usaremos los equipos del lado de la ventana.', 'approved', ''],
    [idOf('carlos.ruiz@colegio.edu'), d0, '10:00', '11:30', '9°', 'B', 26, 'Simulación de circuitos eléctricos', '', 'approved', ''],
    [idOf('ana.torres@colegio.edu'), d1, '07:30', '09:00', '11°', 'A', 30, 'Introducción a hojas de cálculo', '', 'approved', ''],
    [idOf('diego.herrera@colegio.edu'), d1, '09:30', '11:00', '10°', 'B', 22, 'Laboratorio de listening y pronunciación', 'El grupo necesita audífonos.', 'pending', ''],
    [idOf('maria.lopez@colegio.edu'), d1, '08:00', '09:30', '7°', 'A', 29, 'Gráficas de funciones en GeoGebra', '', 'pending', ''],
    [idOf('carlos.ruiz@colegio.edu'), d2, '13:00', '14:30', '6°', 'C', 24, 'Indagación sobre el sistema solar', '', 'rejected', 'Ese bloque queda para mantenimiento de equipos.'],
    [idOf('ana.torres@colegio.edu'), d2, '14:00', '15:30', '9°', 'A', 27, 'Presentaciones del proyecto de investigación', '', 'approved', ''],
  ]
  for (const row of rows) {
    await pool.query(
      `INSERT INTO requests
        (teacher_id, date, start_time, end_time, grade, section, students, purpose, notes, status, admin_note, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IN ('pending'), NULL, NOW()))`,
      [...row, row[9]],
    )
  }

  await pool.query(
    `INSERT INTO notifications (user_id, title, body, href) VALUES
      (?, 'Solicitud por revisar', 'Diego Herrera pidió la sala. El horario no se cruza y puede aprobarse.', '/admin/solicitudes'),
      (?, 'Horario cruzado', 'María López pidió un bloque que se cruza con una clase ya confirmada.', '/admin/solicitudes'),
      (?, 'Solicitud en revisión', 'Tu pedido del laboratorio de listening está pendiente de coordinación.', '/panel/solicitudes'),
      (?, 'Horario no disponible', 'Tu solicitud de GeoGebra se cruza con otra clase. Coordinación no podrá aprobarla así.', '/panel/solicitudes')`,
    [idOf('admin@colegio.edu'), idOf('admin@colegio.edu'), idOf('diego.herrera@colegio.edu'), idOf('maria.lopez@colegio.edu')],
  )
}

export function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    dni: row.dni || '',
    role: row.role,
    subject: row.subject,
    active: Boolean(row.active),
  }
}

export function mapRequest(row) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    roomId: row.room_id || null,
    roomName: row.room_name || '',
    date: String(row.date).slice(0, 10),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    grade: row.grade,
    section: row.section,
    students: Number(row.students),
    purpose: row.purpose,
    notes: row.notes || '',
    status: row.status,
    adminNote: row.admin_note || '',
    createdAt: asIso(row.created_at),
    decidedAt: asIso(row.decided_at),
  }
}

export function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    href: row.href,
    read: Boolean(row.read_at),
    createdAt: asIso(row.created_at),
  }
}

function asIso(value) {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
