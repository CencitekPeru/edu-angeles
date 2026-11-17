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
  { key: 'padres', label: 'Reuniones de padres y multas', group: 'Gestión Escolar', paths: ['/admin/padres'], api: ['/api/parent-meetings', '/api/parent-fines', '/api/guardians'], privateRead: true },
  { key: 'psicologia', label: 'Atención psicológica', group: 'Gestión Escolar', paths: ['/admin/psicologia'], api: ['/api/psychology'], privateRead: true },
  { key: 'actividades', label: 'Calendario institucional (actividades)', group: 'Gestión Documental', paths: [], api: ['/api/activities', '/api/activity-tasks', '/api/activity-resources', '/api/activity-reports', '/api/commissions'], privateRead: true },
  { key: 'documentos', label: 'Gestión documental', group: 'Gestión Documental', paths: ['/admin/documentos'], api: ['/api/docs'], privateRead: true },
  { key: 'reservas', label: 'Reservas (solicitudes, calendario y horarios)', group: 'Gestión Reservas', paths: ['/admin/solicitudes', '/admin/calendario', '/admin/horarios'], api: ['/api/fixed-schedules'] },
  { key: 'usuarios', label: 'Usuarios y docentes', group: 'Administración', paths: ['/admin/profesores', '/admin/docentes'], api: ['/api/users'] },
  { key: 'configuracion', label: 'Configuración y base de datos', group: 'Administración', paths: ['/admin/configuracion'], api: ['/api/admin'], privateRead: true },
]
export const MODULE_KEYS = MODULES.map((module) => module.key)

/**
 * Screens (views) inside the modules. A view only has «Ver»: it decides whether the screen shows up in the menu
 * and can be opened. What can be done with the data (create, edit, delete, export) is still decided per module,
 * and that is what the API checks. Keys are `module.view`; `exact` routes match only themselves, `paths` are prefixes.
 */
export const VIEWS = [
  { key: 'inventario.tecnologicos', module: 'inventario', label: 'Bienes tecnológicos', exact: ['/admin/inventario', '/admin/inventario/lista'] },
  { key: 'inventario.mobiliarios', module: 'inventario', label: 'Bienes mobiliarios', paths: ['/admin/materiales'] },
  { key: 'inventario.maquinaria', module: 'inventario', label: 'Maquinaria y equipos', paths: ['/admin/bienes/maquinaria'] },
  { key: 'inventario.transporte', module: 'inventario', label: 'Bienes de transporte', paths: ['/admin/bienes/transporte'] },
  { key: 'inventario.culturales', module: 'inventario', label: 'Bienes culturales', paths: ['/admin/bienes/culturales'] },
  { key: 'inventario.catalogo', module: 'inventario', label: 'Ambientes y categorías', paths: ['/admin/catalogo'] },
  { key: 'mantenimiento.lista', module: 'mantenimiento', label: 'Mantenimientos', exact: ['/admin/mantenimiento', '/admin/mantenimiento/lista'] },
  { key: 'mantenimiento.cronograma', module: 'mantenimiento', label: 'Plan de mantenimiento', paths: ['/admin/mantenimiento/cronograma'] },
  { key: 'mantenimiento.historial', module: 'mantenimiento', label: 'Historial del bien', paths: ['/admin/mantenimiento/historial'] },
  { key: 'mantenimiento.repuestos', module: 'mantenimiento', label: 'Repuestos', paths: ['/admin/mantenimiento/repuestos'] },
  { key: 'asistencia.panel', module: 'asistencia', label: 'Panel de asistencia', exact: ['/admin/asistencia'] },
  { key: 'asistencia.escanear', module: 'asistencia', label: 'Escanear QR', paths: ['/admin/asistencia/escanear'] },
  { key: 'asistencia.qr', module: 'asistencia', label: 'Códigos QR', paths: ['/admin/asistencia/qr'] },
  { key: 'asistencia.historial', module: 'asistencia', label: 'Historial de asistencia', paths: ['/admin/asistencia/historial'] },
  { key: 'asistencia.reportes', module: 'asistencia', label: 'Reportes de asistencia', paths: ['/admin/asistencia/reportes'] },
  { key: 'padres.reuniones', module: 'padres', label: 'Convocatorias y asistencia', paths: ['/admin/padres/reuniones'] },
  { key: 'padres.multas', module: 'padres', label: 'Registro de multas', paths: ['/admin/padres/multas'] },
  { key: 'padres.consulta', module: 'padres', label: 'Consulta de apoderado (DNI)', paths: ['/admin/padres/consulta'] },
  { key: 'psicologia.atenciones', module: 'psicologia', label: 'Registro de atenciones', paths: ['/admin/psicologia/atenciones'] },
  { key: 'psicologia.casos', module: 'psicologia', label: 'Casos en seguimiento', paths: ['/admin/psicologia/casos'] },
  { key: 'psicologia.seguimiento', module: 'psicologia', label: 'Seguimiento y citas', paths: ['/admin/psicologia/seguimiento', '/admin/psicologia/citas'] },
  { key: 'psicologia.derivaciones', module: 'psicologia', label: 'Derivaciones', paths: ['/admin/psicologia/derivaciones'] },
  { key: 'psicologia.estudiantes', module: 'psicologia', label: 'Estudiantes atendidos', paths: ['/admin/psicologia/estudiantes'] },
  { key: 'psicologia.reportes', module: 'psicologia', label: 'Reportes de psicología', paths: ['/admin/psicologia/reportes'] },
  { key: 'documentos.instrumentos', module: 'documentos', label: '1. Instrumentos de gestión', paths: ['/admin/documentos/instrumentos'] },
  { key: 'documentos.organizacion', module: 'documentos', label: '2. Organización institucional', paths: ['/admin/documentos/organizacion'] },
  { key: 'documentos.externos', module: 'documentos', label: '3. Documentos de entidades externas', paths: ['/admin/documentos/externos'] },
  { key: 'documentos.administrativos', module: 'documentos', label: '4. Documentos administrativos', paths: ['/admin/documentos/administrativos'] },
  { key: 'reservas.solicitudes', module: 'reservas', label: 'Solicitudes', paths: ['/admin/solicitudes'] },
  { key: 'reservas.calendario', module: 'reservas', label: 'Calendario de reservas', paths: ['/admin/calendario'] },
  { key: 'reservas.horarios', module: 'reservas', label: 'Horarios fijos', paths: ['/admin/horarios'] },
  { key: 'usuarios.usuarios', module: 'usuarios', label: 'Usuarios', paths: ['/admin/profesores'] },
  { key: 'usuarios.docentes', module: 'usuarios', label: 'Docentes', paths: ['/admin/docentes'] },
]
export const VIEW_KEYS = VIEWS.map((view) => view.key)
export const viewsOf = (moduleKey) => VIEWS.filter((view) => view.module === moduleKey)
const isView = (key) => VIEW_KEYS.includes(key)
/** Every key of a permission map: modules and their views. */
export const PERMISSION_KEYS = [...MODULE_KEYS, ...VIEW_KEYS]

