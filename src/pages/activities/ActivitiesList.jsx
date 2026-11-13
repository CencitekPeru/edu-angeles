import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarRange, Eraser, Eye, FileSpreadsheet, FileText, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, Table } from '../campus/kit'
import { FilterLabel, Select, todayLima } from '../attendance/shared'
import { ACTIVITY_LEVELS, ACTIVITY_STATUS, ACTIVITY_TYPES, ActivityDetail, ActivityForm, Progress, dateLabel, dmy, opts, soles, timeLabel, useCommissions } from './shared'

/** Actividades programadas: every activity of the period, with filters, register / edit and exports. */
export default function ActivitiesList() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const [params, setParams] = useSearchParams()
  const today = todayLima()
  const [range, setRange] = useState({ from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` })
  const emptyFilters = { q: '', type: '', level: '', status: '', commission: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [commissions] = useCommissions()
  const openedId = Number(params.get('actividad')) || null

  async function load() {
    setLoading(true)
    const result = await api(`/api/activities?${new URLSearchParams(range)}`)
    setLoading(false)
    if (result.ok) setActivities(result.activities)
    else toast(result.error || 'No se pudieron cargar las actividades.', 'bad')
  }
  useEffect(() => { load() }, [range.from, range.to])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return activities.filter((item) =>
      (!filters.type || item.type === filters.type)
      && (!filters.level || item.level === filters.level)
      && (!filters.status || item.status === filters.status)
      && (!filters.commission || String(item.commissionId) === filters.commission)
      && (!term || `${item.code} ${item.title} ${item.place} ${item.responsible} ${item.commissionName}`.toLowerCase().includes(term)))
  }, [activities, filters])

  const payload = () => ({
    title: 'Gestión de actividades · Actividades programadas',
    subtitle: `Del ${dmy(range.from)} al ${dmy(range.to)}`,
    summary: [['Actividades', visible.length], ['Realizadas', visible.filter((item) => item.status === 'Realizada').length]],
    headers: ['Código', 'Actividad', 'Tipo', 'Nivel', 'Fecha', 'Horario', 'Lugar', 'Comisión', 'Responsable', 'Estado', 'Avance', 'Presupuesto'],
    rows: visible.map((item) => [item.code, item.title, item.type, item.level, dateLabel(item), timeLabel(item), item.place || '—', item.commissionName || '—',
      item.responsible || '—', item.status, item.tasks.progress === null ? '—' : `${item.tasks.progress} %`, soles(item.budget)]),
  })
  function exportExcel() {
    if (!visible.length) return toast('No hay actividades para exportar.', 'bad')
    exportTableXlsx({ ...payload(), widths: [10, 36, 16, 13, 20, 14, 22, 26, 24, 14, 9, 13] }).then(() => toast('Actividades exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    if (!visible.length) return toast('No hay actividades para exportar.', 'bad')
    exportTablePdf({ ...payload(), fontSize: 7 }).then(() => toast('Actividades exportadas a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarRange} title="Actividades programadas" description="Registro y consulta de las actividades institucionales del periodo."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
            {canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Registrar actividad</Button>}
          </>
        )} />

      <Panel title={`Actividades (${visible.length})`} icon={CalendarRange}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <FilterLabel label="Buscar" className="sm:col-span-2"><Input placeholder="Código, actividad, lugar o responsable" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <FilterLabel label="Tipo"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(ACTIVITY_TYPES, 'Todos')} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(ACTIVITY_LEVELS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(ACTIVITY_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Comisión"><Select value={filters.commission} onChange={(commission) => setFilters({ ...filters, commission })} options={[{ value: '', label: 'Todas' }, ...commissions.map((item) => ({ value: String(item.id), label: item.name }))]} /></FilterLabel>
          <div className="flex items-end xl:col-start-8"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay actividades con estos filtros.'}
          columns={[
            { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap">{dateLabel(item)}<span className="block text-xs text-muted-foreground">{timeLabel(item)}</span></span> },
            { key: 'title', label: 'Actividad', render: (item) => <span><span className="block font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.code} · {item.type} · {item.level}</span></span> },
            { key: 'place', label: 'Lugar', render: (item) => item.place || '—' },
            { key: 'owner', label: 'Comisión / responsable', render: (item) => <span><span className="block">{item.commissionName || '—'}</span><span className="text-xs text-muted-foreground">{item.responsible}</span></span> },
            { key: 'progress', label: 'Avance', render: (item) => <span><Progress value={item.tasks.progress} />{item.tasks.overdue > 0 && <span className="text-xs font-semibold text-destructive">{item.tasks.overdue} vencida(s)</span>}</span> },
            { key: 'status', label: 'Estado', render: (item) => <span className="flex flex-col items-start gap-1"><Pill value={item.status} />{item.hasReport && <span className="text-[11px] text-muted-foreground">Con informe</span>}</span> },
            { key: 'actions', label: 'Acciones', render: (item) => <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver actividad" aria-label={`Ver ${item.title}`} onClick={() => setParams({ actividad: String(item.id) })}><Eye /></Button> },
          ]}
        />
      </Panel>

      {creating && <ActivityForm onClose={() => setCreating(false)} onSaved={(result) => { setCreating(false); load(); if (result.id) setParams({ actividad: String(result.id) }) }} />}
      {openedId && <ActivityDetail key={openedId} id={openedId} onClose={() => setParams({})} onChanged={load} />}
    </div>
  )
}
