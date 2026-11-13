import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, FileText, Flag, ListChecks, MapPin, Package, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Pill } from '../campus/kit'
import { Select, todayLima } from '../attendance/shared'

/* ------------------------------------------------------------- catalogs */

export const ACTIVITY_TYPES = ['Cívica', 'Académica', 'Cultural', 'Deportiva', 'Religiosa', 'Reunión institucional', 'Escuela de padres', 'Salida / visita de estudio', 'Capacitación', 'Otra']
export const ACTIVITY_LEVELS = ['Institucional', 'Primaria', 'Secundaria']
export const ACTIVITY_STATUS = ['Planificada', 'En preparación', 'En ejecución', 'Realizada', 'Postergada', 'Cancelada']
export const TASK_STATUS = ['Pendiente', 'En proceso', 'Completada']
export const RESOURCE_CATEGORIES = ['Material', 'Equipo', 'Ambiente', 'Presupuesto', 'Transporte', 'Alimentación', 'Otro']
export const RESOURCE_STATUS = ['Solicitado', 'Aprobado', 'Entregado', 'No disponible']
export const ACTIVE_STATUS = ['Planificada', 'En preparación', 'En ejecución']

export const ACT = {
  panel: '/admin/actividades',
  calendar: '/admin/actividades/calendario',
  list: '/admin/actividades/programadas',
  commissions: '/admin/actividades/comisiones',
  followUp: '/admin/actividades/seguimiento',
  resources: '/admin/actividades/recursos',
}
export const activityLink = (id) => `${ACT.list}?actividad=${id}`

/* -------------------------------------------------------------- helpers */

