import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ACTIONS, MODULE_KEYS, can, canChange, canSee, firstPathFor, levelOf, moduleForPath } from './accessModel'

/**
 * Roles:
 *  - admin     Coordinación CIST: full access to the admin panel (always).
 *  - director  Dirección: sees the whole admin panel in read-only mode (can view and export).
 *  - auxiliar  Auxiliar: student attendance and students.
 *  - psicologo Psicología: only the psychological care module (confidential).
 *  - teacher   Docente: teacher panel (reservations).
 * Those are the defaults; each staff account can get custom permissions per module (see accessModel.js).
 */
export const ROLE_LABEL = {
  admin: 'Coordinación CIST',
  director: 'Directora',
  auxiliar: 'Auxiliar',
  psicologo: 'Psicología',
  teacher: 'Docente',
}

export const STAFF_ROLES = ['admin', 'director', 'auxiliar', 'psicologo']

/** Whether the user enters the admin panel: staff roles, or a teacher who was given permissions in some module. */
export const isStaff = (user) => STAFF_ROLES.includes(user?.role) || (user?.role === 'teacher' && MODULE_KEYS.some((key) => canSee(user, key)))

export function homePath(user) {
  if (!user) return '/login'
  if (user.role === 'teacher') return '/panel'
  return firstPathFor(user)
}

/** Whether the user may open an admin-panel route. */
export function canView(user, path) {
  if (!user || !isStaff(user)) return false
  if (path === '/admin/perfil') return true
  const module = moduleForPath(path)
  if (!module) return user.role === 'admin'
  // Scanning registers attendance, so it needs «Editar».
  if (path === '/admin/asistencia/escanear') return canChange(user, 'asistencia')
  return canSee(user, module)
}

/** Whether the user may create, edit or delete in a module (its key, e.g. 'asistencia'). */
export function canEdit(user, module) {
  if (!user) return false
  return Boolean(module) && canChange(user, module)
}

/**
 * Editing rights on the current page. Pages may name their module ('psicologia', 'asistencia'…);
 * otherwise it is taken from the route, so shared components follow the page they are on.
 */
export function useCan(module) {
  const { user } = useApp()
  const { pathname } = useLocation()
  return canEdit(user, module || moduleForPath(pathname))
}

/** Level of the module of the current page: 'none' | 'view' | 'edit'. */
export function useLevel() {
  const { user } = useApp()
  const { pathname } = useLocation()
  const module = moduleForPath(pathname)
  return module ? levelOf(user, module) : null
}

/**
 * Actions allowed on the current page's module (or the one named):
 * { view, create, edit, delete, export } booleans, for showing or hiding buttons.
 */
export function useActions(module) {
  const { user } = useApp()
  const { pathname } = useLocation()
  const key = module || moduleForPath(pathname)
  return Object.fromEntries(ACTIONS.map((action) => [action, Boolean(key) && can(user, key, action)]))
}
