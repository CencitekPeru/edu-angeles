import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Clock3, Plus, Sparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { conflictingRequests, isBlocking } from '../lib/reservations'
import { formatDuration, formatLongDate, formatMinutes, greeting, isPastEnd, schoolWeek, todayISO, toMinutes } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DayTimeline } from '../components/Schedule'
import { ActivityFeed } from '../components/Notifications'
import { PageHeader, Stat, StatusBadge } from '../components/ui'

export default function TeacherHome() {
  const { user, requests, users, notifications } = useApp()
  const mine = requests.filter((item) => item.teacherId === user.id)
  const pending = mine.filter((item) => item.status === 'pending')
  const upcoming = mine
    .filter((item) => item.status === 'approved' && !isPastEnd(item.date, item.endTime))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  const week = new Set(schoolWeek(new Date()))
  const weekMinutes = mine
    .filter((item) => item.status === 'approved' && week.has(item.date))
    .reduce((total, item) => total + toMinutes(item.endTime) - toMinutes(item.startTime), 0)
  const crossed = pending.filter((item) => conflictingRequests(requests, {
    date: item.date,
    start: item.startTime,
    end: item.endTime,
    ignoreId: item.id,
  }).length > 0)
  const today = todayISO()
  const todayItems = requests.filter((item) => item.date === today && isBlocking(item.status))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={greeting(user.name)}
        title="Panel del Docente"
        text="Reserva la sala de cómputo para tus clases. Si otra solicitud ya apartó ese horario, el sistema te avisará de inmediato."
        action={
          <Button asChild className="gap-2 font-bold">
            <Link to="/panel/nueva">
              <Plus className="size-4" />
              Nueva solicitud
            </Link>
          </Button>
        }
      />

      {crossed.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <p>
            Tienes {crossed.length === 1 ? 'una solicitud que se cruza' : `${crossed.length} solicitudes que se cruzan`} con otro horario.
            Coordinación no podrá aprobarla hasta que el bloque quede libre o escojas otro horario.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Solicitudes pendientes" value={pending.length} hint="Esperando revisión de CIST" icon={Clock3} />
        <Stat label="Clases confirmadas" value={upcoming.length} hint="Próximas reservas activas" icon={CalendarDays} />
        <Stat label="Horas esta semana" value={formatMinutes(weekMinutes)} hint="Tiempo de sala programado" icon={Sparkles} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-foreground">Avisos y notificaciones</h2>
        <ActivityFeed items={notifications} />
      </section>

      {/* Main split */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-foreground">Próximas reservas confirmadas</h2>
          {upcoming.length === 0 ? (
            <Card className="border-dashed border-2 bg-card/40 text-center p-8">
              <CardContent className="p-0">
                <p className="text-sm text-muted-foreground">
                  Aún no tienes clases confirmadas para los próximos días. Envía una solicitud para apartar la sala.
                </p>
              </CardContent>
            </Card>
          ) : (
            upcoming.slice(0, 4).map((item) => (
              <Card key={item.id} className="border-border/80 transition-shadow hover:shadow-xs">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-semibold text-muted-foreground">
                      {item.grade} {item.section}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-foreground text-sm">
                    {formatLongDate(item.date)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {item.startTime} – {item.endTime} ({formatDuration(item.startTime, item.endTime)})
                  </p>
                  <p className="text-xs text-foreground/90 bg-muted/30 p-2 rounded-md">
                    {item.purpose}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-foreground">Ocupación de hoy en sala</h2>
          {todayItems.length === 0 && (
            <p className="text-xs text-muted-foreground">Hoy no hay horarios ocupados en la sala.</p>
          )}
          <DayTimeline date={today} requests={requests} users={users} />
        </section>
      </div>
    </div>
  )
}
