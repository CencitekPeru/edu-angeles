import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  Armchair,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  ClipboardList,
  Equal,
  Eye,
  FileText,
  Filter,
  Laptop,
  ListChecks,
  Monitor,
  Pencil,
  PlusCircle,
  Printer,
  Projector,
  RefreshCw,
  Router,
  Search,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, StatCard, Table } from './kit'
import { IncidentForm } from './IncidentForm'
import { FilterLabel, Select, allOption } from '../attendance/shared'
import { TONE, CHIP_BASE } from '../../lib/tones'

const PRIORITY = {
  alta: { label: 'Alta', icon: ChevronsUp, tone: TONE.bad.chip },
  media: { label: 'Media', icon: Equal, tone: TONE.warn.chip },
  baja: { label: 'Baja', icon: ChevronsDown, tone: TONE.ok.chip },
}

function PriorityChip({ value }) {
  const item = PRIORITY[value] || PRIORITY.media
  const Icon = item.icon
  return <span className={cn(CHIP_BASE, item.tone)}><Icon aria-hidden="true" />{item.label}</span>
}

/** Incidents in "registrada" are shown as pending, the same as the stat card. */
function IncidentStatus({ value }) {
  return <Pill value={value === 'registrada' ? 'pendiente' : value} />
}

function AssetIcon({ row }) {
  const type = String(row.assetType || '').toLowerCase()
  let Icon = Monitor
  if (row.assetKind === 'mobiliario') Icon = Armchair
  else if (type.includes('port') || type.includes('laptop') || type.includes('tablet')) Icon = Laptop
  else if (type.includes('proyect')) Icon = Projector
  else if (type.includes('impres')) Icon = Printer
  else if (type.includes('router') || type.includes('switch') || type.includes('access')) Icon = Router
  return <Icon className="size-5 shrink-0 text-foreground/70" aria-hidden="true" />
}

function splitDetected(value) {
  const [date = '', time = ''] = String(value || '').split('T')
  const [y, m, d] = date.split('-')
  return { date: d ? `${d}/${m}/${y}` : '—', time: time && time !== '00:00' ? time.slice(0, 5) : '' }
}

