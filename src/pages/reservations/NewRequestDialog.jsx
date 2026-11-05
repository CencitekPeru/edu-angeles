import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  Info,
  Laptop,
  Layers,
  Send,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { GRADES, SECTIONS, STATUS, fixedConflicts, personName, validateRequest } from '../../lib/reservations'
import { LAB, endOptions, formatDuration, nextBookableDate, startOptions } from '../../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Select } from '../attendance/shared'

export const ACTIVITIES = [
  'Práctica de informática',
  'Clase con recursos digitales',
  'Evaluación en línea',
  'Investigación y búsqueda de información',
  'Proyecto de aprendizaje',
  'Capacitación docente',
]
const OTHER = '__otra__'

function Section({ number, title, icon: Icon, children, className }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card dark:border-blue-500/20', className)}>
      <h3 className="flex items-center gap-2.5 bg-gradient-to-r from-slate-100 to-transparent px-4 py-2 text-[15px] font-bold text-foreground dark:from-blue-500/20 dark:to-transparent">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Icon className="size-4" /></span>
        {number}. {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  )
}

function IconField({ icon: Icon, label, error, children, className }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="mt-5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground/70"><Icon className="size-5" /></span>
      <label className="grid flex-1 gap-1 text-sm font-semibold text-foreground">
        {label}
        {children}
        {error && <span className="text-xs font-medium text-destructive">{error}</span>}
      </label>
    </div>
  )
}

