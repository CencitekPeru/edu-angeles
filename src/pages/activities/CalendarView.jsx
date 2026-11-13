import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill } from '../campus/kit'
import { FilterLabel, Select, todayLima } from '../attendance/shared'
import { ACTIVITY_LEVELS, ACTIVITY_TYPES, ActivityDetail, ActivityForm, opts, timeLabel } from './shared'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/** Calendario institucional: month view of every activity (multi-day ones appear on each of their days). */
export default function ActivitiesCalendar() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const today = todayLima()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [filters, setFilters] = useState({ type: '', level: '', status: '' })
  const [activities, setActivities] = useState([])
  const [opened, setOpened] = useState(null)
  const [creatingOn, setCreatingOn] = useState(null)

  const daysInMonth = new Date(month.y, month.m, 0).getDate()
  const first = iso(month.y, month.m, 1)
  const last = iso(month.y, month.m, daysInMonth)
  async function load() {
    const result = await api(`/api/activities?from=${first}&to=${last}`)
    if (result.ok) setActivities(result.activities)
    else toast(result.error || 'No se pudo cargar el calendario.', 'bad')
  }
  useEffect(() => { load() }, [first])

  const visible = useMemo(() => activities.filter((item) =>
    (!filters.type || item.type === filters.type)
    && (!filters.level || item.level === filters.level || item.level === 'Institucional')
    && (!filters.status || item.status === filters.status)), [activities, filters])

  const offset = (new Date(month.y, month.m - 1, 1).getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => iso(month.y, month.m, index + 1))]
  while (cells.length % 7) cells.push(null)
  const move = (delta) => setMonth(({ y, m }) => { const date = new Date(y, m - 1 + delta, 1); return { y: date.getFullYear(), m: date.getMonth() + 1 } })
  const title = new Date(month.y, month.m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarDays} title="Calendario institucional" description="Actividades cívicas, académicas, culturales y deportivas de la institución."
        actions={canEdit && <Button type="button" onClick={() => setCreatingOn(today)}><Plus /> Registrar actividad</Button>} />

      <Panel title={<span className="capitalize">{title}</span>} icon={CalendarDays} action={(
        <span className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft /></Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) })}>Hoy</Button>
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight /></Button>
        </span>
      )}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          <FilterLabel label="Tipo"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(ACTIVITY_TYPES, 'Todos los tipos')} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(ACTIVITY_LEVELS, 'Todos los niveles')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(['Planificada', 'En preparación', 'En ejecución', 'Realizada', 'Postergada', 'Cancelada'], 'Todos los estados')} /></FilterLabel>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border border-border">
            {WEEKDAYS.map((day) => <div key={day} className="border-b border-border bg-slate-50 py-2 text-center text-xs font-bold dark:bg-muted/40">{day}</div>)}
            {cells.map((date, index) => {
              const items = date ? visible.filter((item) => item.startDate <= date && item.endDate >= date) : []
              return (
                <div key={date || `empty-${index}`} className={cn('min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n+7)]:border-r-0', !date && 'bg-muted/20', date === today && 'bg-primary/5')}>
                  {date && (
                    <>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={cn('flex size-6 items-center justify-center rounded-full text-xs font-semibold', date === today && 'bg-primary text-primary-foreground')}>{Number(date.slice(8))}</span>
                        {canEdit && <button type="button" className="rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground" aria-label={`Registrar actividad el ${date}`} title="Registrar actividad este día" onClick={() => setCreatingOn(date)}><Plus className="size-3.5" /></button>}
                      </div>
                      <ul className="space-y-1">
                        {items.slice(0, 4).map((item) => (
                          <li key={item.id}>
                            <button type="button" onClick={() => setOpened(item.id)} title={`${item.title} · ${timeLabel(item)} · ${item.status}`}
                              className={cn('w-full truncate rounded border-l-[3px] bg-card px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs hover:bg-muted',
                                ['Cancelada', 'Postergada'].includes(item.status) ? 'border-l-slate-400 text-muted-foreground line-through' : item.status === 'Realizada' ? 'border-l-[#3f7d5c]' : 'border-l-primary')}>
                              <span className="font-semibold">{item.startTime && item.startDate === date ? `${item.startTime} ` : ''}</span>{item.title}
                            </button>
                          </li>
                        ))}
                        {items.length > 4 && <li className="px-1 text-[11px] text-muted-foreground">+{items.length - 4} más</li>}
                      </ul>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-primary" /> Programada</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-[#3f7d5c]" /> Realizada</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-slate-400" /> Postergada o cancelada</span>
        </p>
      </Panel>

      <Panel title={`Actividades del mes (${visible.length})`} icon={CalendarDays} contentClassName="p-0">
        <ul className="divide-y divide-border text-sm">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setOpened(item.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-2.5 text-left hover:bg-muted/40">
                <span className="w-24 shrink-0 font-semibold">{item.startDate.slice(8)}{item.endDate !== item.startDate ? `–${item.endDate.slice(8)}` : ''} <span className="font-normal capitalize text-muted-foreground">{new Date(`${item.startDate}T12:00`).toLocaleDateString('es-PE', { weekday: 'short' })}</span></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.type} · {item.level} · {timeLabel(item)}</span></span>
                <Pill value={item.status} />
              </button>
            </li>
          ))}
          {!visible.length && <li className="px-5 py-6 text-center text-muted-foreground">No hay actividades en este mes.</li>}
        </ul>
      </Panel>

      {creatingOn && <ActivityForm date={creatingOn} onClose={() => setCreatingOn(null)} onSaved={() => { setCreatingOn(null); load() }} />}
      {opened && <ActivityDetail id={opened} onClose={() => setOpened(null)} onChanged={load} />}
    </div>
  )
}
