import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, ClipboardList, FileText, Info, Landmark, Lock, NotebookPen, Search, Send, Target, User, Users, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { StudentPhoto, Select, todayLima } from '../attendance/shared'

/* ------------------------------------------------------------- catalogs */

export const REASONS = ['Académico', 'Dificultades de aprendizaje', 'Conductual', 'Convivencia escolar', 'Socioemocional', 'Emocional', 'Familiar', 'Social', 'Orientación vocacional', 'Otro']
export const REFERRED_BY = ['Docente / tutor', 'Padre o madre de familia', 'Auxiliar', 'Dirección', 'Iniciativa del estudiante', 'Psicología', 'Otro']
export const RISKS = ['Bajo', 'Medio', 'Alto']
export const CASE_STATUS = ['En seguimiento', 'Pendiente', 'Cerrado']
export const SESSION_TYPES = ['Individual', 'Seguimiento', 'Familiar', 'Grupal', 'Con docente / tutor']
export const SESSION_STATUS = ['Programada', 'Realizada', 'No asistió', 'Reprogramada', 'Cancelada']
export const MODALITIES = ['Presencial', 'Virtual']
export const REFERRAL_MOTIVES = ['Dificultades de aprendizaje', 'Problemas de convivencia', 'Conducta disruptiva', 'Atención emocional', 'Atención especializada', 'Evaluación externa', 'Situación familiar', 'Otro']
export const INTERNAL_AREAS = ['Tutoría', 'Coordinación de Convivencia', 'Coordinación Académica', 'Coordinación de Tutoría y Orientación Educativa', 'Dirección', 'Subdirección', 'Otra área interna']
export const EXTERNAL_INSTITUTIONS = ['Centro de Salud (MINSA)', 'Centro de Salud Mental Comunitario', 'Hospital', 'DEMUNA', 'Centro Emergencia Mujer (CEM)', 'Policía / Fiscalía', 'UGEL – Servicio de Inclusión', 'Psicólogo o psiquiatra particular', 'Otra institución']
export const REFERRAL_STATUS = ['En proceso', 'Atendida', 'No atendida']

/** Paths of the module's views, in the order of the manual. */
export const PSY = {
  attentions: '/admin/psicologia/atenciones',
  cases: '/admin/psicologia/casos',
  followUp: '/admin/psicologia/seguimiento',
  referrals: '/admin/psicologia/derivaciones',
  students: '/admin/psicologia/estudiantes',
  reports: '/admin/psicologia/reportes',
}
export const caseLink = (id) => `${PSY.cases}?caso=${id}`
export const studentLink = (id) => `${PSY.students}?estudiante=${id}`

/* -------------------------------------------------------------- helpers */

export const opts = (list, first) => [...(first ? [{ value: '', label: first }] : []), ...list.map((value) => ({ value, label: value }))]
export const classroom = (student) => `${student.level} · ${student.grade} ${student.section}`
export const gradeSection = (student) => `${student.grade} ${student.section}`

/** «12 nov. 2026» from an ISO date. */
export function shortDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
/** «12/11/2026» from an ISO date. */
export const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
export const toMinutes = (time) => { const [h, m] = String(time || '').split(':').map(Number); return h * 60 + m }
export function duration(start, end) {
  if (!start || !end) return ''
  const total = toMinutes(end) - toMinutes(start)
  if (!(total > 0)) return ''
  return total >= 60 ? `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ''}` : `${total} min`
}
export const timeRange = (item) => (item.endTime ? `${item.time} – ${item.endTime}` : item.time)
const nowTime = () => new Date().toTimeString().slice(0, 5)
const addMinutes = (time, amount) => { const total = toMinutes(time) + amount; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }

/** Session label inside a case: «Sesión 3». */
export const sessionLabel = (item) => (item.ordinal ? `Sesión ${item.ordinal}` : item.caseId ? 'Sesión' : 'Atención puntual')

