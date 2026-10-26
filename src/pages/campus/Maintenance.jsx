import { useEffect, useState } from 'react'
import { Camera, ClipboardList, Clock3, MapPin, Pencil, Trash2, Wrench, X } from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Filters, Panel, Pill, Table } from './kit'

const empty = {
  equipmentId: '', scheduledDate: new Date().toISOString().slice(0, 10), startTime: '09:00', endTime: '10:30',
  type: 'Preventivo', status: 'Programado', activities: '', notes: '', responsibleId: '', nextDate: '',
}

function PhotoPreviews({ files, onRemove }) {
  const [previews, setPreviews] = useState([])

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [files])

  if (!previews.length) return null

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {previews.map(({ file, url }, index) => (
        <figure key={`${file.name}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-md border border-border/70">
          <img src={url} alt={`Vista previa: ${file.name}`} className="h-20 w-full object-cover" />
          <button
            type="button"
            className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`Quitar ${file.name}`}
            title="Quitar imagen"
            onClick={() => onRemove(index)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <figcaption className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{file.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

export function MaintenancePage({ mode = 'form' }) {
  const { user, toast } = useApp()
  const [rows, setRows] = useState([])
  const [equipment, setEquipment] = useState([])
  const [users, setUsers] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(empty)
  const [photos, setPhotos] = useState([])
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [filters, setFilters] = useState({ q: '', status: '', category: '', from: '', to: '' })

  async function load() {
    const params = new URLSearchParams(filters)
    const [list, gear, people, cats] = await Promise.all([
      api(`/api/maintenance?${params}`),
      api('/api/equipment'),
      api('/api/bootstrap'),
      api('/api/categories'),
    ])
    if (list.ok) setRows(list.maintenance)
    if (gear.ok) setEquipment(gear.equipment)
    if (people.ok) setUsers(people.users)
    if (cats.ok) setCategories(cats.categories)
  }
  useEffect(() => { load() }, [filters.q, filters.status, filters.category, filters.from, filters.to])

  const selected = equipment.find((item) => Number(item.id) === Number(form.equipmentId))
  const visible = mode === 'plan' ? rows.filter((item) => item.status === 'Programado' || item.status === 'Pendiente') : rows

  async function save(event) {
    event.preventDefault()
    const payload = { ...form, responsibleId: form.responsibleId || null }
    const result = editing
      ? await api(`/api/maintenance/${editing}`, { method: 'PATCH', body: payload })
      : await api('/api/maintenance', { method: 'POST', body: payload })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    const id = result.id || editing
    if (photos.length && id) await upload(`/api/maintenance/${id}/photos`, photos)
    toast(editing ? 'Mantenimiento actualizado.' : `Registrado ${result.code}.`)
    setForm(empty)
    setEditing(null)
    setPhotos([])
    setOpen(false)
    load()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    const result = await api(`/api/maintenance/${deleting.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo eliminar el mantenimiento.', 'bad')
      return
    }
    toast(`Mantenimiento ${deleting.code} eliminado.`)
    setDeleting(null)
    await load()
  }

  function editRow(row) {
    setEditing(row.id)
    setForm({ ...empty, ...row, equipmentId: row.equipmentId, responsibleId: row.responsibleId || '', scheduledDate: row.date, nextDate: row.nextDate || '' })
    setOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Mantenimiento <span className="mx-1">›</span> {mode === 'plan' ? 'Cronograma' : mode === 'list' ? 'Lista' : 'Registrar'}</p>
        {user.role === 'admin' && <Button type="button" onClick={() => { setForm(empty); setEditing(null); setPhotos([]); setOpen(true) }}>Registrar mantenimiento</Button>}
      </div>
      {user.role === 'admin' && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader className="border-b border-border/70 pb-4">
              <div className="flex items-start gap-3 pr-6">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Wrench className="size-5" /></div>
                <div>
                  <DialogTitle>{editing ? 'Editar mantenimiento' : 'Registrar nuevo mantenimiento'}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {editing
                      ? 'Actualiza la programación, el trabajo realizado y su seguimiento.'
                      : 'Completa los datos para programar y documentar el mantenimiento de un equipo.'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={save} className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <MapPin className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">1. Equipo y programación</h3>
                      <p className="text-xs text-muted-foreground">Selecciona el equipo y cuándo se realizará el trabajo.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-3">
                    <Field label="Equipo *">
                      <Choice value={form.equipmentId} onChange={(value) => setForm({ ...form, equipmentId: value })} placeholder="Seleccionar equipo" options={equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
                    </Field>
                    {selected && (
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{selected.brand} {selected.model}</span>
                        <span> · Serie: {selected.serial || '—'} · Ubicación: {selected.place || 'Sin asignar'}</span>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Fecha programada *"><Input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} required /></Field>
                      <Field label="Tipo de mantenimiento"><Choice value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={['Preventivo', 'Correctivo'].map((item) => ({ value: item, label: item }))} /></Field>
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <Clock3 className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">2. Horario y seguimiento</h3>
                      <p className="text-xs text-muted-foreground">Define el horario, estado y responsable.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2">
                    <Field label="Hora de inicio"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
                    <Field label="Hora de fin"><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
                    <Field label="Estado"><Choice value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={['Programado', 'Pendiente', 'En proceso', 'Realizado'].map((item) => ({ value: item, label: item }))} /></Field>
                    <Field label="Responsable"><Choice value={form.responsibleId || 'cist'} onChange={(value) => setForm({ ...form, responsibleId: value === 'cist' ? '' : value })} options={[{ value: 'cist', label: 'CIST' }, ...users.map((item) => ({ value: item.id, label: item.name }))]} /></Field>
                    <Field label="Próximo mantenimiento" className="sm:col-span-2"><Input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} /></Field>
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <ClipboardList className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">3. Trabajo y observaciones</h3>
                      <p className="text-xs text-muted-foreground">Describe las tareas y cualquier detalle importante.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-3">
                    <Field label="Actividades realizadas *"><Textarea value={form.activities} onChange={(e) => setForm({ ...form, activities: e.target.value })} placeholder="Describe las tareas realizadas o previstas…" className="min-h-24" required /></Field>
                    <Field label="Observaciones"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Añade notas complementarias…" className="min-h-20" /></Field>
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <Camera className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">4. Evidencia fotográfica</h3>
                      <p className="text-xs text-muted-foreground">Adjunta imágenes para documentar el mantenimiento (opcional).</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="grid gap-3">
                      <Field label="Fotografías" hint={photos.length ? `${photos.length} imagen(es) lista(s) para guardar.` : 'Puedes seleccionar varias imágenes.'}>
                        <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/')))} />
                      </Field>
                      <PhotoPreviews files={photos} onRemove={(index) => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                    </div>
                  </div>
                </section>
              </div>
              <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-border/70 bg-background px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit">{editing ? 'Guardar cambios' : 'Guardar mantenimiento'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <Panel title={mode === 'plan' ? 'Cronograma de actividades' : 'Listado de mantenimientos'}>
        <Filters className="lg:grid-cols-5">
          <Input placeholder="Buscar por equipo, código o actividad" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Choice value={filters.category || 'todas'} onChange={(value) => setFilters({ ...filters, category: value === 'todas' ? '' : value })} options={[{ value: 'todas', label: 'Todas las categorías' }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} />
          <Choice value={filters.status || 'todos'} onChange={(value) => setFilters({ ...filters, status: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los estados' }, ...['Programado', 'Pendiente', 'En proceso', 'Realizado'].map((item) => ({ value: item, label: item }))]} />
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Filters>
        <Table
          rows={visible}
          columns={[
            { key: 'code', label: 'ID' },
            { key: 'date', label: 'Fecha' },
            { key: 'equipment', label: 'Equipo', render: (row) => `${row.equipmentCode} · ${row.equipmentName}` },
            { key: 'type', label: 'Tipo' },
            { key: 'place', label: 'Ubicación' },
            { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} solid /> },
            { key: 'responsible', label: 'Responsable' },
            { key: 'next', label: 'Próximo', render: (row) => row.nextDate || '—' },
            { key: 'actions', label: 'Acciones', render: (row) => user.role === 'admin' ? (
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" className="gap-1.5 bg-sky-600 text-white shadow-sm hover:bg-sky-700" onClick={() => editRow(row)}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  aria-label={`Eliminar mantenimiento ${row.code}`}
                  title="Eliminar mantenimiento"
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </span>
            ) : '—' },
          ]}
        />
      </Panel>
      <Dialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next && !deleteLoading) setDeleting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Deseas eliminar el mantenimiento <span className="font-semibold text-foreground">{deleting?.code}</span>?
              Esta acción no se puede deshacer. Los repuestos asociados se conservarán sin vínculo a este mantenimiento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleteLoading} onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={deleteLoading} onClick={confirmDelete}>
              {deleteLoading ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PartsPage() {
  const { toast } = useApp()
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
      <div className="flex justify-end"><Button type="button" onClick={() => setOpenPart(true)}>Registrar repuesto</Button></div>
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
          { key: 'actions', label: '', render: (row) => <button type="button" className="font-bold text-rose-700" onClick={async () => { await api(`/api/parts/${row.id}`, { method: 'DELETE' }); load() }}>Quitar</button> },
        ]} />
      </Panel>
    </div>
  )
}
