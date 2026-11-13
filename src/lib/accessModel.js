/**
 * Access model shared by the API and the pages. Each staff user has, per module, a set of actions:
 *   view   — open the module and read its data
 *   create — register new records
 *   edit   — modify records (and actions on them: approve, activate, reschedule…)
 *   delete — delete records
 *   export — export to Excel / PDF
 * A role brings default actions; a user can be given custom actions per module that replace the role's.
 * Coordinación (admin) always has everything, so the system can never be locked out.
 * Old stored levels ('none' | 'view' | 'edit') are still understood and converted to actions.
 */

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export']
export const ACTION_LABEL = { view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar' }
const ACTION_VERB = { view: 'ver', create: 'registrar', edit: 'modificar', delete: 'eliminar', export: 'exportar' }

/** Summary levels, used for badges and the read-only banner. */
export const LEVELS = ['none', 'view', 'edit']
export const LEVEL_LABEL = { none: 'Sin acceso', view: 'Solo consulta', edit: 'Gestiona' }

/**
 * `paths` are panel routes (prefixes); `api` are API prefixes protected by the module's actions.
 * `privateRead`: reading the API also needs `view` (personal or confidential data).
 * `actions`: the actions that make sense in the module (all by default).
 */
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', group: 'General', paths: [], exact: '/admin', api: [], actions: ['view'] },
  { key: 'inventario', label: 'Inventario y catálogos', group: 'Gestión Tecnológica', paths: ['/admin/inventario', '/admin/materiales', '/admin/catalogo', '/admin/bienes'], api: ['/api/equipment', '/api/materials', '/api/categories', '/api/places', '/api/patrimonial-codes', '/api/assets', '/api/documents', '/api/rooms'] },
  { key: 'incidencias', label: 'Incidencias', group: 'Gestión Tecnológica', paths: ['/admin/incidencias'], api: ['/api/incidents'] },
  { key: 'mantenimiento', label: 'Mantenimiento', group: 'Gestión Tecnológica', paths: ['/admin/mantenimiento'], api: ['/api/maintenance', '/api/parts'] },
  { key: 'reportes', label: 'Reportes de bienes', group: 'Gestión Tecnológica', paths: ['/admin/reportes'], api: ['/api/reports'], privateRead: true, actions: ['view', 'export'] },
  { key: 'estudiantes', label: 'Estudiantes', group: 'Gestión Escolar', paths: ['/admin/estudiantes'], api: ['/api/students'], privateRead: true },
  { key: 'asistencia', label: 'Asistencia estudiantil', group: 'Gestión Escolar', paths: ['/admin/asistencia'], api: ['/api/attendance', '/api/justifications'], privateRead: true },
  { key: 'psicologia', label: 'Atención psicológica', group: 'Gestión Escolar', paths: ['/admin/psicologia'], api: ['/api/psychology'], privateRead: true },
  { key: 'actividades', label: 'Gestión de actividades', group: 'Gestión de Actividades', paths: ['/admin/actividades'], api: ['/api/activities', '/api/activity-tasks', '/api/activity-resources', '/api/activity-reports', '/api/commissions'], privateRead: true },
  { key: 'reservas', label: 'Reservas (solicitudes, calendario y horarios)', group: 'Gestión Reservas', paths: ['/admin/solicitudes', '/admin/calendario', '/admin/horarios'], api: ['/api/fixed-schedules'] },
  { key: 'usuarios', label: 'Usuarios y docentes', group: 'Administración', paths: ['/admin/profesores', '/admin/docentes'], api: ['/api/users'] },
  { key: 'configuracion', label: 'Configuración y base de datos', group: 'Administración', paths: ['/admin/configuracion'], api: ['/api/admin'], privateRead: true },
]
export const MODULE_KEYS = MODULES.map((module) => module.key)
/** Actions that make sense in a module (the dashboard, for instance, can only be viewed). */
export const moduleActions = (key) => MODULES.find((module) => module.key === key)?.actions || ACTIONS