/* --------------------------------------------------------- building blocks */

export function ConfidentialNote() {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground dark:bg-muted/40">
      <Lock className="size-3.5 shrink-0 text-primary" />
      Información confidencial: solo Coordinación y Psicología pueden registrarla; Dirección puede consultarla.
    </p>
  )
}

/** Footer note of every form (manual: «La información clínica es de uso exclusivo del área de Psicología»). */
function FormNote({ children }) {
  return (
    <p className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
      <Info className="size-4 shrink-0 text-primary" />
      <span>{children || <><strong>Confidencialidad:</strong> la información clínica es de uso exclusivo del área de Psicología.</>}</span>
    </p>
  )
}

export function Section({ number, icon: Icon, title, children, className }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-3 py-2 text-sm font-bold dark:bg-muted/40">
        {Icon && <Icon className="size-4 text-primary" />} {number}. {title}
      </h3>
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

/** Active students for the module's forms (with their active case, if any). */
export function usePsyStudents() {
  const [students, setStudents] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    api('/api/psychology/students').then((result) => { if (result.ok) setStudents(result.students); setLoaded(true) })
  }, [])
  return [students, loaded]
}

/** Selected-student card with «Cambiar estudiante», or a search box when none is chosen yet. */
export function StudentChooser({ students, value, onChange, locked = false }) {
  const [searching, setSearching] = useState(!value)
  const [query, setQuery] = useState('')
  const selected = students.find((item) => item.id === value)
  const term = query.trim().toLowerCase()
  const results = useMemo(
    () => (term ? students.filter((item) => `${item.name} ${item.code} ${item.dni} ${classroom(item)}`.toLowerCase().includes(term)) : students).slice(0, 30),
    [students, term],
  )
  if (selected && !searching) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StudentPhoto student={selected} size="size-10" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold uppercase">{selected.name}</span>
            <span className="text-xs text-muted-foreground">{selected.code} | {selected.level} | {gradeSection(selected)}</span>
          </span>
        </div>
        {!locked && <Button type="button" variant="outline" size="sm" onClick={() => setSearching(true)}><Search /> Cambiar estudiante</Button>}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código, DNI o grado…" />
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
        {results.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => { onChange(item.id); setSearching(false); setQuery('') }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">{item.name} <span className="text-xs text-muted-foreground">· {item.code}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{classroom(item)}</span>
            </button>
          </li>
        ))}
        {!results.length && <li className="px-3 py-3 text-center text-xs text-muted-foreground">{students.length ? 'Sin coincidencias.' : 'No hay estudiantes registrados en Gestión Escolar → Estudiantes.'}</li>}
      </ul>
      {selected && <Button type="button" variant="ghost" size="sm" onClick={() => setSearching(false)}><X /> Mantener a {selected.name}</Button>}
    </div>
  )
}

function useSaving() {
  const { toast } = useApp()
  const [saving, setSaving] = useState(false)
  async function run(request, success, onDone) {
    setSaving(true)
    const result = await request()
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(typeof success === 'function' ? success(result) : success)
    onDone(result)
  }
  return [saving, run, toast]
}

/* ------------------------------------------------------------ attention */

const emptyAttention = () => ({
  studentId: null, date: todayLima(), startTime: addMinutes(nowTime(), -30) > nowTime() ? '08:00' : addMinutes(nowTime(), -30), endTime: nowTime(),
  reason: '', referredBy: '', referrerName: '', riskLevel: 'Bajo', type: 'Individual', followUp: false,
  description: '', agreements: '', adminReason: '', adminNotes: '',
})

