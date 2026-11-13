import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, LayoutGrid, List, Pencil, Plus, Trash2, User, Users, UsersRound } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { SCHOOL } from '../../lib/school'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PageHeader } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import { ActivityDetail, ActivityForm, timeLabel } from './shared'
import { DeleteActivityDialog, MAIN_TYPES, inactive, peopleOf, styleOf } from './activityStyle'

/* ---------------------------------------------------------------- dates */

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = (n) => String(n).padStart(2, '0')
const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const fromIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12) }
const addDays = (iso, days) => { const date = fromIso(iso); date.setDate(date.getDate() + days); return toIso(date) }
const mondayOf = (iso) => addDays(iso, -((fromIso(iso).getDay() + 6) % 7))
const weekdayShort = (iso) => WEEKDAYS[(fromIso(iso).getDay() + 6) % 7]
const isSunday = (iso) => fromIso(iso).getDay() === 0

/** Full weeks (Monday to Sunday) that cover a month, including the neighbouring days. */
function monthCells(y, m) {
  const first = `${y}-${pad(m)}-01`
  const last = toIso(new Date(y, m, 0, 12))
  const cells = []
  for (let day = mondayOf(first); day <= last || cells.length % 7; day = addDays(day, 1)) cells.push(day)
  return cells
}

/* ---------------------------------------------------------------- views */

const VIEWS = [
  { value: 'month', label: 'Mes', icon: CalendarDays },
  { value: 'week', label: 'Semana', icon: CalendarRange },
  { value: 'list', label: 'Lista', icon: List },
  { value: 'year', label: 'Año', icon: LayoutGrid },
]

function Chip({ item, onOpen, faded }) {
  const style = styleOf(item.type)
  const Icon = style.icon
  return (
    <button type="button" onClick={() => onOpen(item.id)} title={`${item.title} · ${timeLabel(item)} · ${item.status}`}
      className={cn('flex w-full items-start gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold leading-tight transition-colors hover:brightness-95', style.chip,
        (faded || inactive(item)) && 'opacity-55', inactive(item) && 'line-through')}>
      <Icon className={cn('mt-px size-3.5 shrink-0', style.icon)} />
      <span className="line-clamp-3">{item.title}</span>
    </button>
  )
}

