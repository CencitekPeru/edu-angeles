import { useMemo, useState } from 'react'
import { ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, Clock, Eye, Laptop, Layers, List, Plus, Trash2, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { isPastEnd, todayISO } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, StatCard } from './campus/kit'
import { StatusChip, dmy, longDate, tableHead, td, th } from './attendance/shared'
import { REQUEST_META, createdParts, requestCode, shortDayDate } from './reservations/shared'
import { CalendarLegend, MonthCalendar } from './reservations/MonthCalendar'
import NewRequestDialog from './reservations/NewRequestDialog'

export default function MyRequests() {
  const { user, requests, rooms, cancelRequest, toast } = useApp()
  const today = todayISO()
  const [creating, setCreating] = useState(false)
  const [target, setTarget] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [selectedDay, setSelectedDay] = useState(today)
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }))

  const mine = useMemo(() => requests.filter((item) => item.teacherId === user.id), [requests, user.id])
  const activeRoom = roomId || String(rooms[0]?.id || '')
  const count = (status) => mine.filter((item) => item.status === status).length

  const marks = useMemo(() => {
    const priority = { approved: 3, pending: 2, rejected: 1 }
    const result = {}
    for (const item of mine) {
      if (String(item.roomId) !== activeRoom || !priority[item.status]) continue
      if (!result[item.date] || priority[item.status] > priority[result[item.date]]) result[item.date] = item.status
    }
    return result
  }, [mine, activeRoom])

  const upcoming = mine
    .filter((item) => item.status !== 'cancelled' && !isPastEnd(item.date, item.endTime))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 3)
  const history = [...mine].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.id - a.id)
  const dayItems = mine.filter((item) => item.date === selectedDay && String(item.roomId) === activeRoom)

  async function confirmCancel() {
    const result = await cancelRequest(target.id)
    if (!result.ok) return toast(result.error, 'bad')
    toast('Solicitud cancelada. El horario quedó libre.')
    setTarget(null)
  }

  const canCancel = (item) => (item.status === 'pending' || item.status === 'approved') && !isPastEnd(item.date, item.endTime)

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarCheck} title="Mis Solicitudes de Reserva" description="Gestiona tus solicitudes de uso de las salas de cómputo." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <StatCard tone="blue" icon={Layers} value={mine.length} label="Total de solicitudes" />
        <StatCard tone="amber" icon={Clock} value={count('pending')} label="Pendientes" />
        <StatCard tone="green" icon={CheckCircle2} value={count('approved')} label="Aprobadas" />
        <StatCard tone="red" icon={XCircle} value={count('rejected')} label="Rechazadas" />
        <Button type="button" size="lg" className="h-auto self-center bg-[#0b1730] px-6 py-3 hover:bg-[#13244a] dark:bg-primary" onClick={() => setCreating(true)}><Plus /> Nueva reserva</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
        <Panel title="Calendario de mis reservas" icon={CalendarDays}>
          <div className="mb-3 flex flex-wrap justify-end gap-1">
            {rooms.map((room) => (
              <button key={room.id} type="button" onClick={() => setRoomId(String(room.id))}
                className={cn('rounded-md px-4 py-1.5 text-sm font-semibold', String(room.id) === activeRoom ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted')}>
                {room.name}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
            <MonthCalendar year={month.year} month={month.month} onMonth={(year, value) => setMonth({ year, month: value })} today={today} selected={selectedDay} marks={marks} onSelect={setSelectedDay} />
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-bold">Leyenda</p>
              <CalendarLegend items={[['approved', 'Reserva aprobada'], ['pending', 'Reserva pendiente'], ['rejected', 'Reserva rechazada'], ['selected', 'Día seleccionado']]} />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border p-3 text-sm">
            <p className="font-semibold">{longDate(selectedDay)}</p>
            {dayItems.length ? (
              <ul className="mt-1.5 space-y-1">
                {dayItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>{item.startTime}–{item.endTime} · {item.purpose}</span>
                    <StatusChip status={item.status} meta={REQUEST_META} />
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-xs text-muted-foreground">Sin reservas tuyas en esta sala.</p>}
          </div>
        </Panel>

        <Panel title="Próximas reservas" icon={Clock} contentClassName="p-3">
          {upcoming.length ? (
            <ul className="space-y-3">
              {upcoming.map((item) => (
                <li key={item.id} className={cn('flex items-center gap-3 rounded-lg border border-border border-l-4 p-3', item.status === 'approved' ? 'border-l-[#3f7d5c]' : item.status === 'pending' ? 'border-l-[#b7832f]' : 'border-l-[#b4413c]')}>
                  <Laptop className="size-6 shrink-0 text-foreground/70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.purpose}</p>
                    <p className="text-xs text-muted-foreground">{item.roomName} | {item.grade} {item.section} | {item.students} estudiantes</p>
                  </div>
                  <StatusChip status={item.status} meta={REQUEST_META} />
                  <div className="hidden shrink-0 text-right text-xs font-semibold sm:block">
                    <p className="flex items-center justify-end gap-1"><CalendarDays className="size-3.5" />{shortDayDate(item.date)}</p>
                    <p className="flex items-center justify-end gap-1"><Clock className="size-3.5" />{item.startTime} – {item.endTime}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              No tienes reservas próximas.
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}><Plus /> Crear una reserva</Button>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Historial de solicitudes"
        icon={List}
        contentClassName="p-0"
        action={history.length > 5 && (
          <button type="button" onClick={() => setShowAll((value) => !value)} className="flex items-center gap-1 rounded-lg border border-primary/40 bg-card px-3 py-1 text-xs font-semibold text-primary hover:bg-muted">
            {showAll ? 'Ver menos' : 'Ver todo'} <ArrowRight className="size-3.5" />
          </button>
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>{['N.º', 'Fecha de solicitud', 'Ambiente', 'Grado', 'Sección', 'Estudiantes', 'Actividad / Motivo', 'Fecha y horario', 'Estado', 'Acciones'].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {(showAll ? history : history.slice(0, 5)).map((item) => (
                <tr key={item.id} className="border-t border-border/70">
                  <td className={cn(td, 'whitespace-nowrap font-semibold')}>{requestCode(item.id)}</td>
                  <td className={cn(td, 'tabular-nums')}>{createdParts(item.createdAt).date}</td>
                  <td className={td}>{item.roomName}</td>
                  <td className={td}>{item.grade}</td>
                  <td className={td}>{item.section}</td>
                  <td className={cn(td, 'text-center')}>{item.students}</td>
                  <td className={cn(td, 'max-w-[220px] truncate')} title={item.purpose}>{item.purpose}</td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{dmy(item.date)} <span className="ml-2">{item.startTime} – {item.endTime}</span></td>
                  <td className={td}><StatusChip status={item.status} meta={REQUEST_META} /></td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setViewing(item)} className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-primary hover:bg-muted" aria-label="Ver"><Eye className="size-4" /></button>
                      {canCancel(item) && <button type="button" onClick={() => setTarget(item)} className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-[#b4413c] hover:bg-muted" aria-label="Cancelar reserva"><Trash2 className="size-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Aún no has enviado solicitudes.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {creating && <NewRequestDialog initialDate={selectedDay >= today ? selectedDay : undefined} onClose={() => setCreating(false)} onComplete={() => setCreating(false)} />}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
        <DialogContent className="sm:max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{requestCode(viewing.id)} · {viewing.purpose}</DialogTitle>
                <DialogDescription>{longDate(viewing.date)} · {viewing.startTime}–{viewing.endTime}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Estado</dt><dd><StatusChip status={viewing.status} meta={REQUEST_META} /></dd>
                <dt className="text-muted-foreground">Sala</dt><dd>{viewing.roomName}</dd>
                <dt className="text-muted-foreground">Grado / sección</dt><dd>{viewing.grade} {viewing.section} · {viewing.students} estudiantes</dd>
                <dt className="text-muted-foreground">Descripción</dt><dd>{viewing.notes || '—'}</dd>
                <dt className="text-muted-foreground">Respuesta de CIST</dt><dd>{viewing.adminNote || '—'}</dd>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(target)} onOpenChange={(next) => { if (!next) setTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
            <DialogDescription>
              {target && `${dmy(target.date)} · ${target.startTime}–${target.endTime} (${target.grade} ${target.section}). El horario se liberará inmediatamente para otros docentes.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>Mantener reserva</Button>
            <Button type="button" variant="destructive" onClick={confirmCancel}>Confirmar cancelación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
