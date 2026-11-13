import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Eraser, Eye, FileSpreadsheet, FileText, Package, Pencil, Plus, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { FilterLabel, Select, todayLima } from '../attendance/shared'
import { ActivityDetail, RESOURCE_CATEGORIES, RESOURCE_STATUS, ReportForm, ResourceForm, dateLabel, dmy, opts, soles } from './shared'

/** Recursos e informes: what each activity needs (and costs) and the results report once it took place. */
export default function ResourcesReportsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('vista') === 'informes' ? 'reports' : 'resources'
  return (
    <div className="space-y-4">
      <PageHeader icon={Boxes} title="Recursos e informes" description="Recursos y presupuesto de cada actividad, e informes de resultados de las actividades realizadas." />
      <nav className="flex gap-1 border-b border-border" aria-label="Vistas">
        {[['resources', 'Recursos', Package, {}], ['reports', 'Informes de actividades', FileText, { vista: 'informes' }]].map(([value, label, Icon, query]) => (
          <button key={value} type="button" onClick={() => setParams(query)} aria-current={tab === value ? 'page' : undefined}
            className={cn('-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold', tab === value ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>
      {tab === 'resources' ? <ResourcesTab /> : <ReportsTab />}
    </div>
  )
}

function ResourcesTab() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const [resources, setResources] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const emptyFilters = { q: '', category: '', status: '', activity: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const today = todayLima()

  async function load() {
    const [resourceResult, activityResult] = await Promise.all([api('/api/activity-resources'), api(`/api/activities?from=${today.slice(0, 4)}-01-01&to=${today.slice(0, 4)}-12-31`)])
    setLoading(false)
    if (!resourceResult.ok || !activityResult.ok) return toast('No se pudieron cargar los recursos.', 'bad')
    setResources(resourceResult.resources)
    setActivities(activityResult.activities)
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return resources.filter((item) =>
      (!filters.category || item.category === filters.category)
      && (!filters.status || item.status === filters.status)
      && (!filters.activity || String(item.activityId) === filters.activity)
      && (!term || `${item.description} ${item.activityTitle} ${item.activityCode} ${item.provider}`.toLowerCase().includes(term)))
  }, [resources, filters])
  const cost = (list) => list.filter((item) => item.status !== 'No disponible').reduce((total, item) => total + (item.estimatedCost || 0) * item.quantity, 0)

  function exportData() {
    if (!visible.length) return toast('No hay recursos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión de actividades · Recursos',
      summary: [['Recursos', visible.length], ['Costo estimado', soles(cost(visible))]],
      headers: ['Actividad', 'Fecha', 'Categoría', 'Recurso', 'Cantidad', 'Unidad', 'Costo unitario', 'Subtotal', 'Estado', 'Proveedor / responsable'],
      widths: [36, 12, 14, 34, 9, 10, 13, 13, 13, 26],
      rows: visible.map((item) => [`${item.activityCode} · ${item.activityTitle}`, dmy(item.activityDate), item.category, item.description, item.quantity, item.unit,
        item.estimatedCost ?? '—', item.estimatedCost === null ? '—' : item.estimatedCost * item.quantity, item.status, item.provider || '—']),
    }).then(() => toast('Recursos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} value={resources.length} label="Recursos registrados" />
        <StatCard tone="amber" icon={Package} value={resources.filter((item) => item.status === 'Solicitado').length} label="Por aprobar" onClick={() => setFilters({ ...emptyFilters, status: 'Solicitado' })} />
        <StatCard tone="green" icon={Package} value={resources.filter((item) => item.status === 'Entregado').length} label="Entregados" onClick={() => setFilters({ ...emptyFilters, status: 'Entregado' })} />
        <StatCard tone="blue" icon={Wallet} value={soles(cost(resources))} label="Costo estimado total" />
      </div>
      <Panel title={`Recursos (${visible.length}) · ${soles(cost(visible))}`} icon={Package} action={(
        <span className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
          {canEdit && <Button type="button" size="sm" onClick={() => setAdding(true)}><Plus /> Nuevo recurso</Button>}
        </span>
      )}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <FilterLabel label="Buscar"><Input placeholder="Recurso, actividad o proveedor" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Categoría"><Select value={filters.category} onChange={(category) => setFilters({ ...filters, category })} options={opts(RESOURCE_CATEGORIES, 'Todas')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(RESOURCE_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Actividad"><Select value={filters.activity} onChange={(activity) => setFilters({ ...filters, activity })} options={[{ value: '', label: 'Todas' }, ...activities.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.title}` }))]} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay recursos con estos filtros.'}
          columns={[
            { key: 'description', label: 'Recurso', render: (item) => <span><span className="block font-medium">{item.description}</span><span className="text-xs text-muted-foreground">{item.category}{item.provider ? ` · ${item.provider}` : ''}</span></span> },
            { key: 'activity', label: 'Actividad', render: (item) => <span><span className="block">{item.activityTitle}</span><span className="text-xs text-muted-foreground">{item.activityCode} · {dmy(item.activityDate)}</span></span> },
            { key: 'quantity', label: 'Cantidad', render: (item) => `${item.quantity} ${item.unit}` },
            { key: 'cost', label: 'Costo estimado', render: (item) => (item.estimatedCost === null ? '—' : <span className="whitespace-nowrap">{soles(item.estimatedCost * item.quantity)}<span className="block text-xs text-muted-foreground">{soles(item.estimatedCost)} c/u</span></span>) },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (item) => <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar recurso" aria-label="Editar recurso" onClick={() => setEditing(item)}><Pencil /></Button> },
          ]}
        />
      </Panel>
      {editing && <ResourceForm activityId={editing.activityId} resource={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {adding && <PickActivity title="Nuevo recurso" activities={activities.filter((item) => !['Cancelada'].includes(item.status))} onClose={() => setAdding(false)}>
        {(activityId) => <ResourceForm activityId={activityId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      </PickActivity>}
    </>
  )
}

function ReportsTab() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const today = todayLima()
  const [reports, setReports] = useState([])
  const [activities, setActivities] = useState([])
  const [q, setQ] = useState('')
  const [writing, setWriting] = useState(null)
  const [opened, setOpened] = useState(null)

  async function load() {
    const [reportResult, activityResult] = await Promise.all([api('/api/activity-reports'), api(`/api/activities?from=${today.slice(0, 4)}-01-01&to=${today.slice(0, 4)}-12-31`)])
    if (!reportResult.ok || !activityResult.ok) return toast('No se pudieron cargar los informes.', 'bad')
    setReports(reportResult.reports)
    setActivities(activityResult.activities)
  }
  useEffect(() => { load() }, [])

  const term = q.trim().toLowerCase()
  const visible = reports.filter((item) => !term || `${item.activityCode} ${item.activityTitle} ${item.activityType}`.toLowerCase().includes(term))
  // Activities that already happened (or are marked done) and still have no report.
  const pending = activities.filter((item) => !item.hasReport && !['Cancelada', 'Postergada'].includes(item.status) && (item.status === 'Realizada' || item.endDate < today))

  function exportExcel() {
    if (!visible.length) return toast('No hay informes para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión de actividades · Informes de actividades',
      headers: ['Código', 'Actividad', 'Tipo', 'Nivel', 'Fecha', 'Participantes', 'Desarrollo', 'Logros', 'Dificultades', 'Recomendaciones', 'Evidencias'],
      widths: [10, 34, 16, 13, 12, 12, 46, 40, 36, 36, 36],
      rows: visible.map((item) => [item.activityCode, item.activityTitle, item.activityType, item.activityLevel, dmy(item.activityDate), item.participants ?? '—', item.summary, item.achievements, item.difficulties, item.recommendations, item.evidence]),
    }).then(() => toast('Informes exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportOnePdf(item) {
    exportTablePdf({
      title: `Informe de actividad · ${item.activityCode}`,
      subtitle: `${item.activityTitle} · ${item.activityType} · ${dmy(item.activityDate)}`,
      headers: ['Aspecto', 'Detalle'],
      rows: [['Fecha del informe', dmy(item.reportDate)], ['Participantes', item.participants ?? '—'], ['Desarrollo de la actividad', item.summary], ['Logros alcanzados', item.achievements],
        ['Dificultades', item.difficulties || '—'], ['Recomendaciones / mejoras', item.recommendations || '—'], ['Evidencias', item.evidence || '—'], ['Elaborado por', item.createdBy || '—']],
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } },
    }).then(() => toast('Informe exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  return (
    <>
      {pending.length > 0 && (
        <Panel title={`Actividades sin informe (${pending.length})`} icon={FileText} contentClassName="p-0">
          <ul className="divide-y divide-border text-sm">
            {pending.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.code} · {dateLabel(item)} · {item.status}</span></span>
                {canEdit && <Button type="button" size="sm" onClick={() => setWriting(item)}><FileText /> Elaborar informe</Button>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={`Informes registrados (${visible.length})`} icon={FileText} action={<Button type="button" variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>}>
        <div className="mb-4 max-w-sm"><Input placeholder="Buscar por actividad o tipo" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Buscar informes" /></div>
        <Table
          rows={visible}
          empty="Aún no hay informes registrados."
          columns={[
            { key: 'activity', label: 'Actividad', render: (item) => <span><span className="block font-medium">{item.activityTitle}</span><span className="text-xs text-muted-foreground">{item.activityCode} · {item.activityType}</span></span> },
            { key: 'date', label: 'Fecha', render: (item) => dmy(item.activityDate) },
            { key: 'participants', label: 'Participantes', render: (item) => item.participants ?? '—' },
            { key: 'achievements', label: 'Logros', render: (item) => <span className="line-clamp-2 max-w-80 text-xs">{item.achievements}</span> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver actividad e informe" aria-label="Ver informe" onClick={() => setOpened(item.activityId)}><Eye /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-[#b4413c]" title="Exportar informe a PDF" aria-label="Exportar informe a PDF" onClick={() => exportOnePdf(item)}><FileText /></Button>
              </span>
            ) },
          ]}
        />
      </Panel>
      {writing && <ReportForm activity={writing} onClose={() => setWriting(null)} onSaved={() => { setWriting(null); load() }} />}
      {opened && <ActivityDetail id={opened} initialTab="report" onClose={() => setOpened(null)} onChanged={load} />}
    </>
  )
}

/** Picks the activity, then renders `children(activityId)` (the form for it). */
function PickActivity({ title, activities, onClose, children }) {
  const [activityId, setActivityId] = useState('')
  const [ready, setReady] = useState(false)
  if (ready) return children(Number(activityId))
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Elige la actividad a la que pertenece.</DialogDescription>
        </DialogHeader>
        <Select value={activityId} onChange={setActivityId} options={[{ value: '', label: activities.length ? 'Seleccione una actividad' : 'No hay actividades' }, ...activities.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.title} (${dmy(item.startDate)})` }))]} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!activityId} onClick={() => setReady(true)}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
