import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Eraser, Eye, ListChecks, Pencil, Repeat2, UserX } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, Table } from '../campus/kit'
import { FilterLabel, LEVELS, Select, addDaysISO, longDate, todayLima } from '../attendance/shared'
import { AppointmentForm, AttentionForm, ConfidentialNote, RescheduleForm, SESSION_STATUS, caseLink, classroom, dmy, opts, sessionLabel, timeRange } from './shared'

/** Monday of the week that contains `iso`. */
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay() || 7
  return addDaysISO(iso, 1 - weekday)
}

/** Seguimiento y citas (manual §5): schedule and control sessions of active cases. */
export default function AppointmentsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const today = todayLima()
  const [tab, setTab] = useState('list')
  const [range, setRange] = useState({ from: addDaysISO(today, -30), to: addDaysISO(today, 30) })
  const emptyFilters = { q: '', status: '', caseId: '', level: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(undefined)
  const [rescheduling, setRescheduling] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [editingAttention, setEditingAttention] = useState(null)
  // Attentions registered in «Registro de atenciones» are edited with their own form.
  const edit = (item) => (item.origin === 'atencion' ? setEditingAttention(item) : setForm(item))

  // The calendar always shows its week, whatever the list's period is.
  const period = tab === 'calendar' ? { from: weekStart, to: addDaysISO(weekStart, 6) } : range
  async function load() {
    setLoading(true)
    const result = await api(`/api/psychology/sessions?${new URLSearchParams(period)}`)
    setLoading(false)
    if (result.ok) setSessions(result.sessions)
    else toast(result.error || 'No se pudieron cargar las citas.', 'bad')
  }
  useEffect(() => { load() }, [period.from, period.to])

  const caseOptions = useMemo(() => [...new Map(sessions.map((item) => [item.caseId, `${item.caseCode} · ${item.student.name}`])).entries()], [sessions])
  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return sessions.filter((item) =>
      (!filters.status || item.status === filters.status)
      && (!filters.caseId || String(item.caseId) === filters.caseId)
      && (!filters.level || item.student.level === filters.level)
      && (!term || `${item.student.name} ${item.student.code} ${item.caseCode} ${item.topic} ${item.reason}`.toLowerCase().includes(term)))
  }, [sessions, filters])

  async function quickStatus(item, status) {
    if (status === 'Realizada' && item.date > today) return toast('No marques como «Realizada» una cita que todavía no ocurre.', 'bad')
    const result = await api(`/api/psychology/sessions/${item.id}`, { method: 'PATCH', body: { ...item, startTime: item.time, status } })
    if (!result.ok) return toast(result.error || 'No se pudo actualizar la cita.', 'bad')
    toast(`Cita marcada como «${status}».`)
    load()
  }

  const actions = (item) => (
    <span className="flex gap-1">
      <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver cita" aria-label="Ver cita" onClick={() => setViewing(item)}><Eye /></Button>
      {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar" aria-label="Editar cita" onClick={() => edit(item)}><Pencil /></Button>}
      {canEdit && item.status === 'Programada' && (
        <>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-[#3f7d5c]" title="Marcar como realizada" aria-label="Marcar como realizada" disabled={item.date > today} onClick={() => quickStatus(item, 'Realizada')}><Check /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-[#b4413c]" title="No asistió" aria-label="Marcar que no asistió" disabled={item.date > today} onClick={() => quickStatus(item, 'No asistió')}><UserX /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-[#b7832f]" title="Reprogramar" aria-label="Reprogramar cita" onClick={() => setRescheduling(item)}><Repeat2 /></Button>
        </>
      )}
    </span>
  )

  const days = Array.from({ length: 7 }, (_, index) => addDaysISO(weekStart, index))
  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarClock}
        title="Seguimiento y citas"
        description="Registro, programación y control de sesiones de los casos en seguimiento."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => setTab('calendar')}><CalendarDays /> Ver calendario</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><CalendarPlus /> Programar cita</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <Panel title="Buscar y filtrar" icon={ListChecks}>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterLabel label="Buscar" className="sm:col-span-2 lg:col-span-4"><Input placeholder="Buscar por estudiante, código de caso o motivo…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} disabled={tab === 'calendar'} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} disabled={tab === 'calendar'} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <FilterLabel label="Estado de la cita" className="lg:col-span-2"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(SESSION_STATUS, 'Todos los estados')} /></FilterLabel>
          <FilterLabel label="Caso" className="lg:col-span-2"><Select value={filters.caseId} onChange={(caseId) => setFilters({ ...filters, caseId })} options={[{ value: '', label: 'Todos los casos' }, ...caseOptions.map(([id, label]) => ({ value: String(id), label }))]} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVELS, 'Todos los niveles')} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar filtros</Button></div>
        </div>
      </Panel>

      <nav className="flex gap-1 border-b border-border" aria-label="Vistas de citas">
        {[['list', 'Listado de citas', ListChecks], ['calendar', 'Calendario de sesiones', CalendarDays]].map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold ${tab === value ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'list' ? (
        <Panel title={`Citas (${visible.length})`} icon={CalendarClock}>
          <Table
            rows={visible}
            empty={loading ? 'Cargando…' : 'No hay citas en este periodo.'}
            columns={[
              { key: 'date', label: 'Fecha y hora', render: (item) => <span className="whitespace-nowrap">{dmy(item.date)}<span className="block text-xs text-muted-foreground">{timeRange(item)}</span></span> },
              { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{classroom(item.student)}</span></span> },
              { key: 'case', label: 'Caso', render: (item) => <Link to={caseLink(item.caseId)} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-primary hover:underline dark:bg-muted">{item.caseCode}</Link> },
              { key: 'topic', label: 'Motivo / Sesión', render: (item) => <span><span className="block font-medium">{sessionLabel(item)}</span><span className="line-clamp-1 max-w-56 text-xs text-muted-foreground">{item.topic || item.reason}</span></span> },
              { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
              { key: 'next', label: 'Próxima cita', render: (item) => (item.nextAppointment ? <span className="whitespace-nowrap text-xs">{dmy(item.nextAppointment)}<span className="block text-muted-foreground">{item.nextAppointment.slice(11)}</span></span> : '—') },
              { key: 'actions', label: 'Acciones', render: actions },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="Calendario de sesiones" icon={CalendarDays} action={(
          <span className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Semana anterior" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><ChevronLeft /></Button>
            <span className="min-w-44 text-center text-xs font-semibold">{dmy(weekStart)} – {dmy(addDaysISO(weekStart, 6))}</span>
            <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Semana siguiente" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><ChevronRight /></Button>
            {weekStart !== mondayOf(today) && <Button type="button" variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(today))}>Hoy</Button>}
          </span>
        )}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((date) => {
              const items = visible.filter((item) => item.date === date)
              return (
                <section key={date} className={`min-h-28 rounded-lg border p-2 ${date === today ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                  <h3 className="mb-2 text-xs font-bold capitalize">{longDate(date).split(',')[0]} <span className="font-normal text-muted-foreground">{dmy(date).slice(0, 5)}</span></h3>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => setViewing(item)} className="w-full rounded-md border border-border bg-card p-1.5 text-left text-[11px] leading-tight hover:border-primary/50">
                          <span className="block font-bold">{timeRange(item)}</span>
                          <span className="block truncate">{item.student.name}</span>
                          <span className="mt-1 flex items-center justify-between gap-1"><span className="text-muted-foreground">{item.caseCode}</span><Pill value={item.status} className="scale-90" /></span>
                        </button>
                      </li>
                    ))}
                    {!items.length && <li className="text-[11px] text-muted-foreground">Sin citas</li>}
                  </ul>
                </section>
              )
            })}
          </div>
        </Panel>
      )}

      {form !== undefined && <AppointmentForm session={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load() }} />}
      {editingAttention && <AttentionForm attention={editingAttention} onClose={() => setEditingAttention(null)} onSaved={() => { setEditingAttention(null); load() }} />}
      {rescheduling && <RescheduleForm session={rescheduling} onClose={() => setRescheduling(null)} onSaved={() => { setRescheduling(null); load() }} />}
      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{sessionLabel(viewing)} · {viewing.caseCode} <Pill value={viewing.status} /></DialogTitle>
              <DialogDescription>{viewing.student.name} · {classroom(viewing.student)}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Fecha y hora</dt><dd>{dmy(viewing.date)} · {timeRange(viewing)}</dd>
              <dt className="text-muted-foreground">Tipo · Modalidad</dt><dd>{viewing.type}{viewing.modality ? ` · ${viewing.modality}` : ''}</dd>
              <dt className="text-muted-foreground">Motivo / Tema</dt><dd className="whitespace-pre-wrap">{viewing.topic || viewing.reason || '—'}</dd>
              <dt className="text-muted-foreground">Observaciones</dt><dd className="whitespace-pre-wrap">{viewing.notes || '—'}</dd>
              <dt className="text-muted-foreground">Acuerdos</dt><dd className="whitespace-pre-wrap">{viewing.agreements || '—'}</dd>
              <dt className="text-muted-foreground">Próxima cita</dt><dd>{viewing.nextAppointment ? `${dmy(viewing.nextAppointment)} ${viewing.nextAppointment.slice(11)}` : '—'}</dd>
            </dl>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {canEdit && <Button type="button" onClick={() => { edit(viewing); setViewing(null) }}><Pencil /> Editar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
