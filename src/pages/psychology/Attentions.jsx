import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardPen, FileSpreadsheet, NotebookPen, Pencil, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Filters, PageHeader, Panel, Pill, Table } from '../campus/kit'
import { FilterLabel, Select, addDaysISO, todayLima } from '../attendance/shared'
import { ConfidentialNote, RegisterAttention, SESSION_STATUS, SESSION_TYPES, SessionForm, caseLink, classroom, opts, shortDate } from './shared'

const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

/** Columns of the administrative report, in the institution's format: [header, width, value of a row]. */
const REPORT_COLUMNS = [
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
  ['Tipo de atención', 18, (r) => r.type],
  ['Categoría general', 20, (r) => r.category],
  ['Motivo administrativo breve', 32, (r) => r.adminReason],
  ['Estado de atención', 15, (r) => r.attentionStatus],
  ['Psicólogo(a) responsable', 26, (r) => r.psychologist],
  ['Asistió a cita', 10, (r) => r.attended],
  ['N.º citas programadas', 12, (r) => r.scheduled],
  ['N.º citas asistidas', 12, (r) => r.attendedCount],
  ['N.º citas inasistidas', 12, (r) => r.missedCount],
  ['Próxima cita', 16, (r) => (r.nextAppointment ? `${dmy(r.nextAppointment)} ${r.nextAppointment.slice(11)}` : '')],
  ['Estado seguimiento', 15, (r) => r.followUp],
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

/** Every attention (session) recorded by Psychology, newest first. */
export default function AttentionsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const today = todayLima()
  const [range, setRange] = useState({ from: addDaysISO(today, -30), to: today })
  const [filters, setFilters] = useState({ q: '', type: '', status: '' })
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [editing, setEditing] = useState(null)
  const [exporting, setExporting] = useState(false)

  async function load() {
    setLoading(true)
    const result = await api(`/api/psychology/sessions?${new URLSearchParams(range)}`)
    setLoading(false)
    if (result.ok) setSessions([...result.sessions].reverse())
    else toast(result.error || 'No se pudieron cargar las atenciones.', 'bad')
  }
  useEffect(() => { load() }, [range.from, range.to])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return sessions.filter((item) =>
      (!filters.type || item.type === filters.type)
      && (!filters.status || item.status === filters.status)
      && (!term || `${item.student.name} ${item.caseCode} ${classroom(item.student)} ${item.reason}`.toLowerCase().includes(term)))
  }, [sessions, filters])

  /** Administrative report of the attentions shown (same period and filters), one row per attention. */
  async function exportData() {
    if (!visible.length) return toast('No hay atenciones para exportar.', 'bad')
    setExporting(true)
    const result = await api(`/api/psychology/export?${new URLSearchParams(range)}`)
    setExporting(false)
    if (!result.ok) return toast(result.error || 'No se pudo preparar el reporte.', 'bad')
    const shown = new Set(visible.map((item) => item.id))
    const rows = result.rows.filter((row) => shown.has(row.attentionId))
    exportTableXlsx({
      title: 'Atención psicológica · Reporte de atenciones',
      subtitle: `Del ${shortDate(range.from)} al ${shortDate(range.to)} · Uso administrativo, sin información clínica`,
      summary: [['Atenciones', rows.length], ['Estudiantes', new Set(rows.map((row) => row.studentId)).size]],
      headers: REPORT_COLUMNS.map(([header]) => header),
      widths: REPORT_COLUMNS.map(([, width]) => width),
      rows: rows.map((row) => REPORT_COLUMNS.map(([, , value]) => value(row) ?? '')),
    }).then(() => toast('Reporte de atenciones exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={NotebookPen}
        title="Registro de atenciones"
        description="Cada atención psicológica realizada a los estudiantes, con su caso, tipo y acuerdos."
        actions={(
          <>
            <Button type="button" variant="outline" disabled={exporting} onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> {exporting ? 'Preparando…' : 'Exportar Excel'}</Button>
            {canEdit && <Button type="button" onClick={() => setRegistering(true)}><Plus /> Registrar atención</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <Panel title="Atenciones registradas" icon={ClipboardPen}>
        <Filters className="lg:grid-cols-5">
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <FilterLabel label="Tipo"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(SESSION_TYPES, 'Todos los tipos')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(SESSION_STATUS, 'Todos los estados')} /></FilterLabel>
          <FilterLabel label="Buscar"><Input placeholder="Estudiante, caso o grado" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
        </Filters>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay atenciones en este periodo.'}
          columns={[
            { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap">{shortDate(item.date)}<span className="block text-xs text-muted-foreground">{item.time}</span></span> },
            { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{classroom(item.student)}</span></span> },
            { key: 'case', label: 'Caso', render: (item) => <span><Link to={caseLink(item.caseId)} className="font-semibold text-primary hover:underline">{item.caseCode}</Link><span className="block text-xs text-muted-foreground">{item.reason}</span></span> },
            { key: 'type', label: 'Tipo' },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'agreements', label: 'Acuerdos', render: (item) => <span className="line-clamp-2 max-w-72 text-xs">{item.agreements || '—'}</span> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (item) => <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar atención" aria-label="Editar atención" onClick={() => setEditing(item)}><Pencil /></Button> },
          ]}
        />
      </Panel>

      {registering && <RegisterAttention onClose={() => setRegistering(false)} onSaved={() => { setRegistering(false); load() }} />}
      {editing && (
        <SessionForm
          caseId={editing.caseId}
          caseLabel={`Caso ${editing.caseCode} · ${editing.student.name}`}
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
