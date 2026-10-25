import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
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
  const [editing, setEditing] = useState(null)
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
  }

  function edit(row) {
    setEditing(row.id)
    setForm({ ...empty, ...row, categoryId: row.categoryId || '', placeId: row.placeId || '', responsibleId: row.responsibleId || '' })
    setOpen(true)
  }

  async function save(event) {
    event.preventDefault()
    const payload = { ...form, categoryId: form.categoryId || null, placeId: form.placeId || null, responsibleId: form.responsibleId || null }
    const result = editing
      ? await api(`/api/equipment/${editing}`, { method: 'PATCH', body: payload })
      : await api('/api/equipment', { method: 'POST', body: payload })
    if (!result.ok) return toast(result.error || 'No se pudo guardar el equipo.', 'bad')
    const id = result.id || editing
    if (photos.length && id) await upload(`/api/equipment/${id}/photos`, photos)
    toast(editing ? 'Equipo actualizado.' : `Equipo ${result.code || ''} registrado.`)
    close()
    load()
  }

  async function remove(row) {
    const result = await api(`/api/equipment/${row.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se puede eliminar: tiene mantenimientos o incidencias.', 'bad')
    toast('Equipo eliminado.')
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Inventario <span className="mx-1">›</span> Equipos</p>
        {admin && <Button type="button" onClick={() => { setForm(empty); setEditing(null); setPhotos([]); setOpen(true) }}>Registrar equipo</Button>}
      </div>
      {admin && (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else setOpen(true) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{editing ? `Editar ${form.code || 'equipo'}` : 'Registrar nuevo equipo'}</DialogTitle>
              <DialogDescription>El código EQ se genera al guardar.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nombre del equipo *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
                <Field label="Categoría"><Choice value={form.categoryId} onChange={(value) => setForm({ ...form, categoryId: value })} placeholder="Seleccionar" options={categories.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                <Field label="Tipo de equipo"><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
                <Field label="Marca *"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></Field>
                <Field label="Modelo"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
                <Field label="Número de serie"><Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></Field>
                <Field label="Código patrimonial MINEDU"><Input value={form.patrimonial} onChange={(e) => setForm({ ...form, patrimonial: e.target.value })} /></Field>
                <Field label="Dirección MAC"><Input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} /></Field>
                <Field label="Procesador"><Input value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })} /></Field>
                <Field label="Memoria RAM"><Input value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })} /></Field>
                <Field label="Almacenamiento"><Input value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} /></Field>
                <Field label="Sistema operativo"><Input value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} /></Field>
                <Field label="Ubicación"><Choice value={form.placeId} onChange={(value) => setForm({ ...form, placeId: value })} options={places.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                <Field label="Responsable"><Choice value={form.responsibleId} onChange={(value) => setForm({ ...form, responsibleId: value })} options={users.map((item) => ({ value: item.id, label: item.name }))} /></Field>
                <Field label="Estado físico"><Choice value={form.physicalState} onChange={(value) => setForm({ ...form, physicalState: value })} options={['Bueno', 'Regular', 'Malo'].map((item) => ({ value: item, label: item }))} /></Field>
                <Field label="Estado operativo"><Choice value={form.operationalState} onChange={(value) => setForm({ ...form, operationalState: value })} options={['Operativo', 'Con fallas', 'Inoperativo'].map((item) => ({ value: item, label: item }))} /></Field>
                <Field label="Fecha de registro"><Input type="date" value={form.registeredOn} onChange={(e) => setForm({ ...form, registeredOn: e.target.value })} /></Field>
                <Field label="Observaciones" className="sm:col-span-2 lg:col-span-3"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>
              <Field label="Fotografías del equipo" hint={photos.length ? `${photos.length} foto(s) lista(s)` : 'Opcional, se guardan en el servidor.'}>
                <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos([...e.target.files])} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Limpiar</Button>
                <Button type="submit">Guardar equipo</Button>
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
                <Button asChild type="button" variant="ghost" size="icon" className="size-8 text-blue" aria-label={`Ver historial de ${row.name}`} title="Ver historial">
                  <Link to={`${user.role === 'admin' ? '/admin' : '/panel'}/mantenimiento/historial?equipo=${row.id}`}>
                    <Eye aria-hidden="true" />
                  </Link>
                </Button>
                {admin && (
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-slate-600" onClick={() => edit(row)} aria-label={`Editar ${row.name}`} title="Editar">
                    <Pencil aria-hidden="true" />
                  </Button>
                )}
                {admin && (
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => remove(row)} aria-label={`Borrar ${row.name}`} title="Borrar">
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </span>
            ) },
          ]}
        />
      </Panel>
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Categorías" action={<Button type="button" size="sm" onClick={() => { setCategory(''); setKind('categoria') }}>Nueva categoría</Button>}>
        <ul className="space-y-2">{categories.map((item) => <li key={item.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{item.name}</span><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={async () => { await api(`/api/categories/${item.id}`, { method: 'DELETE' }); load() }}>Quitar</Button></li>)}</ul>
      </Panel>
      <Panel title="Ambientes" action={<Button type="button" size="sm" onClick={() => { setPlace(''); setKind('ambiente') }}>Nuevo ambiente</Button>}>
        <ul className="space-y-2">{places.map((item) => <li key={item.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{item.name}</span><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={async () => { await api(`/api/places/${item.id}`, { method: 'DELETE' }); load() }}>Quitar</Button></li>)}</ul>
      </Panel>
      <Dialog open={Boolean(kind)} onOpenChange={(next) => { if (!next) setKind('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === 'categoria' ? 'Nueva categoría' : 'Nuevo ambiente'}</DialogTitle>
            <DialogDescription>El nombre queda disponible en los formularios de inventario.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); add(kind === 'categoria' ? '/api/categories' : '/api/places', kind === 'categoria' ? category : place, kind === 'categoria' ? setCategory : setPlace) }}>
            <Field label="Nombre">
              <Input value={kind === 'categoria' ? category : place} onChange={(event) => (kind === 'categoria' ? setCategory : setPlace)(event.target.value)} required />
            </Field>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setKind('')}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
