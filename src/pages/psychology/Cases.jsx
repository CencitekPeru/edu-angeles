import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarPlus, CheckCircle2, Clock, Eraser, Eye, FileSpreadsheet, FolderOpen, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { FilterLabel, LEVELS, Select } from '../attendance/shared'
import { AppointmentForm, CASE_STATUS, CaseForm, ConfidentialNote, REASONS, ReferralForm, classroom, dmy, gradeSection, opts, sessionLabel, timeRange } from './shared'

/** Casos en seguimiento (manual §4): situations that need continuity, sessions or complementary actions. */
export default function CasesPage() {
  const { toast, user } = useApp()
  const canEdit = useCan('psicologia')
  const [params, setParams] = useSearchParams()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const emptyFilters = { q: '', status: '', level: '', reason: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [editing, setEditing] = useState(undefined)
  const [scheduling, setScheduling] = useState(null)
  const [version, setVersion] = useState(0)
  const openId = Number(params.get('caso')) || null

  async function load() {
    const result = await api('/api/psychology/cases')
    setLoading(false)
    if (result.ok) setCases(result.cases)
    else toast(result.error || 'No se pudieron cargar los casos.', 'bad')
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return cases.filter((item) =>
      (!filters.status || item.status === filters.status)
      && (!filters.level || item.student.level === filters.level)
      && (!filters.reason || item.reason === filters.reason)
      && (!term || `${item.code} ${item.student.name} ${item.student.code} ${classroom(item.student)}`.toLowerCase().includes(term)))
  }, [cases, filters])
  const count = (status) => cases.filter((item) => item.status === status).length
  const openCase = (id) => setParams(id ? { caso: String(id) } : {})
  const refresh = () => { setVersion((value) => value + 1); load() }

  function exportData() {
    if (!visible.length) return toast('No hay casos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Atención psicológica · Casos en seguimiento',
      subtitle: `Exportado el ${new Date().toLocaleDateString('es-PE')} · Información confidencial`,
      summary: [['Casos', visible.length], ['En seguimiento', visible.filter((item) => item.status === 'En seguimiento').length]],
      headers: ['Código', 'Estudiante', 'Código escolar', 'Nivel', 'Grado y sección', 'Motivo', 'Sesiones realizadas', 'Nivel de riesgo', 'Estado', 'Fecha de apertura', 'Próxima cita', 'Cierre'],
      widths: [11, 32, 13, 12, 13, 22, 11, 11, 15, 13, 17, 12],
      rows: visible.map((item) => [item.code, item.student.name, item.student.code, item.student.level, gradeSection(item.student), item.reason, item.sessionsDone,
        item.riskLevel, item.status, dmy(item.openedOn), item.nextSession ? `${dmy(item.nextSession)} ${item.nextSession.slice(11)}` : '—', dmy(item.closedOn) || '—']),
    }).then(() => toast('Casos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FolderOpen}
        title="Casos en seguimiento"
        description="Administración y seguimiento de casos psicológicos que requieren continuidad."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setEditing(null)}><Plus /> Nuevo caso</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} value={cases.length} label="Total de casos" onClick={() => setFilters({ ...filters, status: '' })} />
        <StatCard tone="amber" icon={Clock} value={count('En seguimiento')} label="En seguimiento" onClick={() => setFilters({ ...filters, status: 'En seguimiento' })} />
        <StatCard tone="blue" icon={CalendarPlus} value={count('Pendiente')} label="Pendientes" onClick={() => setFilters({ ...filters, status: 'Pendiente' })} />
        <StatCard tone="green" icon={CheckCircle2} value={count('Cerrado')} label="Cerrados" onClick={() => setFilters({ ...filters, status: 'Cerrado' })} />
      </div>

      <Panel title={`Listado de casos (${visible.length})`} icon={FolderOpen}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <FilterLabel label="Buscar" className="sm:col-span-2 lg:col-span-5"><Input placeholder="Buscar por estudiante, código del caso o grado…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Estado del caso"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(CASE_STATUS, 'Todos los estados')} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVELS, 'Todos los niveles')} /></FilterLabel>
          <FilterLabel label="Motivo" className="lg:col-span-2"><Select value={filters.reason} onChange={(reason) => setFilters({ ...filters, reason })} options={opts(REASONS, 'Todos los motivos')} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar filtros</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay casos con estos filtros.'}
          columns={[
            { key: 'code', label: 'Código', render: (item) => <span className="font-semibold">{item.code}</span> },
            { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{item.student.code}</span></span> },
            { key: 'grade', label: 'Grado', render: (item) => gradeSection(item.student) },
            { key: 'reason', label: 'Motivo' },
            { key: 'sessions', label: 'Sesiones', render: (item) => item.sessionsDone },
            { key: 'risk', label: 'Nivel de riesgo', render: (item) => <Pill value={item.riskLevel} /> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'opened', label: 'Fecha de apertura', render: (item) => dmy(item.openedOn) },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver caso" aria-label={`Ver caso ${item.code}`} onClick={() => openCase(item.id)}><Eye /></Button>
                {canEdit && item.status !== 'Cerrado' && <Button type="button" variant="ghost" size="icon" className="size-8" title="Programar cita" aria-label={`Programar cita del caso ${item.code}`} onClick={() => setScheduling(item.id)}><CalendarPlus /></Button>}
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar caso" aria-label={`Editar caso ${item.code}`} onClick={() => setEditing(item)}><Pencil /></Button>}
              </span>
            ) },
          ]}
        />
      </Panel>

      {editing !== undefined && <CaseForm item={editing} onClose={() => setEditing(undefined)} onSaved={(id) => { setEditing(undefined); refresh(); openCase(id) }} />}
      {scheduling && <AppointmentForm caseId={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); refresh() }} />}
      {openId && <CaseDetail key={`${openId}-${version}`} id={openId} canEdit={canEdit} isAdmin={user.role === 'admin'} onClose={() => openCase(null)} onEdit={(item) => setEditing(item)} onChanged={refresh} />}
    </div>
  )
}