export function IncidentsPage() {
  const { user, toast } = useApp()
  const admin = user.role === 'admin'
  const [rows, setRows] = useState([])
  const [all, setAll] = useState([])
  const [equipment, setEquipment] = useState([])
  const [materials, setMaterials] = useState([])
  const [places, setPlaces] = useState([])
  const [users, setUsers] = useState([])
  const [formRow, setFormRow] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [filters, setFilters] = useState({ q: '', status: '', place: '', level: '', from: '', to: '' })

  async function load() {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    const [list, everything, gear, furniture, site, people] = await Promise.all([
      api(`/api/incidents?${params}`),
      api('/api/incidents'),
      api('/api/equipment'),
      api('/api/materials'),
      api('/api/places'),
      api('/api/bootstrap'),
    ])
    if (list.ok) setRows(list.incidents)
    if (everything.ok) setAll(everything.incidents)
    if (gear.ok) setEquipment(gear.equipment)
    if (furniture.ok) setMaterials(furniture.materials)
    if (site.ok) setPlaces(site.places)
    if (people.ok) setUsers(people.users)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filters.q, filters.status, filters.place, filters.level, filters.from, filters.to])

  async function viewIncident(row) {
    const result = await api(`/api/incidents/${row.id}`)
    if (!result.ok) return toast(result.error || 'No se pudo cargar el detalle de la incidencia.', 'bad')
    setViewing(result)
  }

  const count = (statuses) => all.filter((item) => statuses.includes(item.status)).length

  return (
    <div className="space-y-4">
      <PageHeader
        icon={AlertTriangle}
        title="Gestión de Incidencias"
        description="Registro, seguimiento y atención de incidencias de los bienes tecnológicos y mobiliarios."
        actions={admin && <Button type="button" onClick={() => setFormRow(null)}><PlusCircle /> Registrar incidencia</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={ClipboardList} value={all.length} label="Total de incidencias" onClick={() => setFilters({ ...filters, status: '' })} />
        <StatCard tone="red" icon={AlertCircle} value={count(['registrada', 'pendiente'])} label="Pendientes" onClick={() => setFilters({ ...filters, status: 'pendiente' })} />
        <StatCard tone="amber" icon={RefreshCw} value={count(['en_proceso'])} label="En atención" onClick={() => setFilters({ ...filters, status: 'en_proceso' })} />
        <StatCard tone="green" icon={CheckCircle2} value={count(['resuelta'])} label="Resueltas" onClick={() => setFilters({ ...filters, status: 'resuelta' })} />
      </div>

      <Panel title="Filtrar incidencias" icon={Filter} contentClassName="p-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,2fr)]">
          <FilterLabel label="Buscar">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="N.º incidencia, equipo o descripción…" className="pl-9" />
            </span>
          </FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[allOption(), { value: 'pendiente', label: 'Pendiente' }, { value: 'en_proceso', label: 'En atención' }, { value: 'resuelta', label: 'Resuelta' }]} /></FilterLabel>
          <FilterLabel label="Ambiente"><Select value={filters.place} onChange={(place) => setFilters({ ...filters, place })} options={[allOption(), ...places.map((item) => ({ value: item.name, label: item.name }))]} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={[allOption(), { value: 'Primaria', label: 'Primaria' }, { value: 'Secundaria', label: 'Secundaria' }]} /></FilterLabel>
          <FilterLabel label="Rango de fechas">
            <span className="flex items-center gap-1.5">
              <Input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="Desde" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="Hasta" />
            </span>
          </FilterLabel>
        </div>
      </Panel>

      <Panel title="Listado de incidencias" icon={ListChecks} contentClassName="p-0">
        <Table rows={rows} empty="No hay incidencias con estos filtros." columns={[
          { key: 'code', label: 'N.º', render: (row) => <span className="whitespace-nowrap font-semibold text-primary">{row.code}</span> },
          { key: 'detectedAt', label: 'Fecha registro', render: (row) => {
            const when = splitDetected(row.detectedAt)
            return <span className="whitespace-nowrap tabular-nums"><span className="block">{when.date}</span>{when.time && <span className="text-xs text-muted-foreground">{when.time}</span>}</span>
          } },
          { key: 'asset', label: 'Equipo / Bien', render: (row) => (
            <span className="flex items-center gap-2.5">
              <AssetIcon row={row} />
              <span className="min-w-0">
                <span className="block max-w-[200px] truncate font-medium" title={row.equipmentName}>{row.equipmentName || '—'}</span>
                <span className="text-xs text-muted-foreground">(Cód. {row.patrimonial || row.equipmentCode || '—'})</span>
              </span>
            </span>
          ) },
          { key: 'place', label: 'Ambiente', render: (row) => row.place || '—' },
          { key: 'description', label: 'Descripción de la incidencia', render: (row) => (
            <span className="line-clamp-2 max-w-[260px] text-sm" title={row.description || row.title}>{row.description || row.title}</span>
          ) },
          { key: 'status', label: 'Estado', render: (row) => <IncidentStatus value={row.status} /> },
          { key: 'priority', label: 'Prioridad', render: (row) => <PriorityChip value={row.priority} /> },
          { key: 'actions', label: 'Acciones', render: (row) => (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => viewIncident(row)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-primary hover:bg-muted" aria-label={`Ver ${row.code}`} title="Ver detalle"><Eye className="size-4" /></button>
              {admin && <button type="button" onClick={() => setFormRow(row)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-primary hover:bg-muted" aria-label={`Atender ${row.code}`} title="Atender / editar"><Pencil className="size-4" /></button>}
            </div>
          ) },
        ]} />
      </Panel>

      {formRow !== undefined && (
        <IncidentForm
          row={formRow}
          equipment={equipment}
          materials={materials}
          places={places}
          users={users}
          admin={admin}
          onClose={() => setFormRow(undefined)}
          onSaved={() => { setFormRow(undefined); load() }}
        />
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(next) => { if (!next) setViewing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {viewing && (() => {
            const item = viewing.incident
            const when = splitDetected(item.detectedAt)
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">{item.code} · {item.incidentType || item.title} <IncidentStatus value={item.status} /> <PriorityChip value={item.priority} /></DialogTitle>
                  <DialogDescription>{item.equipmentName} · Cód. {item.patrimonial || item.equipmentCode || '—'}</DialogDescription>
                </DialogHeader>
                <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-muted">
                  {[
                    ['Tipo de bien', item.assetKind === 'mobiliario' ? 'Bien mobiliario' : 'Bien tecnológico'],
                    ['Categoría', item.category],
                    ['Nivel', item.level],
                    ['Ubicación', [item.place, item.placeDetail].filter(Boolean).join(' · ')],
                    ['Detectada', `${when.date} ${when.time}`],
                    ['Reportado por', [item.reportedByRole, item.reporterName].filter(Boolean).join(' · ')],
                    ['Estado inicial del bien', item.initialState],
                    ['Responsable de la atención', item.assignee || 'Sin asignar'],
                  ].map(([label, value]) => (
                    <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value || '—'}</dd></div>
                  ))}
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descripción</dt><dd>{item.description || '—'}</dd></div>
                  {item.observations && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Observaciones</dt><dd>{item.observations}</dd></div>}
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Solución</dt><dd>{item.solution || 'Sin solución registrada.'}</dd></div>
                </dl>
                <PhotoGallery title="Evidencia del problema" photos={viewing.photos.before} />
                <PhotoGallery title="Evidencia después de la atención" photos={viewing.photos.after} />
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PhotoGallery({ title, photos }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {photos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <a key={photo.id} href={photo.path} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-border/70">
              {/\.pdf$/i.test(photo.path) ? (
                <span className="flex h-36 flex-col items-center justify-center gap-1 p-2 text-center text-xs"><FileText className="size-8 text-[#b4413c]" /><span className="line-clamp-2 break-all">{photo.fileName || 'Documento PDF'}</span></span>
              ) : (
                <img src={photo.path} alt={title} className="h-36 w-full object-cover transition-transform hover:scale-105" />
              )}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No hay archivos cargados.</p>
      )}
    </section>
  )
}

export function HistoryPage() {
  const [params] = useSearchParams()
  const [equipment, setEquipment] = useState([])
  const [selected, setSelected] = useState(params.get('equipo') || '')
  const [detail, setDetail] = useState(null)

  useEffect(() => { api('/api/equipment').then((result) => { if (result.ok) setEquipment(result.equipment) }) }, [])
  useEffect(() => {
    if (!selected) return
    api(`/api/equipment/${selected}`).then((result) => { if (result.ok) setDetail(result) })
  }, [selected])

  return (
    <div className="space-y-4">
      <Panel title="Historial por equipo">
        <Choice value={selected} onChange={setSelected} placeholder="Elige un código de inventario" options={equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
        {detail && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">{detail.equipment.brand} {detail.equipment.model} · {detail.equipment.place} · <Pill value={detail.equipment.operationalState} /></p>
            <h3 className="font-bold">Mantenimientos</h3>
            <Table rows={detail.maintenance} columns={[
              { key: 'code', label: 'Código' }, { key: 'date', label: 'Fecha' }, { key: 'type', label: 'Tipo' },
              { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> }, { key: 'activities', label: 'Actividades' },
            ]} />
            <h3 className="font-bold">Incidencias</h3>
            <Table rows={detail.incidents} columns={[
              { key: 'code', label: 'Código' }, { key: 'reportedOn', label: 'Fecha' }, { key: 'title', label: 'Falla' },
              { key: 'priority', label: 'Prioridad', render: (row) => <PriorityChip value={row.priority} /> },
              { key: 'status', label: 'Estado', render: (row) => <IncidentStatus value={row.status} /> },
              { key: 'solution', label: 'Solución', render: (row) => <Truncated text={row.solution} /> },
            ]} />
          </div>
        )}
      </Panel>
    </div>
  )
}

/** Long text shown on one line with an ellipsis; the full text appears on hover. */
function Truncated({ text, width = 'max-w-[140px]' }) {
  if (!text) return <span className="text-muted-foreground">—</span>
  return <span className={`block truncate ${width}`} title={text}>{text}</span>
}
