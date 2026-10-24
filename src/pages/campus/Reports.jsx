import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { WEEKDAYS } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Panel, Pill, Table } from './kit'

export function ReportsPage() {
  const [summary, setSummary] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [incidents, setIncidents] = useState([])
  const [equipment, setEquipment] = useState([])

  useEffect(() => {
    api('/api/summary').then((result) => { if (result.ok) setSummary(result) })
    api('/api/maintenance').then((result) => { if (result.ok) setMaintenance(result.maintenance) })
    api('/api/incidents').then((result) => { if (result.ok) setIncidents(result.incidents) })
    api('/api/equipment').then((result) => { if (result.ok) setEquipment(result.equipment) })
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button type="button" className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background" onClick={() => window.print()}>Imprimir reporte</button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="bg-black" label="Programados" value={summary?.maintenance.programados || 0} />
        <Stat tone="bg-emerald-600" label="Realizados" value={summary?.maintenance.realizados || 0} />
        <Stat tone="bg-amber-500" label="En proceso" value={summary?.maintenance.proceso || 0} />
        <Stat tone="bg-rose-600" label="Pendientes" value={summary?.maintenance.pendientes || 0} />
      </div>
      <Panel title="Equipos por estado operativo">
        <Table rows={equipment} columns={[
          { key: 'code', label: 'Código' }, { key: 'name', label: 'Equipo' }, { key: 'place', label: 'Ambiente' },
          { key: 'state', label: 'Estado', render: (row) => <Pill value={row.operationalState} /> },
        ]} />
      </Panel>
      <Panel title="Mantenimientos">
        <Table rows={maintenance} columns={[
          { key: 'code', label: 'Código' }, { key: 'date', label: 'Fecha' }, { key: 'equipmentName', label: 'Equipo' },
          { key: 'type', label: 'Tipo' }, { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
        ]} />
      </Panel>
      <Panel title="Incidencias vinculadas al inventario">
        <Table rows={incidents} columns={[
          { key: 'code', label: 'Código' }, { key: 'equipmentCode', label: 'Equipo' }, { key: 'title', label: 'Falla' },
          { key: 'priority', label: 'Prioridad', render: (row) => <Pill value={row.priority} /> },
          { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
        ]} />
      </Panel>
    </div>
  )
}

export function DocumentsPage() {
  const { user, toast } = useApp()
  const [rows, setRows] = useState([])
  const [equipment, setEquipment] = useState([])
  const [form, setForm] = useState({ title: '', kind: 'Ficha técnica', equipmentId: '', notes: '' })
  const [openDoc, setOpenDoc] = useState(false)

  async function load() {
    const [docs, gear] = await Promise.all([api('/api/documents'), api('/api/equipment')])
    if (docs.ok) setRows(docs.documents)
    if (gear.ok) setEquipment(gear.equipment)
  }
  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    const result = await api('/api/documents', { method: 'POST', body: { ...form, equipmentId: form.equipmentId || null } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast('Documento registrado.')
    setForm({ title: '', kind: 'Ficha técnica', equipmentId: '', notes: '' })
    setOpenDoc(false)
    load()
  }

  return (
    <div className="space-y-4">
      {user.role === 'admin' && <div className="flex justify-end"><Button type="button" onClick={() => setOpenDoc(true)}>Nuevo documento</Button></div>}
      <Dialog open={openDoc} onOpenChange={setOpenDoc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva documentación técnica</DialogTitle>
            <DialogDescription>Ficha, protocolo, reporte o manual vinculado a un equipo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3">
            <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Tipo"><Choice value={form.kind} onChange={(value) => setForm({ ...form, kind: value })} options={['Ficha técnica', 'Protocolo', 'Reporte', 'Manual'].map((item) => ({ value: item, label: item }))} /></Field>
            <Field label="Equipo"><Choice value={form.equipmentId || 'general'} onChange={(value) => setForm({ ...form, equipmentId: value === 'general' ? '' : value })} options={[{ value: 'general', label: 'General' }, ...equipment.map((item) => ({ value: item.id, label: item.code }))]} /></Field>
            <Field label="Nota"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDoc(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Panel title="Documentos">
        <Table rows={rows} columns={[
          { key: 'title', label: 'Título' }, { key: 'kind', label: 'Tipo' },
          { key: 'equipment_code', label: 'Equipo', render: (row) => row.equipment_code || 'General' },
          { key: 'notes', label: 'Nota' },
        ]} />
      </Panel>
    </div>
  )
}

export function FixedHoursPage() {
  const { user, users, rooms, toast } = useApp()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ teacherId: '', roomId: '', weekday: '1', startTime: '08:00', endTime: '09:30', grade: '8°', section: 'A', purpose: 'Horario fijo' })
  const [openHour, setOpenHour] = useState(false)

  async function load() {
    const result = await api('/api/fixed-schedules')
    if (result.ok) setRows(result.schedules)
  }
  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    const result = await api('/api/fixed-schedules', { method: 'POST', body: { ...form, weekday: Number(form.weekday) } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast('Horario fijo agregado. Ya bloquea el calendario.')
    setOpenHour(false)
    load()
  }

  return (
    <div className="space-y-4">
      <Panel title="Horarios fijos semanales">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Estos bloques aparecen solos cada semana y no permiten otra reserva en la misma sala.</p>
          {user.role === 'admin' && <Button type="button" onClick={() => setOpenHour(true)}>Agregar horario</Button>}
        </div>
        <Dialog open={openHour} onOpenChange={setOpenHour}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Horario fijo semanal</DialogTitle>
              <DialogDescription>El bloque se repetirá el día elegido y bloqueará la sala.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="grid gap-3">
              <Field label="Docente"><Choice value={form.teacherId} onChange={(value) => setForm({ ...form, teacherId: value })} options={users.filter((item) => item.role === 'teacher').map((item) => ({ value: item.id, label: item.name }))} /></Field>
              <Field label="Sala"><Choice value={form.roomId} onChange={(value) => setForm({ ...form, roomId: value })} options={rooms.map((item) => ({ value: item.id, label: item.name }))} /></Field>
              <Field label="Día"><Choice value={form.weekday} onChange={(value) => setForm({ ...form, weekday: value })} options={WEEKDAYS.map((day) => ({ value: day.id, label: day.label }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
                <Field label="Fin"><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
              </div>
              <Field label="Finalidad"><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenHour(false)}>Cancelar</Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Table rows={rows} columns={[
          { key: 'teacherName', label: 'Docente' },
          { key: 'day', label: 'Día', render: (row) => WEEKDAYS.find((day) => day.id === Number(row.weekday))?.label },
          { key: 'hours', label: 'Horario', render: (row) => `${row.startTime}–${row.endTime}` },
          { key: 'roomName', label: 'Sala' },
          { key: 'grade', label: 'Grado', render: (row) => `${row.grade} ${row.section}` },
          { key: 'purpose', label: 'Finalidad' },
          { key: 'actions', label: '', render: (row) => user.role === 'admin' ? <button type="button" className="font-bold text-rose-700" onClick={async () => { await api(`/api/fixed-schedules/${row.id}`, { method: 'DELETE' }); load() }}>Quitar</button> : null },
        ]} />
      </Panel>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-extrabold text-white ${tone}`}>{value}</span>
      <p className="text-sm font-bold text-slate-600">{label}</p>
    </article>
  )
}