/** «Registrar nueva atención psicológica» (manual §3): student, data, kind of attention and detail. */
export function AttentionForm({ attention, onClose, onSaved }) {
  const editing = Boolean(attention)
  const [students] = usePsyStudents()
  const [form, setForm] = useState(() => (attention
    ? {
      studentId: attention.student.id, date: attention.date, startTime: attention.time, endTime: attention.endTime || attention.time, reason: attention.reason,
      referredBy: attention.referredBy, referrerName: attention.referrerName, riskLevel: attention.riskLevel || 'Bajo', type: attention.type, followUp: Boolean(attention.caseId),
      description: attention.notes, agreements: attention.agreements, adminReason: attention.adminReason, adminNotes: attention.adminNotes,
    }
    : emptyAttention()))
  const [saving, run, toast] = useSaving()
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const student = students.find((item) => item.id === form.studentId)
  const activeCase = student?.activeCase

  function save(event) {
    event.preventDefault()
    if (!form.studentId) return toast('Selecciona y confirma al estudiante.', 'bad')
    if (form.endTime && toMinutes(form.endTime) <= toMinutes(form.startTime)) return toast('La hora de fin debe ser posterior a la hora de inicio.', 'bad')
    return run(
      () => (editing ? api(`/api/psychology/attentions/${attention.id}`, { method: 'PATCH', body: form }) : api('/api/psychology/attentions', { method: 'POST', body: form })),
      (result) => (editing ? 'Atención actualizada.' : result.caseCreated ? `Atención registrada. Se abrió el caso ${result.caseCode}.` : result.caseCode ? `Atención registrada y vinculada al caso ${result.caseCode}.` : 'Atención puntual registrada.'),
      onSaved,
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><NotebookPen className="size-5 text-primary" /> {editing ? 'Editar atención psicológica' : 'Registrar nueva atención psicológica'}</DialogTitle>
          <DialogDescription>Registra la intervención realizada y define si será una atención puntual o un caso con seguimiento.</DialogDescription>
        </DialogHeader>
        <form id="attention-form" className="space-y-3" onSubmit={save}>
          <Section number={1} icon={User} title="Datos del estudiante">
            <StudentChooser students={students} value={form.studentId} onChange={(studentId) => set({ studentId })} locked={editing} />
          </Section>
          <Section number={2} icon={CalendarDays} title="Datos de la atención" className="sm:grid-cols-4">
            <Field label="Fecha de atención" required><Input type="date" value={form.date} max={todayLima()} onChange={(event) => set({ date: event.target.value })} required /></Field>
            <Field label="Hora de inicio" required><Input type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} required /></Field>
            <Field label="Hora de fin" required><Input type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} required /></Field>
            <Field label="Motivo de la atención" required><Select value={form.reason} onChange={(reason) => set({ reason })} options={opts(REASONS, 'Seleccione')} required /></Field>
            <Field label="Derivado por" required><Select value={form.referredBy} onChange={(referredBy) => set({ referredBy })} options={opts(REFERRED_BY, 'Seleccione')} required /></Field>
            <Field label="Nombre de quien deriva" className="sm:col-span-2"><Input value={form.referrerName} onChange={(event) => set({ referrerName: event.target.value })} placeholder="Ej. Prof. tutor de 3.° B" maxLength={160} /></Field>
            <Field label="Nivel de riesgo" required><Select value={form.riskLevel} onChange={(riskLevel) => set({ riskLevel })} options={opts(RISKS)} /></Field>
          </Section>
          <Section number={3} icon={ClipboardList} title="Tipo de atención" className="sm:grid-cols-2">
            {[
              [false, 'Atención puntual', 'Orientación o intervención en una sola sesión. No requiere seguimiento por el momento.'],
              [true, 'Atención con seguimiento (Abrir caso)', 'Situación que requiere más de una sesión, coordinación o acciones complementarias.'],
            ].map(([value, title, description]) => (
              <label key={title} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3 text-sm', form.followUp === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50', editing && 'cursor-not-allowed opacity-70')}>
                <input type="radio" name="followUp" className="mt-1 accent-[var(--primary)]" checked={form.followUp === value} disabled={editing} onChange={() => set({ followUp: value })} />
                <span><span className="block font-semibold">{title}</span><span className="text-xs text-muted-foreground">{description}</span></span>
              </label>
            ))}
            {form.followUp && !editing && student && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground sm:col-span-2 dark:bg-muted/40">
                {activeCase ? <>La atención se <strong>vinculará al caso activo {activeCase.code}</strong> del estudiante (no se abre otro caso).</> : <>El estudiante no tiene un caso activo: se <strong>abrirá un caso nuevo</strong> con estos datos.</>}
              </p>
            )}
            {!form.followUp && !editing && activeCase && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground sm:col-span-2 dark:bg-muted/40">Este estudiante ya tiene el caso activo {activeCase.code}. Si esta atención forma parte de ese seguimiento, elige «Atención con seguimiento» para vincularla.</p>
            )}
          </Section>
          <Section number={4} icon={FileText} title="Detalle de la intervención" className="sm:grid-cols-2">
            <Field label="Descripción de la situación" required><Textarea rows={3} value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={6000} placeholder="Registra qué se observó, desde cuándo y antecedentes relevantes…" required /></Field>
            <Field label="Acuerdos / Orientaciones" required><Textarea rows={3} value={form.agreements} onChange={(event) => set({ agreements: event.target.value })} maxLength={3000} placeholder="Acciones, compromisos u orientaciones brindadas…" required /></Field>
            <Field label="Motivo administrativo breve" hint="no confidencial"><Input value={form.adminReason} onChange={(event) => set({ adminReason: event.target.value })} maxLength={160} placeholder="Ej. Dificultades de adaptación al aula" /></Field>
            <Field label="Observación administrativa" hint="no confidencial"><Input value={form.adminNotes} onChange={(event) => set({ adminNotes: event.target.value })} maxLength={500} placeholder="Ej. Se coordinó con tutoría el seguimiento quincenal" /></Field>
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote />
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="attention-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar atención'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- case */

