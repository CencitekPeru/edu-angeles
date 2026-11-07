import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Laptop, Plus, X, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { isStaff, useCan } from '../lib/permissions'
import { GRADES, SECTIONS, STATUS, personName } from '../lib/reservations'
import { LAB, addDays, isPastEnd, parseISODate, schoolWeek, toISODate, toMinutes, todayISO } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PageHeader, StatCard } from './campus/kit'
import { FilterLabel, Select, StatusChip, allOption, longDate } from './attendance/shared'
import { REQUEST_META, requestCode } from './reservations/shared'
import { CalendarLegend, MonthCalendar } from './reservations/MonthCalendar'
import NewRequestDialog from './reservations/NewRequestDialog'

const DAY_START = toMinutes(LAB.open)
const DAY_END = toMinutes(LAB.close)
const HOUR_HEIGHT = 56
const HOURS = Array.from({ length: Math.ceil((DAY_END - DAY_START) / 60) }, (_, index) => DAY_START + index * 60)
const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

const BLOCK = {
  approved: 'border-border bg-[#f1f7f3] text-[#24503a] dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-100',
  pending: 'border-[#ead9b8] bg-[#fbf6ec] text-[#6f4a10] dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100',
  rejected: 'border-border bg-[#fbf1f0] text-[#7d2621] dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100',
  fixed: 'border-slate-300 bg-slate-50 text-slate-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-100',
}
const BLOCK_ICON = { approved: CheckCircle2, pending: Clock, rejected: XCircle, fixed: CalendarDays }
const ICON_TONE = { approved: 'text-[#3f7d5c]', pending: 'text-[#b7832f]', rejected: 'text-[#b4413c]', fixed: 'text-primary' }

function dayHeader(iso) {
  const date = parseISODate(iso)
  const weekday = new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(date).replace('.', '')
  const day = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(date).replace('.', '')
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), day }
}

function rangeLabel(days) {
  const first = parseISODate(days[0])
  const last = parseISODate(days.at(-1))
  if (days.length === 1) return longDate(days[0])
  const month = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(last)
  return `${String(first.getDate()).padStart(2, '0')} – ${String(last.getDate()).padStart(2, '0')} de ${month}`
}

