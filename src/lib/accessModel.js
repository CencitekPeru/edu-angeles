/**
 * Access model shared by the API and the pages. Each staff user has a level per module:
 *   none  — the module is hidden and its data can't be read
 *   view  — can open, consult and export
 *   edit  — can also register, modify and delete
 * A role brings default levels; a user can be given custom levels that replace them.
 * Coordinación (admin) always has full access, so the system can never be locked out.
 */

export const LEVELS = ['none', 'view', 'edit']
export const LEVEL_LABEL = { none: 'Sin acceso', view: 'Ver', edit: 'Editar' }

/**
 * `paths` are panel routes (prefixes); `api` are API prefixes whose writes need `edit`.
 * `privateRead`: reading the API also needs at least `view` (personal or confidential data).
 */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', group: 'General', paths: [], exact: '/admin', api: [] },
  { key: 'inventario', label: 'Inventario y catálogos', group: 'Gestión Tecnológica', paths: ['/admin/inventario', '/admin/materiales', '/admin/catalogo', '/admin/bienes'], api: ['/api/equipment', '/api/materials', '/api/categories', '/api/places', '/api/patrimonial-codes', '/api/assets', '/api/documents', '/api/rooms'] },
  { key: 'incidencias', label: 'Incidencias', group: 'Gestión Tecnológica', paths: ['/admin/incidencias'], api: ['/api/incidents'] },
  { key: 'mantenimiento', label: 'Mantenimiento', group: 'Gestión Tecnológica', paths: ['/admin/mantenimiento'], api: ['/api/maintenance', '/api/parts'] },
  { key: 'reportes', label: 'Reportes de bienes', group: 'Gestión Tecnológica', paths: ['/admin/reportes'], api: ['/api/reports'], privateRead: true },
  { key: 'estudiantes', label: 'Estudiantes', group: 'Gestión Escolar', paths: ['/admin/estudiantes'], api: ['/api/students'], privateRead: true },
  { key: 'asistencia', label: 'Asistencia estudiantil', group: 'Gestión Escolar', paths: ['/admin/asistencia'], api: ['/api/attendance', '/api/justifications'], privateRead: true },
  { key: 'psicologia', label: 'Atención psicológica', group: 'Gestión Escolar', paths: ['/admin/psicologia'], api: ['/api/psychology'], privateRead: true },
  { key: 'reservas', label: 'Reservas (solicitudes, calendario y horarios)', group: 'Gestión Reservas', paths: ['/admin/solicitudes', '/admin/calendario', '/admin/horarios'], api: ['/api/fixed-schedules'] },
  { key: 'usuarios', label: 'Usuarios y docentes', group: 'Administración', paths: ['/admin/profesores', '/admin/docentes'], api: ['/api/users'] },
  { key: 'configuracion', label: 'Configuración y base de datos', group: 'Administración', paths: ['/admin/configuracion'], api: ['/api/admin'], privateRead: true },
]
export const MODULE_KEYS = MODULES.map((module) => module.key)

const all = (level) => Object.fromEntries(MODULE_KEYS.map((key) => [key, level]))

/** Default levels of each role (what the role allowed before custom permissions existed). */
export const ROLE_DEFAULTS = {
  admin: all('edit'),
  director: { ...all('view'), configuracion: 'none' },
  auxiliar: { ...all('none'), estudiantes: 'edit', asistencia: 'edit' },
  psicologo: { ...all('none'), psicologia: 'edit' },
  teacher: all('none'),
}

/** Custom levels as stored (JSON text or object) → clean object, or null when none. */
export function parsePermissions(value) {
  if (!value) return null
  let data = value
  if (typeof value === 'string') {
    try { data = JSON.parse(value) } catch { return null }
  }
  if (!data || typeof data !== 'object') return null
  const clean = {}
  for (const key of MODULE_KEYS) if (LEVELS.includes(data[key])) clean[key] = data[key]
  return Object.keys(clean).length ? clean : null
}

/** Effective level of every module for a user. */
export function accessOf(user) {
  if (!user) return all('none')
  if (user.role === 'admin') return all('edit')
  const base = ROLE_DEFAULTS[user.role] || all('none')
  return { ...base, ...(parsePermissions(user.permissions) || {}) }
}

export const levelOf = (user, key) => accessOf(user)[key] || 'none'
export const canSee = (user, key) => levelOf(user, key) !== 'none'
export const canChange = (user, key) => levelOf(user, key) === 'edit'

const under = (path, base) => path === base || path.startsWith(`${base}/`)

/** Module of a panel route, or null. */
export function moduleForPath(path) {
  return MODULES.find((module) => module.exact === path || module.paths.some((base) => under(path, base)))?.key || null
}

/** Module of an API path, or null for routes every signed-in user may use (profile, bootstrap, requests…). */
export function moduleForApi(path) {
  if (/^\/api\/requests\/[^/]+\/decide$/.test(path)) return 'reservas'
  // QR codes are managed from the attendance module.
  if (/^\/api\/students\/(qr\/|[^/]+\/qr$)/.test(path)) return 'asistencia'
  return MODULES.find((module) => module.api.some((base) => under(path, base)))?.key || null
}

/**
 * Why a request is not allowed, or null when it is. Writes need `edit` on their module; reads of
 * private modules need `view`. Shared catalogs (equipment, rooms, places…) stay readable by everyone signed in.
 */
export function apiAccessError(user, method, path) {
  const key = moduleForApi(path)
  if (!key) return null
  const level = levelOf(user, key)
  // The attendance pages need the student list (one way only: Estudiantes does not open attendance data).
  const alsoRead = { estudiantes: 'asistencia' }[key]
  const label = MODULES.find((module) => module.key === key).label
  if (method === 'GET') {
    const module = MODULES.find((entry) => entry.key === key)
    if (!module.privateRead || level !== 'none' || (alsoRead && levelOf(user, alsoRead) !== 'none')) return null
    return `No tienes acceso al módulo «${label}».`
  }
  // Generating a report only records that it was generated: viewing is enough.
  if (key === 'reportes' && method === 'POST' && path === '/api/reports') return level === 'none' ? `No tienes acceso al módulo «${label}».` : null
  if (level === 'edit') return null
  return level === 'view' ? `Tienes acceso de solo consulta en «${label}».` : `No tienes acceso al módulo «${label}».`
}

/** First panel page a user may open (their landing page after signing in). */
export function firstPathFor(user) {
  const access = accessOf(user)
  const order = [['dashboard', '/admin'], ['inventario', '/admin/inventario'], ['incidencias', '/admin/incidencias'], ['mantenimiento', '/admin/mantenimiento'],
    ['reportes', '/admin/reportes'], ['asistencia', '/admin/asistencia'], ['estudiantes', '/admin/estudiantes'], ['psicologia', '/admin/psicologia/atenciones'],
    ['reservas', '/admin/solicitudes'], ['usuarios', '/admin/profesores'], ['configuracion', '/admin/configuracion']]
  return order.find(([key]) => access[key] !== 'none')?.[1] || '/admin/perfil'
}