export default function NewRequestDialog({ onClose, onComplete, initialDate }) {
  const { user, requests, users, rooms, fixedSchedules, createRequest, toast } = useApp()
  const [form, setForm] = useState({
    roomId: rooms[0]?.id || '',
    date: initialDate || nextBookableDate(),
    startTime: '08:00',
    endTime: '09:00',
    grade: '1°',
    section: 'A',
    students: '24',
    activity: ACTIVITIES[0],
    otherActivity: '',
    notes: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)

  const purpose = form.activity === OTHER ? form.otherActivity : form.activity
  const roomId = rooms.some((room) => Number(room.id) === Number(form.roomId)) ? form.roomId : rooms[0]?.id || ''

  const { check, fixed } = useMemo(() => {
    const input = { ...form, roomId, purpose }
    const fixedList = fixedConflicts(fixedSchedules, { date: form.date, start: form.startTime, end: form.endTime, roomId })
    const result = validateRequest(requests, input, { teacherId: user.id })
    if (fixedList.length && !result.errors.date && !result.errors.endTime) {
      result.ok = false
      result.errors = { ...result.errors, overlap: `Ese horario ya está ocupado por el horario fijo de ${fixedList[0].teacherName}.` }
    }
    return { check: result, fixed: fixedList }
  }, [requests, form, roomId, purpose, user.id, fixedSchedules])

  function update(partial) {
    setForm((current) => {
      const next = { ...current, ...partial }
      if (partial.startTime) {
        const ends = endOptions(partial.startTime)
        if (!ends.includes(next.endTime)) next.endTime = ends[Math.min(1, ends.length - 1)]
      }
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!check.ok) return
    setSending(true)
    const result = await createRequest({ roomId, date: form.date, startTime: form.startTime, endTime: form.endTime, grade: form.grade, section: form.section, students: form.students, purpose, notes: form.notes })
    setSending(false)
    if (!result.ok) return toast(result.error || 'No se pudo enviar la solicitud.', 'bad')
    toast('Solicitud enviada. Coordinación CIST la revisará.')
    onComplete?.()
  }

  const show = (key) => (submitted ? check.errors[key] : '')
  const durationOk = !check.errors.endTime
  const conflictList = [
    ...fixed.map((item) => `${item.teacherName} · ${item.startTime}–${item.endTime} (horario fijo de ${item.grade} ${item.section})`),
    ...check.conflicts.map((item) => `${personName(users, item.teacherId)} · ${item.startTime}–${item.endTime} (${STATUS[item.status] || 'Activa'})`),
  ]

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="max-h-[94vh] gap-0 overflow-y-auto p-0 sm:max-w-4xl">
        <div className="flex items-center gap-4 bg-gradient-to-r from-[#0b1730] via-[#16275a] to-[#1e3a8a] px-6 py-5 text-white">
          <span className="flex size-12 items-center justify-center rounded-xl bg-white/15"><CalendarCheck className="size-7" /></span>
          <div className="flex-1">
            <DialogTitle className="text-2xl font-extrabold text-white">Nueva Solicitud de Reserva</DialogTitle>
            <DialogDescription className="text-white/80">Complete la información para solicitar el uso de una sala de cómputo.</DialogDescription>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Cerrar"><X className="size-6" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4 bg-slate-50 p-5 dark:bg-background">
          <Section number={1} title="Datos de la solicitud" icon={FileText}>
            <div className="grid gap-4 md:grid-cols-2">
              <IconField icon={Laptop} label={<span>Sala de cómputo <span className="text-destructive">*</span></span>} error={show('roomId')}>
                <Select value={String(roomId)} onChange={(value) => update({ roomId: Number(value) })} options={rooms.map((room) => ({ value: String(room.id), label: room.name }))} />
              </IconField>
              <IconField icon={CalendarDays} label={<span>Fecha de uso <span className="text-destructive">*</span></span>} error={show('date')}>
                <Input type="date" value={form.date} min={nextBookableDate()} onChange={(event) => update({ date: event.target.value })} required />
              </IconField>
              <IconField icon={Clock} label={<span>Horario de uso <span className="text-destructive">*</span></span>} error={show('endTime')} className="md:col-span-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Hora de inicio:
                    <Select className="w-28" value={form.startTime} onChange={(startTime) => update({ startTime })} options={startOptions().map((time) => ({ value: time, label: time }))} />
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Hora de fin:
                    <Select className="w-28" value={form.endTime} onChange={(endTime) => update({ endTime })} options={endOptions(form.startTime).map((time) => ({ value: time, label: time }))} />
                  </span>
                  <span className={cn('ml-auto flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold', durationOk ? 'bg-[#fbf6ec] text-[#6f4a10] dark:bg-amber-500/10 dark:text-amber-300' : 'bg-[#fbf1f0] text-[#9a2f2a]')}>
                    <Clock className="size-4" /> Duración: {formatDuration(form.startTime, form.endTime)}
                  </span>
                </div>
              </IconField>
            </div>
          </Section>

          <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
            <Section number={2} title="Información académica" icon={GraduationCap}>
              <div className="grid gap-3 sm:grid-cols-3">
                <IconField icon={GraduationCap} label={<span>Grado <span className="text-destructive">*</span></span>} error={show('grade')}>
                  <Select value={form.grade} onChange={(grade) => update({ grade })} options={GRADES.map((value) => ({ value, label: value }))} />
                </IconField>
                <IconField icon={UsersRound} label={<span>Sección <span className="text-destructive">*</span></span>} error={show('section')}>
                  <Select value={form.section} onChange={(section) => update({ section })} options={SECTIONS.map((value) => ({ value, label: value }))} />
                </IconField>
                <IconField icon={Users} label={<span className="whitespace-nowrap">Estudiantes <span className="text-destructive">*</span></span>} error={show('students')}>
                  <Input type="number" min="1" max={LAB.capacity} value={form.students} onChange={(event) => update({ students: event.target.value })} required />
                </IconField>
              </div>
            </Section>
            <Section number={3} title="Actividad" icon={Layers}>
              <IconField icon={FileText} label={<span>Actividad / Motivo <span className="text-destructive">*</span></span>} error={show('purpose')}>
                <Select value={form.activity} onChange={(activity) => update({ activity })} options={[...ACTIVITIES.map((value) => ({ value, label: value })), { value: OTHER, label: 'Otra actividad…' }]} />
                {form.activity === OTHER && (
                  <Input value={form.otherActivity} maxLength={180} onChange={(event) => update({ otherActivity: event.target.value })} placeholder="Describe la actividad (mín. 8 caracteres)" className="mt-1" autoFocus />
                )}
              </IconField>
            </Section>
          </div>

          <Section number={4} title="Descripción adicional (opcional)" icon={FileText}>
            <Textarea value={form.notes} maxLength={200} onChange={(event) => update({ notes: event.target.value })} placeholder="Ej.: Uso de software de estadística para análisis de datos." />
            <p className="mt-1 text-right text-xs text-muted-foreground">{form.notes.length} / 200</p>
          </Section>

          {(conflictList.length > 0 || check.errors.limit) && (
            <div className="rounded-xl border border-[#ead9b8] bg-[#fbf6ec] p-3 text-sm text-[#6f4a10] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-center gap-2 font-bold"><AlertCircle className="size-4" /> {check.errors.limit || 'Este horario ya está ocupado'}</p>
              {conflictList.length > 0 && <ul className="mt-1 list-disc pl-6 text-xs">{conflictList.map((text) => <li key={text}>{text}</li>)}</ul>}
            </div>
          )}

          <div className="flex items-start gap-4 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-blue-500/10">
            <Info className="mt-0.5 size-6 shrink-0 text-primary" />
            <span className="font-bold text-foreground">Importante:</span>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-foreground/80">
              <li>La solicitud será enviada a coordinación para su evaluación y aprobación.</li>
              <li>Podrá consultar el estado de su solicitud en la sección «Mis solicitudes».</li>
              <li>No se puede solicitar en horarios fijos ya establecidos (lunes a viernes, {LAB.open}–{LAB.close}, máx. 3 h por día).</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" size="lg" onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" size="lg" disabled={sending}><Send /> {sending ? 'Enviando…' : 'Enviar solicitud'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
