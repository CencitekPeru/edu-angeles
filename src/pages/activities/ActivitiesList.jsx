import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen, CalendarCheck, CalendarDays, CheckCircle2, ChevronsLeft, ChevronsRight, CircleAlert, CirclePlay, Clock, Eraser, Eye, FileSpreadsheet, FileText,
  GraduationCap, Layers, Pencil, Plus, Search, Tag, Trash2, Users, UsersRound,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader } from '../campus/kit'
import { FilterLabel, Select, todayLima } from '../attendance/shared'
import { ACTIVITY_LEVELS, ACTIVITY_STATUS, ACTIVITY_TYPES, ActivityDetail, ActivityForm, opts, staffLevels, useCommissions } from './shared'
import { DeleteActivityDialog, LEVEL_VIEW, LevelBadge, STATUS_VIEW, StatusBadge, hoursLabel, peopleOf, styleOf } from './activityStyle'

const MONTHS_SHORT = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const shortDay = (iso) => `${iso.slice(8)} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
const longDay = (iso) => `${Number(iso.slice(8))} de ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`
const longDate = (item) => (item.endDate !== item.startDate ? `${longDay(item.startDate)} al ${longDay(item.endDate)}` : longDay(item.startDate))
/** "Comité de Gestión Pedagógica" → "Gestión Pedagógica" (the column already says it is a committee). */
const committeeShort = (name) => (name || '').replace(/^(comit[ée]|comisi[óo]n)\s+(de\s+(la\s+|los\s+|las\s+)?)?/i, '') || name
const PAGE_SIZES = [8, 10, 20, 50]
const PROGRAMMED = ['Planificada', 'En preparación']

const KPIS = [
  { key: 'total', label: 'Actividades registradas', icon: CalendarCheck, tone: 'bg-blue-50/70 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900', match: () => true },
  { key: 'programmed', label: 'Programadas', icon: CheckCircle2, tone: 'bg-emerald-50/70 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900', status: 'programadas', match: (item) => PROGRAMMED.includes(item.status) },
  { key: 'running', label: 'En ejecución', icon: CirclePlay, tone: 'bg-amber-50/70 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900', status: 'En ejecución', match: (item) => item.status === 'En ejecución' },
  { key: 'done', label: 'Realizadas', icon: CheckCircle2, tone: 'bg-sky-50/70 text-sky-700 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900', status: 'Realizada', match: (item) => item.status === 'Realizada' },
  { key: 'pending', label: 'Por programar', icon: CircleAlert, tone: 'bg-rose-50/70 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900', status: 'Postergada', match: (item) => item.status === 'Postergada' },
]

const STAFF_BOX = {
  Secundaria: { icon: GraduationCap, className: 'border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30', title: 'text-primary' },
  Primaria: { icon: BookOpen, className: 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30', title: 'text-emerald-800 dark:text-emerald-300' },
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="grid grid-cols-[1.25rem_5.5rem_1fr] items-start gap-1 text-sm">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <span className="font-semibold">{label}:</span>
      <span className="min-w-0 break-words">{children || '—'}</span>
    </div>
  )
}

/** Side card with the selected activity: data and the teachers assigned per level. */
function DetailPanel({ item, onOpen }) {
  if (!item) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Selecciona una actividad de la tabla para ver su detalle.</p>
  }
  const style = styleOf(item.type)
  const Icon = style.icon
  const levels = staffLevels(item.level).filter((level) => item.staff?.[level])
  const { leads } = peopleOf(item)
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border', style.chip)}><Icon className={cn('size-5', style.icon)} /></span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(item.id)} className="text-left text-base font-bold leading-tight hover:underline">{item.title}</button>
          <p className="text-xs text-muted-foreground">{item.code}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="space-y-2">
        <DetailRow icon={CalendarDays} label="Fecha">{longDate(item)}</DetailRow>
        <DetailRow icon={Clock} label="Horario">{hoursLabel(item)}</DetailRow>
        <DetailRow icon={Layers} label="Comité">{item.commissionName}</DetailRow>
        <DetailRow icon={Tag} label="Tipo">{item.type}</DetailRow>
        <DetailRow icon={Users} label="Nivel">{LEVEL_VIEW[item.level]?.long || item.level}</DetailRow>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><UsersRound className="size-4" /> Responsables asignados</h3>
        <div className="space-y-2">
          {levels.map((level) => {
            const box = STAFF_BOX[level]
            const LevelIcon = box.icon
            const staff = item.staff[level]
            return (
              <div key={level} className={cn('rounded-lg border p-3', box.className)}>
                <p className={cn('mb-1.5 flex items-center gap-2 text-sm font-bold', box.title)}><LevelIcon className="size-4" /> {level}</p>
                <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold">Principal:</span><span>{staff.lead || '—'}</span>
                  <span className="font-semibold">Apoyo:</span><span>{staff.support.length ? staff.support.map((name) => <span key={name} className="block">{name}</span>) : '—'}</span>
                </div>
              </div>
            )
          })}
          {!levels.length && <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">{leads.length ? `Responsable: ${leads.join(' / ')}` : 'Sin responsables asignados.'}</p>}
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => onOpen(item.id)}><Eye /> Ver tareas, recursos e informe</Button>
    </div>
  )
}

/** Actividades programadas: KPIs, filters, paginated table and a detail card of the selected activity. */
export default function ActivitiesList() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const [params, setParams] = useSearchParams()
  const today = todayLima()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const emptyFilters = { q: '', type: '', level: '', status: '', commission: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [pageSize, setPageSize] = useState(8)
  const [page, setPage] = useState(1)
  const [commissions] = useCommissions()
  const openedId = Number(params.get('actividad')) || null

  async function load() {
    setLoading(true)
    const result = await api(`/api/activities?from=${year}-01-01&to=${year}-12-31`)
    setLoading(false)
    if (result.ok) setActivities(result.activities)
    else toast(result.error || 'No se pudieron cargar las actividades.', 'bad')
  }
  useEffect(() => { load() }, [year])

  const set = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1) }
  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return activities.filter((item) => {
      const { leads, support } = peopleOf(item)
      return (!filters.type || item.type === filters.type)
        && (!filters.level || item.level === filters.level)
        && (!filters.status || (filters.status === 'programadas' ? PROGRAMMED.includes(item.status) : item.status === filters.status))
        && (!filters.commission || String(item.commissionId) === filters.commission)
        && (!term || `${item.code} ${item.title} ${item.commissionName} ${leads.join(' ')} ${support.join(' ')}`.toLowerCase().includes(term))
    })
  }, [activities, filters])

  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pages)
  const rows = visible.slice((current - 1) * pageSize, current * pageSize)
  const first = visible.length ? (current - 1) * pageSize + 1 : 0
  const pageButtons = (() => {
    const start = Math.max(1, Math.min(current - 2, pages - 4))
    return Array.from({ length: Math.min(5, pages) }, (_, index) => start + index)
  })()
  const selected = activities.find((item) => item.id === selectedId) || rows[0] || null

  const payload = () => ({
    title: `Gestión de actividades · Actividades programadas ${year}`,
    subtitle: `Año escolar ${year}`,
    summary: KPIS.map((kpi) => [kpi.label, activities.filter(kpi.match).length]),
    headers: ['N.°', 'Código', 'Actividad', 'Tipo', 'Fecha', 'Horario', 'Comité de gestión', 'Nivel', 'Responsable principal', 'Docentes de apoyo', 'Estado'],
    rows: visible.map((item, index) => {
      const { leads, support } = peopleOf(item)
      return [index + 1, item.code, item.title, item.type, longDate(item), hoursLabel(item), item.commissionName || '—', LEVEL_VIEW[item.level]?.long || item.level,
        leads.join(' / ') || '—', support.join(', ') || '—', STATUS_VIEW[item.status]?.label || item.status]
    }),
  })
  function exportExcel() {
    if (!visible.length) return toast('No hay actividades para exportar.', 'bad')
    exportTableXlsx({ ...payload(), widths: [6, 10, 34, 16, 24, 22, 28, 16, 28, 34, 14] }).then(() => toast('Actividades exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    if (!visible.length) return toast('No hay actividades para exportar.', 'bad')
    exportTablePdf({ ...payload(), fontSize: 7 }).then(() => toast('Actividades exportadas a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  const thisYear = Number(today.slice(0, 4))
  const years = [...new Set([thisYear - 2, thisYear - 1, thisYear, thisYear + 1, year])].sort()

  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarCheck} title={`Actividades Programadas ${year}`} description="Registro y gestión de las actividades institucionales del año escolar."
        actions={(
          <>
            <select value={year} onChange={(event) => { setYear(Number(event.target.value)); setPage(1); setSelectedId(null) }} aria-label="Año escolar"
              className="h-9 rounded-md border border-input bg-card px-2.5 text-sm font-semibold shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
              {years.map((value) => <option key={value} value={value}>Año {value}</option>)}
            </select>
            <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
            {canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Nueva actividad</Button>}
          </>
        )} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon
          const active = kpi.status && filters.status === kpi.status
          return (
            <button key={kpi.key} type="button" onClick={() => set({ status: kpi.status && !active ? kpi.status : '' })} aria-pressed={Boolean(active)}
              title={kpi.status ? (active ? 'Quitar filtro' : `Ver solo: ${kpi.label}`) : 'Ver todas'}
              className={cn('flex items-center gap-3 rounded-xl p-3.5 text-left ring-1 transition-shadow hover:shadow-sm', kpi.tone, active && 'ring-2')}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card shadow-xs"><Icon className="size-6" /></span>
              <span>
                <span className="block text-2xl font-extrabold leading-none text-foreground">{activities.filter(kpi.match).length}</span>
                <span className="mt-1 block text-xs font-medium text-foreground/80">{kpi.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border border-border bg-card p-3">
          <div className="mb-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <label className="relative block sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar actividad…" aria-label="Buscar actividad" value={filters.q} onChange={(event) => set({ q: event.target.value })} />
            </label>
            <FilterLabel label="Comité de gestión"><Select value={filters.commission} onChange={(commission) => set({ commission })} options={[{ value: '', label: 'Todos' }, ...commissions.map((item) => ({ value: String(item.id), label: item.name }))]} /></FilterLabel>
            <FilterLabel label="Tipo de actividad"><Select value={filters.type} onChange={(type) => set({ type })} options={opts(ACTIVITY_TYPES, 'Todos')} /></FilterLabel>
            <FilterLabel label="Nivel / Alcance"><Select value={filters.level} onChange={(level) => set({ level })} options={[{ value: '', label: 'Todos' }, ...ACTIVITY_LEVELS.map((value) => ({ value, label: LEVEL_VIEW[value].long }))]} /></FilterLabel>
            <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => set({ status })} options={[{ value: '', label: 'Todos' }, { value: 'programadas', label: 'Programadas (todas)' }, ...ACTIVITY_STATUS.map((value) => ({ value, label: STATUS_VIEW[value].label }))]} /></FilterLabel>
            <Button type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setPage(1) }}><Eraser /> Limpiar</Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-foreground dark:bg-muted/40">
                <tr>
                  <th className="w-12 px-3 py-2.5 text-center">N.°</th>
                  <th className="px-3 py-2.5">Actividad</th>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Comité de gestión</th>
                  <th className="px-3 py-2.5 text-center">Nivel</th>
                  <th className="px-3 py-2.5">Responsable principal</th>
                  <th className="px-3 py-2.5 text-center">Estado</th>
                  <th className="px-3 py-2.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item, index) => {
                  const style = styleOf(item.type)
                  const Icon = style.icon
                  const { leads } = peopleOf(item)
                  return (
                    <tr key={item.id} onClick={() => setSelectedId(item.id)} aria-selected={selected?.id === item.id}
                      className={cn('cursor-pointer transition-colors hover:bg-muted/40', selected?.id === item.id && 'bg-primary/[0.05]')}>
                      <td className={cn('border-l-4 px-3 py-2.5 text-center font-semibold', style.bar)}>{first + index}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Icon className={cn('size-5 shrink-0', style.icon)} />
                          <span className={cn('font-semibold leading-tight', ['Cancelada'].includes(item.status) && 'line-through text-muted-foreground')}>{item.title}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-muted-foreground" /> {shortDay(item.startDate)}</span>
                        {item.endDate !== item.startDate && <span className="block pl-5.5 text-xs text-muted-foreground">al {shortDay(item.endDate)}</span>}
                      </td>
                      <td className="max-w-48 px-3 py-2.5 leading-tight" title={item.commissionName}>{committeeShort(item.commissionName) || '—'}</td>
                      <td className="px-3 py-2.5 text-center"><LevelBadge level={item.level} /></td>
                      <td className="px-3 py-2.5 leading-tight">{leads.length ? leads.map((name) => <span key={name} className="block">{name}</span>) : '—'}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={item.status} /></td>
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <span className="flex items-center justify-center gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver actividad" aria-label={`Ver ${item.title}`} onClick={() => setParams({ actividad: String(item.id) })}><Eye /></Button>
                          {canEdit && (
                            <>
                              <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Editar" aria-label={`Editar ${item.title}`} onClick={() => setEditing(item)}><Pencil /></Button>
                              <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" title="Eliminar" aria-label={`Eliminar ${item.title}`} onClick={() => setDeleting(item)}><Trash2 /></Button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">{loading ? 'Cargando…' : 'No hay actividades con estos filtros.'}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Mostrando {first} a {first ? first + rows.length - 1 : 0} de {visible.length} registros</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                Filas por página:
                <Select className="w-20" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1) }} options={PAGE_SIZES.map((value) => ({ value: String(value), label: String(value) }))} />
              </label>
              <nav className="flex items-center gap-1" aria-label="Paginación">
                <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Primera página" disabled={current === 1} onClick={() => setPage(1)}><ChevronsLeft /></Button>
                {pageButtons.map((number) => (
                  <Button key={number} type="button" variant={number === current ? 'default' : 'outline'} size="icon" className="size-8" aria-current={number === current ? 'page' : undefined} onClick={() => setPage(number)}>{number}</Button>
                ))}
                <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Última página" disabled={current === pages} onClick={() => setPage(pages)}><ChevronsRight /></Button>
              </nav>
            </div>
          </div>
        </section>

        <aside className="self-start rounded-xl border border-border bg-card">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-base font-bold text-primary"><CalendarDays className="size-5" /> Detalle de la actividad</h2>
          <DetailPanel item={selected} onOpen={(id) => setParams({ actividad: String(id) })} />
        </aside>
      </div>

      {creating && <ActivityForm onClose={() => setCreating(false)} onSaved={(result) => { setCreating(false); load(); if (result.id) setSelectedId(result.id) }} />}
      {editing && <ActivityForm activity={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {deleting && <DeleteActivityDialog activity={deleting} onClose={() => setDeleting(null)} onDeleted={load} />}
      {openedId && <ActivityDetail key={openedId} id={openedId} onClose={() => setParams({})} onChanged={load} />}
    </div>
  )
}
