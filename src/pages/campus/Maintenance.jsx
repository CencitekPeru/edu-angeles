import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Armchair,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  Filter,
  History,
  Laptop,
  Layers,
  ListChecks,
  Monitor,
  Pencil,
  PlusCircle,
  Printer,
  Projector,
  Router,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { CHIP_BASE, TONE } from '../../lib/tones'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, StatCard, Table } from './kit'
import { MaintenanceForm } from './MaintenanceForm'
import { FilterLabel, Select, allOption } from '../attendance/shared'

const STATUS = {
  Realizado: { icon: CheckCircle2, tone: TONE.ok.chip },
  'En proceso': { icon: Clock3, tone: TONE.warn.chip },
  Programado: { icon: CalendarDays, tone: TONE.brand.chip },
  Pendiente: { icon: AlertTriangle, tone: TONE.bad.chip },
}

function StatusChip({ value }) {
  const item = STATUS[value] || STATUS.Programado
  const Icon = item.icon
  return <span className={cn(CHIP_BASE, item.tone)}><Icon aria-hidden="true" />{value}</span>
}

function TypeChip({ value }) {
  const preventive = value !== 'Correctivo'
  const Icon = preventive ? CalendarCheck : Wrench
  return <span className={cn(CHIP_BASE, 'rounded-md', preventive ? TONE.ok.chip : TONE.warn.chip)}><Icon aria-hidden="true" />{value}</span>
}

function AssetIcon({ row }) {
  const type = String(row.typeName || '').toLowerCase()
  let Icon = Monitor
  if (row.assetKind === 'mobiliario') Icon = Armchair
  else if (type.includes('port') || type.includes('laptop') || type.includes('tablet')) Icon = Laptop
  else if (type.includes('proyect')) Icon = Projector
  else if (type.includes('impres')) Icon = Printer
  else if (type.includes('router') || type.includes('switch') || type.includes('access')) Icon = Router
  return <Icon className="size-5 shrink-0 text-foreground/70" aria-hidden="true" />
}