function MonthGrid({ y, m, today, items, onOpen, onCreate, canEdit }) {
  const cells = monthCells(y, m)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 bg-primary text-primary-foreground">
          {WEEKDAYS.map((day) => <div key={day} className={cn('py-2.5 text-center text-sm font-bold', day === 'Sáb' && 'text-sky-200')}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const outside = Number(date.slice(5, 7)) !== m
            const dayItems = items.filter((item) => item.startDate <= date && item.endDate >= date)
            return (
              <div key={date} className={cn('group min-h-[6.5rem] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0', outside && 'bg-muted/30', date === today && 'bg-primary/[0.04]')}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-sm font-bold',
                    outside ? 'text-muted-foreground/60' : isSunday(date) ? 'text-[#b4443c]' : 'text-foreground',
                    outside && isSunday(date) && 'text-[#b4443c]/50',
                    date === today && 'bg-primary text-primary-foreground')}>{Number(date.slice(8))}</span>
                  {canEdit && (
                    <button type="button" className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Registrar actividad el ${date}`} title="Registrar actividad este día" onClick={() => onCreate(date)}><Plus className="size-3.5" /></button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 2).map((item) => <Chip key={item.id} item={item} onOpen={onOpen} faded={outside} />)}
                  {dayItems.length > 2 && <p className="px-1 text-[11px] font-medium text-muted-foreground">+{dayItems.length - 2} más</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekGrid({ start, today, items, onOpen, onCreate, canEdit }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-border bg-card">
        {days.map((date, index) => {
          const dayItems = items.filter((item) => item.startDate <= date && item.endDate >= date)
          return (
            <div key={date} className={cn('flex min-h-[22rem] flex-col border-r border-border last:border-r-0', date === today && 'bg-primary/[0.04]')}>
              <div className={cn('bg-primary py-2 text-center text-primary-foreground', index === 5 && 'text-sky-200')}>
                <p className="text-xs font-semibold">{WEEKDAYS[index]}</p>
                <p className="text-lg font-extrabold leading-tight">{Number(date.slice(8))}</p>
              </div>
              <div className="flex-1 space-y-1.5 p-1.5">
                {dayItems.map((item) => (
                  <div key={item.id}>
                    <Chip item={item} onOpen={onOpen} />
                    <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">{timeLabel(item)}</p>
                  </div>
                ))}
                {canEdit && (
                  <button type="button" onClick={() => onCreate(date)} className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Plus className="size-3" /> Agregar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function YearGrid({ y, today, items, onPickMonth }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((name, index) => {
        const m = index + 1
        const cells = monthCells(y, m)
        const count = items.filter((item) => item.startDate.slice(0, 7) <= `${y}-${pad(m)}` && item.endDate.slice(0, 7) >= `${y}-${pad(m)}`).length
        return (
          <div key={name} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => onPickMonth(m)} className="flex w-full items-center justify-between bg-primary px-3 py-2 text-left text-sm font-bold text-primary-foreground hover:bg-primary/90">
              {name}<span className="text-xs font-medium opacity-80">{count} {count === 1 ? 'actividad' : 'actividades'}</span>
            </button>
            <div className="grid grid-cols-7 gap-y-0.5 p-2 text-center text-[11px]">
              {WEEKDAYS.map((day) => <span key={day} className="font-semibold text-muted-foreground">{day[0]}</span>)}
              {cells.map((date) => {
                const outside = Number(date.slice(5, 7)) !== m
                const first = outside ? null : items.find((item) => item.startDate <= date && item.endDate >= date)
                return (
                  <span key={date} className="flex flex-col items-center py-0.5">
                    <span className={cn('flex size-5 items-center justify-center rounded-full', outside && 'invisible', isSunday(date) && 'text-[#b4443c]', date === today && 'bg-primary font-bold text-primary-foreground')}>{Number(date.slice(8))}</span>
                    <span className={cn('size-1 rounded-full', first ? styleOf(first.type).dot : 'bg-transparent')} title={first?.title} />
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Activity row with coloured date badge, committee and the people in charge. */
function ActivityRow({ item, onOpen, onEdit, onDelete, canEdit }) {
  const style = styleOf(item.type)
  const { leads, support } = peopleOf(item)
  return (
    <li className={cn('flex gap-3 rounded-lg border border-border border-l-4 bg-card p-2.5', style.bar, inactive(item) && 'opacity-70')}>
      <button type="button" onClick={() => onOpen(item.id)} className={cn('flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border', style.chip)} aria-label={`Abrir ${item.title}`}>
        <span className="text-[11px] font-semibold">{weekdayShort(item.startDate)}</span>
        <span className="text-xl font-extrabold leading-none">{item.startDate.slice(8)}</span>
      </button>
      <div className="min-w-0 flex-1 space-y-0.5 text-xs text-muted-foreground">
        <button type="button" onClick={() => onOpen(item.id)} className={cn('block text-left text-sm font-bold text-foreground hover:underline', inactive(item) && 'line-through')}>
          {item.title}
        </button>
        {item.commissionName && <p className="flex items-center gap-1.5"><Users className="size-3.5 shrink-0" /> {item.commissionName}</p>}
        {leads.length > 0 && <p className="flex items-start gap-1.5"><User className="mt-px size-3.5 shrink-0" /> <span>{support.length ? 'Resp. principal' : 'Resp.'}: {leads.join(' / ')}</span></p>}
        {support.length > 0 && <p className="flex items-start gap-1.5"><UsersRound className="mt-px size-3.5 shrink-0" /> <span>Apoyo: {support.join(', ')}</span></p>}
        {(item.endDate !== item.startDate || inactive(item)) && <p className="text-[11px]">{item.endDate !== item.startDate ? `Hasta el ${Number(item.endDate.slice(8))}/${item.endDate.slice(5, 7)} · ` : ''}{inactive(item) ? item.status : ''}</p>}
      </div>
      {canEdit && (
        <span className="flex shrink-0 items-start gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="size-7 text-primary" aria-label={`Editar ${item.title}`} title="Editar" onClick={() => onEdit(item)}><Pencil className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" aria-label={`Eliminar ${item.title}`} title="Eliminar" onClick={() => onDelete(item)}><Trash2 className="size-4" /></Button>
        </span>
      )}
    </li>
  )
}

/* ----------------------------------------------------------------- page */

/** Calendario institucional: month, week, list and year views of every activity. */
export default function ActivitiesCalendar() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const today = todayLima()
  const [cursor, setCursor] = useState(today)
  const [view, setView] = useState('month')
  const [typeFilter, setTypeFilter] = useState('')
  const [activities, setActivities] = useState([])
  const [opened, setOpened] = useState(null)
  const [creatingOn, setCreatingOn] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const y = Number(cursor.slice(0, 4))
  const m = Number(cursor.slice(5, 7))
  async function load() {
    // The whole school year plus the days of the neighbouring months shown in the grid.
    const result = await api(`/api/activities?from=${y - 1}-12-20&to=${y + 1}-01-10`)
    if (result.ok) setActivities(result.activities)
    else toast(result.error || 'No se pudo cargar el calendario.', 'bad')
  }
  useEffect(() => { load() }, [y])

  const filtered = useMemo(() => activities.filter((item) => !typeFilter || item.type === typeFilter), [activities, typeFilter])
  const weekStart = mondayOf(cursor)
  const range = view === 'week'
    ? { from: weekStart, to: addDays(weekStart, 6), title: `Semana del ${Number(weekStart.slice(8))} de ${MONTHS[Number(weekStart.slice(5, 7)) - 1].toLowerCase()}` }
    : view === 'year'
      ? { from: `${y}-01-01`, to: `${y}-12-31`, title: `${y}` }
      : { from: `${y}-${pad(m)}-01`, to: toIso(new Date(y, m, 0, 12)), title: `${MONTHS[m - 1]} ${y}` }
  const inRange = filtered.filter((item) => item.startDate <= range.to && item.endDate >= range.from)
  const legendTypes = [...new Set([...MAIN_TYPES, ...activities.filter((item) => item.startDate.startsWith(String(y))).map((item) => item.type)])]

  function move(delta) {
    if (view === 'week') return setCursor(addDays(cursor, 7 * delta))
    if (view === 'year') return setCursor(`${y + delta}-${pad(m)}-01`)
    const date = new Date(y, m - 1 + delta, 1, 12)
    return setCursor(toIso(date))
  }
  const years = [...new Set([Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1, Number(today.slice(0, 4)) + 2, y])].sort()

  const rowProps = { onOpen: setOpened, onEdit: setEditing, onDelete: setDeleting, canEdit }
  const sidePanel = view === 'month' || view === 'week'

  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarDays} title={`Calendario Institucional ${y}`} description={`Programación anual de actividades, eventos y fechas importantes de la ${SCHOOL.name}.`}
        actions={(
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold shadow-xs">
            <CalendarDays className="size-4 text-muted-foreground" />
            Año escolar:
            <select value={y} onChange={(event) => setCursor(`${event.target.value}-${pad(m)}-01`)} className="bg-transparent font-bold outline-none" aria-label="Año escolar">
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        )} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs">
          <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" aria-label="Anterior" onClick={() => move(-1)}><ChevronLeft /></Button>
          <button type="button" onClick={() => setCursor(today)} title="Ir a hoy" className="flex min-w-44 items-center justify-center gap-2 rounded-md px-3 py-1 text-base font-bold hover:bg-muted">
            <CalendarDays className="size-4 text-muted-foreground" /> {range.title}
          </button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" aria-label="Siguiente" onClick={() => move(1)}><ChevronRight /></Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs" role="tablist" aria-label="Vista del calendario">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', view === value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {canEdit ? <Button type="button" onClick={() => setCreatingOn(cursor.slice(0, 7) === today.slice(0, 7) ? today : cursor)}><Plus /> Nueva actividad</Button> : <span />}
      </div>

      <div className={cn('grid gap-4', sidePanel && 'xl:grid-cols-[minmax(0,1fr)_400px]')}>
        <div className="min-w-0">
          {view === 'month' && <MonthGrid y={y} m={m} today={today} items={filtered} onOpen={setOpened} onCreate={setCreatingOn} canEdit={canEdit} />}
          {view === 'week' && <WeekGrid start={weekStart} today={today} items={filtered} onOpen={setOpened} onCreate={setCreatingOn} canEdit={canEdit} />}
          {view === 'year' && <YearGrid y={y} today={today} items={filtered} onPickMonth={(month) => { setCursor(`${y}-${pad(month)}-01`); setView('month') }} />}
          {view === 'list' && (
            <section className="rounded-xl border border-border bg-card p-3">
              <h2 className="mb-3 flex items-center gap-2 px-1 text-base font-bold text-primary"><List className="size-5" /> Actividades de {range.title.toLowerCase()} ({inRange.length})</h2>
              <ul className="grid gap-2 lg:grid-cols-2">{inRange.map((item) => <ActivityRow key={item.id} item={item} {...rowProps} />)}</ul>
              {!inRange.length && <p className="py-8 text-center text-sm text-muted-foreground">No hay actividades en este mes.</p>}
            </section>
          )}
        </div>

        {sidePanel && (
          <aside className="flex flex-col rounded-xl border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-base font-bold text-primary">
              <CalendarRange className="size-5" /> {view === 'week' ? 'Actividades de la semana' : `Actividades de ${range.title.toLowerCase()}`}
            </h2>
            <ul className="max-h-[34rem] flex-1 space-y-2 overflow-y-auto p-3">
              {inRange.map((item) => <ActivityRow key={item.id} item={item} {...rowProps} />)}
              {!inRange.length && <li className="py-8 text-center text-sm text-muted-foreground">No hay actividades programadas.</li>}
            </ul>
          </aside>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
        <span className="font-bold">Leyenda:</span>
        {legendTypes.map((type) => (
          <button key={type} type="button" onClick={() => setTypeFilter(typeFilter === type ? '' : type)} aria-pressed={typeFilter === type}
            title={typeFilter === type ? 'Mostrar todos los tipos' : `Mostrar solo: ${type}`}
            className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors hover:bg-muted', typeFilter === type && 'bg-muted font-semibold ring-1 ring-border', typeFilter && typeFilter !== type && 'opacity-50')}>
            <span className={cn('size-2.5 rounded-full', styleOf(type).dot)} /> {styleOf(type).label}
          </button>
        ))}
        {typeFilter && <button type="button" className="ml-auto text-primary hover:underline" onClick={() => setTypeFilter('')}>Quitar filtro</button>}
      </div>

      {creatingOn && <ActivityForm date={creatingOn} onClose={() => setCreatingOn(null)} onSaved={() => { setCreatingOn(null); load() }} />}
      {editing && <ActivityForm activity={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {opened && <ActivityDetail id={opened} onClose={() => setOpened(null)} onChanged={load} />}
      {deleting && <DeleteActivityDialog activity={deleting} onClose={() => setDeleting(null)} onDeleted={load} />}
    </div>
  )
}
