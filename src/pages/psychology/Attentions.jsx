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

  function exportData() {
    if (!visible.length) return toast('No hay atenciones para exportar.', 'bad')
    exportTableXlsx({
      title: 'Atención psicológica · Registro de atenciones',
      subtitle: `Del ${shortDate(range.from)} al ${shortDate(range.to)} · Información confidencial`,
      summary: [['Atenciones', visible.length], ['Realizadas', visible.filter((item) => item.status === 'Realizada').length]],
      headers: ['Fecha', 'Hora', 'Estudiante', 'Grado y sección', 'Caso', 'Motivo', 'Tipo', 'Estado', 'Acuerdos', 'Registrado por'],
      widths: [12, 8, 30, 18, 11, 20, 18, 13, 40, 22],
      rows: visible.map((item) => [item.date, item.time, item.student.name, classroom(item.student), item.caseCode, item.reason, item.type, item.status, item.agreements || '', item.createdBy || '']),
    }).then(() => toast('Atenciones exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={NotebookPen}
        title="Registro de atenciones"
        description="Cada atención psicológica realizada a los estudiantes, con su caso, tipo y acuerdos."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
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
