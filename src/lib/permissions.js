import { useApp } from '../context/AppContext'

/**
 * Roles:
 *  - admin     Coordinación CIST: full access to the admin panel.
 *  - director  Dirección: sees the whole admin panel in read-only mode (can view and export).
 *  - auxiliar  Auxiliar: only the student attendance module, with full use of it.
 *  - teacher   Docente: teacher panel (reservations).
 */
export const ROLE_LABEL = {
  admin: 'Coordinación CIST',
  director: 'Directora',
  auxiliar: 'Auxiliar',
  teacher: 'Docente',
}

export const STAFF_ROLES = ['admin', 'director', 'auxiliar']

export const isStaff = (user) => STAFF_ROLES.includes(user?.role)

export function homePath(user) {
  if (!user) return '/login'
  if (user.role === 'teacher') return '/panel'
  if (user.role === 'auxiliar') return '/admin/asistencia'
  return '/admin'
}

const ATTENDANCE = '/admin/asistencia'

/** Whether the user may open an admin-panel route. */
export function canView(user, path) {
  if (!user) return false
  if (path === '/admin/perfil') return isStaff(user)
  if (user.role === 'admin') return true
  if (user.role === 'director') return path !== '/admin/asistencia/escanear'
  if (user.role === 'auxiliar') return path === ATTENDANCE || path.startsWith(`${ATTENDANCE}/`)
  return false
}

/** Whether the user may create, edit, approve or delete in an area ('general' or 'asistencia'). */
export function canEdit(user, area = 'general') {
  if (user?.role === 'admin') return true
  if (user?.role === 'auxiliar') return area === 'asistencia'
  return false
}

export function useCan(area = 'general') {
  const { user } = useApp()
  return canEdit(user, area)
}
