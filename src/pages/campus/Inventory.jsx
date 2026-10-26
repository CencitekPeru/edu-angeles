import { useEffect, useState } from 'react'
import { CalendarDays, Camera, Cpu, MapPin, Pencil, Tag, Trash2 } from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Choice } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Filters, Panel, Pill, Table } from './kit'

const empty = {
  name: '', brand: '', model: '', type: 'Computadora de escritorio', categoryId: '', placeId: '', responsibleId: '',
  serial: '', patrimonial: '', mac: '', processor: '', ram: '', storage: '', os: '',
  physicalState: 'Bueno', operationalState: 'Operativo', registeredOn: new Date().toISOString().slice(0, 10), notes: '',
}

function EquipmentSection({ icon, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
        {icon && <span className="mt-0.5 text-primary">{icon}</span>}
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grid gap-3 p-3">{children}</div>
    </section>
  )
}

function SelectedPhotoPreviews({ files }) {
  const [previews, setPreviews] = useState([])

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [files])

  return previews.map(({ file, url }) => (
    <div key={`${file.name}-${file.lastModified}`} className="overflow-hidden rounded-md border border-border/70">
      <img src={url} alt={file.name} className="h-24 w-full object-cover" />
      <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{file.name}</p>
    </div>
  ))
}

export function EquipmentPage() {
  const { user, toast } = useApp()
  const admin = user.role === 'admin'
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(empty)
  const [photos, setPhotos] = useState([])
  const [savedPhotos, setSavedPhotos] = useState([])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [filters, setFilters] = useState({ q: '', category: '', place: '', state: '' })

  async function load() {
    const [equipment, cats, site, people] = await Promise.all([
      api(`/api/equipment?q=${encodeURIComponent(filters.q)}&category=${encodeURIComponent(filters.category)}&place=${encodeURIComponent(filters.place)}&state=${encodeURIComponent(filters.state)}`),
      api('/api/categories'),
      api('/api/places'),
      api('/api/bootstrap'),
    ])
    if (equipment.ok) setRows(equipment.equipment)
    if (cats.ok) setCategories(cats.categories)
    if (site.ok) setPlaces(site.places)
    if (people.ok) setUsers(people.users)
  }

  useEffect(() => { load() }, [filters.q, filters.category, filters.place, filters.state])

  function close() {
    setOpen(false)
    setForm(empty)
    setEditing(null)
    setPhotos([])
    setSavedPhotos([])
  }

  async function edit(row) {
    setEditing(row.id)
    setForm({ ...empty, ...row, categoryId: row.categoryId || '', placeId: row.placeId || '', responsibleId: row.responsibleId || '' })
    setPhotos([])
    setSavedPhotos([])
    setOpen(true)
    const result = await api(`/api/equipment/${row.id}`)
    if (!result.ok) {
      toast(result.error || 'No se pudieron cargar las fotografías del equipo.', 'bad')
      return
    }
    setSavedPhotos(result.equipment.photos || [])
  }

  async function save(event) {
    event.preventDefault()
    const payload = { ...form, categoryId: form.categoryId || null, placeId: form.placeId || null, responsibleId: form.responsibleId || null }
    const result = editing
      ? await api(`/api/equipment/${editing}`, { method: 'PATCH', body: payload })
      : await api('/api/equipment', { method: 'POST', body: payload })
    if (!result.ok) return toast(result.error || 'No se pudo guardar el equipo.', 'bad')
    const id = result.id || editing
    const photoResult = photos.length && id ? await upload(`/api/equipment/${id}/photos`, photos) : null
    if (photoResult && !photoResult.ok) {
      toast(`El equipo se guardó, pero hubo un problema al subir las fotografías. ${photoResult.error || ''}`.trim(), 'bad')
    } else {
      toast(editing ? 'Equipo actualizado.' : `Equipo ${result.code || ''} registrado.`)
    }
    close()
    load()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    const result = await api(`/api/equipment/${deleting.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo eliminar el equipo.', 'bad')
      return
    }
    toast(`Equipo "${deleting.name}" eliminado.`)
    setDeleting(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Inventario <span className="mx-1">›</span> Equipos</p>
        {admin && <Button type="button" onClick={() => { setForm(empty); setEditing(null); setPhotos([]); setSavedPhotos([]); setOpen(true) }}>Registrar equipo</Button>}
      </div>
      {admin && (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else setOpen(true) }}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
            <DialogHeader className="border-b border-border/70 pb-4">
              <div className="flex items-start justify-between gap-4 pr-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><Cpu className="size-5" /></div>
                  <div>
                    <DialogTitle>{editing ? `Editar equipo - ${form.code || ''}` : 'Registrar nuevo equipo'}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {editing ? 'Modifica la información del equipo tecnológico.' : 'Completa los datos disponibles para registrar el equipo.'}
                      {!editing && ' El código EQ se genera al guardar.'}
                    </DialogDescription>
                  </div>
                </div>
                {editing && (
                  <Badge variant={form.operationalState === 'Operativo' ? 'success' : 'warning'} className="shrink-0">
                    {form.operationalState}
                  </Badge>
                )}
              </div>
            </DialogHeader>
            <form onSubmit={save} className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                  <EquipmentSection icon={<Cpu className="size-4" />} title="1. Información básica" description="Datos principales para identificar el equipo.">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {editing && <Field label="Código interno"><Input value={form.code || ''} readOnly className="bg-muted" /></Field>}
                      <Field label="Nombre del equipo *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
                      <Field label="Categoría"><Choice value={form.categoryId} onChange={(value) => setForm({ ...form, categoryId: value })} placeholder="Seleccionar" options={categories.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                      <Field label="Tipo de equipo"><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
                      <Field label="Marca *"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></Field>
                      <Field label="Modelo"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
                      <Field label="Número de serie"><Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></Field>
                      <Field label="Código patrimonial MINEDU"><Input value={form.patrimonial} onChange={(e) => setForm({ ...form, patrimonial: e.target.value })} /></Field>
                      <Field label="Dirección MAC"><Input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} /></Field>
                    </div>
                  </EquipmentSection>

                  <EquipmentSection icon={<Cpu className="size-4" />} title="2. Especificaciones técnicas" description="Características técnicas registradas para el equipo.">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Procesador"><Input value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })} /></Field>
                      <Field label="Memoria RAM"><Input value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })} /></Field>
                      <Field label="Almacenamiento"><Input value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} /></Field>
                      <Field label="Sistema operativo"><Input value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} /></Field>
                    </div>
                  </EquipmentSection>

                  <EquipmentSection icon={<MapPin className="size-4" />} title="3. Ubicación y asignación" description="Ambiente y persona responsable del equipo.">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Ubicación"><Choice value={form.placeId} onChange={(value) => setForm({ ...form, placeId: value })} options={places.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                      <Field label="Responsable"><Choice value={form.responsibleId} onChange={(value) => setForm({ ...form, responsibleId: value })} options={users.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                    </div>
                  </EquipmentSection>

                  <EquipmentSection icon={<CalendarDays className="size-4" />} title="4. Estado y mantenimiento" description="Condición actual y fecha de registro del equipo.">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Estado físico"><Choice value={form.physicalState} onChange={(value) => setForm({ ...form, physicalState: value })} options={['Bueno', 'Regular', 'Malo'].map((item) => ({ value: item, label: item }))} /></Field>
                      <Field label="Estado operativo"><Choice value={form.operationalState} onChange={(value) => setForm({ ...form, operationalState: value })} options={['Operativo', 'Con fallas', 'Inoperativo'].map((item) => ({ value: item, label: item }))} /></Field>
                      <Field label="Fecha de registro"><Input type="date" value={form.registeredOn} onChange={(e) => setForm({ ...form, registeredOn: e.target.value })} /></Field>
                    </div>
                  </EquipmentSection>
                </div>

                <aside className="space-y-4 lg:col-span-4">
                  <EquipmentSection icon={<Camera className="size-4" />} title="Fotografías del equipo" description="Imágenes de referencia del equipo.">
                    <div className="grid grid-cols-2 gap-2">
                      {savedPhotos.map((photo) => (
                        <a key={`saved-${photo.id}`} href={photo.path} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-border/70">
                          <img src={photo.path} alt="Foto del equipo" className="h-24 w-full object-cover" />
                        </a>
                      ))}
                      <SelectedPhotoPreviews files={photos} />
                    </div>
                    <Field label="Agregar fotografías" hint={photos.length ? `${photos.length} foto(s) lista(s)` : 'Opcional, se guardan en el servidor.'}>
                      <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} />
                    </Field>
                  </EquipmentSection>

                  <EquipmentSection title="Observaciones">
                    <Field label="Notas del equipo">
                      <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-28" />
                    </Field>
                  </EquipmentSection>
                </aside>
              </div>
              <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-border/70 bg-background px-6 py-4">
                <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
                <Button type="submit">{editing ? 'Guardar cambios' : 'Guardar equipo'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <Panel title="Listado de equipos registrados">
        <Filters>
          <Input placeholder="Buscar por nombre, serie, código o MAC" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Choice value={filters.category || 'todas'} onChange={(value) => setFilters({ ...filters, category: value === 'todas' ? '' : value })} options={[{ value: 'todas', label: 'Todas las categorías' }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} />
          <Choice value={filters.place || 'todos'} onChange={(value) => setFilters({ ...filters, place: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los ambientes' }, ...places.map((item) => ({ value: item.name, label: item.name }))]} />
          <Choice value={filters.state || 'todos'} onChange={(value) => setFilters({ ...filters, state: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los estados' }, ...['Operativo', 'Con fallas', 'Inoperativo'].map((item) => ({ value: item, label: item }))]} />
        </Filters>
        <Table
          rows={rows}
          columns={[
            { key: 'code', label: 'ID' },
            { key: 'name', label: 'Nombre' },
            { key: 'category', label: 'Categoría' },
            { key: 'brand', label: 'Marca' },
            { key: 'model', label: 'Modelo' },
            { key: 'place', label: 'Ubicación' },
            { key: 'state', label: 'Estado', render: (row) => ['Operativo', 'Con fallas'].includes(row.operationalState)
              ? <Badge
                  variant={row.operationalState === 'Operativo' ? 'success' : 'warning'}
                  className={row.operationalState === 'Operativo'
                    ? 'border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                    : 'border-amber-700 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600 dark:text-white'}
                >
                  {row.operationalState}
                </Badge>
              : <Pill value={row.operationalState} /> },
            { key: 'actions', label: 'Acciones', render: (row) => (
              <span className="flex gap-1">
                {admin && (
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-slate-600" onClick={() => edit(row)} aria-label={`Editar ${row.name}`} title="Editar">
                    <Pencil aria-hidden="true" />
                  </Button>
                )}
                {admin && (
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setDeleting(row)} aria-label={`Borrar ${row.name}`} title="Borrar">
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </span>
            ) },
          ]}
        />
      </Panel>
      {admin && (
        <Dialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next && !deleteLoading) setDeleting(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar eliminación</DialogTitle>
              <DialogDescription>
                ¿Deseas eliminar el equipo <span className="font-semibold text-foreground">{deleting?.name}</span>?
                Esta acción no se puede deshacer. No se podrá eliminar si tiene mantenimientos, incidencias u otros registros vinculados.
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
      )}
    </div>
  )
}

export function CatalogPage() {
  const { toast } = useApp()
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [category, setCategory] = useState('')
  const [place, setPlace] = useState('')
  const [kind, setKind] = useState('')

  async function load() {
    const [cats, sites] = await Promise.all([api('/api/categories'), api('/api/places')])
    if (cats.ok) setCategories(cats.categories)
    if (sites.ok) setPlaces(sites.places)
  }
  useEffect(() => { load() }, [])

  async function add(path, name, clear) {
    const result = await api(path, { method: 'POST', body: { name } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    clear('')
    setKind('')
    load()
  }

  async function removeCatalogItem(path, item, label) {
    const result = await api(`${path}/${item.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || `No se pudo quitar ${label.toLowerCase()}.`, 'bad')
    toast(`${label} "${item.name}" quitado.`)
    load()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Categorías" action={<Button type="button" size="sm" onClick={() => { setCategory(''); setKind('categoria') }}>Nueva categoría</Button>}>
        <ul className="space-y-2">{categories.map((item) => <li key={item.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{item.name}</span><Button type="button" variant="destructive" size="icon-sm" aria-label={`Quitar categoría ${item.name}`} title={`Quitar categoría ${item.name}`} className="shadow-sm" onClick={() => removeCatalogItem('/api/categories', item, 'Categoría')}><Trash2 className="size-4" /></Button></li>)}</ul>
      </Panel>
      <Panel title="Ambientes" action={<Button type="button" size="sm" onClick={() => { setPlace(''); setKind('ambiente') }}>Nuevo ambiente</Button>}>
        <ul className="space-y-2">{places.map((item) => <li key={item.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{item.name}</span><Button type="button" variant="destructive" size="icon-sm" aria-label={`Quitar ambiente ${item.name}`} title={`Quitar ambiente ${item.name}`} className="shadow-sm" onClick={() => removeCatalogItem('/api/places', item, 'Ambiente')}><Trash2 className="size-4" /></Button></li>)}</ul>
      </Panel>
      <Dialog open={Boolean(kind)} onOpenChange={(next) => { if (!next) setKind('') }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                {kind === 'categoria' ? <Tag className="size-5" /> : <MapPin className="size-5" />}
              </div>
              <div>
                <DialogTitle>{kind === 'categoria' ? 'Nueva categoría' : 'Nuevo ambiente'}</DialogTitle>
                <DialogDescription className="mt-1">
                  {kind === 'categoria'
                    ? 'Organiza los equipos con una categoría fácil de reconocer.'
                    : 'Registra un espacio para ubicar los equipos del inventario.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              add(
                kind === 'categoria' ? '/api/categories' : '/api/places',
                kind === 'categoria' ? category : place,
                kind === 'categoria' ? setCategory : setPlace,
              )
            }}
          >
            <section className="overflow-hidden rounded-lg border border-border/70">
              <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                {kind === 'categoria' ? <Tag className="mt-0.5 size-4 text-primary" /> : <MapPin className="mt-0.5 size-4 text-primary" />}
                <div>
                  <h3 className="text-sm font-semibold">Datos del catálogo</h3>
                  <p className="text-xs text-muted-foreground">Este nombre aparecerá como opción en el inventario.</p>
                </div>
              </div>
              <div className="p-3">
                <Field label={kind === 'categoria' ? 'Nombre de la categoría' : 'Nombre del ambiente'}>
                  <Input
                    autoFocus
                    value={kind === 'categoria' ? category : place}
                    onChange={(event) => (kind === 'categoria' ? setCategory : setPlace)(event.target.value)}
                    placeholder={kind === 'categoria' ? 'Ej. Computadoras' : 'Ej. Aula 1'}
                    maxLength={120}
                    required
                  />
                </Field>
              </div>
            </section>
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={() => setKind('')}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