const dmy = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function MaintenancePage({ mode = 'list' }) {
  const { toast } = useApp()
  const canEdit = useCan()
  const [rows, setRows] = useState([])
  const [all, setAll] = useState([])
  const [equipment, setEquipment] = useState([])
  const [materials, setMaterials] = useState([])
  const [places, setPlaces] = useState([])
  const [users, setUsers] = useState([])
  const [formRow, setFormRow] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [filters, setFilters] = useState({ q: '', type: '', status: '', place: '', level: '', from: '', to: '' })

  async function load() {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    const [list, everything, gear, furniture, site, people] = await Promise.all([
      api(`/api/maintenance?${params}`),
      api('/api/maintenance'),
      api('/api/equipment'),
      api('/api/materials'),
      api('/api/places'),
      api('/api/bootstrap'),
    ])
    if (list.ok) setRows(list.maintenance)
    if (everything.ok) setAll(everything.maintenance)
    if (gear.ok) setEquipment(gear.equipment)
    if (furniture.ok) setMaterials(furniture.materials)
    if (site.ok) setPlaces(site.places)
    if (people.ok) setUsers(people.users)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filters.q, filters.type, filters.status, filters.place, filters.level, filters.from, filters.to])

  async function view(row) {
    const result = await api(`/api/maintenance/${row.id}`)
    if (!result.ok) return toast(result.error || 'No se pudo cargar el detalle.', 'bad')
    setViewing(result)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    const result = await api(`/api/maintenance/${deleting.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el mantenimiento.', 'bad')
    toast(`Mantenimiento ${deleting.code} eliminado.`)
    setDeleting(null)
    load()
  }

  const plan = mode === 'plan'
  const visible = plan
    ? rows.filter((item) => item.status === 'Programado' || item.status === 'Pendiente').sort((a, b) => a.date.localeCompare(b.date))
    : rows

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Wrench}
        title="Gestión de Mantenimiento"
        description="Planificación, registro y seguimiento del mantenimiento de los bienes tecnológicos y mobiliarios."
        actions={canEdit && <Button type="button" onClick={() => setFormRow(null)}><PlusCircle /> Registrar mantenimiento</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Layers} value={all.length} label="Total de mantenimientos" onClick={() => setFilters({ ...filters, type: '', status: '' })} />
        <StatCard tone="green" icon={CalendarCheck} value={all.filter((item) => item.type === 'Preventivo').length} label="Preventivos" onClick={() => setFilters({ ...filters, type: 'Preventivo' })} />
        <StatCard tone="amber" icon={Wrench} value={all.filter((item) => item.type === 'Correctivo').length} label="Correctivos" onClick={() => setFilters({ ...filters, type: 'Correctivo' })} />
        <StatCard tone="red" icon={AlertTriangle} value={all.filter((item) => item.status === 'Pendiente').length} label="Pendientes" onClick={() => setFilters({ ...filters, status: 'Pendiente' })} />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {[
          { to: '/admin/mantenimiento', label: 'Mantenimientos', icon: ClipboardList, active: !plan },
          { to: '/admin/mantenimiento/cronograma', label: 'Plan de mantenimiento', icon: CalendarDays, active: plan },
          { to: '/admin/mantenimiento/historial', label: 'Historial del bien', icon: History, active: false },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <Link key={tab.to} to={tab.to} className={cn('-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold transition-colors', tab.active ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="size-4" /> {tab.label}
            </Link>
          )
        })}
      </nav>

      <Panel title="Filtrar mantenimientos" icon={Filter} contentClassName="p-4">
        <div className="grid items-end gap-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,2fr)]">
          <FilterLabel label="Buscar">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="N.º, equipo o descripción…" className="pl-9" />
            </span>
          </FilterLabel>
          <FilterLabel label="Tipo"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={[allOption(), { value: 'Preventivo', label: 'Preventivo' }, { value: 'Correctivo', label: 'Correctivo' }]} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[allOption(), ...Object.keys(STATUS).map((value) => ({ value, label: value }))]} /></FilterLabel>
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

      <Panel title={plan ? 'Plan de mantenimiento (programados y pendientes)' : 'Listado de mantenimientos'} icon={ListChecks} contentClassName="p-0">
        <Table rows={visible} empty={plan ? 'No hay mantenimientos programados o pendientes.' : 'No hay mantenimientos con estos filtros.'} columns={[
          { key: 'code', label: 'N.º', render: (row) => <span className="whitespace-nowrap font-semibold text-primary">{row.code}</span> },
          { key: 'date', label: 'Fecha', render: (row) => <span className="whitespace-nowrap tabular-nums">{dmy(row.executedDate || row.date)}</span> },
          { key: 'asset', label: 'Equipo / Bien', render: (row) => (
            <span className="flex items-center gap-2.5">
              <AssetIcon row={row} />
              <span className="min-w-0">
                <span className="block max-w-[190px] truncate font-medium" title={row.equipmentName}>{row.equipmentName || '—'}</span>
                <span className="text-xs text-muted-foreground">(Cód. {row.patrimonial || row.equipmentCode || '—'})</span>
              </span>
            </span>
          ) },
          { key: 'type', label: 'Tipo', render: (row) => <TypeChip value={row.type} /> },
          { key: 'activities', label: 'Descripción del mantenimiento', render: (row) => <span className="line-clamp-2 max-w-[260px]" title={row.activities}>{row.activities || '—'}</span> },
          { key: 'responsible', label: 'Responsable', render: (row) => row.responsible || '—' },
          { key: 'status', label: 'Estado', render: (row) => <StatusChip value={row.status} /> },
          { key: 'nextDate', label: 'Próxima fecha', render: (row) => <span className="tabular-nums">{dmy(row.nextDate)}</span> },
          { key: 'actions', label: 'Acciones', render: (row) => (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => view(row)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-primary hover:bg-muted" aria-label={`Ver ${row.code}`} title="Ver detalle"><Eye className="size-4" /></button>
              {canEdit && <button type="button" onClick={() => setFormRow(row)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-primary hover:bg-muted" aria-label={`Editar ${row.code}`} title="Editar"><Pencil className="size-4" /></button>}
              {canEdit && <button type="button" onClick={() => setDeleting(row)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-[#b4413c] hover:bg-muted" aria-label={`Eliminar ${row.code}`} title="Eliminar"><Trash2 className="size-4" /></button>}
            </div>
          ) },
        ]} />
      </Panel>

      {formRow !== undefined && (
        <MaintenanceForm row={formRow} equipment={equipment} materials={materials} places={places} users={users}
          onClose={() => setFormRow(undefined)} onSaved={() => { setFormRow(undefined); load() }} />
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {viewing && (() => {
            const item = viewing.maintenance
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">{item.code} · {item.equipmentName} <TypeChip value={item.type} /> <StatusChip value={item.status} /></DialogTitle>
                  <DialogDescription>Cód. {item.patrimonial || item.equipmentCode || '—'} · {item.category || 'Sin categoría'}</DialogDescription>
                </DialogHeader>
                <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-muted">
                  {[
                    ['Tipo de bien', item.assetKind === 'mobiliario' ? 'Bien mobiliario' : 'Bien tecnológico'],
                    ['Prioridad', { alta: 'Alta', media: 'Media', baja: 'Baja' }[item.priority]],
                    ['Nivel', item.level],
                    ['Ubicación', [item.place, item.placeDetail].filter(Boolean).join(' · ')],
                    ['Fecha programada', dmy(item.date)],
                    ['Fecha de ejecución', item.executedDate ? dmy(item.executedDate) : 'Sin ejecutar'],
                    ['Horario', item.startTime ? `${item.startTime} – ${item.endTime || '…'}` : ''],
                    ['Próximo mantenimiento', item.nextDate ? dmy(item.nextDate) : ''],
                    ['Responsable', item.responsible],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value || '—'}</dd></div>)}
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descripción</dt><dd>{item.activities || '—'}</dd></div>
                  {item.checklist.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Actividades realizadas</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">{item.checklist.map((activity) => <span key={activity} className={cn(CHIP_BASE, TONE.brand.chip)}><CheckCircle2 />{activity === 'Otras (especificar)' ? item.otherActivity || 'Otras' : activity}</span>)}</dd>
                    </div>
                  )}
                </dl>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Evidencia</h3>
                  {viewing.photos.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {viewing.photos.map((photo) => (
                        <a key={photo.id} href={photo.path} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-border">
                          {/\.pdf$/i.test(photo.path)
                            ? <span className="flex h-32 flex-col items-center justify-center gap-1 p-2 text-center text-xs"><FileText className="size-8 text-[#b4413c]" /><span className="line-clamp-2 break-all">{photo.fileName || 'Documento PDF'}</span></span>
                            : <img src={photo.path} alt="Evidencia" className="h-32 w-full object-cover" />}
                        </a>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No hay archivos cargados.</p>}
                </section>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteLoading) setDeleting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar mantenimiento</DialogTitle>
            <DialogDescription>¿Deseas eliminar el mantenimiento <b>{deleting?.code}</b>? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleteLoading} onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={deleteLoading} onClick={confirmDelete}>{deleteLoading ? 'Eliminando…' : 'Sí, eliminar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PartsPage() {
  const { toast } = useApp()
  const canEdit = useCan()
  const [parts, setParts] = useState([])
  const [equipment, setEquipment] = useState([])
  const [form, setForm] = useState({ name: '', equipmentId: '', quantity: 1, unit: 'unidad', notes: '' })
  const [openPart, setOpenPart] = useState(false)

  async function load() {
    const [list, gear] = await Promise.all([api('/api/parts'), api('/api/equipment')])
    if (list.ok) setParts(list.parts)
    if (gear.ok) setEquipment(gear.equipment)
  }
  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    const result = await api('/api/parts', { method: 'POST', body: { ...form, equipmentId: form.equipmentId || null } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast('Repuesto registrado.')
    setForm({ name: '', equipmentId: '', quantity: 1, unit: 'unidad', notes: '' })
    setOpenPart(false)
    load()
  }

  return (
    <div className="space-y-4">
      {canEdit && <div className="flex justify-end"><Button type="button" onClick={() => setOpenPart(true)}>Registrar repuesto</Button></div>}
      <Dialog open={openPart} onOpenChange={setOpenPart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar repuesto o material</DialogTitle>
            <DialogDescription>Puedes vincularlo a un equipo del inventario.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Equipo"><Choice value={form.equipmentId || 'general'} onChange={(value) => setForm({ ...form, equipmentId: value === 'general' ? '' : value })} options={[{ value: 'general', label: 'General' }, ...equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad"><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
              <Field label="Unidad"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
            </div>
            <Field label="Nota"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenPart(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Panel title="Repuestos y materiales">
        <Table rows={parts} columns={[
          { key: 'name', label: 'Material' },
          { key: 'equipment', label: 'Equipo', render: (row) => row.equipmentCode ? `${row.equipmentCode} · ${row.equipmentName}` : 'General' },
          { key: 'quantity', label: 'Cantidad' },
          { key: 'unit', label: 'Unidad' },
          { key: 'notes', label: 'Nota' },
          { key: 'actions', label: '', render: (row) => <button type="button" className="font-bold text-[#9a2f2a]" onClick={async () => { await api(`/api/parts/${row.id}`, { method: 'DELETE' }); load() }}>Quitar</button> },
        ]} />
      </Panel>
    </div>
  )
}