export default function CalendarPage() {
  const { user, requests, users, rooms, fixedSchedules, decideRequest, toast } = useApp()
  // Staff (coordination, direction) see the management view; only coordination approves or rejects.
  const admin = isStaff(user)
  const canDecide = useCan()
  const today = todayISO()
  const [roomId, setRoomId] = useState('')
  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(today)
  const [filters, setFilters] = useState({ grade: '', section: '', status: '', from: '', to: '' })
  const [detail, setDetail] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingDate, setCreatingDate] = useState(null)

  const activeRoom = rooms.some((room) => String(room.id) === String(roomId)) ? String(roomId) : String(rooms[0]?.id || '')
  const anchorDate = parseISODate(anchor)

  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    if (view === 'week') return schoolWeek(anchor)
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12)
    const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 12)
    const list = []
    for (let d = first; d <= last; d = addDays(d, 1)) list.push(toISODate(d))
    return list
  }, [view, anchor, anchorDate])

  const passes = (item) =>
    (!filters.grade || item.grade === filters.grade) &&
    (!filters.section || item.section === filters.section) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.from || item.date >= filters.from) &&
    (!filters.to || item.date <= filters.to)

  // Requests in the visible period (all rooms) drive the stat cards.
  const periodRequests = requests.filter((item) => item.date >= days[0] && item.date <= days.at(-1) && item.status !== 'cancelled' && passes(item))

  const events = useMemo(() => {
    const list = requests
      .filter((item) => String(item.roomId) === activeRoom && item.status !== 'cancelled' && passes(item))
      .map((item) => ({ ...item, kind: item.status }))
    if (!filters.status) {
      for (const date of days) {
        const weekday = parseISODate(date).getDay()
        for (const slot of fixedSchedules) {
          if (String(slot.roomId) !== activeRoom || Number(slot.weekday) !== weekday) continue
          if ((filters.grade && slot.grade !== filters.grade) || (filters.section && slot.section !== filters.section)) continue
          list.push({ ...slot, id: `fijo-${slot.id}-${date}`, date, kind: 'fixed', teacherName: slot.teacherName })
        }
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, fixedSchedules, activeRoom, days, filters])

  const marks = useMemo(() => {
    const result = {}
    const priority = { approved: 3, pending: 2, rejected: 1 }
    for (const item of requests) {
      if (String(item.roomId) !== activeRoom || !priority[item.status]) continue
      if (!result[item.date] || priority[item.status] > priority[result[item.date]]) result[item.date] = item.status
    }
    return result
  }, [requests, activeRoom])

  function move(delta) {
    if (view === 'day') {
      let next = addDays(anchor, delta)
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, delta)
      setAnchor(toISODate(next))
    } else if (view === 'week') setAnchor(toISODate(addDays(anchor, delta * 7)))
    else setAnchor(toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1, 12)))
  }

  async function approve(item) {
    setSaving(true)
    const result = await decideRequest(item.id, 'approved')
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo aprobar la solicitud.', 'bad')
    toast('Solicitud aprobada.')
    setDetail(null)
  }

  async function reject() {
    setSaving(true)
    const result = await decideRequest(detail.id, 'rejected', rejectNote)
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo rechazar la solicitud.', 'bad')
    toast('Solicitud rechazada.')
    setDetail(null)
    setRejecting(false)
  }

  function reserve(date) {
    if (admin || date < today || parseISODate(date).getDay() % 6 === 0) return
    setCreatingDate(date)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarCheck}
        title="Calendario de Reservas"
        description={admin ? 'Visualiza y gestiona las reservas de las salas de cómputo.' : 'Consulta la disponibilidad y solicita la sala para tus clases.'}
        actions={!admin && <Button type="button" onClick={() => setCreatingDate(today)}><Plus /> Nueva reserva</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={CalendarDays} value={periodRequests.length} label="Total de reservas" hint={view === 'month' ? 'Este mes' : view === 'week' ? 'Esta semana' : 'Este día'} />
        <StatCard tone="amber" icon={Clock} value={periodRequests.filter((item) => item.status === 'pending').length} label="Pendientes" onClick={() => setFilters({ ...filters, status: 'pending' })} />
        <StatCard tone="green" icon={CheckCircle2} value={periodRequests.filter((item) => item.status === 'approved').length} label="Aprobadas" onClick={() => setFilters({ ...filters, status: 'approved' })} />
        <StatCard tone="red" icon={XCircle} value={periodRequests.filter((item) => item.status === 'rejected').length} label="Rechazadas" onClick={() => setFilters({ ...filters, status: 'rejected' })} />
      </div>

      <div className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,2fr)]">
        <FilterLabel label="Ambiente"><Select value={activeRoom} onChange={setRoomId} options={rooms.map((room) => ({ value: String(room.id), label: room.name }))} /></FilterLabel>
        <FilterLabel label="Grado"><Select value={filters.grade} onChange={(grade) => setFilters({ ...filters, grade })} options={[allOption(), ...GRADES.map((value) => ({ value, label: value }))]} /></FilterLabel>
        <FilterLabel label="Sección"><Select value={filters.section} onChange={(section) => setFilters({ ...filters, section })} options={[allOption(), ...SECTIONS.map((value) => ({ value, label: value }))]} /></FilterLabel>
        <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[allOption(), ...['pending', 'approved', 'rejected'].map((value) => ({ value, label: STATUS[value] }))]} /></FilterLabel>
        <div className="flex items-end">
          <Button type="button" variant="outline" className="w-full" onClick={() => setFilters({ grade: '', section: '', status: '', from: '', to: '' })}>Limpiar</Button>
        </div>
        <FilterLabel label="Rango de fechas">
          <span className="flex items-center gap-1.5">
            <Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-label="Desde" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-label="Hasta" />
          </span>
        </FilterLabel>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => (
                <button key={room.id} type="button" onClick={() => setRoomId(String(room.id))}
                  className={cn('flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold', String(room.id) === activeRoom ? 'border-primary bg-primary text-primary-foreground shadow' : 'border-border bg-card text-foreground hover:bg-muted')}>
                  <Laptop className="size-4" /> {room.name}
                </button>
              ))}
              {!rooms.length && <p className="text-sm text-muted-foreground">No hay salas de cómputo registradas. Créalas en “Categorías y ambientes”.</p>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border bg-card p-0.5">
                {[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setView(id)} className={cn('rounded-md px-3 py-1 text-sm font-semibold', view === id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>{label}</button>
                ))}
              </div>
              <button type="button" onClick={() => move(-1)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted" aria-label="Anterior"><ChevronLeft className="size-4" /></button>
              <span className="min-w-40 text-center text-sm font-semibold">{view === 'month' ? new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(anchorDate) : rangeLabel(days)}</span>
              <button type="button" onClick={() => move(1)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted" aria-label="Siguiente"><ChevronRight className="size-4" /></button>
            </div>
          </div>

          {view === 'month' ? (
            <MonthBoard days={days} events={events} today={today} onPick={(date) => { setAnchor(date); setView('day') }} />
          ) : (
            <TimeGrid days={days} events={events} users={users} today={today} onOpen={setDetail} onReserve={admin ? null : reserve} />
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <MonthCalendar compact year={anchorDate.getFullYear()} month={anchorDate.getMonth()} onMonth={(year, month) => setAnchor(toISODate(new Date(year, month, 1, 12)))} selected={anchor} today={today} marks={marks} onSelect={(date) => { setAnchor(date); if (view === 'month') setView('day') }} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold">Leyenda</p>
            <CalendarLegend items={[['approved', 'Reserva aprobada'], ['pending', 'Reserva pendiente'], ['rejected', 'Reserva rechazada'], ['free', 'Horario libre'], ['fixed', 'Horario fijo (curricular)']]} />
            {!admin && <p className="mt-3 text-xs text-muted-foreground">Haz clic en un espacio libre de un día para solicitar la sala.</p>}
          </div>
        </aside>
      </div>

      {creatingDate && <NewRequestDialog initialDate={creatingDate} onClose={() => setCreatingDate(null)} onComplete={() => setCreatingDate(null)} />}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) { setDetail(null); setRejecting(false) } }}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.kind === 'fixed' ? 'Horario fijo' : `${requestCode(detail.id)} · ${detail.grade} ${detail.section}`}</DialogTitle>
                <DialogDescription>{longDate(detail.date)} · {detail.startTime}–{detail.endTime}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Docente</dt><dd>{detail.kind === 'fixed' ? detail.teacherName || personName(users, detail.teacherId) : personName(users, detail.teacherId)}</dd>
                <dt className="text-muted-foreground">Actividad</dt><dd>{detail.purpose || '—'}</dd>
                {detail.kind !== 'fixed' && <><dt className="text-muted-foreground">Estudiantes</dt><dd>{detail.students}</dd></>}
                <dt className="text-muted-foreground">Estado</dt><dd>{detail.kind === 'fixed' ? 'Horario fijo semanal' : <StatusChip status={detail.status} meta={REQUEST_META} />}</dd>
                {detail.notes && <><dt className="text-muted-foreground">Notas</dt><dd>{detail.notes}</dd></>}
                {detail.adminNote && <><dt className="text-muted-foreground">Nota CIST</dt><dd>{detail.adminNote}</dd></>}
              </dl>
              {canDecide && detail.kind === 'pending' && (
                rejecting ? (
                  <div className="space-y-2">
                    <Textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Motivo del rechazo (opcional)" />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setRejecting(false)}>Volver</Button>
                      <Button type="button" variant="destructive" disabled={saving} onClick={reject}>Confirmar rechazo</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <DialogFooter>
                    <Button type="button" variant="outline" className="border-border text-[#b4413c]" onClick={() => { setRejectNote(''); setRejecting(true) }}><X /> Rechazar</Button>
                    <Button type="button" disabled={saving || isPastEnd(detail.date, detail.endTime)} onClick={() => approve(detail)}><Check /> Aprobar</Button>
                  </DialogFooter>
                )
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Lays out one day's events so overlapping ones sit side by side instead of on top of each other.
 * Events that overlap (directly or through a chain) form a cluster; inside it each event takes the
 * first free lane, and every event of the cluster shares the cluster's lane count for its width.
 */
function layoutDay(items) {
  const sorted = items
    .map((item) => {
      const start = Math.max(DAY_START, toMinutes(item.startTime))
      const end = Math.min(DAY_END, Math.max(toMinutes(item.endTime), start + 15))
      return { item, start, end }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const placed = []
  let cluster = []
  let clusterEnd = -1
  const close = () => {
    const lanes = Math.max(...cluster.map((entry) => entry.lane)) + 1
    for (const entry of cluster) placed.push({ ...entry, lanes })
    cluster = []
  }
  for (const entry of sorted) {
    if (cluster.length && entry.start >= clusterEnd) close()
    const laneEnds = []
    for (const other of cluster) laneEnds[other.lane] = Math.max(laneEnds[other.lane] ?? -1, other.end)
    let lane = laneEnds.findIndex((end) => end <= entry.start)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ ...entry, lane })
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  if (cluster.length) close()
  return placed
}

function TimeGrid({ days, events, users, today, onOpen, onReserve }) {
  const height = ((DAY_END - DAY_START) / 60) * HOUR_HEIGHT
  const byDay = useMemo(
    () => Object.fromEntries(days.map((date) => [date, layoutDay(events.filter((item) => item.date === date))])),
    [days, events],
  )
  // Give each day enough width for its busiest moment so side-by-side blocks stay readable.
  const maxLanes = Math.max(1, ...Object.values(byDay).flatMap((list) => list.map((entry) => entry.lanes)))
  const minWidth = 90 + days.length * Math.max(110, maxLanes * 96)
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${days.length}, minmax(0, 1fr))`, minWidth }}>
        <div className="border-b border-r border-border bg-slate-50 px-2 py-2 text-center text-sm font-bold dark:bg-muted/60">Hora</div>
        {days.map((date) => {
          const label = dayHeader(date)
          return (
            <div key={date} className={cn('border-b border-r border-border px-2 py-1.5 text-center last:border-r-0', date === today ? 'bg-slate-100 dark:bg-blue-500/20' : 'bg-slate-50 dark:bg-muted/60')}>
              <p className="text-sm font-bold">{label.weekday}</p>
              <p className="text-xs text-muted-foreground">{label.day}</p>
            </div>
          )
        })}
        <div className="relative border-r border-border" style={{ height }}>
          {HOURS.map((mins, index) => (
            <div key={mins} className="absolute inset-x-0 border-b border-border/70 px-2 pt-1 text-[11px] font-medium text-muted-foreground" style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
              {fmt(mins)} – {fmt(Math.min(mins + 60, DAY_END))}
            </div>
          ))}
        </div>
        {days.map((date) => (
          <div
            key={date}
            className={cn('relative border-r border-border last:border-r-0', onReserve && date >= today && 'cursor-pointer hover:bg-muted/50 dark:hover:bg-blue-500/5')}
            style={{ height }}
            onClick={() => onReserve?.(date)}
          >
            {HOURS.map((mins, index) => <div key={mins} className="absolute inset-x-0 border-b border-border/60" style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }} />)}
            {byDay[date].map(({ item, start, end, lane, lanes }) => {
              const top = ((start - DAY_START) / 60) * HOUR_HEIGHT
              const blockHeight = Math.max(24, ((end - start) / 60) * HOUR_HEIGHT - 4)
              const Icon = BLOCK_ICON[item.kind]
              const teacher = item.kind === 'fixed' ? item.teacherName || personName(users, item.teacherId) : personName(users, item.teacherId)
              const short = blockHeight < 44
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onOpen(item) }}
                  className={cn('absolute flex flex-col items-stretch justify-start overflow-hidden rounded-md border px-2 py-1 text-left text-[11px] leading-tight shadow-xs transition hover:z-10 hover:shadow-md', BLOCK[item.kind])}
                  style={{
                    top: top + 2,
                    height: blockHeight,
                    left: `calc(${(lane / lanes) * 100}% + 3px)`,
                    width: `calc(${100 / lanes}% - 6px)`,
                  }}
                  title={`${item.grade} ${item.section} – ${item.purpose} · ${teacher} · ${item.startTime} – ${item.endTime}`}
                >
                  <span className="flex min-w-0 items-center gap-1 font-bold"><Icon className={cn('size-3.5 shrink-0', ICON_TONE[item.kind])} /><span className="truncate">{item.grade} {item.section} – {item.purpose}</span></span>
                  {!short && <span className="block truncate">Prof. {teacher}</span>}
                  {!short && <span className="block truncate">{item.startTime} – {item.endTime}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthBoard({ days, events, today, onPick }) {
  const first = parseISODate(days[0])
  const offset = (first.getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...days]
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-bold dark:bg-muted/60">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day} className="py-2">{day}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="min-h-24 border-r border-t border-border bg-muted/20" />
          const dayEvents = events.filter((item) => item.date === date)
          return (
            <button key={date} type="button" onClick={() => onPick(date)} className={cn('min-h-24 border-r border-t border-border p-1.5 text-left align-top hover:bg-muted/40', date === today && 'bg-slate-50 dark:bg-blue-500/10')}>
              <span className="text-xs font-bold">{Number(date.slice(8))}</span>
              <span className="mt-1 block space-y-0.5">
                {dayEvents.slice(0, 3).map((item) => (
                  <span key={item.id} className={cn('block truncate rounded border px-1 text-[10px] font-semibold', BLOCK[item.kind])}>{item.startTime} {item.grade}{item.section}</span>
                ))}
                {dayEvents.length > 3 && <span className="block text-[10px] text-muted-foreground">+{dayEvents.length - 3} más</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