/** «Nuevo caso en seguimiento» (manual §4): student, case information, description and initial plan. */
export function CaseForm({ item, onClose, onSaved }) {
  const editing = Boolean(item)
  const [students] = usePsyStudents()
  const [form, setForm] = useState(() => (item
    ? { studentId: item.student.id, openedOn: item.openedOn, reason: item.reason, riskLevel: item.riskLevel, referredBy: item.referredBy, referrerName: item.referrerName, description: item.description, objective: item.objective, initialActions: item.initialActions, status: item.status }
    : { studentId: null, openedOn: todayLima(), reason: '', riskLevel: 'Bajo', referredBy: '', referrerName: '', description: '', objective: '', initialActions: '', status: 'Pendiente' }))
  const [saving, run, toast] = useSaving()
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const student = students.find((entry) => entry.id === form.studentId)

  function save(event) {
    event.preventDefault()
    if (!form.studentId) return toast('Selecciona y confirma al estudiante.', 'bad')
    if (!editing && student?.activeCase) return toast(`El estudiante ya tiene el caso activo ${student.activeCase.code}. Agrega las sesiones a ese caso.`, 'bad')
    return run(
      () => (editing ? api(`/api/psychology/cases/${item.id}`, { method: 'PATCH', body: form }) : api('/api/psychology/cases', { method: 'POST', body: form })),
      (result) => (editing ? 'Caso actualizado.' : `Caso ${result.code} creado.`),
      (result) => onSaved(result.id || item.id),
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" /> {editing ? `Editar caso ${item.code}` : 'Nuevo caso en seguimiento'}</DialogTitle>
          <DialogDescription>Registra un caso psicológico que requiere continuidad y seguimiento.</DialogDescription>
        </DialogHeader>
        <form id="case-form" className="space-y-3" onSubmit={save}>
          <Section number={1} icon={User} title="Datos del estudiante">
            <StudentChooser students={students} value={form.studentId} onChange={(studentId) => set({ studentId })} locked={editing} />
            {!editing && student?.activeCase && <p className="text-xs font-semibold text-destructive">Este estudiante ya tiene el caso activo {student.activeCase.code}: agrega las nuevas sesiones a ese caso.</p>}
          </Section>
          <Section number={2} icon={ClipboardList} title="Información del caso" className="sm:grid-cols-3">
            <Field label="Fecha de apertura" required><Input type="date" value={form.openedOn} max={todayLima()} onChange={(event) => set({ openedOn: event.target.value })} required /></Field>
            <Field label="Motivo del caso" required><Select value={form.reason} onChange={(reason) => set({ reason })} options={opts(REASONS, 'Seleccione')} required /></Field>
            <Field label="Nivel de riesgo" required><Select value={form.riskLevel} onChange={(riskLevel) => set({ riskLevel })} options={opts(RISKS)} /></Field>
            <Field label="Derivado por" required><Select value={form.referredBy} onChange={(referredBy) => set({ referredBy })} options={opts(REFERRED_BY, 'Seleccione')} required /></Field>
            <Field label="Nombre de quien deriva" className="sm:col-span-2"><Input value={form.referrerName} onChange={(event) => set({ referrerName: event.target.value })} placeholder="Ej. Prof. tutor de 3.° B" maxLength={160} /></Field>
            {editing && <Field label="Estado del caso"><Select value={form.status} onChange={(status) => set({ status })} options={opts(CASE_STATUS)} /></Field>}
          </Section>
          <Section number={3} icon={FileText} title="Descripción del caso">
            <Field label="Descripción de la situación" required><Textarea rows={3} value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={4000} placeholder="Registra la situación que origina el caso, antecedentes relevantes y contexto…" required /></Field>
          </Section>
          <Section number={4} icon={Target} title="Plan de seguimiento inicial" className="sm:grid-cols-2">
            <Field label="Objetivo del seguimiento" required><Textarea rows={3} value={form.objective} onChange={(event) => set({ objective: event.target.value })} maxLength={1000} placeholder="Ej. Fortalecer la adaptación al aula y la convivencia escolar…" required={!editing} /></Field>
            <Field label="Acciones iniciales / Acuerdos" required><Textarea rows={3} value={form.initialActions} onChange={(event) => set({ initialActions: event.target.value })} maxLength={2000} placeholder="Ej. Programar sesiones, coordinación con tutor, orientación…" required={!editing} /></Field>
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote />
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="case-form" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear caso'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------------- appointment */

/**
 * «Programar nueva cita» (manual §5): pick the student and their active case, date and time (duration is
 * computed), session type, modality, topic and next agreements. Also edits an existing appointment.
 */
export function AppointmentForm({ session, caseId: fixedCase, onClose, onSaved }) {
  const editing = Boolean(session)
  const [students] = usePsyStudents()
  const [cases, setCases] = useState([])
  const [form, setForm] = useState(() => (session
    ? { studentId: session.student.id, caseId: String(session.caseId), date: session.date, startTime: session.time, endTime: session.endTime || addMinutes(session.time, 30), type: session.type, modality: session.modality || 'Presencial', status: session.status, topic: session.topic, notes: session.notes, agreements: session.agreements }
    : { studentId: null, caseId: fixedCase ? String(fixedCase) : '', date: todayLima(), startTime: '10:30', endTime: '11:00', type: 'Seguimiento', modality: 'Presencial', status: 'Programada', topic: '', notes: '', agreements: '' }))
  const [saving, run, toast] = useSaving()
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  useEffect(() => {
    api('/api/psychology/cases').then((result) => {
      if (!result.ok) return
      setCases(result.cases)
      if (fixedCase) {
        const chosen = result.cases.find((item) => item.id === Number(fixedCase))
        if (chosen) setForm((current) => ({ ...current, studentId: chosen.student.id }))
      }
    })
  }, [fixedCase])

  const studentCases = cases.filter((item) => item.student.id === form.studentId && (item.status !== 'Cerrado' || String(item.id) === form.caseId))
  useEffect(() => {
    if (!editing && form.studentId && !studentCases.some((item) => String(item.id) === form.caseId)) {
      set({ caseId: studentCases[0] ? String(studentCases[0].id) : '' })
    }
  }, [form.studentId, cases.length])

  function save(event) {
    event.preventDefault()
    if (!form.caseId) return toast('Selecciona el caso en seguimiento al que pertenece la cita.', 'bad')
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) return toast('La hora de fin debe ser posterior a la hora de inicio.', 'bad')
    if (form.status === 'Realizada' && form.date > todayLima()) return toast('No marques como «Realizada» una cita que todavía no ocurre.', 'bad')
    return run(
      () => (editing ? api(`/api/psychology/sessions/${session.id}`, { method: 'PATCH', body: form }) : api(`/api/psychology/cases/${form.caseId}/sessions`, { method: 'POST', body: form })),
      editing ? 'Cita actualizada.' : 'Cita programada. Se muestra en el listado y en el calendario de sesiones.',
      onSaved,
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-5 text-primary" /> {editing ? 'Editar cita' : 'Programar nueva cita'}</DialogTitle>
          <DialogDescription>Registra una sesión de seguimiento para un caso psicológico.</DialogDescription>
        </DialogHeader>
        <form id="appointment-form" className="space-y-3" onSubmit={save}>
          <Section number={1} icon={User} title="Seleccionar caso" className="sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Field label="Estudiante" required><StudentChooser students={students} value={form.studentId} onChange={(studentId) => set({ studentId, caseId: '' })} locked={editing || Boolean(fixedCase)} /></Field>
            <Field label="Caso en seguimiento" required>
              <Select
                value={form.caseId}
                onChange={(caseId) => set({ caseId })}
                disabled={editing || !form.studentId}
                options={[{ value: '', label: !form.studentId ? 'Primero elige al estudiante' : studentCases.length ? 'Seleccione' : 'Sin casos activos' }, ...studentCases.map((item) => ({ value: String(item.id), label: `${item.code} – ${item.reason}` }))]}
              />
              {form.studentId && !studentCases.length && <span className="font-normal text-muted-foreground">Abre primero un caso en «Casos en seguimiento» o registra una atención con seguimiento.</span>}
            </Field>
          </Section>
          <Section number={2} icon={CalendarDays} title="Datos de la cita" className="sm:grid-cols-4">
            <Field label="Fecha de la cita" required><Input type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} required /></Field>
            <Field label="Hora de inicio" required><Input type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} required /></Field>
            <Field label="Hora de fin" required><Input type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} required /></Field>
            <Field label="Duración"><Input value={duration(form.startTime, form.endTime) || '—'} readOnly tabIndex={-1} className="bg-muted/50" /></Field>
            <Field label="Tipo de sesión" required><Select value={form.type} onChange={(type) => set({ type })} options={opts(SESSION_TYPES)} /></Field>
            <Field label="Modalidad" required><Select value={form.modality} onChange={(modality) => set({ modality })} options={opts(MODALITIES)} /></Field>
            <Field label={editing ? 'Estado' : 'Estado inicial'} className="sm:col-span-2">
              <Select value={form.status} onChange={(status) => set({ status })} options={opts(editing ? SESSION_STATUS.filter((value) => value !== 'Reprogramada' || form.status === 'Reprogramada') : ['Programada'])} />
            </Field>
          </Section>
          <Section number={3} icon={FileText} title="Detalle de la sesión" className="sm:grid-cols-2">
            <Field label="Motivo / Tema de la sesión" required><Textarea rows={3} value={form.topic} onChange={(event) => set({ topic: event.target.value })} maxLength={255} placeholder="Ej. Seguimiento de acuerdos, manejo de emociones, etc." required /></Field>
            <Field label="Observaciones" hint="opcional"><Textarea rows={3} value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={6000} placeholder="Información adicional o consideraciones para la sesión…" /></Field>
          </Section>
          <Section number={4} icon={Users} title="Próximos acuerdos">
            <Field label="Acuerdos o acciones a trabajar"><Textarea rows={2} value={form.agreements} onChange={(event) => set({ agreements: event.target.value })} maxLength={3000} placeholder="Ej. Reforzar estrategias de convivencia, seguimiento con tutor, etc." /></Field>
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote><strong>Nota:</strong> la cita quedará registrada en el caso y se mostrará en el calendario de sesiones.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="appointment-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cita'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Moves a scheduled appointment: the original stays as «Reprogramada». */
export function RescheduleForm({ session, onClose, onSaved }) {
  const [form, setForm] = useState({ date: session.date < todayLima() ? todayLima() : session.date, startTime: session.time, endTime: session.endTime || addMinutes(session.time, 30) })
  const [saving, run] = useSaving()
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reprogramar cita</DialogTitle>
          <DialogDescription>{session.student.name} · {session.caseCode}. La cita del {dmy(session.date)} a las {session.time} quedará como «Reprogramada» y se creará una nueva.</DialogDescription>
        </DialogHeader>
        <form id="reschedule-form" className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); run(() => api(`/api/psychology/sessions/${session.id}/reschedule`, { method: 'POST', body: form }), 'Cita reprogramada.', onSaved) }}>
          <Field label="Nueva fecha" required><Input type="date" min={todayLima()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
          <Field label="Inicio" required><Input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></Field>
          <Field label="Fin" required><Input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="reschedule-form" disabled={saving}>{saving ? 'Guardando…' : 'Reprogramar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------- referral */

/** «Registrar nueva derivación» (manual §6): student, information, destination, detail and follow-up. */
export function ReferralForm({ referral, studentId: fixedStudent, caseId: fixedCase, onClose, onSaved }) {
  const editing = Boolean(referral)
  const [students] = usePsyStudents()
  const [cases, setCases] = useState([])
  const [form, setForm] = useState(() => (referral
    ? { studentId: referral.student.id, caseId: referral.caseId ? String(referral.caseId) : '', date: referral.date, motive: referral.motive, destinationType: referral.destinationType, institution: referral.institution, specialist: referral.specialist, reason: referral.reason, objective: referral.objective, status: referral.status, deadline: referral.deadline, response: referral.response }
    : { studentId: fixedStudent || null, caseId: fixedCase ? String(fixedCase) : '', date: todayLima(), motive: '', destinationType: 'interna', institution: '', specialist: '', reason: '', objective: '', status: 'En proceso', deadline: '', response: '' }))
  const [saving, run, toast] = useSaving()
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  useEffect(() => { api('/api/psychology/cases').then((result) => { if (result.ok) setCases(result.cases) }) }, [])
  const studentCases = cases.filter((item) => item.student.id === form.studentId)
  const destinations = form.destinationType === 'interna' ? INTERNAL_AREAS : EXTERNAL_INSTITUTIONS

  function save(event) {
    event.preventDefault()
    if (!form.studentId) return toast('Selecciona y confirma al estudiante.', 'bad')
    return run(
      () => (editing ? api(`/api/psychology/referrals/${referral.id}`, { method: 'PATCH', body: form }) : api('/api/psychology/referrals', { method: 'POST', body: form })),
      (result) => (editing ? 'Derivación actualizada.' : `Derivación ${result.code} registrada.`),
      onSaved,
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-5 text-primary" /> {editing ? `Editar derivación ${referral.code}` : 'Registrar nueva derivación'}</DialogTitle>
          <DialogDescription>Registra la derivación del estudiante a otra área, servicio o institución.</DialogDescription>
        </DialogHeader>
        <form id="referral-form" className="space-y-3" onSubmit={save}>
          <Section number={1} icon={User} title="Datos del estudiante">
            <StudentChooser students={students} value={form.studentId} onChange={(studentId) => set({ studentId, caseId: '' })} locked={editing || Boolean(fixedStudent)} />
          </Section>
          <Section number={2} icon={ClipboardList} title="Información de la derivación" className="sm:grid-cols-3">
            <Field label="Fecha de derivación" required><Input type="date" value={form.date} max={todayLima()} onChange={(event) => set({ date: event.target.value })} required /></Field>
            <Field label="Caso en seguimiento" hint="si corresponde">
              <Select value={form.caseId} onChange={(caseId) => set({ caseId })} disabled={!form.studentId} options={[{ value: '', label: 'Sin caso vinculado' }, ...studentCases.map((item) => ({ value: String(item.id), label: `${item.code} – ${item.reason}` }))]} />
            </Field>
            <Field label="Motivo de derivación" required><Select value={form.motive} onChange={(motive) => set({ motive })} options={opts(REFERRAL_MOTIVES, 'Seleccione')} required /></Field>
          </Section>
          <Section number={3} icon={Landmark} title="Área / Institución de destino" className="sm:grid-cols-3">
            <Field label="Tipo de destino" required>
              <span className="flex h-9 items-center gap-4 font-normal">
                {[['interna', 'Área interna'], ['externa', 'Institución externa']].map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm"><input type="radio" name="destinationType" className="accent-[var(--primary)]" checked={form.destinationType === value} onChange={() => set({ destinationType: value, institution: '' })} /> {label}</label>
                ))}
              </span>
            </Field>
            <Field label={form.destinationType === 'interna' ? 'Área de destino' : 'Institución de destino'} required><Select value={form.institution} onChange={(institution) => set({ institution })} options={opts(destinations, 'Seleccione')} required /></Field>
            <Field label="Responsable / Contacto"><Input value={form.specialist} onChange={(event) => set({ specialist: event.target.value })} placeholder="Ej. Prof. Carlos Huamán R." maxLength={160} /></Field>
          </Section>
          <Section number={4} icon={FileText} title="Detalle de la derivación" className="sm:grid-cols-2">
            <Field label="Descripción de la situación" required><Textarea rows={3} value={form.reason} onChange={(event) => set({ reason: event.target.value })} maxLength={2000} placeholder="Describe de forma breve y clara la situación que motiva la derivación…" required /></Field>
            <Field label="Objetivo de la derivación" required><Textarea rows={3} value={form.objective} onChange={(event) => set({ objective: event.target.value })} maxLength={1000} placeholder="Indica el propósito o resultado esperado de la derivación…" required /></Field>
          </Section>
          <Section number={5} icon={Users} title="Seguimiento" className="sm:grid-cols-3">
            <Field label={editing ? 'Estado' : 'Estado inicial'} required><Select value={form.status} onChange={(status) => set({ status })} options={opts(REFERRAL_STATUS)} /></Field>
            <Field label="Plazo de atención" hint="opcional"><Input type="date" value={form.deadline || ''} onChange={(event) => set({ deadline: event.target.value })} /></Field>
            <Field label={editing ? 'Respuesta / Observaciones' : 'Observaciones'} hint="opcional"><Input value={form.response} onChange={(event) => set({ response: event.target.value })} maxLength={3000} placeholder="Información adicional, coordinaciones o indicaciones…" /></Field>
            {form.status === 'Atendida' && <p className="text-xs text-muted-foreground sm:col-span-3">Marca «Atendida» solo cuando se confirmó la respuesta o atención del área o institución de destino.</p>}
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote><strong>Nota:</strong> la derivación quedará registrada y podrá consultarse en el listado de derivaciones.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="referral-form" disabled={saving}><Send /> {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar derivación'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------- shared filters */

/** Level / grade / section filtering used by several views. */
export function matchesClassroom(student, filters) {
  return (!filters.level || student.level === filters.level)
    && (!filters.grade || student.grade === filters.grade)
    && (!filters.section || student.section === filters.section)
}
