import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

function mysqlConfigFromEnvironment() {
  const connectionString = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL
  let urlConfig = {}
  if (connectionString) {
    let url
    try {
      url = new URL(connectionString)
    } catch {
      throw new Error('MYSQL_URL o DATABASE_URL no contiene una URL válida.')
    }
    if (url.protocol !== 'mysql:') {
      throw new Error('MYSQL_URL o DATABASE_URL debe usar el protocolo mysql.')
    }
    urlConfig = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
    }
  }

  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || urlConfig.host || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || urlConfig.port || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || urlConfig.user || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || urlConfig.password || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || urlConfig.database || 'nodo_sala',
  }
}

const port = Number(process.env.PORT || 3001)
const db = mysqlConfigFromEnvironment()
const jwtSecret = process.env.JWT_SECRET || 'nodo-xampp-local-secret'

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('La variable PORT debe ser un puerto válido.')
}
if (!Number.isInteger(db.port) || db.port < 1 || db.port > 65535) {
  throw new Error('La variable del puerto MySQL debe ser válida.')
}
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || jwtSecret.length < 32)) {
  throw new Error(
    'JWT_SECRET falta o es demasiado corto. En Railway, configura JWT_SECRET en las Variables del servicio de la API con una clave aleatoria de al menos 32 caracteres y vuelve a desplegar.',
  )
}

export const config = {
  port,
  db,
  jwtSecret,
}