/**
 * Completes the views of a permission map. A view the map does not mention follows its module;
 * a module without «Ver» hides all its views; `fallback` gives the views of modules the map turned on itself.
 */
export function withViews(map, fallback = null) {
  const result = { ...map }
  for (const view of VIEWS) {
    const moduleOn = (map[view.module] || []).includes('view')
    if (!moduleOn) result[view.key] = []
    else if (Array.isArray(map[view.key])) result[view.key] = map[view.key].includes('view') ? ['view'] : []
    else if (fallback && Array.isArray(fallback[view.key]) && (fallback[view.module] || []).includes('view')) result[view.key] = fallback[view.key]
    else result[view.key] = ['view']
  }
  return result
}
/** Actions that make sense in a module (the dashboard, for instance, can only be viewed). */
export const moduleActions = (key) => (VIEW_KEYS.includes(key) ? ['view'] : MODULES.find((module) => module.key === key)?.actions || ACTIONS)

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
const all = (level) => withViews(fromLevels(allLevels(level)))

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

/** Custom permissions as stored (JSON text or object, actions or old levels) → { module or view: [actions] }, or null when none. */
export function parsePermissions(value) {
  if (!value) return null
  let data = value
  if (typeof value === 'string') {
    try { data = JSON.parse(value) } catch { return null }
  }
  if (!data || typeof data !== 'object') return null
  const clean = {}
  for (const key of PERMISSION_KEYS) {
    const entry = data[key]
    if (Array.isArray(entry)) clean[key] = normalizeActions(entry, key)
    else if (!isView(key) && LEVELS.includes(entry)) clean[key] = levelToActions(entry, key)
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

// Roles created by the administrator in «Roles» (stored in the database): [{ key, label, description, permissions }].
let customRoles = []
/** Key pattern of the roles created in the panel (built-in roles never match it). */
export const CUSTOM_ROLE_KEY = /^r_[a-z0-9]{4,16}$/

/** Loads the roles created in the panel. Called by the API at start-up and by the app on bootstrap. */
export function setCustomRoles(list) {
  customRoles = (Array.isArray(list) ? list : [])
    .filter((role) => role && CUSTOM_ROLE_KEY.test(role.key))
    .map((role) => ({ key: role.key, label: String(role.label || role.key), description: String(role.description || ''), permissions: withViews({ ...fromLevels(allLevels('none')), ...(parsePermissions(role.permissions) || {}) }) }))
  return customRoles
}
export const customRoleList = () => customRoles
export const isCustomRole = (role) => customRoles.some((item) => item.key === role)
/** Roles that can be assigned to a staff account (Coordinación is handled apart). */
export const isAssignableRole = (role) => EDITABLE_ROLES.includes(role) || isCustomRole(role)

/** Actions a role gives (built-in defaults plus what was edited for the role). */
export function roleDefaults(role) {
  if (role === 'admin') return all('edit')
  const custom = customRoles.find((item) => item.key === role)
  if (custom) return custom.permissions
  if (!ROLE_DEFAULTS[role]) return all('none')
  return withViews({ ...ROLE_DEFAULTS[role], ...(roleCustom[role] || {}) })
}
/** Built-in («original») permissions of a role, with its views. */
export const roleOriginal = (role) => withViews(ROLE_DEFAULTS[role] || {})

/** Staff roles that can be combined in one account, from the most to the least powerful (the first one chosen is the main role). */
export const ROLE_PRIORITY = ['admin', 'director', 'psicologo', 'auxiliar']
export const primaryRole = (roles = []) => ROLE_PRIORITY.find((role) => roles.includes(role)) || roles[0] || 'auxiliar'

/** Additional roles as stored (JSON text or array) → clean list of staff roles. */
export function parseRoles(value) {
  let list = value
  if (typeof value === 'string') {
    try { list = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(list) ? [...new Set(list.filter((role) => isAssignableRole(role)))] : []
}

/** Every role of a user: the main one plus the additional ones. */
export const rolesOf = (user) => [...new Set([user?.role, ...(user?.extraRoles || [])].filter(Boolean))]

/** Actions given by a set of roles together (the union of what each role allows). */
export function roleSetDefaults(roles = []) {
  if (roles.includes('admin')) return all('edit')
  // A module or a view is allowed when any of the roles allows it.
  return withViews(Object.fromEntries(PERMISSION_KEYS.map((key) => [key, normalizeActions(roles.flatMap((role) => roleDefaults(role)[key] || []), key)])))
}

/** Effective actions of every module for a user: { inventario: ['view', 'export'], … }. */
export function accessOf(user) {
  if (!user) return all('none')
  // Coordinación starts with everything, but the administrator may also limit another Coordinación account.
  const base = roleSetDefaults(rolesOf(user))
  const modules = Object.fromEntries(MODULE_KEYS.map((key) => [key, base[key]]))
  // Views not saved for the account follow its roles (or open fully when the account was given a module its roles lack).
  return withViews({ ...modules, ...(parsePermissions(user.permissions) || {}) }, base)
}

/** Whether a user may perform an action ('view', 'create', 'edit', 'delete', 'export') in a module. */
export const can = (user, key, action) => (accessOf(user)[key] || []).includes(action)
export const levelOf = (user, key) => levelOfActions(accessOf(user)[key])
export const canSee = (user, key) => can(user, key, 'view')
/** Any write (create, edit or delete) in the module. */
export const canChange = (user, key) => levelOf(user, key) === 'edit'

/** View (screen) of a panel route, or null when the route has no separate view. */
export function viewForPath(path) {
  return VIEWS.find((view) => view.exact?.includes(path) || view.paths?.some((base) => path === base || path.startsWith(`${base}/`)))?.key || null
}
/** Whether a user may open a view: its module needs «Ver» and the view must be checked. */
export const canSeeView = (user, viewKey) => {
  const view = VIEWS.find((item) => item.key === viewKey)
  return Boolean(view) && canSee(user, view.module) && (accessOf(user)[viewKey] || []).includes('view')
}

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
  // Modules in menu order: the first screen the user may open (a module with views goes to its first allowed view).
  const order = [['dashboard', '/admin'], ['inventario'], ['incidencias', '/admin/incidencias'], ['mantenimiento'], ['reportes', '/admin/reportes'], ['estudiantes', '/admin/estudiantes'],
    ['asistencia'], ['padres'], ['psicologia'], ['documentos'], ['reservas'], ['usuarios'], ['configuracion', '/admin/configuracion']]
  for (const [key, path] of order) {
    if (!canSee(user, key)) continue
    if (path) return path
    const view = viewsOf(key).find((item) => canSeeView(user, item.key))
    if (view) return view.exact?.[0] || view.paths[0]
  }
  return '/admin/perfil'
}
