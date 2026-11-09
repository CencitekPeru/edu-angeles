import { useEffect, useMemo, useState } from 'react'
import { Boxes, Bus, CheckCircle2, Cog, FileSpreadsheet, FileText, Landmark, ListChecks, Pencil, Plus, Trash2, Wrench, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { ASSET_KINDS, COMMON_FIELDS, LEVEL_OPTIONS, OPERATIONAL_STATES, PHYSICAL_STATES, commonLabel } from '../../lib/assetKinds'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Filters, PageHeader, Panel, Pill, StatCard, Table } from './kit'
import { InventoryTabs } from './Inventory'
import { PatrimonialCodePicker } from './PatrimonialCodePicker'
import { Select } from '../attendance/shared'

export const KIND_ICONS = { maquinaria: Cog, transporte: Bus, cultural: Landmark }

const opts = (list, first) => [...(first ? [{ value: '', label: first }] : []), ...list.map((value) => ({ value, label: value }))]
const today = () => new Date().toISOString().slice(0, 10)
const emptyItem = () => ({
  codMinedu: '', name: '', level: '', category: '', type: '', brand: '', model: '', serial: '', color: '', dimensions: '',
  quantity: '1', unit: 'unidad', place: '', state: 'Bueno', operationalState: 'Operativo', registeredOn: today(), notes: '', details: {},
})

/** Columns of the section, used by the table exports: [label, value of an item]. */
function exportColumns(kind) {
  const config = ASSET_KINDS[kind]
  return [
    ['Nivel', (item) => item.level],
    ['COD MINEDU', (item) => item.codMinedu],
    ['Denominación', (item) => item.name],
    ['Tipo', (item) => item.type],
    ...config.common.map((key) => [COMMON_FIELDS[key].short || commonLabel(kind, key), (item) => item[key]]),
    ...config.details.map((field) => [field.label, (item) => item.details?.[field.key]]),
    ['Cantidad', (item) => `${item.quantity} ${item.unit}`],
    ['Ubicación', (item) => item.place],
    ['Estado operativo', (item) => item.operationalState],
    ['Estado físico', (item) => item.state],
    ['Observación', (item) => item.notes],
  ]
}

