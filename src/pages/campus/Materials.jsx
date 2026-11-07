import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, ClipboardList, FileDown, FileSpreadsheet, FileUp, MapPin, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Choice } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, Pill, Table } from './kit'
import { Select } from '../attendance/shared'
import { exportTableXlsx } from '../../lib/exporters'
import { ImportMaterialsDialog, downloadMaterialsTemplate } from './MaterialsImport'

const emptyMaterial = {
  level: '',
  name: '',
  codMinedu: '',
  category: '',
  type: '',
  color: '',
  dimensions: '',
  quantity: '1',
  unit: 'unidad',
  place: '',
  state: 'Bueno',
  operationalState: 'Operativo',
  registeredOn: new Date().toISOString().slice(0, 10),
  notes: '',
}
const FURNITURE_TYPES = ['Silla', 'Carpeta', 'Mesa', 'Escritorio', 'Pizarra', 'Estante', 'Armario', 'Archivador', 'Banca', 'Módulo', 'Otro']
const COLORS = ['Caoba', 'Marrón', 'Natural', 'Negro', 'Blanco', 'Gris', 'Azul', 'Verde']

export default function MaterialsPage() {
  const { toast } = useApp()
  const canEdit = useCan()
  const toastRef = useRef(toast)
  const [materials, setMaterials] = useState([])
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyMaterial)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  const loadMaterials = useCallback(async () => {
    const result = await api('/api/materials')
    if (!result.ok) {
      toastRef.current(result.error || 'No se pudo cargar el inventario de materiales.', 'bad')
      setLoading(false)
      return
    }
    setMaterials(result.materials)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) loadMaterials()
    })
    Promise.all([api('/api/categories'), api('/api/places')]).then(([categoryResult, placeResult]) => {
      if (!active) return
      if (!categoryResult.ok) {
        toastRef.current(categoryResult.error || 'No se pudieron cargar las categorías.', 'bad')
      } else {
        setCategories(categoryResult.categories)
      }
      if (!placeResult.ok) {
        toastRef.current(placeResult.error || 'No se pudieron cargar los ambientes.', 'bad')
      } else {
        setPlaces(placeResult.places)
      }
    })
    return () => { active = false }
  }, [loadMaterials])

  const filteredMaterials = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return materials
    return materials.filter((item) =>
      `${item.name} ${item.category} ${item.place} ${item.state}`.toLocaleLowerCase().includes(needle),
    )
  }, [materials, query])

  const summary = useMemo(() => ({
    types: materials.length,
    pieces: materials.reduce((total, item) => total + item.quantity, 0),
    attention: materials.filter((item) => item.state === 'Malo').length,
  }), [materials])
  const placeOptions = useMemo(() => {
    const options = places.map((place) => ({ value: place.name, label: place.name }))
    if (form.place && !places.some((place) => place.name === form.place)) {
      options.push({ value: form.place, label: `${form.place} (actual)` })
    }
    return options
  }, [places, form.place])

  async function downloadTemplate() {
    setDownloading(true)
    try {
      await downloadMaterialsTemplate({ categories, places })
      toast('Formato descargado. Complétalo y usa «Importar Excel».')
    } catch (error) {
      console.error(error)
      toast('No se pudo generar el formato.', 'bad')
    } finally {
      setDownloading(false)
    }
  }

  function exportData() {
    if (!filteredMaterials.length) return toast('No hay bienes para exportar.', 'bad')
    const payload = {
      title: 'Inventario de bienes mobiliarios',
      subtitle: query.trim() ? `Filtro: «${query.trim()}»` : 'Todos los bienes registrados',
      summary: [['Registros', filteredMaterials.length], ['Unidades', filteredMaterials.reduce((total, item) => total + item.quantity, 0)]],
      headers: ['Código patrimonial', 'Denominación', 'Nivel', 'Categoría', 'Tipo', 'Color', 'Dimensiones', 'Cantidad', 'Ubicación', 'Estado físico', 'Estado operativo', 'Fecha de registro', 'Observaciones'],
      widths: [18, 30, 12, 20, 14, 12, 18, 12, 22, 13, 15, 14, 30],
      rows: filteredMaterials.map((item) => [
        item.codMinedu || '—', item.name, item.level || '—', item.category || '—', item.type || '—', item.color || '—', item.dimensions || '—',
        `${item.quantity} ${item.unit}`, item.place || 'Sin asignar', item.state || '—', item.operationalState || 'Operativo', item.registeredOn || '—', item.notes || '',
      ]),
    }
    exportTableXlsx(payload).then(() => toast('Inventario exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  function openNew() {
    setEditingId(null)
    setForm(emptyMaterial)
    setDialogOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      ...emptyMaterial,
      level: item.level || '',
      name: item.name,
      codMinedu: item.codMinedu || '',
      category: item.category,
      type: item.type || '',
      color: item.color || '',
      dimensions: item.dimensions || '',
      quantity: String(item.quantity),
      unit: item.unit,
      place: item.place,
      state: item.state,
      operationalState: item.operationalState || 'Operativo',
      registeredOn: item.registeredOn || emptyMaterial.registeredOn,
      notes: item.notes,
    })
    setDialogOpen(true)
  }

  function closeDialog(open) {
    setDialogOpen(open)
    if (!open) {
      setEditingId(null)
      setForm(emptyMaterial)
    }
  }

  async function save(event) {
    event.preventDefault()
    if (!form.level) {
      toast('Selecciona el nivel (Primaria, Secundaria o Ambos).', 'bad')
      return
    }
    if (!form.place) {
      toast('Selecciona la ubicación del bien.', 'bad')
      return
    }
    if (!categories.some((category) => category.name === form.category)) {
      toast('Selecciona una categoría registrada en la vista Categorías.', 'bad')
      return
    }
    setSaving(true)
    const payload = { ...form, quantity: Number(form.quantity) }
    const result = editingId
      ? await api(`/api/materials/${editingId}`, { method: 'PATCH', body: payload })
      : await api('/api/materials', { method: 'POST', body: payload })
    setSaving(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo guardar el material.', 'bad')
      return
    }
    toast(editingId ? 'Material actualizado.' : 'Material agregado al inventario.')
    closeDialog(false)
    await loadMaterials()
  }

  async function remove(item) {
    if (!window.confirm(`¿Eliminar ${item.name} del inventario?`)) return
    const result = await api(`/api/materials/${item.id}`, { method: 'DELETE' })
    if (!result.ok) {
      toast(result.error || 'No se pudo eliminar el material.', 'bad')
      return
    }
    toast('Material eliminado del inventario.')
    await loadMaterials()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Boxes}
        title="Inventario"
        description="Control de bienes tecnológicos y mobiliarios de la institución."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && (
              <>
                <Button type="button" variant="outline" disabled={downloading} onClick={downloadTemplate}><FileDown /> {downloading ? 'Preparando…' : 'Descargar formato'}</Button>
                <Button type="button" variant="outline" onClick={() => setImporting(true)}><FileUp /> Importar Excel</Button>
                <Button type="button" onClick={openNew}><Plus aria-hidden="true" /> Registrar bien mobiliario</Button>
              </>
            )}
          </>
        )}
      />
      {importing && <ImportMaterialsDialog onClose={() => setImporting(false)} onDone={loadMaterials} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Tipos de material" value={summary.types} />
        <SummaryCard label="Unidades registradas" value={summary.pieces} />
        <SummaryCard label="Requieren atención" value={summary.attention} />
      </div>

      <Panel
        title="Bienes mobiliarios registrados"
        action={<Badge variant="outline">{filteredMaterials.length} {filteredMaterials.length === 1 ? 'registro' : 'registros'}</Badge>}
      >
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar materiales"
              className="pl-9"
              placeholder="Buscar por material, categoría o ubicación"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <Table
          rows={filteredMaterials}
          empty={loading ? 'Cargando inventario…' : query ? 'No hay materiales que coincidan con la búsqueda.' : 'Aún no hay materiales registrados. Agrega sillas, pizarras u otros recursos.'}
          columns={[
            { key: 'codMinedu', label: 'Código patrimonial', render: (item) => item.codMinedu ? <span className="font-semibold">{item.codMinedu}</span> : <span className="text-muted-foreground">—</span> },
            { key: 'name', label: 'Denominación', render: (item) => (
              <span>
                <span className="block font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">{[item.type, item.color, item.dimensions].filter(Boolean).join(' · ') || item.category}</span>
              </span>
            ) },
            { key: 'level', label: 'Nivel', render: (item) => item.level || '—' },
            { key: 'category', label: 'Categoría' },
            { key: 'quantity', label: 'Existencias', render: (item) => <span className="font-semibold">{item.quantity} {item.unit}</span> },
            { key: 'place', label: 'Ubicación', render: (item) => item.place || <span className="text-muted-foreground">Sin asignar</span> },
            { key: 'state', label: 'Estado físico', render: (item) => <Pill value={item.state} /> },
            { key: 'operationalState', label: 'Estado operativo', render: (item) => <Pill value={item.operationalState || 'Operativo'} /> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => openEdit(item)}>
                  <Pencil aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Eliminar ${item.name}`} title="Eliminar" onClick={() => remove(item)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </span>
            ) },
          ]}
        />
      </Panel>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Package className="size-5" /></div>
              <div>
                <DialogTitle>{editingId ? 'Editar bien mobiliario' : 'Registrar bien mobiliario'}</DialogTitle>
                <DialogDescription className="mt-1">
                  {editingId
                    ? 'Actualiza la información y existencias de este material.'
                    : 'Completa los datos para registrar un material en el inventario.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="overflow-hidden rounded-lg border border-border/70 lg:col-span-2">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <Package className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">1. Identificación del bien</h3>
                    <p className="text-xs text-muted-foreground">Nivel, código patrimonial, denominación y categoría.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nivel *">
                    <Select value={form.level} onChange={(level) => setForm({ ...form, level })} options={[{ value: '', label: 'Seleccione' }, ...['Primaria', 'Secundaria', 'Ambos'].map((value) => ({ value, label: value }))]} required />
                  </Field>
                  <Field label="Código patrimonial *">
                    <Input value={form.codMinedu} onChange={(event) => setForm({ ...form, codMinedu: event.target.value })} placeholder="74648119-0473" maxLength={80} required />
                  </Field>
                  <Field label="Denominación *" className="sm:col-span-2">
                    <Input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Silla de madera" maxLength={160} required />
                  </Field>
                  <Field label="Categoría *">
                    <Choice
                      value={form.category}
                      onChange={(value) => setForm({ ...form, category: value })}
                      placeholder={categories.length ? 'Selecciona una categoría' : 'No hay categorías registradas'}
                      options={categories.map((category) => ({ value: category.name, label: category.name }))}
                    />
                    {categories.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Registra primero una categoría en la vista “Categorías”.
                      </p>
                    )}
                  </Field>
                  <Field label="Tipo *">
                    <Input list="furniture-types" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="Silla" maxLength={80} required />
                    <datalist id="furniture-types">{FURNITURE_TYPES.map((value) => <option key={value} value={value} />)}</datalist>
                  </Field>
                  <Field label="Color">
                    <Input list="furniture-colors" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} placeholder="Caoba" maxLength={60} />
                    <datalist id="furniture-colors">{COLORS.map((value) => <option key={value} value={value} />)}</datalist>
                  </Field>
                  <Field label="Dimensiones (largo × ancho × alto)">
                    <Input value={form.dimensions} onChange={(event) => setForm({ ...form, dimensions: event.target.value })} placeholder="46 × 44 × 75 cm" maxLength={80} />
                  </Field>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70 lg:col-span-2">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <Boxes className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">2. Cantidad, estados y registro</h3>
                    <p className="text-xs text-muted-foreground">Cuántos hay, su condición y la fecha de registro.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Cantidad *">
                    <Input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
                  </Field>
                  <Field label="Unidad *">
                    <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="unidad, paquete, caja…" maxLength={40} required />
                  </Field>
                  <Field label="Estado físico *">
                    <Choice value={form.state} onChange={(value) => setForm({ ...form, state: value })} options={['Bueno', 'Regular', 'Malo'].map((value) => ({ value, label: value }))} />
                  </Field>
                  <Field label="Estado operativo *">
                    <Choice value={form.operationalState} onChange={(value) => setForm({ ...form, operationalState: value })} options={['Operativo', 'Con fallas', 'Inoperativo'].map((value) => ({ value, label: value }))} />
                  </Field>
                  <Field label="Fecha de registro *" className="sm:col-span-2 lg:col-span-1">
                    <Input type="date" value={form.registeredOn} onChange={(event) => setForm({ ...form, registeredOn: event.target.value })} required />
                  </Field>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <MapPin className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">3. Ubicación *</h3>
                    <p className="text-xs text-muted-foreground">Puedes dejarla vacía si aún no está asignado.</p>
                  </div>
                </div>
                <div className="p-3">
                  <Field label="Ambiente o lugar">
                    <Choice
                      value={form.place || '__unassigned__'}
                      onChange={(value) => setForm({ ...form, place: value === '__unassigned__' ? '' : value })}
                      placeholder={placeOptions.length ? 'Selecciona un ambiente' : 'No hay ambientes registrados'}
                      options={[
                        { value: '__unassigned__', label: 'Sin asignar' },
                        ...placeOptions,
                      ]}
                    />
                    {places.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Registra los ambientes en “Categorías y ambientes”.
                      </p>
                    )}
                  </Field>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <ClipboardList className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">4. Información adicional</h3>
                    <p className="text-xs text-muted-foreground">Añade detalles que ayuden a identificarlo o controlarlo.</p>
                  </div>
                </div>
                <div className="p-3">
                  <Field label="Observaciones">
                    <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Detalles útiles sobre el material…" className="min-h-20" />
                  </Field>
                </div>
              </section>
            </div>
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={() => closeDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || categories.length === 0}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <Card className="gap-2 py-4 shadow-xs">
      <CardContent className="px-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}
