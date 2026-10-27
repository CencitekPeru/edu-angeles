import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, Minus, Clock, Calendar } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { GRADES, SECTIONS, STATUS, fixedConflicts, personName, validateRequest } from '../lib/reservations'
import { LAB, endOptions, nextBookableDate, startOptions, toMinutes } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { DayTimeline } from '../components/Schedule'

function initialForm(params, rooms) {
  const start = startOptions().includes(params.get('start') || '') ? params.get('start') : '08:00'
  const ends = endOptions(start)
  const requestedEnd = params.get('end')
  const end = ends.includes(requestedEnd) ? requestedEnd : ends[Math.min(2, ends.length - 1)]
  const date = params.get('date')
  const roomId = params.get('roomId') || (rooms && rooms[0] ? rooms[0].id : '')
  return {
    roomId: roomId ? Number(roomId) : '',
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : nextBookableDate(),
    startTime: start,
    endTime: end,
    grade: '1°',
    section: 'A',
    students: '24',
    purpose: '',
    notes: '',
  }
}

export default function NewRequest({
  inline = false,
  calendarMode = false,
  initialDate = '',
  initialRoomId = '',
  onDateChange,
  onRoomChange,
  onComplete,
  onCancel,
}) {
  const { user, requests, users, rooms, fixedSchedules, createRequest, toast } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState(() => {
    const initial = initialForm(params, rooms)
    return {
      ...initial,
      date: initialDate || initial.date,
      roomId: initialRoomId ? Number(initialRoomId) : initial.roomId,
    }
  })
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (initialDate) setForm((current) => current.date === initialDate ? current : { ...current, date: initialDate })
  }, [initialDate])

  useEffect(() => {
    if (initialRoomId) {
      const room = Number(initialRoomId)
      setForm((current) => current.roomId === room ? current : { ...current, roomId: room })
    }
  }, [initialRoomId])

  // Ensure default roomId if none set and rooms become available
  const activeRoomId = rooms.some((room) => Number(room.id) === Number(form.roomId))
    ? form.roomId
    : rooms[0]?.id || ''

  const { check, fixed } = useMemo(() => {
    const fixedList = fixedConflicts(fixedSchedules, {
      date: form.date,
      start: form.startTime,
      end: form.endTime,
      roomId: activeRoomId,
    })
    const result = validateRequest(requests, { ...form, roomId: activeRoomId }, { teacherId: user.id })
    if (fixedList.length && !result.errors.date && !result.errors.endTime) {
      result.ok = false
      result.errors = {
        ...result.errors,
        overlap: `Ese horario ya está ocupado por el horario fijo de ${fixedList[0].teacherName}.`,
      }
    }
    return { check: result, fixed: fixedList }
  }, [requests, form, activeRoomId, user.id, fixedSchedules])

  function update(partial) {
    if (partial.date) onDateChange?.(partial.date)
    if (partial.roomId) onRoomChange?.(partial.roomId)
    setForm((current) => {
      const next = { ...current, ...partial }
      if (partial.startTime) {
        const ends = endOptions(partial.startTime)
        if (!ends.includes(next.endTime)) next.endTime = ends[Math.min(2, ends.length - 1)]
      }
      return next
    })
  }

  async function onSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!check.ok) return
    setSending(true)
    const result = await createRequest({ ...form, roomId: activeRoomId })
    setSending(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo enviar la solicitud.', 'bad')
      return
    }
    toast('Solicitud enviada con éxito. Coordinación CIST la revisará.')
    if (calendarMode) {
      const initial = initialForm(new URLSearchParams(), rooms)
      setForm({ ...initial, date: initialDate || initial.date, roomId: activeRoomId })
      setSubmitted(false)
    }
    if (onComplete) onComplete()
    else if (!calendarMode) navigate('/panel/solicitudes')
  }

  const show = (key) => (submitted ? check.errors[key] : '')
  const ends = endOptions(form.startTime)
  const previewReady = !check.errors.date && !check.errors.endTime
  const rules = [
    { label: 'Lunes a viernes, desde hoy hasta 45 días', bad: Boolean(check.errors.date), ready: Boolean(form.date) },
    { label: 'Entre 30 min y 3 hrs (07:00 a 17:30)', bad: Boolean(check.errors.endTime), ready: Boolean(form.startTime && form.endTime) },
    { label: 'Sin cruces con otras reservas u horario fijo', bad: Boolean(check.errors.overlap), ready: previewReady },
    { label: 'Máximo 3 horas por docente al día', bad: Boolean(check.errors.limit), ready: previewReady },
    { label: `Capacidad de 1 a ${LAB.capacity} estudiantes`, bad: Boolean(check.errors.students), ready: form.students !== '' },
  ]

  const content = (
    <>
      {inline ? (
        <div className="mb-5">
          <h2 className="text-lg font-bold">{calendarMode ? 'Solicitar horario' : 'Nueva reserva de sala de cómputo'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {calendarMode
              ? 'Elige el horario y completa los datos para solicitar la sala.'
              : 'Completa los datos de la clase y verifica la disponibilidad antes de enviar la solicitud.'}
          </p>
        </div>
      ) : (
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="size-5 text-primary" />
            Nueva Reserva de Sala de Cómputo
          </DialogTitle>
          <DialogDescription>
            Selecciona la fecha y bloque deseados. Si el horario no presenta conflictos, se registrará inmediatamente para revisión.
          </DialogDescription>
        </DialogHeader>
      )}

      <div className={`grid items-start gap-6 ${calendarMode ? '' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
          <form className={calendarMode ? 'space-y-3' : 'space-y-4'} onSubmit={onSubmit}>
            <div className={calendarMode ? 'grid grid-cols-2 gap-3' : 'grid gap-3 sm:grid-cols-2'}>
              <Field label="Fecha de la clase *" error={show('date')} className={calendarMode ? 'col-span-2' : ''}>
                <Input
                  type="date"
                  value={form.date}
                  min={nextBookableDate()}
                  onChange={(event) => update({ date: event.target.value })}
                  required
                />
              </Field>

              <Field label="Hora de inicio *" error={show('endTime')}>
                <Choice
                  value={form.startTime}
                  onChange={(value) => update({ startTime: value })}
                  options={startOptions().map((time) => ({ value: time, label: time }))}
                />
              </Field>

              <Field label="Hora de finalización *">
                <Choice
                  value={form.endTime}
                  onChange={(value) => update({ endTime: value })}
                  options={ends.map((time) => ({ value: time, label: time }))}
                />
              </Field>

              <Field label="Sala de cómputo *" error={show('roomId')} className={calendarMode ? 'col-span-2' : ''}>
                <Choice
                  value={activeRoomId}
                  onChange={(value) => update({ roomId: Number(value) })}
                  options={rooms.map((room) => ({ value: room.id, label: room.name }))}
                />
              </Field>

              <Field label="Grado *" error={show('grade')}>
                <Choice
                  value={form.grade}
                  onChange={(value) => update({ grade: value })}
                  options={GRADES.map((grade) => ({ value: grade, label: grade }))}
                />
              </Field>

              <Field label="Sección *" error={show('section')}>
                <Choice
                  value={form.section}
                  onChange={(value) => update({ section: value })}
                  options={SECTIONS.map((section) => ({ value: section, label: section }))}
                />
              </Field>

              <Field
                label="Cantidad de estudiantes *"
                error={show('students')}
                hint={`Límite de la sala: ${LAB.capacity}`}
                className={calendarMode ? 'col-span-2' : ''}
              >
                <Input
                  type="number"
                  min="1"
                  max={LAB.capacity}
                  value={form.students}
                  onChange={(event) => update({ students: event.target.value })}
                  required
                />
              </Field>
            </div>

            <Field label="Propósito pedagógico / Actividad *" error={show('purpose')}>
              <Textarea
                value={form.purpose}
                maxLength={180}
                placeholder="Ej. Uso de simuladores de física y resolución de ejercicios prácticos."
                onChange={(event) => update({ purpose: event.target.value })}
                required
              />
            </Field>

            {calendarMode ? (
              <details className="rounded-md border border-border/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  Notas o requerimientos especiales (opcional)
                </summary>
                <Field className="mt-3" error={show('notes')}>
                  <Textarea
                    value={form.notes}
                    maxLength={240}
                    placeholder="Ej. Se requiere proyector multimedia encendido e internet estable."
                    onChange={(event) => update({ notes: event.target.value })}
                  />
                </Field>
              </details>
            ) : (
              <Field label="Notas o requerimientos especiales para CIST" hint="Opcional" error={show('notes')}>
                <Textarea
                  value={form.notes}
                  maxLength={240}
                  placeholder="Ej. Se requiere proyector multimedia encendido e internet estable."
                  onChange={(event) => update({ notes: event.target.value })}
                />
              </Field>
            )}

            {(check.errors.limit || (submitted && check.errors.endTime)) && (
              <p className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg">
                {check.errors.limit || (submitted ? check.errors.endTime : '')}
              </p>
            )}

            {(check.conflicts.length > 0 || fixed.length > 0) && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 mb-2">
                  <AlertCircle className="size-4" />
                  <span>Conflicto detectado: este horario ya está ocupado</span>
                </div>
                <ul className="space-y-1.5 text-amber-900/90 dark:text-amber-200">
                  {fixed.map((item) => (
                    <li key={`fijo-${item.id}`} className="flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" />
                      <span>{item.teacherName} · {item.startTime}–{item.endTime} (Horario fijo de {item.grade} {item.section})</span>
                    </li>
                  ))}
                  {check.conflicts.map((item) => (
                    <li key={item.id} className="flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" />
                      <span>
                        {personName(users, item.teacherId)} · {item.startTime}–{item.endTime} ({STATUS[item.status] || 'Activa'})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter className={`pt-2 ${calendarMode ? 'flex-col-reverse sm:flex-row' : ''}`}>
              {calendarMode ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSubmitted(false)
                    setForm({ ...initialForm(new URLSearchParams(), rooms), date: form.date, roomId: activeRoomId })
                  }}
                >
                  Limpiar
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => (onCancel ? onCancel() : navigate('/panel/calendario'))}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={sending}>
                {sending ? 'Enviando...' : calendarMode ? 'Enviar solicitud' : 'Enviar solicitud'}
              </Button>
            </DialogFooter>
          </form>

          {/* Sidebar validation rules & Timeline */}
          {!calendarMode && <aside className="space-y-4">
            <Card className="border-border/80">
              <CardContent className="p-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Requisitos de reserva
                </h3>
                <ul className="space-y-2.5">
                  {rules.map((rule) => {
                    const ok = rule.ready && !rule.bad
                    const bad = rule.ready && rule.bad
                    return (
                      <li key={rule.label} className="flex items-start gap-2 text-xs">
                        <span
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                            ok
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : bad
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {bad ? <Minus className="size-2.5" /> : <Check className="size-2.5" />}
                        </span>
                        <span className={bad ? 'text-destructive font-semibold' : ok ? 'text-foreground' : 'text-muted-foreground'}>
                          {rule.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            <div>
              <h3 className="mb-2 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Disponibilidad del día
              </h3>
              <DayTimeline
                date={form.date}
                requests={[
                  ...requests.filter((item) => !activeRoomId || Number(item.roomId) === Number(activeRoomId)),
                  ...fixedSchedules
                    .filter(
                      (item) =>
                        Number(item.roomId) === Number(activeRoomId) &&
                        Number(item.weekday) === new Date(`${form.date}T12:00:00`).getDay()
                    )
                    .map((item) => ({ ...item, id: `fijo-${item.id}`, teacherId: item.teacherId, date: form.date, status: 'fixed' })),
                ]}
                users={users}
                preview={
                  previewReady
                    ? {
                        start: form.startTime,
                        end: form.endTime,
                        label: 'Tu solicitud',
                        tone: check.conflicts.length || fixed.length || toMinutes(form.endTime) <= toMinutes(form.startTime) ? 'bad' : 'ok',
                      }
                    : null
                }
              />
            </div>
          </aside>}
      </div>
    </>
  )

  if (inline) return <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs sm:p-6">{content}</div>

  return (
    <Dialog open onOpenChange={(next) => { if (!next) navigate('/panel/calendario') }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        {content}
      </DialogContent>
    </Dialog>
  )
}
