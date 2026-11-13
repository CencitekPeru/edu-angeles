import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, Hammer, LayoutGrid, ListChecks, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader, Panel, Pill, StatCard } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import { ACT, ACTIVE_STATUS, ActivityDetail, ActivityForm, Progress, daysUntil, dmy, isOverdue, timeLabel } from './shared'

/** Panel de actividades: what is coming, what is being prepared and what needs attention. */
export default function ActivitiesPanel() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const today = todayLima()
  const [activities, setActivities] = useState([])
  const [tasks, setTasks] = useState([])
  const [opened, setOpened] = useState(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const year = today.slice(0, 4)
    const [activityResult, taskResult] = await Promise.all([api(`/api/activities?from=${year}-01-01&to=${year}-12-31`), api('/api/activity-tasks')])
    if (!activityResult.ok || !taskResult.ok) return toast('No se pudo cargar el panel de actividades.', 'bad')
    setActivities(activityResult.activities)
    setTasks(taskResult.tasks)
  }
  useEffect(() => { load() }, [])

  const data = useMemo(() => {
    const month = today.slice(0, 7)
    const active = activities.filter((item) => ACTIVE_STATUS.includes(item.status))
    const upcoming = active.filter((item) => item.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
    const byType = new Map()
    activities.forEach((item) => byType.set(item.type, (byType.get(item.type) || 0) + 1))
    return {
      thisMonth: activities.filter((item) => item.startDate.slice(0, 7) === month || item.endDate.slice(0, 7) === month).length,
      nextWeek: upcoming.filter((item) => daysUntil(item.startDate, today) <= 7).length,
      preparing: activities.filter((item) => item.status === 'En preparación').length,
      done: activities.filter((item) => item.status === 'Realizada').length,
      upcoming: upcoming.slice(0, 7),
      overdue: tasks.filter((task) => isOverdue(task, today)),
      dueSoon: tasks.filter((task) => task.status !== 'Completada' && task.dueDate && task.dueDate >= today && daysUntil(task.dueDate, today) <= 7),
      noReport: activities.filter((item) => item.status === 'Realizada' && !item.hasReport).concat(activities.filter((item) => ACTIVE_STATUS.includes(item.status) && item.endDate < today)),
      byType: [...byType.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
    }
  }, [activities, tasks, today])
  const maxType = Math.max(1, ...data.byType.map((row) => row.total))

  return (
    <div className="space-y-5">
      <PageHeader icon={LayoutGrid} title="Panel de actividades" description={`Resumen de las actividades institucionales del año ${today.slice(0, 4)}.`}
        actions={canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Registrar actividad</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={CalendarDays} value={data.thisMonth} label="Actividades del mes" to={ACT.calendar} />
        <StatCard tone="blue" icon={CalendarClock} value={data.nextWeek} label="Próximos 7 días" to={ACT.list} />
        <StatCard tone="amber" icon={Hammer} value={data.preparing} label="En preparación" to={ACT.list} />
        <StatCard tone="green" icon={CheckCircle2} value={data.done} label="Realizadas" to={ACT.resources} />
        <StatCard tone="red" icon={AlertTriangle} value={data.overdue.length} label="Tareas vencidas" to={ACT.followUp} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Próximas actividades" icon={CalendarClock} contentClassName="p-0"
          action={<Link to={ACT.calendar} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver calendario <ArrowRight className="size-3.5" /></Link>}>
          <ul className="divide-y divide-border">
            {data.upcoming.map((item) => {
              const days = daysUntil(item.startDate, today)
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => setOpened(item.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-muted/40">
                    <span className="w-20 shrink-0 text-center">
                      <span className="block text-lg font-extrabold leading-none">{dmy(item.startDate).slice(0, 5)}</span>
                      <span className="text-[11px] text-muted-foreground">{days <= 0 ? 'Hoy / en curso' : days === 1 ? 'Mañana' : `En ${days} días`}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.type} · {timeLabel(item)}{item.place ? ` · ${item.place}` : ''} · {item.commissionName || item.responsible}</span>
                    </span>
                    <span className="hidden flex-col items-end gap-1 sm:flex"><Pill value={item.status} /><Progress value={item.tasks.progress} /></span>
                  </button>
                </li>
              )
            })}
            {!data.upcoming.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No hay actividades próximas programadas.</li>}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel title="Requiere atención" icon={AlertTriangle} contentClassName="p-0"
            action={<Link to={ACT.followUp} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Seguimiento <ArrowRight className="size-3.5" /></Link>}>
            <ul className="divide-y divide-border text-sm">
              {data.overdue.slice(0, 5).map((task) => (
                <li key={`o${task.id}`} className="px-5 py-2.5"><span className="font-medium">{task.title}</span><span className="block text-xs text-destructive">Vencida el {dmy(task.dueDate)} · {task.responsible} · {task.activityCode}</span></li>
              ))}
              {data.dueSoon.slice(0, 4).map((task) => (
                <li key={`s${task.id}`} className="px-5 py-2.5"><span className="font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">Vence el {dmy(task.dueDate)} · {task.responsible} · {task.activityCode}</span></li>
              ))}
              {data.noReport.slice(0, 4).map((item) => (
                <li key={`r${item.id}`} className="px-5 py-2.5">
                  <button type="button" className="text-left hover:text-primary" onClick={() => setOpened(item.id)}><span className="font-medium">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">{item.status === 'Realizada' ? 'Realizada sin informe de resultados' : `Pasó el ${dmy(item.endDate)} y sigue «${item.status}»: actualiza su estado`}</span></button>
                </li>
              ))}
              {!data.overdue.length && !data.dueSoon.length && !data.noReport.length && <li className="flex items-center gap-2 px-5 py-6 text-muted-foreground"><CalendarCheck className="size-4" /> Todo al día.</li>}
            </ul>
          </Panel>

          <Panel title="Actividades por tipo" icon={BarChart3}>
            <ul className="space-y-2.5">
              {data.byType.map((row) => (
                <li key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm" title={`${row.label}: ${row.total}`}>
                  <span className="truncate text-foreground/80">{row.label}</span>
                  <span className="h-3 rounded-r bg-muted/60"><span className="block h-3 rounded-r-[4px] bg-primary" style={{ width: `${(row.total / maxType) * 100}%` }} /></span>
                  <span className="text-right tabular-nums">{row.total}</span>
                </li>
              ))}
              {!data.byType.length && <li className="py-4 text-center text-sm text-muted-foreground">Sin actividades este año.</li>}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ListChecks className="size-3.5" /> {tasks.filter((task) => task.status === 'Completada').length} de {tasks.length} tareas completadas.</p>
          </Panel>
        </div>
      </div>

      {creating && <ActivityForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {opened && <ActivityDetail id={opened} onClose={() => setOpened(null)} onChanged={load} />}
    </div>
  )
}