/** One inventory section (machinery, transport or cultural assets) driven by its configuration. */
export default function AssetsPage({ kind }) {
  const config = ASSET_KINDS[kind]
  const Icon = KIND_ICONS[kind] || Boxes
  const { toast } = useApp()
  const canEdit = useCan()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [filters, setFilters] = useState({ q: '', level: '', state: '' })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    const result = await api(`/api/assets?kind=${kind}`)
    setLoading(false)
    if (result.ok) setItems(result.items)
    else toast(result.error || 'No se pudo cargar el inventario.', 'bad')
  }
  useEffect(() => {
    setFilters({ q: '', level: '', state: '' })
    load()
  }, [kind])
  useEffect(() => {
    Promise.all([api('/api/categories'), api('/api/places')]).then(([cats, sites]) => {
      if (cats.ok) setCategories(cats.categories)
      if (sites.ok) setPlaces(sites.places)
    })
  }, [])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return items.filter((item) =>
      (!filters.level || item.level === filters.level || item.level === 'Ambos')
      && (!filters.state || item.operationalState === filters.state)
      && (!term || [item.codMinedu, item.name, item.type, item.brand, item.model, item.serial, item.place, ...Object.values(item.details || {})].join(' ').toLowerCase().includes(term)))
  }, [items, filters])

  const count = (state) => items.filter((item) => item.operationalState === state).length
  const appliedFilters = [filters.q.trim() && `Búsqueda: «${filters.q.trim()}»`, filters.level && `Nivel: ${filters.level}`, filters.state && `Estado: ${filters.state}`].filter(Boolean)
  const exportPayload = () => {
    const columns = exportColumns(kind)
    return {
      title: `Inventario de ${config.label.toLowerCase()}`,
      subtitle: appliedFilters.length ? `Filtros: ${appliedFilters.join(' · ')}` : 'Todos los bienes registrados',
      summary: [['Registros', visible.length], ['Unidades', visible.reduce((total, item) => total + item.quantity, 0)]],
      headers: columns.map(([label]) => label),
      rows: visible.map((item) => columns.map(([, value]) => value(item) || '—')),
    }
  }
  function exportExcel() {
    if (!visible.length) return toast('No hay bienes para exportar.', 'bad')
    const payload = exportPayload()
    exportTableXlsx({ ...payload, widths: payload.headers.map((label) => (label === 'Denominación' || label === 'Observación' ? 32 : 16)) })
      .then(() => toast('Inventario exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    if (!visible.length) return toast('No hay bienes para exportar.', 'bad')
    const payload = exportPayload()
    exportTablePdf({ ...payload, fontSize: payload.headers.length > 13 ? 6 : 7 })
      .then(() => toast('Inventario exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  async function confirmDelete() {
    const result = await api(`/api/assets/${deleting.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el bien.', 'bad')
    toast(`«${deleting.name}» eliminado del inventario.`)
    setDeleting(null)
    load()
  }

  // Table: the section's two most telling extra fields next to the shared ones.
  const extraColumns = [
    ...config.common.filter((key) => ['brand', 'model'].includes(key)).slice(0, 1).map((key) => ({
      key, label: 'Marca / Modelo', render: (item) => [item.brand, item.model].filter(Boolean).join(' ') || '—',
    })),
    ...config.details.slice(0, kind === 'cultural' ? 2 : 1).map((field) => ({ key: field.key, label: field.label, render: (item) => item.details?.[field.key] || '—' })),
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Boxes}
        title="Inventario"
        description="Control de los bienes de la institución por tipo."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
            {canEdit && <Button type="button" onClick={() => setEditing(emptyItem())}><Plus /> Registrar {config.singular}</Button>}
          </>
        )}
      />
      <InventoryTabs />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Icon} value={items.length} label={config.label} hint={`${items.reduce((total, item) => total + item.quantity, 0)} unidades`} onClick={() => setFilters({ ...filters, state: '' })} />
        <StatCard tone="green" icon={CheckCircle2} value={count('Operativo')} label="Operativos" onClick={() => setFilters({ ...filters, state: 'Operativo' })} />
        <StatCard tone="amber" icon={Wrench} value={count('Con fallas')} label="Con fallas" onClick={() => setFilters({ ...filters, state: 'Con fallas' })} />
        <StatCard tone="red" icon={XCircle} value={count('Inoperativo')} label="Inoperativos" onClick={() => setFilters({ ...filters, state: 'Inoperativo' })} />
      </div>

      <Panel title={`${config.label} registrados`} icon={ListChecks}>
        <Filters className="lg:grid-cols-3">
          <Input placeholder="Buscar por código, denominación, marca, serie…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
          <Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVEL_OPTIONS.slice(0, 2), 'Todos los niveles')} />
          <Select value={filters.state} onChange={(state) => setFilters({ ...filters, state })} options={opts(OPERATIONAL_STATES, 'Todos los estados')} />
        </Filters>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : `No hay ${config.label.toLowerCase()} registrados.`}
          columns={[
            { key: 'codMinedu', label: 'Código patrimonial', render: (item) => <span className="font-semibold">{item.codMinedu || '—'}</span> },
            { key: 'name', label: 'Denominación', render: (item) => <span><span className="block font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{[item.type, item.level].filter(Boolean).join(' · ')}</span></span> },
            ...extraColumns,
            { key: 'quantity', label: 'Cantidad', render: (item) => `${item.quantity} ${item.unit}` },
            { key: 'place', label: 'Ubicación', render: (item) => item.place || 'Sin asignar' },
            { key: 'state', label: 'Estado', render: (item) => <span className="flex flex-col items-start gap-1"><Pill value={item.operationalState} /><span className="text-xs text-muted-foreground">Físico: {item.state}</span></span> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-slate-600" title="Editar" aria-label={`Editar ${item.name}`} onClick={() => setEditing({ ...item, quantity: String(item.quantity) })}><Pencil /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-[#9a2f2a]" title="Eliminar" aria-label={`Eliminar ${item.name}`} onClick={() => setDeleting(item)}><Trash2 /></Button>
              </span>
            ) },
          ]}
        />
      </Panel>

      {editing && <AssetForm kind={kind} item={editing} categories={categories} places={places} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>¿Deseas eliminar <span className="font-semibold text-foreground">{deleting?.name}</span> del inventario? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Label({ label, required, className, children }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  )
}

function Section({ number, title, text, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70">
      <div className="border-b border-border/60 bg-muted/30 px-3 py-2.5">
        <h3 className="text-sm font-semibold">{number}. {title}</h3>
        {text && <p className="text-xs text-muted-foreground">{text}</p>}
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  )
}

/** Create / edit form of a section; shows only the fields that section uses. */
function AssetForm({ kind, item, categories, places, onClose, onSaved }) {
  const config = ASSET_KINDS[kind]
  const { toast } = useApp()
  const editing = Boolean(item.id)
  const [form, setForm] = useState(item)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const setDetail = (key, value) => setForm((current) => ({ ...current, details: { ...current.details, [key]: value } }))

  async function save(event) {
    event.preventDefault()
    if (!form.level) return toast('Selecciona el nivel (Primaria, Secundaria o Ambos).', 'bad')
    if (!form.codMinedu) return toast('Selecciona el código patrimonial.', 'bad')
    if (!form.place) return toast('Selecciona la ubicación del bien.', 'bad')
    setSaving(true)
    const body = { ...form, kind, quantity: Number(form.quantity) }
    const result = editing
      ? await api(`/api/assets/${item.id}`, { method: 'PATCH', body })
      : await api('/api/assets', { method: 'POST', body })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar el bien.', 'bad')
    toast(editing ? 'Bien actualizado.' : `${config.singular.charAt(0).toUpperCase()}${config.singular.slice(1)} registrado en el inventario.`)
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${config.singular}` : `Registrar ${config.singular}`}</DialogTitle>
          <DialogDescription>Sección: {config.label}. Los campos con * son obligatorios.</DialogDescription>
        </DialogHeader>
        <form id="asset-form" className="space-y-4" onSubmit={save}>
          <Section number={1} title="Identificación del bien" text="Nivel, código patrimonial, denominación y tipo.">
            <Label label="Nivel" required><Select value={form.level} onChange={(level) => set({ level })} options={opts(LEVEL_OPTIONS, 'Seleccione')} /></Label>
            <Label label="Código patrimonial" required className="lg:col-span-3">
              <PatrimonialCodePicker value={form.codMinedu} onChange={(codMinedu, entry) => setForm((current) => ({ ...current, codMinedu, ...(!current.name.trim() && entry ? { name: entry.description } : {}) }))} />
            </Label>
            <Label label="Denominación" required className="sm:col-span-2"><Input value={form.name} onChange={(event) => set({ name: event.target.value.toUpperCase() })} placeholder={config.namePlaceholder} maxLength={160} required /></Label>
            <Label label="Categoría"><Select value={form.category} onChange={(category) => set({ category })} options={[{ value: '', label: 'Sin categoría' }, ...categories.map((entry) => ({ value: entry.name, label: entry.name }))]} /></Label>
            <Label label="Tipo"><Input value={form.type} onChange={(event) => set({ type: event.target.value })} placeholder={config.typePlaceholder} maxLength={80} /></Label>
          </Section>

          <Section number={2} title="Características" text={`Datos propios de ${config.label.toLowerCase()}.`}>
            {config.common.map((key) => (
              <Label key={key} label={commonLabel(kind, key)} className={key === 'dimensions' ? 'sm:col-span-2' : ''}>
                <Input value={form[key] || ''} onChange={(event) => set({ [key]: COMMON_FIELDS[key].upper ? event.target.value.toUpperCase() : event.target.value })} placeholder={COMMON_FIELDS[key].placeholder} maxLength={80} />
              </Label>
            ))}
            {config.details.map((field) => (
              <Label key={field.key} label={field.label} className={kind === 'cultural' ? 'sm:col-span-2' : ''}>
                {field.options
                  ? <Select value={form.details?.[field.key] || ''} onChange={(value) => setDetail(field.key, value)} options={opts(field.options, 'Seleccione')} />
                  : <Input value={form.details?.[field.key] || ''} onChange={(event) => setDetail(field.key, field.upper ? event.target.value.toUpperCase() : event.target.value)} placeholder={field.placeholder} maxLength={160} />}
              </Label>
            ))}
          </Section>

          <Section number={3} title="Ubicación, cantidad y estado">
            <Label label="Ubicación" required className="sm:col-span-2"><Select value={form.place} onChange={(place) => set({ place })} options={[{ value: '', label: 'Seleccione' }, ...places.map((entry) => ({ value: entry.name, label: entry.name }))]} /></Label>
            <Label label="Cantidad" required><Input type="number" min="0" step="1" value={form.quantity} onChange={(event) => set({ quantity: event.target.value })} required /></Label>
            <Label label="Unidad"><Input value={form.unit} onChange={(event) => set({ unit: event.target.value })} maxLength={40} /></Label>
            <Label label="Estado físico" required><Select value={form.state} onChange={(state) => set({ state })} options={opts(PHYSICAL_STATES)} /></Label>
            <Label label="Estado operativo" required><Select value={form.operationalState} onChange={(operationalState) => set({ operationalState })} options={opts(OPERATIONAL_STATES)} /></Label>
            <Label label="Fecha de registro"><Input type="date" value={form.registeredOn || ''} onChange={(event) => set({ registeredOn: event.target.value })} /></Label>
            <Label label="Observaciones" className="sm:col-span-2 lg:col-span-4"><Textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={1000} /></Label>
          </Section>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="asset-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
