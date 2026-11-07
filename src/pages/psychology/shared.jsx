import { useEffect, useMemo, useState } from 'react'
import { Lock, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Select, todayLima } from '../attendance/shared'

export const REASONS = ['Emocional', 'Conductual', 'Académico', 'Familiar', 'Social', 'Convivencia escolar', 'Orientación vocacional', 'Otro']
export const REFERRALS = ['Docente / tutor', 'Padre o madre de familia', 'Auxiliar', 'Dirección', 'Iniciativa del estudiante', 'Psicología', 'Otro']
export const RISKS = ['Bajo', 'Medio', 'Alto']
export const CASE_STATUS = ['Abierto', 'En seguimiento', 'Derivado', 'Cerrado']
export const SESSION_TYPES = ['Individual', 'Familiar', 'Grupal', 'Con docente / tutor']
export const SESSION_STATUS = ['Programada', 'Realizada', 'No asistió', 'Cancelada']

export const opts = (list, first) => [...(first ? [{ value: '', label: first }] : []), ...list.map((value) => ({ value, label: value }))]
export const classroom = (student) => `${student.level} · ${student.grade} ${student.section}`

/** «12 nov 2026» from an ISO date. */
export function shortDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ConfidentialNote() {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground dark:bg-muted/40">
      <Lock className="size-3.5 shrink-0 text-primary" />
      Información confidencial: solo Coordinación y Psicología pueden registrarla; Dirección puede consultarla.
    </p>
  )
}

function Label({ label, children, className }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Searchable student list (by name, code, DNI or classroom). */
function StudentPicker({ value, onChange }) {
  const [students, setStudents] = useState([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    api('/api/psychology/students').then((result) => { if (result.ok) setStudents(result.students) })
  }, [])
  const selected = students.find((item) => item.id === value)
  const term = query.trim().toLowerCase()
  const results = useMemo(
    () => (term ? students.filter((item) => `${item.name} ${item.code} ${item.dni} ${classroom(item)}`.toLowerCase().includes(term)) : students).slice(0, 40),
    [students, term],
  )
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm dark:bg-muted/40">
        <span className="min-w-0"><span className="block truncate font-semibold">{selected.name}</span><span className="text-xs text-muted-foreground">{selected.code} · {classroom(selected)}</span></span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>Cambiar</Button>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código, DNI o grado…" />
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
        {results.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onChange(item.id)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{classroom(item)}</span>
            </button>
          </li>
        ))}
        {!results.length && <li className="px-3 py-3 text-center text-xs text-muted-foreground">{students.length ? 'Sin coincidencias.' : 'No hay estudiantes registrados en Asistencia estudiantil.'}</li>}
      </ul>
    </div>
  )
}

const emptyCase = () => ({ studentId: null, openedOn: todayLima(), reason: '', referredBy: '', referrerName: '', riskLevel: 'Bajo', status: 'Abierto', description: '' })