/** Old level → actions: 'view' reads and exports, 'edit' does everything. */
export function levelToActions(level, key) {
  if (level === 'edit') return [...moduleActions(key)]
  if (level === 'view') return moduleActions(key).filter((action) => action === 'view' || action === 'export')
  return []
}
/** Clean, ordered action list for a module; any action implies 'view'. */
export function normalizeActions(list, key) {
  const allowed = moduleActions(key)
  const set = new Set((Array.isArray(list) ? list : []).filter((action) => allowed.includes(action)))
  if (set.size) set.add('view')
  return ACTIONS.filter((action) => set.has(action))
}
export const sameActions = (a = [], b = []) => a.length === b.length && a.every((action) => b.includes(action))
/** Summary level of an action list. */
export function levelOfActions(actions = []) {
  if (actions.some((action) => ['create', 'edit', 'delete'].includes(action))) return 'edit'
  return actions.includes('view') ? 'view' : 'none'
}

const allLevels = (level) => Object.fromEntries(MODULE_KEYS.map((key) => [key, level]))
const fromLevels = (levels) => Object.fromEntries(MODULE_KEYS.map((key) => [key, levelToActions(levels[key], key)]))
const all = (level) => fromLevels(allLevels(level))

/** Built-in actions of each role (the "original" permissions of the role). */
export const ROLE_DEFAULTS = {
  admin: all('edit'),
  director: fromLevels({ ...allLevels('view'), configuracion: 'none' }),
  auxiliar: fromLevels({ ...allLevels('none'), estudiantes: 'edit', asistencia: 'edit' }),
  psicologo: fromLevels({ ...allLevels('none'), psicologia: 'edit' }),
  teacher: all('none'),
}

/** Roles whose permissions are fixed: Coordinación always has everything; Docente uses its own panel. */
export const FIXED_ROLES = ['admin', 'teacher']
export const EDITABLE_ROLES = Object.keys(ROLE_DEFAULTS).filter((role) => !FIXED_ROLES.includes(role))

/** Custom permissions as stored (JSON text or object, actions or old levels) → { module: [actions] }, or null when none. */
export function parsePermissions(value) {
  if (!value) return null
  let data = value
  if (typeof value === 'string') {
    try { data = JSON.parse(value) } catch { return null }
  }
  if (!data || typeof data !== 'object') return null
  const clean = {}
  for (const key of MODULE_KEYS) {
    const entry = data[key]
    if (Array.isArray(entry)) clean[key] = normalizeActions(entry, key)
    else if (LEVELS.includes(entry)) clean[key] = levelToActions(entry, key)
  }
  return Object.keys(clean).length ? clean : null
}

// Role permissions edited in «Roles y permisos» (stored in the database), on top of ROLE_DEFAULTS.
let roleCustom = {}

/** Loads the edited role permissions. Called by the API at start-up and by the app on bootstrap. */
export function setRolePermissions(map) {
  const clean = {}
  for (const role of EDITABLE_ROLES) {
    const actions = parsePermissions(map?.[role])
    if (actions) clean[role] = actions
  }
  roleCustom = clean
  return clean
}
export const rolePermissions = () => roleCustom

/** Actions a role gives (built-in defaults plus what was edited for the role). */
export function roleDefaults(role) {
  if (role === 'admin') return all('edit')
  if (!ROLE_DEFAULTS[role]) return all('none')
  return { ...ROLE_DEFAULTS[role], ...(roleCustom[role] || {}) }
}

/** Staff roles that can be combined in one account, from the most to the least powerful (the first one chosen is the main role). */
export const ROLE_PRIORITY = ['admin', 'director', 'psicologo', 'auxiliar']
export const primaryRole = (roles = []) => ROLE_PRIORITY.find((role) => roles.includes(role)) || roles[0] || 'auxiliar'

