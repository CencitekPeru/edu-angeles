import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, upload } from '../../lib/api'
import { INCIDENT_STATUS } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Filters, Panel, Pill, Table } from './kit'

const empty = {
  equipmentId: '', priority: 'media', status: 'registrada', assigneeId: '', title: '', description: '', solution: '',
  reportedOn: new Date().toISOString().slice(0, 10),
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
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' })

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
    if (before.length && id) await upload(`/api/incidents/${id}/photos`, before, { kind: 'before' })
    if (after.length && id) await upload(`/api/incidents/${id}/photos`, after, { kind: 'after' })
    toast(editing ? 'Incidencia actualizada.' : `Incidencia ${result.code} vinculada al equipo.`)
    setForm(empty)
    setEditing(null)
    setBefore([])
    setAfter([])
    setOpen(false)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => { setForm(empty); setEditing(null); setOpen(true) }}>Registrar incidencia</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Actualizar incidencia' : 'Registrar incidencia'}</DialogTitle>
            <DialogDescription>La falla queda vinculada al código del equipo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Equipo del inventario *" className="sm:col-span-2"><Choice value={form.equipmentId} onChange={(value) => setForm({ ...form, equipmentId: value })} options={equipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Field>
            <Field label="Prioridad"><Choice value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }]} /></Field>
            <Field label="Seguimiento"><Choice value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={Object.entries(INCIDENT_STATUS).map(([id, label]) => ({ value: id, label }))} /></Field>
            {admin && <Field label="Responsable"><Choice value={form.assigneeId || 'ninguno'} onChange={(value) => setForm({ ...form, assigneeId: value === 'ninguno' ? '' : value })} options={[{ value: 'ninguno', label: 'Sin asignar' }, ...users.map((item) => ({ value: item.id, label: item.name }))]} /></Field>}
            <Field label="Fecha"><Input type="date" value={form.reportedOn} onChange={(e) => setForm({ ...form, reportedOn: e.target.value })} /></Field>
            <Field label="Falla *" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Descripción" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Solución aplicada" className="sm:col-span-2"><Textarea value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} /></Field>
            <Field label="Fotos del problema"><Input type="file" accept="image/*" multiple onChange={(e) => setBefore([...e.target.files])} /></Field>
            <Field label="Fotos después de la atención"><Input type="file" accept="image/*" multiple onChange={(e) => setAfter([...e.target.files])} /></Field>
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
          { key: 'title', label: 'Falla' },
          { key: 'priority', label: 'Prioridad', render: (row) => <Pill value={row.priority} /> },
          { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
          { key: 'assignee', label: 'Responsable' },
          { key: 'solution', label: 'Solución', render: (row) => row.solution || '—' },
          { key: 'actions', label: '', render: (row) => admin ? <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(row.id); setForm({ ...empty, ...row, assigneeId: row.assigneeId || '' }); setOpen(true) }}>Atender</Button> : null },
        ]} />
      </Panel>
    </div>
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