export const opts = (list, first) => [...(first ? [{ value: '', label: first }] : []), ...list.map((value) => ({ value, label: value }))]
export const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
export function shortDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const dateLabel = (item) => (item.endDate && item.endDate !== item.startDate ? `${dmy(item.startDate)} al ${dmy(item.endDate)}` : dmy(item.startDate))
export const timeLabel = (item) => (item.startTime ? (item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime) : 'Todo el día')
export const soles = (value) => (value === null || value === undefined ? '—' : `S/ ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
export const isOverdue = (task, today = todayLima()) => task.status !== 'Completada' && task.dueDate && task.dueDate < today
/** Days between today and an ISO date (negative when it already passed). */
export function daysUntil(iso, today = todayLima()) {
  const [a, b] = [iso, today].map((value) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d) })
  return Math.round((a - b) / 86400000)
}

export function Progress({ value, className }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">Sin tareas</span>
  return (
    <span className={cn('flex items-center gap-2', className)} title={`${value} % de tareas completadas`}>
      <span className="h-2 w-20 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{ width: `${value}%` }} /></span>
      <span className="text-xs tabular-nums text-muted-foreground">{value} %</span>
    </span>
  )
}

export function Section({ icon: Icon, title, className, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-3 py-2 text-sm font-bold dark:bg-muted/40">{Icon && <Icon className="size-4 text-primary" />} {title}</h3>
      <div className={cn('grid gap-3 p-3', className)}>{children}</div>
    </section>
  )
}

export function Field({ label, required, hint, className, children }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}{required && <span className="text-destructive"> *</span>}{hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}</span>
      {children}
    </label>
  )
}

export function useCommissions() {
  const [commissions, setCommissions] = useState([])
  async function reload() {
    const result = await api('/api/commissions')
    if (result.ok) setCommissions(result.commissions)
  }
  useEffect(() => { reload() }, [])
  return [commissions, reload]
}

function usePlaces() {
  const [places, setPlaces] = useState([])
  useEffect(() => { api('/api/places').then((result) => { if (result.ok) setPlaces(result.places) }) }, [])
  return places
}

function useSave(onSaved) {
  const { toast } = useApp()
  const [saving, setSaving] = useState(false)
  async function run(request, message) {
    setSaving(true)
    const result = await request()
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(typeof message === 'function' ? message(result) : message)
    onSaved(result)
  }
  return [saving, run, toast]
}

function FormDialog({ title, description, icon: Icon, formId, saving, onClose, submitLabel = 'Guardar', size = 'sm:max-w-3xl', children }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={cn('max-h-[94vh] overflow-y-auto', size)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{Icon && <Icon className="size-5 text-primary" />} {title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
          <Button type="submit" form={formId} disabled={saving}>{saving ? 'Guardando…' : submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------- activity */

const emptyActivity = (date) => ({
  title: '', type: '', level: 'Institucional', audience: '', startDate: date || todayLima(), endDate: '', startTime: '', endTime: '', place: '',
  commissionId: '', responsible: '', objective: '', description: '', budget: '', status: 'Planificada',
})

/** Registers or edits an activity: general data, date and place, who is in charge, and planning. */
export function ActivityForm({ activity, date, onClose, onSaved }) {
  const editing = Boolean(activity?.id)
  const [commissions] = useCommissions()
  const places = usePlaces()
  const [form, setForm] = useState(() => (editing
    ? { ...activity, commissionId: activity.commissionId ? String(activity.commissionId) : '', budget: activity.budget ?? '', endDate: activity.endDate === activity.startDate ? '' : activity.endDate }
    : emptyActivity(date)))
  const [saving, run, toast] = useSave(onSaved)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const knownPlace = !form.place || places.some((item) => item.name === form.place)

  function save(event) {
    event.preventDefault()
    if (!form.commissionId && !form.responsible.trim()) return toast('Indica la comisión o la persona responsable.', 'bad')
    return run(
      () => (editing ? api(`/api/activities/${activity.id}`, { method: 'PATCH', body: form }) : api('/api/activities', { method: 'POST', body: form })),
      (result) => (editing ? 'Actividad actualizada.' : `Actividad ${result.code} registrada.`),
    )
  }

  return (
    <FormDialog title={editing ? `Editar actividad ${activity.code}` : 'Registrar actividad'} description="Programa una actividad institucional y define quién está a cargo." icon={CalendarDays} formId="activity-form" saving={saving} onClose={onClose} submitLabel={editing ? 'Guardar cambios' : 'Registrar actividad'}>
      <form id="activity-form" className="space-y-3" onSubmit={save}>
        <Section icon={Flag} title="1. Datos generales" className="sm:grid-cols-4">
          <Field label="Nombre de la actividad" required className="sm:col-span-4"><Input value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={200} placeholder="Ej. Ceremonia por el Día de la Bandera" required /></Field>
          <Field label="Tipo" required><Select value={form.type} onChange={(type) => set({ type })} options={opts(ACTIVITY_TYPES, 'Seleccione')} required /></Field>
          <Field label="Nivel"><Select value={form.level} onChange={(level) => set({ level })} options={opts(ACTIVITY_LEVELS)} /></Field>
          <Field label="Dirigido a" className="sm:col-span-2"><Input value={form.audience} onChange={(event) => set({ audience: event.target.value })} maxLength={160} placeholder="Ej. Estudiantes de 1.° a 5.° de secundaria y padres" /></Field>
        </Section>
        <Section icon={MapPin} title="2. Fecha y lugar" className="sm:grid-cols-4">
          <Field label="Fecha de inicio" required><Input type="date" value={form.startDate} onChange={(event) => set({ startDate: event.target.value })} required /></Field>
          <Field label="Fecha de fin" hint="si dura varios días"><Input type="date" value={form.endDate} min={form.startDate} onChange={(event) => set({ endDate: event.target.value })} /></Field>
          <Field label="Hora de inicio"><Input type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} /></Field>
          <Field label="Hora de fin"><Input type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} /></Field>
          <Field label="Lugar" className="sm:col-span-2">
            <Select value={knownPlace ? form.place : '__other'} onChange={(place) => set({ place: place === '__other' ? ' ' : place })} options={[{ value: '', label: 'Seleccione' }, ...places.map((item) => ({ value: item.name, label: item.name })), { value: '__other', label: 'Otro lugar…' }]} />
          </Field>
          {!knownPlace && <Field label="Otro lugar" className="sm:col-span-2"><Input value={form.place.trimStart()} onChange={(event) => set({ place: event.target.value })} maxLength={160} placeholder="Ej. Estadio municipal" /></Field>}
        </Section>
        <Section icon={Users} title="3. Responsables" className="sm:grid-cols-2">
          <Field label="Comisión a cargo"><Select value={form.commissionId} onChange={(commissionId) => set({ commissionId })} options={[{ value: '', label: 'Sin comisión' }, ...commissions.filter((item) => item.active || String(item.id) === form.commissionId).map((item) => ({ value: String(item.id), label: item.name }))]} /></Field>
          <Field label="Responsable directo"><Input value={form.responsible} onChange={(event) => set({ responsible: event.target.value })} maxLength={160} placeholder="Ej. Prof. Ana Torres" /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Indica al menos la comisión o la persona responsable. Las comisiones se administran en «Comisiones y responsables».</p>
        </Section>
        <Section icon={ClipboardList} title="4. Planificación" className="sm:grid-cols-4">
          <Field label="Objetivo" className="sm:col-span-2"><Textarea rows={3} value={form.objective} onChange={(event) => set({ objective: event.target.value })} maxLength={2000} placeholder="¿Qué se busca lograr con la actividad?" /></Field>
          <Field label="Descripción / programa" className="sm:col-span-2"><Textarea rows={3} value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={4000} placeholder="Momentos, programa o detalles de organización" /></Field>
          <Field label="Presupuesto estimado (S/)"><Input inputMode="decimal" value={form.budget} onChange={(event) => set({ budget: event.target.value })} placeholder="0.00" /></Field>
          <Field label="Estado"><Select value={form.status} onChange={(status) => set({ status })} options={opts(ACTIVITY_STATUS)} /></Field>
        </Section>
      </form>
    </FormDialog>
  )
}

/* ----------------------------------------------------- task / resource / report */

export function TaskForm({ activityId, task, onClose, onSaved }) {
  const editing = Boolean(task?.id)
  const [form, setForm] = useState(() => (editing ? { ...task } : { title: '', responsible: '', dueDate: '', status: 'Pendiente', notes: '' }))
  const [saving, run] = useSave(onSaved)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  return (
    <FormDialog title={editing ? 'Editar tarea' : 'Nueva tarea'} description="Acción concreta para preparar o ejecutar la actividad." icon={ListChecks} formId="task-form" saving={saving} onClose={onClose} size="sm:max-w-xl">
      <form id="task-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); run(() => (editing ? api(`/api/activity-tasks/${task.id}`, { method: 'PATCH', body: form }) : api(`/api/activities/${activityId}/tasks`, { method: 'POST', body: form })), editing ? 'Tarea actualizada.' : 'Tarea registrada.') }}>
        <Field label="Tarea" required className="sm:col-span-2"><Input value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={200} placeholder="Ej. Coordinar el equipo de sonido" required /></Field>
        <Field label="Responsable" required><Input value={form.responsible} onChange={(event) => set({ responsible: event.target.value })} maxLength={160} required /></Field>
        <Field label="Fecha límite"><Input type="date" value={form.dueDate} onChange={(event) => set({ dueDate: event.target.value })} /></Field>
        <Field label="Estado"><Select value={form.status} onChange={(status) => set({ status })} options={opts(TASK_STATUS)} /></Field>
        <Field label="Observaciones" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={2000} /></Field>
      </form>
    </FormDialog>
  )
}

export function ResourceForm({ activityId, resource, onClose, onSaved }) {
  const editing = Boolean(resource?.id)
  const [form, setForm] = useState(() => (editing ? { ...resource, estimatedCost: resource.estimatedCost ?? '' } : { category: '', description: '', quantity: '1', unit: 'unidad', estimatedCost: '', status: 'Solicitado', provider: '', notes: '' }))
  const [saving, run] = useSave(onSaved)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const subtotal = Number(form.quantity) * Number(String(form.estimatedCost).replace(',', '.'))
  return (
    <FormDialog title={editing ? 'Editar recurso' : 'Nuevo recurso'} description="Materiales, equipos, ambientes o presupuesto que requiere la actividad." icon={Package} formId="resource-form" saving={saving} onClose={onClose} size="sm:max-w-2xl">
      <form id="resource-form" className="grid gap-3 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); run(() => (editing ? api(`/api/activity-resources/${resource.id}`, { method: 'PATCH', body: form }) : api(`/api/activities/${activityId}/resources`, { method: 'POST', body: form })), editing ? 'Recurso actualizado.' : 'Recurso registrado.') }}>
        <Field label="Categoría" required><Select value={form.category} onChange={(category) => set({ category })} options={opts(RESOURCE_CATEGORIES, 'Seleccione')} required /></Field>
        <Field label="Descripción" required className="sm:col-span-3"><Input value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={200} placeholder="Ej. Equipo de sonido con 2 micrófonos" required /></Field>
        <Field label="Cantidad" required><Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => set({ quantity: event.target.value })} required /></Field>
        <Field label="Unidad"><Input value={form.unit} onChange={(event) => set({ unit: event.target.value })} maxLength={40} /></Field>
        <Field label="Costo unitario (S/)" hint="estimado"><Input inputMode="decimal" value={form.estimatedCost} onChange={(event) => set({ estimatedCost: event.target.value })} placeholder="0.00" /></Field>
        <Field label="Subtotal"><Input readOnly tabIndex={-1} className="bg-muted/50" value={Number.isFinite(subtotal) && form.estimatedCost !== '' ? soles(subtotal) : '—'} /></Field>
        <Field label="Estado"><Select value={form.status} onChange={(status) => set({ status })} options={opts(RESOURCE_STATUS)} /></Field>
        <Field label="Proveedor / responsable" className="sm:col-span-3"><Input value={form.provider} onChange={(event) => set({ provider: event.target.value })} maxLength={160} placeholder="Ej. CIST, APAFA, Dirección" /></Field>
        <Field label="Observaciones" className="sm:col-span-4"><Textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={1000} /></Field>
      </form>
    </FormDialog>
  )
}

export function ReportForm({ activity, report, onClose, onSaved }) {
  const [form, setForm] = useState(() => (report ? { ...report, participants: report.participants ?? '' } : { reportDate: todayLima(), participants: '', summary: '', achievements: '', difficulties: '', recommendations: '', evidence: '' }))
  const [saving, run] = useSave(onSaved)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  return (
    <FormDialog title={report ? 'Editar informe de la actividad' : 'Informe de la actividad'} description={`${activity.code} · ${activity.title}. Al guardar, la actividad queda como «Realizada».`} icon={FileText} formId="report-form" saving={saving} onClose={onClose} submitLabel="Guardar informe">
      <form id="report-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); run(() => api(`/api/activities/${activity.id}/report`, { method: 'PUT', body: form }), 'Informe guardado.') }}>
        <Field label="Fecha del informe" required><Input type="date" value={form.reportDate} onChange={(event) => set({ reportDate: event.target.value })} required /></Field>
        <Field label="N.° de participantes"><Input type="number" min="0" step="1" value={form.participants} onChange={(event) => set({ participants: event.target.value })} /></Field>
        <Field label="Desarrollo de la actividad" required className="sm:col-span-2"><Textarea rows={3} value={form.summary} onChange={(event) => set({ summary: event.target.value })} maxLength={6000} placeholder="Cómo se desarrolló, participación, momentos principales…" required /></Field>
        <Field label="Logros alcanzados" required><Textarea rows={3} value={form.achievements} onChange={(event) => set({ achievements: event.target.value })} maxLength={4000} required /></Field>
        <Field label="Dificultades"><Textarea rows={3} value={form.difficulties} onChange={(event) => set({ difficulties: event.target.value })} maxLength={4000} /></Field>
        <Field label="Recomendaciones / mejoras" className="sm:col-span-2"><Textarea rows={2} value={form.recommendations} onChange={(event) => set({ recommendations: event.target.value })} maxLength={4000} /></Field>
        <Field label="Evidencias" hint="enlaces a fotos, videos o documentos, uno por línea" className="sm:col-span-2"><Textarea rows={2} value={form.evidence} onChange={(event) => set({ evidence: event.target.value })} maxLength={4000} placeholder="https://drive.google.com/…" /></Field>
      </form>
    </FormDialog>
  )
}

/* ---------------------------------------------------------- commission */

export function CommissionForm({ commission, onClose, onSaved }) {
  const editing = Boolean(commission?.id)
  const [form, setForm] = useState(() => (editing ? { ...commission, members: commission.members.length ? commission.members : [{ name: '', role: '' }] } : { name: '', description: '', coordinator: '', members: [{ name: '', role: '' }], active: true }))
  const [saving, run] = useSave(onSaved)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const setMember = (index, patch) => set({ members: form.members.map((item, position) => (position === index ? { ...item, ...patch } : item)) })
  return (
    <FormDialog title={editing ? 'Editar comisión' : 'Nueva comisión'} description="Equipo responsable de organizar actividades." icon={Users} formId="commission-form" saving={saving} onClose={onClose} size="sm:max-w-2xl">
      <form id="commission-form" className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(() => (editing ? api(`/api/commissions/${commission.id}`, { method: 'PATCH', body: form }) : api('/api/commissions', { method: 'POST', body: form })), editing ? 'Comisión actualizada.' : 'Comisión registrada.') }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la comisión" required><Input value={form.name} onChange={(event) => set({ name: event.target.value })} maxLength={160} placeholder="Ej. Comisión de Calendario Cívico" required /></Field>
          <Field label="Coordinador(a)" required><Input value={form.coordinator} onChange={(event) => set({ coordinator: event.target.value })} maxLength={160} required /></Field>
          <Field label="Funciones / descripción" className="sm:col-span-2"><Textarea rows={2} value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={1000} /></Field>
        </div>
        <Section icon={Users} title="Integrantes">
          {form.members.map((member, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <Input aria-label={`Integrante ${index + 1}`} value={member.name} onChange={(event) => setMember(index, { name: event.target.value })} placeholder="Nombre del integrante" maxLength={160} />
              <Input aria-label={`Función del integrante ${index + 1}`} value={member.role} onChange={(event) => setMember(index, { role: event.target.value })} placeholder="Función (ej. Secretaria)" maxLength={80} />
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar integrante" onClick={() => set({ members: form.members.filter((_, position) => position !== index) })}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set({ members: [...form.members, { name: '', role: '' }] })}><Plus /> Agregar integrante</Button>
        </Section>
        {editing && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.active} onChange={(event) => set({ active: event.target.checked })} /> Comisión activa (las inactivas no aparecen al programar actividades)</label>
        )}
      </form>
    </FormDialog>
  )
}

/* ----------------------------------------------------------- detail */

function Info({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-3' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="whitespace-pre-wrap text-sm">{children || '—'}</div>
    </div>
  )
}

/** Full activity card: information, tasks, resources and report, each editable in place. */
export function ActivityDetail({ id, onClose, onChanged, initialTab = 'info' }) {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const [data, setData] = useState(null)
  const [tab, setTab] = useState(initialTab)
  const [modal, setModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    const result = await api(`/api/activities/${id}`)
    if (result.ok) setData(result)
    else { toast(result.error || 'No se pudo abrir la actividad.', 'bad'); onClose() }
  }
  useEffect(() => { load() }, [id])
  const saved = () => { setModal(null); load(); onChanged?.() }

  async function remove(path, message) {
    const result = await api(path, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar.', 'bad')
    toast(message)
    load()
    onChanged?.()
  }

  async function quickTask(task, status) {
    const result = await api(`/api/activity-tasks/${task.id}`, { method: 'PATCH', body: { ...task, status } })
    if (!result.ok) return toast(result.error || 'No se pudo actualizar la tarea.', 'bad')
    load()
    onChanged?.()
  }

  async function deleteActivity() {
    const result = await api(`/api/activities/${id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar la actividad.', 'bad')
    toast('Actividad eliminada.')
    onChanged?.()
    onClose()
  }

  const item = data?.activity
  const today = todayLima()
  const tabs = [['info', 'Información', Flag], ['tasks', `Tareas (${data?.tasks.length || 0})`, ListChecks], ['resources', `Recursos (${data?.resources.length || 0})`, Package], ['report', 'Informe', FileText]]
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        {!item ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">{item.code} · {item.title} <Pill value={item.status} /></DialogTitle>
              <DialogDescription>{item.type} · {dateLabel(item)} · {timeLabel(item)}{item.place ? ` · ${item.place}` : ''}</DialogDescription>
            </DialogHeader>
            <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Secciones de la actividad">
              {tabs.map(([value, label, Icon]) => (
                <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}
                  className={cn('-mb-px flex items-center gap-1.5 rounded-t-lg border px-3 py-2 text-sm font-semibold', tab === value ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </nav>

            {tab === 'info' && (
              <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
                <Info label="Tipo">{item.type}</Info>
                <Info label="Nivel">{item.level}</Info>
                <Info label="Dirigido a">{item.audience}</Info>
                <Info label="Fecha">{dateLabel(item)}</Info>
                <Info label="Horario">{timeLabel(item)}</Info>
                <Info label="Lugar">{item.place}</Info>
                <Info label="Comisión">{item.commissionName ? `${item.commissionName}${item.commissionCoordinator ? ` (coord. ${item.commissionCoordinator})` : ''}` : ''}</Info>
                <Info label="Responsable directo">{item.responsible}</Info>
                <Info label="Avance de tareas"><Progress value={item.tasks.progress} /></Info>
                <Info label="Presupuesto estimado">{soles(item.budget)}</Info>
                <Info label="Costo de recursos">{soles(item.resources.cost)}</Info>
                <Info label="Registrado por">{item.createdBy}</Info>
                <Info wide label="Objetivo">{item.objective}</Info>
                <Info wide label="Descripción / programa">{item.description}</Info>
              </div>
            )}

            {tab === 'tasks' && (
              <div className="space-y-2">
                {canEdit && <Button type="button" size="sm" onClick={() => setModal({ kind: 'task' })}><Plus /> Nueva tarea</Button>}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.tasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className={cn('block font-medium', task.status === 'Completada' && 'text-muted-foreground line-through')}>{task.title}</span>
                        <span className="text-xs text-muted-foreground">{task.responsible}{task.dueDate ? ` · vence ${dmy(task.dueDate)}` : ''}{isOverdue(task, today) && <strong className="ml-1 text-destructive">· vencida</strong>}</span>
                      </span>
                      <Pill value={task.status} />
                      {canEdit && (
                        <span className="flex gap-1">
                          {task.status !== 'Completada' && <Button type="button" variant="ghost" size="icon" className="size-8 text-[#3f7d5c]" title="Marcar como completada" aria-label="Marcar como completada" onClick={() => quickTask(task, 'Completada')}><CheckCircle2 /></Button>}
                          <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar" aria-label="Editar tarea" onClick={() => setModal({ kind: 'task', item: task })}><Pencil /></Button>
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-[#9a2f2a]" title="Eliminar" aria-label="Eliminar tarea" onClick={() => remove(`/api/activity-tasks/${task.id}`, 'Tarea eliminada.')}><Trash2 /></Button>
                        </span>
                      )}
                    </li>
                  ))}
                  {!data.tasks.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin tareas. Divide la organización en tareas con responsable y fecha límite para hacer seguimiento.</li>}
                </ul>
              </div>
            )}

            {tab === 'resources' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {canEdit ? <Button type="button" size="sm" onClick={() => setModal({ kind: 'resource' })}><Plus /> Nuevo recurso</Button> : <span />}
                  <span className="text-sm">Costo estimado: <strong>{soles(item.resources.cost)}</strong>{item.budget !== null && <span className="text-muted-foreground"> de {soles(item.budget)} presupuestados</span>}</span>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.resources.map((resource) => (
                    <li key={resource.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{resource.description}</span>
                        <span className="text-xs text-muted-foreground">{resource.category} · {resource.quantity} {resource.unit}{resource.estimatedCost !== null ? ` · ${soles(resource.estimatedCost * resource.quantity)}` : ''}{resource.provider ? ` · ${resource.provider}` : ''}</span>
                      </span>
                      <Pill value={resource.status} />
                      {canEdit && (
                        <span className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar" aria-label="Editar recurso" onClick={() => setModal({ kind: 'resource', item: resource })}><Pencil /></Button>
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-[#9a2f2a]" title="Eliminar" aria-label="Eliminar recurso" onClick={() => remove(`/api/activity-resources/${resource.id}`, 'Recurso eliminado.')}><Trash2 /></Button>
                        </span>
                      )}
                    </li>
                  ))}
                  {!data.resources.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin recursos registrados.</li>}
                </ul>
              </div>
            )}

            {tab === 'report' && (
              data.report ? (
                <div className="space-y-3">
                  <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
                    <Info label="Fecha del informe">{dmy(data.report.reportDate)}</Info>
                    <Info label="Participantes">{data.report.participants ?? ''}</Info>
                    <Info label="Elaborado por">{data.report.createdBy}</Info>
                    <Info wide label="Desarrollo">{data.report.summary}</Info>
                    <Info wide label="Logros">{data.report.achievements}</Info>
                    <Info wide label="Dificultades">{data.report.difficulties}</Info>
                    <Info wide label="Recomendaciones">{data.report.recommendations}</Info>
                    <Info wide label="Evidencias">
                      {data.report.evidence && data.report.evidence.split('\n').filter(Boolean).map((line) => (
                        /^https?:\/\//.test(line.trim()) ? <a key={line} href={line.trim()} target="_blank" rel="noreferrer" className="block break-all text-primary hover:underline">{line.trim()}</a> : <span key={line} className="block">{line}</span>
                      ))}
                    </Info>
                  </div>
                  {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setModal({ kind: 'report' })}><Pencil /> Editar informe</Button>}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {['Cancelada', 'Postergada'].includes(item.status) ? `La actividad está «${item.status}»: no corresponde informe.` : 'Aún no hay informe de resultados.'}
                  {canEdit && !['Cancelada', 'Postergada'].includes(item.status) && <div className="mt-3"><Button type="button" size="sm" onClick={() => setModal({ kind: 'report' })}><FileText /> Elaborar informe</Button></div>}
                </div>
              )
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              {canEdit ? <Button type="button" variant="ghost" className="text-[#9a2f2a]" onClick={() => setConfirmDelete(true)}><Trash2 /> Eliminar actividad</Button> : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
                {canEdit && <Button type="button" onClick={() => setModal({ kind: 'activity' })}><Pencil /> Editar actividad</Button>}
              </div>
            </DialogFooter>
          </>
        )}
        {modal?.kind === 'activity' && <ActivityForm activity={item} onClose={() => setModal(null)} onSaved={saved} />}
        {modal?.kind === 'task' && <TaskForm activityId={id} task={modal.item} onClose={() => setModal(null)} onSaved={saved} />}
        {modal?.kind === 'resource' && <ResourceForm activityId={id} resource={modal.item} onClose={() => setModal(null)} onSaved={saved} />}
        {modal?.kind === 'report' && <ReportForm activity={item} report={data.report} onClose={() => setModal(null)} onSaved={saved} />}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Eliminar la actividad {item?.code}?</DialogTitle>
              <DialogDescription>Se eliminarán también sus tareas, recursos e informe. Si solo cambió la fecha o no se realizará, es mejor marcarla como «Postergada» o «Cancelada».</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button type="button" variant="destructive" onClick={deleteActivity}>Sí, eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
