import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronsUpDown, Eye } from 'lucide-react'
import { api, upload } from '../../lib/api'
import { INCIDENT_STATUS } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Filters, Panel, Pill, Table } from './kit'

const empty = {
  equipmentId: '', priority: 'media', status: 'registrada', assigneeId: '', title: '', description: '', solution: '',
  reportedOn: new Date().toISOString().slice(0, 10),
}

function ImagePreviews({ files, label }) {
  const [previews, setPreviews] = useState([])

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [files])

  if (!previews.length) return null

  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {previews.map(({ file, url }) => (
        <figure key={`${file.name}-${file.lastModified}`} className="overflow-hidden rounded-md border border-border/70">
          <img src={url} alt={`${label}: ${file.name}`} className="h-20 w-full object-cover" />
          <figcaption className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{file.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

export function IncidentsPage() {
  const { user, toast } = useApp()
  const admin = user.role === 'admin'
  const [rows, setRows] = useState([])
  const [equipment, setEquipment] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(empty)
  const [before, setBefore] = useState([])
  const [after, setAfter] = useState([])
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false)
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [viewing, setViewing] = useState(null)
  const [loadingView, setLoadingView] = useState(false)
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' })
  const selectedEquipment = equipment.find((item) => String(item.id) === String(form.equipmentId))
  const matchingEquipment = equipment.filter((item) =>
    `${item.code} ${item.name} ${item.brand} ${item.model} ${item.serial} ${item.mac}`
      .toLowerCase()
      .includes(equipmentSearch.trim().toLowerCase()),
  )

  async function load() {
    const params = new URLSearchParams(filters)
    const [list, gear, people] = await Promise.all([api(`/api/incidents?${params}`), api('/api/equipment'), api('/api/bootstrap')])
    if (list.ok) setRows(list.incidents)
    if (gear.ok) setEquipment(gear.equipment)
    if (people.ok) setUsers(people.users)
  }
  useEffect(() => { load() }, [filters.q, filters.status, filters.priority])

  async function save(event) {
    event.preventDefault()
    const payload = { ...form, assigneeId: form.assigneeId || null }
    const result = editing
      ? await api(`/api/incidents/${editing}`, { method: 'PATCH', body: payload })
      : await api('/api/incidents', { method: 'POST', body: payload })
    if (!result.ok) return toast(result.error || 'No se pudo guardar la incidencia.', 'bad')
    const id = result.id || editing
    const photoResults = await Promise.all([
      ...(before.length && id ? [upload(`/api/incidents/${id}/photos`, before, { kind: 'before' })] : []),
      ...(after.length && id ? [upload(`/api/incidents/${id}/photos`, after, { kind: 'after' })] : []),
    ])
    const photoError = photoResults.find((item) => !item.ok)
    if (photoError) {
      toast(`La incidencia se guardó, pero hubo un problema al subir las fotos. ${photoError.error || ''}`.trim(), 'bad')
    }
    else toast(editing ? 'Incidencia actualizada.' : `Incidencia ${result.code} vinculada al equipo.`)
    setForm(empty)
    setEditing(null)
    setBefore([])
    setAfter([])
    setOpen(false)
    load()
  }

  async function viewIncident(row) {
    setLoadingView(true)
    const result = await api(`/api/incidents/${row.id}`)
    setLoadingView(false)
    if (!result.ok) return toast(result.error || 'No se pudo cargar el detalle de la incidencia.', 'bad')
    setViewing(result)
  }

  function fileList(files, setter) {
    setter(Array.from(files || []).filter((file) => file.type.startsWith('image/')))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => { setForm(empty); setEditing(null); setBefore([]); setAfter([]); setOpen(true) }}>Registrar incidencia</Button>
      </div>
      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setBefore([])
          setAfter([])
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Actualizar incidencia' : 'Registrar incidencia'}</DialogTitle>
            <DialogDescription>La falla queda vinculada al código del equipo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Equipo del inventario *" className="sm:col-span-2">
              <Popover open={equipmentSearchOpen} onOpenChange={setEquipmentSearchOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" aria-expanded={equipmentSearchOpen} className="w-full justify-between font-normal">
                    {selectedEquipment ? (
                      <span className="truncate text-left">
                        {selectedEquipment.code} · {selectedEquipment.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          MAC: {selectedEquipment.mac || '—'} · Serie: {selectedEquipment.serial || '—'}
                        </span>
                      </span>
                    ) : 'Buscar equipo por nombre, código, MAC o serie'}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                  <Input
                    autoFocus
                    placeholder="Buscar por nombre, código, MAC o serie"
                    value={equipmentSearch}
                    onChange={(event) => setEquipmentSearch(event.target.value)}
                  />
                  <div className="mt-2 max-h-60 overflow-y-auto">
                    {matchingEquipment.length ? matchingEquipment.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
                        onClick={() => {
                          setForm({ ...form, equipmentId: String(item.id) })
                          setEquipmentSearchOpen(false)
                          setEquipmentSearch('')
                        }}
                      >
                        <Check className={`mt-0.5 size-4 shrink-0 ${String(item.id) === String(form.equipmentId) ? 'opacity-100' : 'opacity-0'}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.code} · {item.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            MAC: {item.mac || '—'} · Serie: {item.serial || '—'}
                          </span>
                        </span>
                      </button>
                    )) : (
                      <p className="px-2 py-4 text-center text-sm text-muted-foreground">No se encontraron equipos.</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </Field>
            <Field label="Prioridad"><Choice value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }]} /></Field>
            <Field label="Seguimiento"><Choice value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={Object.entries(INCIDENT_STATUS).map(([id, label]) => ({ value: id, label }))} /></Field>
            {admin && <Field label="Responsable"><Choice value={form.assigneeId || 'ninguno'} onChange={(value) => setForm({ ...form, assigneeId: value === 'ninguno' ? '' : value })} options={[{ value: 'ninguno', label: 'Sin asignar' }, ...users.map((item) => ({ value: item.id, label: item.name }))]} /></Field>}
            <Field label="Fecha"><Input type="date" value={form.reportedOn} onChange={(e) => setForm({ ...form, reportedOn: e.target.value })} /></Field>
            <Field label="Falla *" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Descripción" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Solución aplicada" className="sm:col-span-2"><Textarea value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} /></Field>
            <Field label="Fotos del problema">
              <Input type="file" accept="image/*" multiple onChange={(e) => fileList(e.target.files, setBefore)} />
              <ImagePreviews files={before} label="Foto del problema" />
            </Field>
            <Field label="Fotos después de la atención">
              <Input type="file" accept="image/*" multiple onChange={(e) => fileList(e.target.files, setAfter)} />
              <ImagePreviews files={after} label="Foto después de la atención" />
            </Field>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar incidencia</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Panel title="Historial de incidencias">
        <Filters>
          <Input placeholder="Buscar por equipo, código o responsable" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Choice value={filters.status || 'todos'} onChange={(value) => setFilters({ ...filters, status: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los estados' }, ...Object.entries(INCIDENT_STATUS).map(([id, label]) => ({ value: id, label }))]} />
          <Choice value={filters.priority || 'todas'} onChange={(value) => setFilters({ ...filters, priority: value === 'todas' ? '' : value })} options={[{ value: 'todas', label: 'Todas las prioridades' }, { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }]} />
        </Filters>
        <Table rows={rows} columns={[
          { key: 'code', label: 'Código' },
          { key: 'reportedOn', label: 'Fecha' },
          { key: 'equipment', label: 'Equipo', render: (row) => `${row.equipmentCode} · ${row.equipmentName}` },
          { key: 'equipmentMac', label: 'MAC', render: (row) => row.equipmentMac || '—' },
          { key: 'equipmentSerial', label: 'Serie', render: (row) => row.equipmentSerial || '—' },
          { key: 'title', label: 'Falla' },
          { key: 'priority', label: 'Prioridad', render: (row) => <Pill value={row.priority} solid /> },
          { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} solid /> },
          { key: 'assignee', label: 'Responsable' },
          { key: 'solution', label: 'Solución', render: (row) => row.solution || '—' },
          { key: 'actions', label: 'Acciones', render: (row) => (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="outline" size="icon" aria-label="Ver incidencia" title="Ver incidencia" disabled={loadingView} onClick={() => viewIncident(row)}>
                <Eye className="size-4" />
              </Button>
              {admin && (
                <Button type="button" size="sm" className="bg-sky-600 text-white shadow-sm hover:bg-sky-700" onClick={() => { setEditing(row.id); setForm({ ...empty, ...row, assigneeId: row.assigneeId || '' }); setBefore([]); setAfter([]); setOpen(true) }}>
                  Atender
                </Button>
              )}
            </div>
          ) },
        ]} />
      </Panel>
      <Dialog open={Boolean(viewing)} onOpenChange={(next) => { if (!next) setViewing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.incident.code} · {viewing?.incident.title}</DialogTitle>
            <DialogDescription>
              {viewing && `${viewing.incident.equipmentCode} · ${viewing.incident.equipmentName} · ${viewing.incident.reportedOn}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
                <p className="text-sm"><span className="font-semibold">MAC:</span> {viewing.incident.equipmentMac || '—'}</p>
                <p className="text-sm"><span className="font-semibold">Serie:</span> {viewing.incident.equipmentSerial || '—'}</p>
                <p className="text-sm"><span className="font-semibold">Prioridad:</span> <Pill value={viewing.incident.priority} solid /></p>
                <p className="text-sm"><span className="font-semibold">Estado:</span> <Pill value={viewing.incident.status} solid /></p>
                <p className="text-sm sm:col-span-2"><span className="font-semibold">Responsable:</span> {viewing.incident.assignee || 'Sin asignar'}</p>
                <p className="text-sm sm:col-span-2"><span className="font-semibold">Descripción:</span> {viewing.incident.description || 'Sin descripción.'}</p>
                <p className="text-sm sm:col-span-2"><span className="font-semibold">Solución:</span> {viewing.incident.solution || 'Sin solución registrada.'}</p>
              </div>
              <PhotoGallery title="Fotos del problema" photos={viewing.photos.before} />
              <PhotoGallery title="Fotos después de la atención" photos={viewing.photos.after} />
            </div>
          )}
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
              <img src={photo.path} alt={title} className="h-36 w-full object-cover transition-transform hover:scale-105" />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No hay fotos cargadas.</p>
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
              { key: 'priority', label: 'Prioridad', render: (row) => <Pill value={row.priority} /> },
              { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
              { key: 'solution', label: 'Solución' },
            ]} />
          </div>
        )}
      </Panel>
    </div>
  )
}
