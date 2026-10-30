import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, ClipboardList, MapPin, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Choice } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Panel, Table } from './kit'

const emptyMaterial = {
  name: '',
  codMinedu: '',
  category: '',
  quantity: '0',
  unit: 'unidad',
  place: '',
  state: 'Bueno',
  notes: '',
}

const stateVariants = {
  Bueno: 'success',
  Regular: 'warning',
  Malo: 'destructive',
}

export default function MaterialsPage() {
  const { toast } = useApp()
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

  function openNew() {
    setEditingId(null)
    setForm(emptyMaterial)
    setDialogOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      codMinedu: item.codMinedu || '',
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      place: item.place,
      state: item.state,
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
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-muted-foreground">Administración <span className="mx-1">›</span> Materiales</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Inventario de materiales</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controla mobiliario, materiales didácticos y otros recursos del colegio.</p>
        </div>
        <Button type="button" onClick={openNew}><Plus aria-hidden="true" /> Agregar material</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Tipos de material" value={summary.types} />
        <SummaryCard label="Unidades registradas" value={summary.pieces} />
        <SummaryCard label="Requieren atención" value={summary.attention} />
      </div>

      <Panel
        title="Materiales registrados"
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
            { key: 'name', label: 'Material' },
            { key: 'codMinedu', label: 'COD MINEDU', render: (item) => item.codMinedu || <span className="text-muted-foreground">—</span> },
            { key: 'category', label: 'Categoría' },
            { key: 'quantity', label: 'Existencias', render: (item) => <span className="font-semibold">{item.quantity} {item.unit}</span> },
            { key: 'place', label: 'Ubicación', render: (item) => item.place || <span className="text-muted-foreground">Sin asignar</span> },
            { key: 'state', label: 'Estado', render: (item) => (
              <Badge
                variant={stateVariants[item.state] || 'secondary'}
                className={{
                  Bueno: 'border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white',
                  Regular: 'border-amber-700 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600 dark:text-white',
                  Malo: 'border-rose-700 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600 dark:text-white',
                }[item.state] || 'border-slate-700 bg-slate-600 text-white dark:border-slate-500 dark:bg-slate-600 dark:text-white'}
              >
                {item.state}
              </Badge>
            ) },
            { key: 'actions', label: 'Acciones', render: (item) => (
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Package className="size-5" /></div>
              <div>
                <DialogTitle>{editingId ? 'Editar material' : 'Agregar material'}</DialogTitle>
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
              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <Package className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">1. Identificación del material</h3>
                    <p className="text-xs text-muted-foreground">Indica qué material estás registrando.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3">
                  <Field label="Nombre del material *">
                    <Input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Sillas" maxLength={160} required />
                  </Field>
                  <Field label="COD MINEDU">
                    <Input value={form.codMinedu} onChange={(event) => setForm({ ...form, codMinedu: event.target.value })} placeholder="Código patrimonial MINEDU" maxLength={80} />
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
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <Boxes className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">2. Existencias y estado</h3>
                    <p className="text-xs text-muted-foreground">Registra cuánto hay disponible y su condición.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2">
                  <Field label="Cantidad *">
                    <Input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
                  </Field>
                  <Field label="Unidad *">
                    <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="unidad, paquete, caja…" maxLength={40} required />
                  </Field>
                  <Field label="Estado" className="sm:col-span-2">
                    <Choice value={form.state} onChange={(value) => setForm({ ...form, state: value })} options={['Bueno', 'Regular', 'Malo'].map((value) => ({ value, label: value }))} />
                  </Field>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <MapPin className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">3. Ubicación</h3>
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
                    <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Detalles útiles sobre el material…" className="min-h-24" />
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