/** Additional roles as stored (JSON text or array) → clean list of staff roles. */
export function parseRoles(value) {
  let list = value
  if (typeof value === 'string') {
    try { list = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(list) ? [...new Set(list.filter((role) => EDITABLE_ROLES.includes(role)))] : []
}

/** Every role of a user: the main one plus the additional ones. */
export const rolesOf = (user) => [...new Set([user?.role, ...(user?.extraRoles || [])].filter(Boolean))]

/** Actions given by a set of roles together (the union of what each role allows). */
export function roleSetDefaults(roles = []) {
  if (roles.includes('admin')) return all('edit')
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, normalizeActions(roles.flatMap((role) => roleDefaults(role)[key] || []), key)]))
}

/** Effective actions of every module for a user: { inventario: ['view', 'export'], … }. */
export function accessOf(user) {
  if (!user) return all('none')
  // Coordinación starts with everything, but the administrator may also limit another Coordinación account.
  return { ...roleSetDefaults(rolesOf(user)), ...(parsePermissions(user.permissions) || {}) }
}

/** Whether a user may perform an action ('view', 'create', 'edit', 'delete', 'export') in a module. */
export const can = (user, key, action) => (accessOf(user)[key] || []).includes(action)
export const levelOf = (user, key) => levelOfActions(accessOf(user)[key])
export const canSee = (user, key) => can(user, key, 'view')
/** Any write (create, edit or delete) in the module. */
export const canChange = (user, key) => levelOf(user, key) === 'edit'

/** Action an API request needs: GET reads, DELETE deletes, PATCH/PUT edit, POST creates (or edits, for actions on a record). */
export function actionForRequest(method, path) {
  if (method === 'GET' || method === 'HEAD') return 'view'
  if (method === 'DELETE') return 'delete'
  if (method !== 'POST') return 'edit'
  if (/\/(active|decide|cancel|reschedule|modify|photo-url|photos|photo|qr|clean|read)$/.test(path)) return 'edit'
  return 'create'
}

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
 * Why a request is not allowed, or null when it is. Each write needs its action (create / edit / delete);
 * reads of private modules need `view`. Shared catalogs (equipment, rooms, places…) stay readable by everyone signed in.
 */
export function apiAccessError(user, method, path) {
  const key = moduleForApi(path)
  if (!key) return null
  const module = MODULES.find((entry) => entry.key === key)
  const { label } = module
  // The attendance pages need the student list (one way only: Estudiantes does not open attendance data).
  const alsoRead = { estudiantes: 'asistencia' }[key]
  if (method === 'GET') {
    if (!module.privateRead || canSee(user, key) || (alsoRead && canSee(user, alsoRead))) return null
    return `No tienes acceso al módulo «${label}».`
  }
  // Generating a report only records that it was generated: viewing is enough.
  if (key === 'reportes' && method === 'POST' && path === '/api/reports') return canSee(user, key) ? null : `No tienes acceso al módulo «${label}».`
  const action = actionForRequest(method, path)
  if (can(user, key, action)) return null
  return canSee(user, key) ? `No tienes permiso para ${ACTION_VERB[action]} en «${label}».` : `No tienes acceso al módulo «${label}».`
}

/** Message when exporting is not allowed in a module, or null. */
export function exportDenied(user, key) {
  if (!key || can(user, key, 'export')) return null
  return `No tienes permiso para exportar en «${MODULES.find((module) => module.key === key)?.label || key}».`
}

/** First panel page a user may open (their landing page after signing in). */
export function firstPathFor(user) {
  const order = [['dashboard', '/admin'], ['inventario', '/admin/inventario'], ['incidencias', '/admin/incidencias'], ['mantenimiento', '/admin/mantenimiento'],
    ['reportes', '/admin/reportes'], ['asistencia', '/admin/asistencia'], ['estudiantes', '/admin/estudiantes'], ['psicologia', '/admin/psicologia/atenciones'],
    ['actividades', '/admin/actividades/calendario'], ['reservas', '/admin/solicitudes'], ['usuarios', '/admin/profesores'], ['configuracion', '/admin/configuracion']]
  return order.find(([key]) => canSee(user, key))?.[1] || '/admin/perfil'
}
