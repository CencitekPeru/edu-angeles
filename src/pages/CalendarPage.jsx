import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  Clock3,
  Eye,
  FileBarChart,
  LockKeyhole,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { WeekBoard } from '../components/Schedule'
import { PageHeader, StatusBadge } from '../components/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Choice } from '@/components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Table } from './campus/kit'
import NewRequest from './NewRequest'
import { isPastEnd, nextBookableDate, parseISODate, schoolWeek } from '../lib/time'
import { personName } from '../lib/reservations'

function SummaryCard({ icon: Icon, label, value, hint, tone }) {
  const tones = {
    blue: 'border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    green: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    red: 'border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300',
  }

  return (
    <Card className={`border shadow-xs ${tones[tone]}`}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold leading-none text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs font-bold">{label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function QuickAction({ to, icon: Icon, children, tone }) {
  return (
    <Button asChild variant="outline" className={`h-auto min-h-11 justify-start gap-2 px-3 py-2 text-xs font-bold ${tone}`}>
      <Link to={to}>
        <Icon className="size-4 shrink-0" />
        {children}
      </Link>
    </Button>
  )
}

function CalendarLegend() {
  const items = [
    { label: 'Horario fijo', color: 'bg-indigo-600' },
    { label: 'Reserva confirmada', color: 'bg-emerald-600' },
    { label: 'Solicitud pendiente', color: 'bg-amber-500' },
  ]

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="border-b border-border/70 bg-muted/30 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4 text-primary" />
          Leyenda de horarios
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-3 p-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`size-3 rounded-sm ${item.color}`} />
            {item.label}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function CalendarPage() {
  const { user, requests, users, rooms, fixedSchedules, decideRequest, toast } = useApp()
  const [roomId, setRoomId] = useState('')
  const [calendarDate, setCalendarDate] = useState(nextBookableDate())
  const [rejecting, setRejecting] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [saving, setSaving] = useState(false)
  const teacher = user.role === 'teacher'
  const admin = user.role === 'admin'
  const selected = rooms.some((room) => Number(room.id) === Number(roomId))
    ? roomId
    : rooms[0]?.id || ''
  const week = schoolWeek(new Date())
  const weeklyRequests = requests.filter((item) => item.date >= week[0] && item.date <= week[4])
  const pendingRequests = useMemo(() => requests
    .filter((item) => item.status === 'pending')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 3), [requests])

  const roomCalendars = useMemo(() => rooms.map((room) => {
    const roomRequests = requests.filter(
      (item) => !item.roomId || Number(item.roomId) === Number(room.id),
    )
    const slots = fixedSchedules.filter((item) => Number(item.roomId) === Number(room.id))
    const fixed = []
    const anchor = new Date()
    for (let offset = -21; offset <= 70; offset += 7) {
      const week = schoolWeek(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offset))
      for (const date of week) {
        const weekday = parseISODate(date).getDay()
        for (const slot of slots.filter((item) => Number(item.weekday) === weekday)) {
          fixed.push({
            id: `fijo-${slot.id}-${date}`,
            teacherId: slot.teacherId,
            roomId: slot.roomId,
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            grade: slot.grade,
            section: slot.section,
            purpose: slot.purpose,
            status: 'fixed',
            students: 0,
            notes: 'Horario fijo semanal',
            adminNote: '',
          })
        }
      }
    }
    return { room, requests: [...roomRequests, ...fixed] }
  }), [rooms, requests, fixedSchedules])

  const upcoming = useMemo(() => requests
    .filter((item) =>
      item.teacherId === user.id &&
      (item.status === 'pending' || item.status === 'approved') &&
      !isPastEnd(item.date, item.endTime),
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 8), [requests, user.id])

  async function approveRequest(request) {
    const result = await decideRequest(request.id, 'approved')
    if (!result.ok) {
      toast(result.error || 'No se pudo aprobar la solicitud.', 'bad')
      return
    }
    toast('Solicitud aprobada.')
  }

  async function rejectRequest() {
    if (!rejecting) return
    setSaving(true)
    const result = await decideRequest(rejecting.id, 'rejected', rejectNote)
    setSaving(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo rechazar la solicitud.', 'bad')
      return
    }
    toast('Solicitud rechazada.')
    setRejecting(null)
    setRejectNote('')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ocupación"
        title={admin ? 'Calendario de reservas' : 'Calendario de salas'}
        text={admin
          ? 'Revisa la ocupación de las salas, gestiona solicitudes y accede rápidamente a las herramientas de coordinación.'
          : 'Consulta la disponibilidad y solicita la sala de cómputo para tus clases o actividades.'}
        action={
          <div className="w-full sm:w-56">
            <Choice
              value={selected}
              onChange={(value) => setRoomId(value)}
              options={rooms.map((room) => ({ value: room.id, label: room.name }))}
            />
          </div>
        }
      />

      {admin && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={CalendarDays} label="Solicitudes totales" value={weeklyRequests.length} hint="Esta semana" tone="blue" />
          <SummaryCard icon={Clock3} label="Pendientes de aprobación" value={weeklyRequests.filter((item) => item.status === 'pending').length} hint="Requieren revisión" tone="amber" />
          <SummaryCard icon={Check} label="Reservas confirmadas" value={weeklyRequests.filter((item) => item.status === 'approved').length} hint="Esta semana" tone="green" />
          <SummaryCard icon={X} label="Solicitudes rechazadas" value={weeklyRequests.filter((item) => item.status === 'rejected').length} hint="Esta semana" tone="red" />
        </div>
      )}

      {admin ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,0.9fr)]">
          <div className="space-y-4">
            {roomCalendars.map(({ room, requests: roomRequests }) => (
              <section key={room.id} className={`space-y-2 rounded-xl ${Number(selected) === Number(room.id) ? 'ring-1 ring-primary/40' : ''}`}>
                <h2 className="px-1 text-sm font-bold text-foreground">{room.name}</h2>
                <WeekBoard
                  requests={roomRequests}
                  users={users}
                  initialDate={calendarDate}
                  onReserve={setCalendarDate}
                />
              </section>
            ))}
            <CalendarLegend />
          </div>
          <aside className="space-y-4">
            <Card className="border-amber-500/20 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <Clock3 className="size-4 text-amber-600" />
                  Solicitudes pendientes ({requests.filter((item) => item.status === 'pending').length})
                </CardTitle>
                <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <Link to="/admin/solicitudes">Ver todas</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 p-3">
                {pendingRequests.length ? pendingRequests.map((item) => (
                  <article key={item.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{personName(users, item.teacherId)}</p>
                        <p className="truncate text-xs text-muted-foreground">{users.find((person) => person.id === item.teacherId)?.subject || 'Docente'}</p>
                      </div>
                      <StatusBadge status="pending" />
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISODate(item.date))}</p>
                      <p className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{item.startTime}–{item.endTime} · {item.students} estudiantes</p>
                    </div>
                    <p className="mt-2 line-clamp-2 rounded bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-200">{item.purpose}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" className="h-8 gap-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700" onClick={() => approveRequest(item)}>
                        <Check className="size-3.5" /> Aprobar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="h-8 gap-1 text-xs" onClick={() => { setRejecting(item); setRejectNote('') }}>
                        <X className="size-3.5" /> Rechazar
                      </Button>
                    </div>
                  </article>
                )) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-xs">
              <CardHeader className="border-b border-border/70 bg-sky-500/5 px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-sky-700 dark:text-sky-300">
                  <Settings2 className="size-4" />
                  Acciones rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
                <QuickAction to="/admin/mantenimiento" icon={Wrench} tone="border-sky-500/20 bg-sky-500/5 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300">
                  Registrar mantenimiento
                </QuickAction>
                <QuickAction to="/admin/horarios" icon={Settings2} tone="border-slate-500/20 bg-muted/40 text-foreground hover:bg-muted">
                  Configurar horarios fijos
                </QuickAction>
                <QuickAction to="/admin/solicitudes" icon={LockKeyhole} tone="border-rose-500/20 bg-rose-500/5 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300">
                  Gestionar solicitudes
                </QuickAction>
                <QuickAction to="/admin/reportes" icon={FileBarChart} tone="border-emerald-500/20 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
                  Ver reportes
                </QuickAction>
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {roomCalendars.map(({ room, requests: roomRequests }) => (
                <section key={room.id} className={`space-y-2 rounded-xl ${Number(selected) === Number(room.id) ? 'ring-1 ring-primary/40' : ''}`}>
                  <h2 className="px-1 text-sm font-bold text-foreground">{room.name}</h2>
                  <WeekBoard
                    requests={roomRequests}
                    users={users}
                    canReserve={teacher}
                    initialDate={calendarDate}
                    onReserve={(date) => {
                      setCalendarDate(date)
                      if (teacher) setRoomId(String(room.id))
                    }}
                  />
                </section>
              ))}
            </div>
            {teacher && (
              <NewRequest
                inline
                calendarMode
                initialDate={calendarDate}
                initialRoomId={selected}
                onDateChange={setCalendarDate}
                onRoomChange={(value) => setRoomId(String(value))}
              />
            )}
          </div>

          <CalendarLegend />
        </>
      )}

      {teacher && (
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <CalendarDays className="size-4 text-primary" />
              Mis próximas reservas
            </CardTitle>
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Link to="/panel/solicitudes">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            <Table
              rows={upcoming}
              empty="Todavía no tienes reservas próximas."
              columns={[
                {
                  key: 'date',
                  label: 'Fecha',
                  render: (item) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISODate(item.date)),
                },
                { key: 'time', label: 'Horario', render: (item) => `${item.startTime}–${item.endTime}` },
                {
                  key: 'room',
                  label: 'Sala',
                  render: (item) => item.roomName || rooms.find((room) => Number(room.id) === Number(item.roomId))?.name || 'Sala de cómputo',
                },
                { key: 'grade', label: 'Grado / Sección', render: (item) => `${item.grade} ${item.section}` },
                { key: 'purpose', label: 'Propósito', render: (item) => item.purpose },
                { key: 'status', label: 'Estado', render: (item) => <StatusBadge status={item.status} /> },
                {
                  key: 'actions',
                  label: 'Acciones',
                  render: () => (
                    <Button asChild type="button" variant="outline" size="icon-sm" aria-label="Ver mis reservas">
                      <Link to="/panel/solicitudes"><Eye className="size-4" /></Link>
                    </Button>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              {rejecting && `${personName(users, rejecting.teacherId)} · ${rejecting.date} · ${rejecting.startTime}–${rejecting.endTime}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="calendar-reject-note" className="text-xs font-semibold">Motivo del rechazo (opcional)</label>
            <Textarea id="calendar-reject-note" value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Indica el motivo para el docente." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={rejectRequest}>
              {saving ? 'Guardando…' : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
