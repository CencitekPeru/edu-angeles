import { exportTableXlsx } from '../../lib/exporters'
import { dmy } from './shared'

/** Columns of the institution's administrative report: [header, width, value of a row]. No clinical data. */
export const REPORT_COLUMNS = [
  ['ID estudiante', 12, (r) => r.studentId],
  ['Código escolar', 14, (r) => r.studentCode],
  ['Apellidos y nombres', 32, (r) => r.fullName],
  ['DNI', 12, (r) => r.dni],
  ['Fecha nacimiento', 14, (r) => dmy(r.birthDate)],
  ['Edad', 7, (r) => r.age],
  ['Nivel', 12, (r) => r.level],
  ['Grado', 8, (r) => r.grade],
  ['Sección', 9, (r) => r.section],
  ['Turno', 10, (r) => r.shift],
  ['Nombre del apoderado', 28, (r) => r.guardian],
  ['Parentesco', 13, (r) => r.relationship],
  ['Teléfono', 13, (r) => r.phone],
  ['Teléfono alternativo', 15, (r) => r.phoneAlt],
  ['Correo apoderado', 28, (r) => r.guardianEmail],
  ['Fecha de atención', 14, (r) => dmy(r.date)],
  ['Hora atención', 10, (r) => r.time],
  ['ID atención', 12, (r) => r.attentionCode],
  ['Tipo de atención', 20, (r) => r.type],
  ['Categoría general', 22, (r) => r.category],
  ['Motivo administrativo breve', 32, (r) => r.adminReason],
  ['Estado de atención', 15, (r) => r.attentionStatus],
  ['Psicólogo(a) responsable', 26, (r) => r.psychologist],
  ['Asistió a cita', 10, (r) => r.attended],
  ['N.º citas programadas', 12, (r) => r.scheduled],
  ['N.º citas asistidas', 12, (r) => r.attendedCount],
  ['N.º citas inasistidas', 12, (r) => r.missedCount],
  ['Próxima cita', 16, (r) => (r.nextAppointment ? `${dmy(r.nextAppointment)} ${r.nextAppointment.slice(11)}` : '')],
  ['Estado seguimiento', 16, (r) => r.followUp],
  ['Derivación', 10, (r) => r.referred],
  ['Destino derivación', 30, (r) => r.referralDestination],
  ['Estado derivación', 14, (r) => r.referralStatus],
  ['Contacto con apoderado', 12, (r) => r.guardianContact],
  ['Fecha contacto', 13, (r) => dmy(r.contactDate)],
  ['Observación administrativa', 40, (r) => r.adminNotes],
  ['Asistencias escolares (mes)', 12, (r) => r.schoolPresent],
  ['Tardanzas escolares (mes)', 12, (r) => r.schoolLate],
  ['Inasistencias escolares (mes)', 12, (r) => r.schoolAbsent],
  ['Mes reporte', 9, (r) => r.reportMonth],
  ['Año reporte', 9, (r) => r.reportYear],
]

/** Downloads the administrative report for `rows` (as returned by /api/psychology/export). */
export function exportAdministrativeReport(rows, subtitle) {
  return exportTableXlsx({
    title: 'Atención psicológica · Reporte de atenciones',
    subtitle: `${subtitle} · Uso administrativo, sin información clínica`,
    summary: [['Registros', rows.length], ['Estudiantes', new Set(rows.map((row) => row.studentId)).size]],
    headers: REPORT_COLUMNS.map(([header]) => header),
    widths: REPORT_COLUMNS.map(([, width]) => width),
    rows: rows.map((row) => REPORT_COLUMNS.map(([, , value]) => value(row) ?? '')),
  })
}
