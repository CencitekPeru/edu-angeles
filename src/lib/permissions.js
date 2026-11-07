import { useApp } from '../context/AppContext'

/**
 * Roles:
 *  - admin     Coordinación CIST: full access to the admin panel.
 *  - director  Dirección: sees the whole admin panel in read-only mode (can view and export).
 *  - auxiliar  Auxiliar: only the student attendance module, with full use of it.
 *  - psicologo Psicología: only the psychological care module (confidential), with full use of it.
 *  - teacher   Docente: teacher panel (reservations).
 */
export const ROLE_LABEL = {
  admin: 'Coordinación CIST',
  director: 'Directora',
  auxiliar: 'Auxiliar',
  psicologo: 'Psicología',
  teacher: 'Docente',
}

export const STAFF_ROLES = ['admin', 'director', 'auxiliar', 'psicologo']

export const isStaff = (user) => STAFF_ROLES.includes(user?.role)

export function homePath(user) {
  if (!user) return '/login'
  if (user.role === 'teacher') return '/panel'
  if (user.role === 'auxiliar') return '/admin/asistencia'
  if (user.role === 'psicologo') return '/admin/psicologia'
  return '/admin'
}

const ATTENDANCE = '/admin/asistencia'
const PSYCHOLOGY = '/admin/psicologia'
const STUDENTS = '/admin/estudiantes'
const under = (path, base) => path === base || path.startsWith(`${base}/`)

/** Whether the user may open an admin-panel route. */
export function canView(user, path) {
  if (!user) return false
  if (path === '/admin/perfil') return isStaff(user)
  if (user.role === 'admin') return true
  // Dirección is read-only: no scanning and no database maintenance.
  if (user.role === 'director') return !['/admin/asistencia/escanear', '/admin/configuracion'].includes(path)
  if (user.role === 'auxiliar') return under(path, ATTENDANCE) || under(path, STUDENTS)
  if (user.role === 'psicologo') return under(path, PSYCHOLOGY)
  return false
}

/** Whether the user may create, edit, approve or delete in an area ('general', 'asistencia' or 'psicologia'). */
export function canEdit(user, area = 'general') {
  if (user?.role === 'admin') return true
  if (user?.role === 'auxiliar') return area === 'asistencia'
  if (user?.role === 'psicologo') return area === 'psicologia'
  return false
}

export function useCan(area = 'general') {
  const { user } = useApp()
  return canEdit(user, area)
}
