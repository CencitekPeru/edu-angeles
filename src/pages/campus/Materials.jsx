import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
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

  function openNew() {
    setEditingId(null)
    setForm(emptyMaterial)
    setDialogOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      name: item.name,
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
            { key: 'category', label: 'Categoría' },
            { key: 'quantity', label: 'Existencias', render: (item) => <span className="font-semibold">{item.quantity} {item.unit}</span> },
            { key: 'place', label: 'Ubicación', render: (item) => item.place || <span className="text-muted-foreground">Sin asignar</span> },
            { key: 'state', label: 'Estado', render: (item) => <Badge variant={stateVariants[item.state] || 'secondary'}>{item.state}</Badge> },
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar material' : 'Agregar material'}</DialogTitle>
            <DialogDescription>Registra la cantidad disponible, su estado y dónde se encuentra.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del material *">
                <Input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Sillas" maxLength={160} required />
              </Field>
              <Field label="Categoría *">
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ej. Mobiliario escolar" maxLength={100} required />
              </Field>
              <Field label="Cantidad *">
                <Input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
              </Field>
              <Field label="Unidad *">
                <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="unidad, paquete, caja…" maxLength={40} required />
              </Field>
              <Field label="Ubicación">
                <Input value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} placeholder="Ej. Aula 1" maxLength={120} />
              </Field>
              <Field label="Estado">
                <Choice value={form.state} onChange={(value) => setForm({ ...form, state: value })} options={['Bueno', 'Regular', 'Malo'].map((value) => ({ value, label: value }))} />
              </Field>
              <Field label="Observaciones" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Detalles útiles sobre el material…" />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar al inventario'}</Button>
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