function Info({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-3' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-foreground">{value || '—'}</p>
    </div>
  )
}

/** Case card: general information, initial plan, sessions and referrals. History is kept (no deleting sessions). */
function CaseDetail({ id, canEdit, isAdmin, onClose, onEdit, onChanged }) {
  const { toast } = useApp()
  const [data, setData] = useState(null)
  const [scheduling, setScheduling] = useState(false)
  const [referring, setReferring] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const result = await api(`/api/psychology/cases/${id}`)
    if (result.ok) setData(result)
    else { toast(result.error || 'No se pudo abrir el caso.', 'bad'); onClose() }
  }
  useEffect(() => { load() }, [id])

  async function removeCase() {
    const result = await api(`/api/psychology/cases/${id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el caso.', 'bad')
    toast('Caso eliminado. Sus atenciones se conservan como atenciones puntuales.')
    onChanged()
    onClose()
  }

  const item = data?.case
  const closed = item?.status === 'Cerrado'
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        {!item ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">Caso {item.code} <Pill value={item.status} /> <Pill value={item.riskLevel} /></DialogTitle>
              <DialogDescription>{item.student.name} · {item.student.code} · {classroom(item.student)}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <Info label="Fecha de apertura" value={dmy(item.openedOn)} />
              <Info label="Motivo" value={item.reason} />
              <Info label="Derivado por" value={[item.referredBy, item.referrerName].filter(Boolean).join(' · ')} />
              <Info label="Sesiones realizadas" value={String(item.sessionsDone)} />
              <Info label="Próxima cita" value={item.nextSession ? `${dmy(item.nextSession)} ${item.nextSession.slice(11)}` : ''} />
              <Info label="Cierre" value={dmy(item.closedOn)} />
              <Info wide label="Descripción de la situación" value={item.description} />
              <Info wide label="Objetivo del seguimiento" value={item.objective} />
              <Info wide label="Acciones iniciales / Acuerdos" value={item.initialActions} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Sesiones y atenciones del caso</h3>
              {canEdit && !closed && <Button type="button" size="sm" onClick={() => setScheduling(true)}><CalendarPlus /> Programar cita</Button>}
            </div>
            {closed && <p className="text-xs text-muted-foreground">El caso está cerrado: no se programan citas. Para retomarlo, edita el caso y cambia su estado con una justificación.</p>}
            <ol className="space-y-2">
              {data.sessions.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{dmy(entry.date)} · {timeRange(entry)} <span className="font-normal text-muted-foreground">· {sessionLabel(entry)} · {entry.origin === 'atencion' ? 'Atención registrada' : `${entry.type}${entry.modality ? ` · ${entry.modality}` : ''}`}</span></p>
                    <Pill value={entry.status} />
                  </div>
                  {entry.topic && <p className="mt-1 text-xs"><span className="font-semibold">Tema:</span> {entry.topic}</p>}
                  {entry.notes && <p className="mt-1 whitespace-pre-wrap text-foreground/90">{entry.notes}</p>}
                  {entry.agreements && <p className="mt-1 whitespace-pre-wrap text-xs"><span className="font-semibold">Acuerdos:</span> {entry.agreements}</p>}
                </li>
              ))}
              {!data.sessions.length && <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aún no hay sesiones registradas.</li>}
            </ol>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Derivaciones</h3>
              {canEdit && <Button type="button" size="sm" variant="outline" onClick={() => setReferring(true)}><Send /> Nueva derivación</Button>}
            </div>
            <ul className="space-y-2">
              {data.referrals.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                  <span><span className="font-semibold">{entry.code}</span> · {entry.institution} <span className="text-muted-foreground">· {entry.motive} · {dmy(entry.date)}</span></span>
                  <Pill value={entry.status} />
                </li>
              ))}
              {!data.referrals.length && <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Sin derivaciones.</li>}
            </ul>

            <DialogFooter className="gap-2 sm:justify-between">
              {isAdmin ? <Button type="button" variant="ghost" className="text-[#9a2f2a]" onClick={() => setDeleting(true)}><Trash2 /> Eliminar caso</Button> : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
                {canEdit && <Button type="button" onClick={() => onEdit(item)}><Pencil /> Editar caso</Button>}
              </div>
            </DialogFooter>
          </>
        )}

        {scheduling && <AppointmentForm caseId={id} onClose={() => setScheduling(false)} onSaved={() => { setScheduling(false); load(); onChanged() }} />}
        {referring && item && <ReferralForm studentId={item.student.id} caseId={item.id} onClose={() => setReferring(false)} onSaved={() => { setReferring(false); load() }} />}
        <Dialog open={deleting} onOpenChange={setDeleting}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Eliminar el caso {item?.code}?</DialogTitle>
              <DialogDescription>Las atenciones ya realizadas se conservan como atenciones puntuales; se eliminan las citas pendientes del caso. Si el seguimiento terminó, es mejor cambiar el estado a «Cerrado».</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancelar</Button>
              <Button type="button" variant="destructive" onClick={removeCase}>Sí, eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
