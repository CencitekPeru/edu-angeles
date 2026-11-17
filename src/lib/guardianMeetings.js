/** Options of «Reuniones de padres y multas», shared by the API and the pages. */

export const MEETING_TYPES = ['Reunión de padres', 'Asamblea general', 'Convocatoria institucional', 'Jornada de trabajo / faena', 'Escuela de padres', 'Otra']
export const MEETING_STATUS = ['Programada', 'Realizada', 'Cancelada']
/** Attendance of a guardian to a meeting. Only «falta» generates a fine. */
export const GUARDIAN_ATTENDANCE = ['presente', 'tardanza', 'falta', 'justificado']
export const GUARDIAN_ATTENDANCE_LABEL = { presente: 'Asistió', tardanza: 'Tardanza', falta: 'Faltó', justificado: 'Justificado' }
export const FINE_STATUS = ['Pendiente', 'Pagada', 'Exonerada']

/** Money in soles. */
export const soles = (value) => `S/ ${Number(value || 0).toFixed(2)}`