/** Create (no `item`) or edit a case. */
export function CaseForm({ item, onClose, onSaved }) {
  const { toast } = useApp()
  const [form, setForm] = useState(() => (item
    ? { studentId: item.student.id, openedOn: item.openedOn, reason: item.reason, referredBy: item.referredBy, referrerName: item.referrerName, riskLevel: item.riskLevel, status: item.status, description: item.description || '' }
    : emptyCase()))
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function save(event) {
    event.preventDefault()
    if (!form.studentId) return toast('Selecciona el estudiante.', 'bad')
    if (!form.reason || !form.referredBy) return toast('Completa el motivo y quién deriva el caso.', 'bad')
    setSaving(true)
    const result = item
      ? await api(`/api/psychology/cases/${item.id}`, { method: 'PATCH', body: form })
      : await api('/api/psychology/cases', { method: 'POST', body: form })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar el caso.', 'bad')
    toast(item ? 'Caso actualizado.' : `Caso ${result.code} registrado.`)
    onSaved(result.id || item.id)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? `Editar caso ${item.code}` : 'Nuevo caso de atención psicológica'}</DialogTitle>
          <DialogDescription>Registra el motivo y la derivación. Las sesiones se agregan desde el detalle del caso.</DialogDescription>
        </DialogHeader>
        <form id="psych-case-form" className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
          <Label label="Estudiante *" className="sm:col-span-2">
            {item ? <p className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm font-semibold dark:bg-muted/40">{item.student.name} <span className="font-normal text-muted-foreground">· {classroom(item.student)}</span></p> : <StudentPicker value={form.studentId} onChange={(studentId) => set({ studentId })} />}
          </Label>
          <Label label="Fecha de apertura *"><Input type="date" value={form.openedOn} onChange={(event) => set({ openedOn: event.target.value })} required /></Label>
          <Label label="Motivo de la atención *"><Select value={form.reason} onChange={(reason) => set({ reason })} options={opts(REASONS, 'Seleccione')} /></Label>
          <Label label="Derivado por *"><Select value={form.referredBy} onChange={(referredBy) => set({ referredBy })} options={opts(REFERRALS, 'Seleccione')} /></Label>
          <Label label="Nombre de quien deriva"><Input value={form.referrerName} onChange={(event) => set({ referrerName: event.target.value })} maxLength={160} placeholder="Ej. Prof. tutor de 3° B" /></Label>
          <Label label="Nivel de riesgo"><Select value={form.riskLevel} onChange={(riskLevel) => set({ riskLevel })} options={opts(RISKS)} /></Label>
          <Label label="Estado del caso"><Select value={form.status} onChange={(status) => set({ status })} options={opts(CASE_STATUS)} /></Label>
          <Label label="Descripción de la situación" className="sm:col-span-2">
            <Textarea rows={4} value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={4000} placeholder="Qué se observó, desde cuándo, antecedentes relevantes…" />
          </Label>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="psych-case-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar caso'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Create a session for `caseId`, or edit `session`. */
export function SessionForm({ caseId, caseLabel, session, onClose, onSaved }) {
  const { toast } = useApp()
  const [form, setForm] = useState(() => (session
    ? { date: session.date, time: session.time, type: session.type, status: session.status, notes: session.notes || '', agreements: session.agreements || '' }
    : { date: todayLima(), time: '09:00', type: 'Individual', status: 'Programada', notes: '', agreements: '' }))
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const done = form.status === 'Realizada'

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const result = session
      ? await api(`/api/psychology/sessions/${session.id}`, { method: 'PATCH', body: form })
      : await api(`/api/psychology/cases/${caseId}/sessions`, { method: 'POST', body: form })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar la sesión.', 'bad')
    toast(session ? 'Sesión actualizada.' : form.status === 'Programada' ? 'Cita programada.' : 'Sesión registrada.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session ? 'Editar sesión' : 'Nueva sesión o cita'}</DialogTitle>
          <DialogDescription>{caseLabel}</DialogDescription>
        </DialogHeader>
        <form id="psych-session-form" className="grid gap-3 sm:grid-cols-4" onSubmit={save}>
          <Label label="Fecha *"><Input type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} required /></Label>
          <Label label="Hora *"><Input type="time" value={form.time} onChange={(event) => set({ time: event.target.value })} required /></Label>
          <Label label="Tipo"><Select value={form.type} onChange={(type) => set({ type })} options={opts(SESSION_TYPES)} /></Label>
          <Label label="Estado"><Select value={form.status} onChange={(status) => set({ status })} options={opts(SESSION_STATUS)} /></Label>
          <Label label={done ? 'Desarrollo de la sesión' : 'Notas'} className="sm:col-span-4">
            <Textarea rows={done ? 5 : 3} value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={6000} placeholder={done ? 'Temas trabajados, observaciones, técnicas aplicadas…' : 'Motivo de la cita u observaciones previas'} />
          </Label>
          {done && (
            <Label label="Acuerdos y próximos pasos" className="sm:col-span-4">
              <Textarea rows={3} value={form.agreements} onChange={(event) => set({ agreements: event.target.value })} maxLength={3000} placeholder="Compromisos del estudiante, la familia o el docente; derivaciones; próxima cita…" />
            </Label>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="psych-session-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
