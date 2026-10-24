import { Link } from 'react-router-dom'
import { CalendarDays, Clock3, Users } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { isBlocking, occupancyPercent, personName } from '../lib/reservations'
import { formatLongDate, greeting, todayISO } from '../lib/time'
import { Button } from '@/components/ui/button'
import { DayTimeline } from '../components/Schedule'
import { ActivityFeed } from '../components/Notifications'
import { PageHeader, Stat, StatusBadge } from '../components/ui'

export default function AdminHome() {
  const { user, requests, users, notifications } = useApp()
  const today = todayISO()
  const pending = requests.filter((item) => item.status === 'pending')
  const todayClasses = requests.filter((item) => item.date === today && item.status === 'approved')
  const activeTeachers = users.filter((item) => item.role === 'teacher' && item.active).length
  const occupancy = occupancyPercent(requests, today)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={greeting(user.name)}
        title="Coordinación de la sala"
        text="Revisa las solicitudes y aprueba solo los horarios que no se cruzan. El cupo de la sala es de 32 estudiantes."
        action={<Button asChild><Link to="/admin/solicitudes">Revisar solicitudes</Link></Button>}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Actividad reciente</h2>
        <ActivityFeed items={notifications} />
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Por revisar" value={pending.length} hint="Solicitudes pendientes" icon={Clock3} />
        <Stat label="Clases de hoy" value={todayClasses.length} hint={formatLongDate(today)} icon={CalendarDays} />
        <Stat label="Ocupación de hoy" value={`${occupancy}%`} hint="Sobre el horario hábil" icon={CalendarDays} />
        <Stat label="Docentes activos" value={activeTeachers} hint="Pueden enviar solicitudes" icon={Users} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">En espera</h2>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-sm text-ink/65">
              No hay solicitudes pendientes.
            </div>
          ) : (
            pending
              .slice()
              .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
              .slice(0, 4)
              .map((item) => (
                <article key={item.id} className="rounded-2xl border border-line bg-white p-4">
                  <StatusBadge status={item.status} />
                  <p className="mt-2 font-bold">{personName(users, item.teacherId)}</p>
                  <p className="text-sm text-ink/65">
                    {formatLongDate(item.date)} · {item.startTime}–{item.endTime} · {item.grade} {item.section}
                  </p>
                  <p className="mt-1 text-sm">{item.purpose}</p>
                </article>
              ))
          )}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Hoy</h2>
            <span className="text-sm font-bold text-pine">{occupancy}% ocupada</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-pine" style={{ width: `${occupancy}%` }} />
          </div>
          {!requests.some((item) => item.date === today && isBlocking(item.status)) && (
            <p className="mb-3 text-sm text-ink/60">Hoy la sala está libre.</p>
          )}
          <DayTimeline date={today} requests={requests} users={users} />
        </section>
      </div>
    </div>
  )
}
