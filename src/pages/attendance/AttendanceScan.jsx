import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Info,
  ListChecks,
  Paperclip,
  Pencil,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { PageHeader, Panel } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  DateChip,
  FilterLabel,
  STATUS_META,
  Select,
  StatusChip,
  StudentPhoto,
  ampm,
  gradeOptions,
  levelOptions,
  pct,
  sectionOptions,
  tableHead,
  td,
  th,
  todayLima,
  useStudents,
} from './shared'

const MODES = [
  { id: 'qr', label: 'Escanear QR', icon: QrCode },
  { id: 'manual', label: 'Registro manual', icon: Pencil },
  { id: 'justificar', label: 'Justificar / Modificar', icon: FileText },
]

export const JUSTIFY_REASONS = ['Enfermedad', 'Cita médica', 'Duelo familiar', 'Problema de transporte', 'Trámite personal', 'Actividad institucional', 'Otro']

function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}

export default function AttendanceScan() {
  const [params, setParams] = useSearchParams()
  const mode = MODES.some((item) => item.id === params.get('modo')) ? params.get('modo') : 'qr'
  const [today, setToday] = useState(null)

  async function loadToday() {
    const result = await api('/api/attendance/today?limit=5')
    if (result.ok) setToday(result)
  }

  useEffect(() => {
    let active = true
    api('/api/attendance/today?limit=5').then((result) => { if (active && result.ok) setToday(result) })
    return () => { active = false }
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        icon={QrCode}
        title="Escanear Código QR"
        description="Registro, control y justificación de la asistencia estudiantil."
        actions={<DateChip date={today?.date} />}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((item) => {
          const Icon = item.icon
          const active = item.id === mode
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams(item.id === 'qr' ? {} : { modo: item.id })}
              className={cn(
                'flex items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card text-foreground hover:bg-muted',
              )}
              aria-pressed={active}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          )
        })}
      </div>

      {mode === 'qr' && <ScanMode today={today} onRecorded={loadToday} />}
      {mode === 'manual' && <ManualMode onSaved={loadToday} />}
      {mode === 'justificar' && <JustifyMode onSaved={loadToday} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* QR scan (USB reader acts as a keyboard: types the code + Enter)     */
/* ------------------------------------------------------------------ */

function ScanMode({ today, onRecorded }) {
  const inputRef = useRef(null)
  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [last, setLast] = useState(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = setTimeout(() => setFeedback(null), 4500)
    return () => clearTimeout(timer)
  }, [feedback])

  async function submit(event) {
    event.preventDefault()
    const value = code.trim()
    setCode('')
    if (!value || busy) return
    setBusy(true)
    const result = await api('/api/attendance/scan', { method: 'POST', body: { code: value } })
    setBusy(false)
    inputRef.current?.focus()
    if (result.ok) {
      setLast(result.record)
      setFeedback({ tone: result.record.status === 'tardanza' ? 'warn' : 'ok', text: `${result.record.fullName} · ${STATUS_META[result.record.status].label} (${result.record.time})` })
      onRecorded()
    } else {
      if (result.record) setLast(result.record)
      setFeedback({ tone: result.duplicate ? 'warn' : 'bad', text: result.error || 'No se pudo registrar la lectura.' })
    }
  }

  const totals = today?.totals || { total: 0, present: 0, late: 0, absent: 0 }
  const lastRecord = last || today?.recent?.[0]

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-50 via-card to-card shadow-sm dark:from-blue-500/10">
        <form onSubmit={submit} className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center" onClick={() => inputRef.current?.focus()}>
          <div className="relative mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-[28px] bg-gradient-to-b from-slate-800 to-slate-950 shadow-2xl">
            <div className="absolute inset-x-6 top-6 h-3 rounded-full bg-gradient-to-r from-slate-300/40 via-slate-200/70 to-slate-300/40 blur-[2px]" />
            <div className="flex size-[62%] items-center justify-center rounded-2xl border border-white/10 bg-slate-900">
              <ScanLine className={cn('size-20 text-slate-200', busy && 'animate-pulse')} strokeWidth={1.4} />
            </div>
            <span className="absolute bottom-4 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/70">LECTOR USB</span>
          </div>

          <div className="flex flex-col items-center text-center">
            <span className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-bold text-primary dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">Lector de códigos QR (USB)</span>
            <span className={cn(
              'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
              focused ? 'bg-[#e3efe7] text-[#2f6447] dark:bg-green-500/15 dark:text-green-300' : 'bg-[#f6ead2] text-[#6f4a10] dark:bg-amber-500/15 dark:text-amber-300',
            )}>
              {focused ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              {focused ? 'Listo para leer' : 'Haz clic aquí para activar el lector'}
            </span>
            <QrCode className="mt-6 size-16 text-primary" strokeWidth={1.4} />
            <p className="mt-3 text-lg font-extrabold text-foreground">{busy ? 'Registrando…' : 'Esperando lectura del QR'}</p>
            <p className="mt-1 text-sm text-muted-foreground">Acerque la agenda escolar al lector.</p>
            <label className="mt-4 w-full max-w-xs text-left text-xs font-semibold text-muted-foreground">
              Código leído (también puedes escribir el código o DNI y pulsar Enter)
              <Input
                ref={inputRef}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoComplete="off"
                placeholder="EST-0001 o DNI"
                className="mt-1 font-mono"
              />
            </label>
            {feedback && (
              <p className={cn(
                'mt-3 w-full max-w-xs rounded-lg border px-3 py-2 text-sm font-semibold',
                feedback.tone === 'ok' && STATUS_META.presente.chip,
                feedback.tone === 'warn' && STATUS_META.tardanza.chip,
                feedback.tone === 'bad' && STATUS_META.inasistencia.chip,
              )} role="status">
                {feedback.text}
              </p>
            )}
          </div>
        </form>
        <div className="grid grid-cols-2 border-t border-border bg-card/70 sm:grid-cols-4">
          {[
            [Zap, 'Registro automático', 'text-[#3f7d5c]'],
            [ShieldCheck, 'Validación de estudiante', 'text-primary'],
            [Clock, 'Control de puntualidad', 'text-primary'],
            [BarChart3, 'Sin registros duplicados', 'text-slate-600'],
          ].map(([Icon, label, color]) => (
            <div key={label} className="flex flex-col items-center gap-1.5 border-border px-2 py-4 text-center text-xs font-medium text-foreground/80 [&:not(:last-child)]:border-r">
              <Icon className={cn('size-6', color)} />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <Panel title="Resumen del día (Ingreso)" icon={CalendarDays} contentClassName="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [Users, totals.present, 'Presentes', pct(totals.present, totals.total), 'bg-[#f1f7f3] text-[#3f7d5c] dark:bg-green-500/10'],
              [Clock, totals.late, 'Tardanzas', pct(totals.late, totals.total), 'bg-[#fbf6ec] text-[#b7832f] dark:bg-amber-500/10'],
              [XCircle, totals.absent, 'Sin registro', pct(totals.absent, totals.total), 'bg-[#fbf1f0] text-[#b4413c] dark:bg-rose-500/10'],
              [Users, totals.total, 'Total de estudiantes', '', 'bg-slate-50 text-primary dark:bg-blue-500/10'],
            ].map(([Icon, value, label, sub, tone]) => (
              <div key={label} className={cn('flex flex-col items-center rounded-xl px-2 py-3 text-center', tone)}>
                <Icon className="size-5" />
                <span className="mt-1 text-2xl font-black text-foreground">{value}</span>
                <span className="text-xs font-medium text-foreground/75">{label}</span>
                {sub && <span className="text-[11px] text-muted-foreground">({sub})</span>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Último registro" icon={UserRound} contentClassName="p-3">
          {lastRecord ? (
            <div className={cn('flex items-center gap-4 rounded-xl border p-3', STATUS_META[lastRecord.status]?.chip)}>
              <StudentPhoto student={lastRecord} size="size-16" />
              <div className="min-w-0 flex-1 text-foreground">
                <p className="truncate font-extrabold">{lastRecord.fullName}</p>
                <p className="flex items-center gap-1.5 text-xs"><GraduationCap className="size-3.5" />{lastRecord.level} – {lastRecord.grade} Sec. {lastRecord.section}</p>
                <p className="flex items-center gap-1.5 text-xs"><Clock className="size-3.5" />Ingreso: {ampm(lastRecord.time)}</p>
              </div>
              <StatusChip status={lastRecord.status} className="bg-card" />
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay lecturas hoy.</p>
          )}
        </Panel>

        <Panel
          title="Últimos registros de asistencia"
          icon={ListChecks}
          contentClassName="p-0"
          action={<Link to="/admin/asistencia/historial" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver historial <ArrowRight className="size-3.5" /></Link>}
        >
          <RecentTable rows={today?.recent || []} />
        </Panel>
      </div>
    </div>
  )
}

function RecentTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className={tableHead}>
        <tr><th className={th} /><th className={th}>Hora</th><th className={th}>Estudiante</th><th className={th}>Grado / Sección</th><th className={th}>Estado</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-border/70">
            <td className="pl-4"><UserRound className="size-4 text-muted-foreground" /></td>
            <td className={cn(td, 'tabular-nums')}>{row.time}</td>
            <td className={cn(td, 'font-medium')}>{row.fullName}</td>
            <td className={td}>{row.grade} Sec. {row.section}</td>
            <td className={td}><StatusChip status={row.status} /></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sin registros todavía.</td></tr>}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/* Student search (shared by manual and justify modes)                 */
/* ------------------------------------------------------------------ */

export function StudentPicker({ selectedId, onSelect, showStatus = true, title = 'Buscar estudiante' }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filters, setFilters] = useState({ level: '', grade: '', section: '' })

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  const hasQuery = Boolean(debounced || filters.level || filters.grade || filters.section)
  const { students, loading } = useStudents(hasQuery ? { q: debounced, ...filters } : { q: '__none__' })
  const results = hasQuery ? students.slice(0, 25) : []

  return (
    <Panel title={title} icon={Search}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="DNI, código o apellidos del estudiante…" className="pl-9" autoFocus />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={levelOptions('Todos')} /></FilterLabel>
        <FilterLabel label="Grado"><Select value={filters.grade} onChange={(grade) => setFilters({ ...filters, grade })} options={gradeOptions('Todos')} /></FilterLabel>
        <FilterLabel label="Sección"><Select value={filters.section} onChange={(section) => setFilters({ ...filters, section })} options={sectionOptions('Todas')} /></FilterLabel>
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm font-bold text-foreground">
        <ListChecks className="size-4 text-primary" /> Resultados de búsqueda {hasQuery && !loading ? `(${students.length})` : ''}
      </p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className={tableHead}>
            <tr><th className={th}>Código</th><th className={th}>Estudiante</th><th className={th}>Grado / Sección</th>{showStatus && <th className={th}>Hoy</th>}<th className={th}>Acción</th></tr>
          </thead>
          <tbody>
            {results.map((student) => (
              <tr key={student.id} className={cn('border-t border-border/70', student.id === selectedId && 'bg-slate-50 dark:bg-blue-500/10')}>
                <td className={cn(td, 'font-semibold text-primary')}>{student.code}</td>
                <td className={td}>
                  <span className="flex items-center gap-2"><StudentPhoto student={student} size="size-8" /><span className="font-medium">{student.fullName}</span></span>
                </td>
                <td className={td}>{student.grade} Sec. {student.section}</td>
                {showStatus && <td className={td}>{student.today ? <StatusChip status={student.today.status} /> : <span className="text-xs text-muted-foreground">Sin registro</span>}</td>}
                <td className={td}>
                  <Button type="button" size="sm" variant={student.id === selectedId ? 'default' : 'outline'} onClick={() => onSelect(student)} className="h-8">
                    <UserRound /> {student.id === selectedId ? 'Seleccionado' : 'Seleccionar'}
                  </Button>
                </td>
              </tr>
            ))}
            {!results.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                {hasQuery ? (loading ? 'Buscando…' : 'No se encontraron estudiantes.') : 'Escribe un nombre, código o DNI, o elige un grado y sección.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function StudentCard({ student }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-slate-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
      <StudentPhoto student={student} size="size-14" />
      <div className="min-w-0">
        <p className="truncate font-extrabold text-foreground">{student.fullName}</p>
        <p className="text-xs text-muted-foreground">Nivel: {student.level} | Grado: {student.grade} | Sección: {student.section}</p>
        <p className="text-xs text-muted-foreground">Código: {student.code}{student.dni ? ` · DNI ${student.dni}` : ''}</p>
      </div>
    </div>
  )
}

function EmptySelection({ text }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <UserRound className="size-10 text-muted-foreground/40" />
      {text}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Manual registration                                                 */
/* ------------------------------------------------------------------ */

function ManualMode({ onSaved }) {
  const { toast } = useApp()
  const [student, setStudent] = useState(null)
  const [form, setForm] = useState({ time: nowTime(), status: 'presente', note: '' })
  const [busy, setBusy] = useState(false)

  function select(next) {
    setStudent(next)
    setForm({ time: next.today?.time || nowTime(), status: next.today?.status || 'presente', note: '' })
  }

  async function save(event) {
    event.preventDefault()
    if (!student) return
    setBusy(true)
    const result = await api('/api/attendance/manual', { method: 'POST', body: { studentId: student.id, ...form } })
    setBusy(false)
    if (!result.ok) return toast(result.error || 'No se pudo registrar la asistencia.', 'bad')
    toast(`Asistencia de ${student.fullName} registrada como ${STATUS_META[form.status].label.toLowerCase()}.`)
    setStudent(null)
    onSaved()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <StudentPicker selectedId={student?.id} onSelect={select} />
      <Panel title="Registrar asistencia" icon={Pencil}>
        {!student ? <EmptySelection text="Selecciona un estudiante de la lista para registrar su asistencia." /> : (
          <form onSubmit={save} className="space-y-4">
            <StudentCard student={student} />
            {student.today && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="size-4" /> Ya tiene registro hoy: <StatusChip status={student.today.status} /> {student.today.time && `a las ${student.today.time}`}. Guardar lo actualizará.
              </p>
            )}
            <label className="flex items-center justify-between gap-4 text-sm font-semibold text-foreground">
              Hora de ingreso
              <Input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} disabled={form.status === 'inasistencia'} className="w-40" />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Tipo de asistencia</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(STATUS_META).map(([value, meta]) => {
                  const Icon = meta.icon
                  const active = form.status === value
                  return (
                    <label key={value} className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold', active ? cn(meta.chip, 'border-current shadow-sm') : 'border-border bg-card text-foreground hover:bg-muted')}>
                      <span className="flex items-center gap-1.5"><Icon className="size-4" />{meta.label}</span>
                      <input type="radio" name="status" value={value} checked={active} onChange={() => setForm({ ...form, status: value })} className="accent-current" />
                    </label>
                  )
                })}
              </div>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold text-foreground">
              <span>Motivo u observación <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <Textarea value={form.note} maxLength={200} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Ingrese el motivo u observación…" />
              <span className="text-right text-xs font-normal text-muted-foreground">{form.note.length} / 200</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" onClick={() => setStudent(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy}><CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar registro'}</Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Justify / modify                                                    */
/* ------------------------------------------------------------------ */

const MOD_TYPES = [
  { id: 'inasistencia_justificada', label: 'Inasistencia justificada', icon: FileText, tone: 'text-primary dark:text-blue-300' },
  { id: 'inasistencia_injustificada', label: 'Inasistencia injustificada', icon: XCircle, tone: 'text-[#b4413c] dark:text-rose-300' },
  { id: 'tardanza_justificada', label: 'Tardanza justificada', icon: Clock, tone: 'text-[#b7832f] dark:text-amber-300' },
  { id: 'correccion', label: 'Corrección de registro', icon: Pencil, tone: 'text-primary dark:text-violet-300' },
]

function JustifyMode({ onSaved }) {
  const { toast } = useApp()
  const [student, setStudent] = useState(null)
  const [date, setDate] = useState(todayLima())
  const [current, setCurrent] = useState(undefined)
  const [form, setForm] = useState({ type: 'inasistencia_justificada', reason: JUSTIFY_REASONS[0], note: '', time: '', status: 'presente' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!student) return undefined
    let active = true
    api(`/api/attendance/student/${student.id}?date=${date}`).then((result) => {
      if (!active || !result.ok) return
      setCurrent(result.record)
      setForm((value) => ({ ...value, time: result.record?.time || '' }))
    })
    return () => { active = false }
  }, [student, date])

  function select(next) {
    setCurrent(undefined)
    setStudent(next)
    setFile(null)
    setForm({ type: 'inasistencia_justificada', reason: JUSTIFY_REASONS[0], note: '', time: '', status: 'presente' })
  }

  const needsReason = form.type === 'inasistencia_justificada' || form.type === 'tardanza_justificada'
  const needsTime = form.type === 'tardanza_justificada' || (form.type === 'correccion' && form.status !== 'inasistencia')

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    const fields = { studentId: student.id, date, type: form.type, reason: needsReason ? form.reason : '', note: form.note, time: needsTime ? form.time : '', status: form.status }
    const result = await upload('/api/attendance/modify', file ? [file] : [], fields)
    setBusy(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar la modificación.', 'bad')
    toast('Asistencia modificada. El cambio quedó registrado en la auditoría.')
    setStudent(null)
    onSaved()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
      <StudentPicker selectedId={student?.id} onSelect={select} showStatus={false} />
      <Panel title="Justificar / modificar asistencia" icon={FileText}>
        {!student ? <EmptySelection text="Selecciona un estudiante para justificar o corregir su asistencia." /> : (
          <form onSubmit={save} className="space-y-4">
            <StudentCard student={student} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                Fecha de asistencia
                <Input type="date" value={date} max={todayLima()} onChange={(event) => setDate(event.target.value)} required />
              </label>
              <div className="grid gap-1.5 text-sm font-semibold text-foreground">
                Estado actual
                <div className="flex h-9 items-center">
                  {current === undefined ? <span className="text-xs text-muted-foreground">Cargando…</span>
                    : current ? <StatusChip status={current.status} justified={current.justified} /> : <span className="text-xs text-muted-foreground">Sin registro (cuenta como inasistencia)</span>}
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Tipo de modificación / justificación</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MOD_TYPES.map((item) => {
                  const Icon = item.icon
                  const active = form.type === item.id
                  return (
                    <label key={item.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-semibold', item.tone, active ? 'border-primary bg-slate-50 ring-1 ring-primary dark:bg-blue-500/10' : 'border-border hover:bg-muted')}>
                      <input type="radio" name="modtype" checked={active} onChange={() => setForm({ ...form, type: item.id })} className="accent-[var(--primary)]" />
                      <Icon className="size-4" />
                      {item.label}
                    </label>
                  )
                })}
              </div>
            </div>
            {form.type === 'correccion' && (
              <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                Estado corregido
                <Select value={form.status} onChange={(status) => setForm({ ...form, status })} options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))} />
              </label>
            )}
            {needsTime && (
              <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                Hora de ingreso
                <Input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required className="w-40" />
              </label>
            )}
            {needsReason && (
              <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                Motivo de justificación
                <Select value={form.reason} onChange={(reason) => setForm({ ...form, reason })} options={JUSTIFY_REASONS.map((value) => ({ value, label: value }))} />
              </label>
            )}
            <label className="grid gap-1.5 text-sm font-semibold text-foreground">
              <span>Observación <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <Textarea value={form.note} maxLength={300} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Detalle o sustentación de la justificación…" />
              <span className="text-right text-xs font-normal text-muted-foreground">{form.note.length} / 300</span>
            </label>
            {needsReason && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-foreground">Evidencia <span className="font-normal text-muted-foreground">(opcional)</span></span>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-muted dark:hover:bg-blue-500/10">
                  <Paperclip className="size-4" /> {file ? 'Cambiar archivo' : 'Adjuntar archivo'}
                  <input type="file" accept=".pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                </label>
                {file ? (
                  <span className="flex items-center gap-1 text-xs text-foreground">{file.name}<button type="button" onClick={() => setFile(null)} aria-label="Quitar archivo"><X className="size-3.5" /></button></span>
                ) : <span className="text-xs text-muted-foreground">PDF, JPG o PNG (máx. 5 MB)</span>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" onClick={() => setStudent(null)}><XCircle /> Cancelar</Button>
              <Button type="submit" disabled={busy || current === undefined}><CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar cambios'}</Button>
            </div>
            <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-foreground dark:bg-blue-500/10 dark:text-blue-200">
              <Info className="size-4 shrink-0" /> Toda modificación o justificación queda registrada y auditada con el usuario y la fecha/hora del cambio.
            </p>
          </form>
        )}
      </Panel>
    </div>
  )
}

