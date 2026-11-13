import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Eraser, FileSpreadsheet, ListChecks, Pencil, Plus, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { FilterLabel, Select, todayLima } from '../attendance/shared'
import { ACTIVE_STATUS, ACTIVITY_STATUS, ActivityDetail, Progress, TASK_STATUS, TaskForm, dateLabel, daysUntil, dmy, isOverdue, opts } from './shared'

/** Seguimiento: every task of every activity, overdue ones first, and the progress of active activities. */
export default function FollowUpPage() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const today = todayLima()
  const [tasks, setTasks] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const emptyFilters = { q: '', status: 'abiertas', responsible: '', activity: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState(null)

  async function load() {
    const year = today.slice(0, 4)
    const [taskResult, activityResult] = await Promise.all([api('/api/activity-tasks'), api(`/api/activities?from=${year}-01-01&to=${year}-12-31`)])
    setLoading(false)
    if (!taskResult.ok || !activityResult.ok) return toast('No se pudo cargar el seguimiento.', 'bad')
    setTasks(taskResult.tasks)
    setActivities(activityResult.activities)
  }
  useEffect(() => { load() }, [])

  const responsibles = useMemo(() => [...new Set(tasks.map((task) => task.responsible).filter(Boolean))].sort(), [tasks])
  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return tasks.filter((task) =>
      (filters.status === 'abiertas' ? task.status !== 'Completada' : filters.status === 'vencidas' ? isOverdue(task, today) : !filters.status || task.status === filters.status)
      && (!filters.responsible || task.responsible === filters.responsible)
      && (!filters.activity || String(task.activityId) === filters.activity)
      && (!term || `${task.title} ${task.activityTitle} ${task.activityCode} ${task.responsible}`.toLowerCase().includes(term)))
  }, [tasks, filters, today])

  async function setTaskStatus(task, status) {
    const result = await api(`/api/activity-tasks/${task.id}`, { method: 'PATCH', body: { ...task, status } })
    if (!result.ok) return toast(result.error || 'No se pudo actualizar la tarea.', 'bad')
    toast(`Tarea marcada como «${status}».`)
    load()
  }
  async function setActivityStatus(activity, status) {
    const result = await api(`/api/activities/${activity.id}/status`, { method: 'PATCH', body: { status } })
    if (!result.ok) return toast(result.error || 'No se pudo actualizar la actividad.', 'bad')
    toast(`${activity.code} ahora está «${status}».`)
    load()
  }

  function exportData() {
    if (!visible.length) return toast('No hay tareas para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión de actividades · Seguimiento de tareas',
      subtitle: `Al ${dmy(today)}`,
      summary: [['Tareas', visible.length], ['Vencidas', visible.filter((task) => isOverdue(task, today)).length]],
      headers: ['Actividad', 'Fecha de la actividad', 'Tarea', 'Responsable', 'Fecha límite', 'Estado', 'Completada el', 'Observaciones'],
      widths: [36, 14, 36, 26, 13, 13, 13, 36],
      rows: visible.map((task) => [`${task.activityCode} · ${task.activityTitle}`, dmy(task.activityDate), task.title, task.responsible, dmy(task.dueDate) || '—', isOverdue(task, today) ? 'Vencida' : task.status, dmy(task.completedOn) || '—', task.notes]),
    }).then(() => toast('Seguimiento exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  const active = activities.filter((item) => ACTIVE_STATUS.includes(item.status)).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const overdue = tasks.filter((task) => isOverdue(task, today)).length
  return (
    <div className="space-y-4">
      <PageHeader icon={TrendingUp} title="Seguimiento" description="Avance de las tareas de organización y estado de las actividades en curso."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setAdding(true)}><Plus /> Nueva tarea</Button>}
          </>
        )} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ListChecks} value={tasks.length} label="Tareas registradas" onClick={() => setFilters({ ...emptyFilters, status: '' })} />
        <StatCard tone="amber" icon={Clock} value={tasks.filter((task) => task.status !== 'Completada').length} label="Abiertas" onClick={() => setFilters({ ...emptyFilters })} />
        <StatCard tone="red" icon={AlertTriangle} value={overdue} label="Vencidas" onClick={() => setFilters({ ...emptyFilters, status: 'vencidas' })} />
        <StatCard tone="green" icon={CheckCircle2} value={tasks.filter((task) => task.status === 'Completada').length} label="Completadas" onClick={() => setFilters({ ...emptyFilters, status: 'Completada' })} />
      </div>

      <Panel title="Avance de actividades en curso" icon={TrendingUp} contentClassName="p-0">
        <ul className="divide-y divide-border text-sm">
          {active.map((item) => {
            const days = daysUntil(item.startDate, today)
            return (
              <li key={item.id} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[minmax(0,2fr)_9rem_8rem_12rem]">
                <button type="button" onClick={() => setOpened(item.id)} className="min-w-0 text-left hover:text-primary">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.code} · {dateLabel(item)} · {item.commissionName || item.responsible}</span>
                </button>
                <span className={cn('text-xs', days < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{days > 1 ? `Faltan ${days} días` : days === 1 ? 'Es mañana' : days === 0 ? 'Es hoy' : `Pasó hace ${-days} día(s)`}</span>
                <span><Progress value={item.tasks.progress} />{item.tasks.overdue > 0 && <span className="text-xs font-semibold text-destructive">{item.tasks.overdue} vencida(s)</span>}</span>
                {canEdit
                  ? <Select aria-label={`Estado de ${item.title}`} value={item.status} onChange={(status) => setActivityStatus(item, status)} options={opts(ACTIVITY_STATUS)} />
                  : <Pill value={item.status} />}
              </li>
            )
          })}
          {!active.length && <li className="px-5 py-6 text-center text-muted-foreground">No hay actividades en curso.</li>}
        </ul>
      </Panel>

      <Panel title={`Tareas (${visible.length})`} icon={ListChecks}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <FilterLabel label="Buscar" className="sm:col-span-2 lg:col-span-1"><Input placeholder="Tarea, actividad o responsable" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[{ value: 'abiertas', label: 'Abiertas' }, { value: 'vencidas', label: 'Vencidas' }, { value: '', label: 'Todas' }, ...opts(TASK_STATUS)]} /></FilterLabel>
          <FilterLabel label="Responsable"><Select value={filters.responsible} onChange={(responsible) => setFilters({ ...filters, responsible })} options={opts(responsibles, 'Todos')} /></FilterLabel>
          <FilterLabel label="Actividad"><Select value={filters.activity} onChange={(activity) => setFilters({ ...filters, activity })} options={[{ value: '', label: 'Todas' }, ...activities.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.title}` }))]} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay tareas con estos filtros.'}
          columns={[
            { key: 'title', label: 'Tarea', render: (task) => <span><span className={cn('block font-medium', task.status === 'Completada' && 'text-muted-foreground line-through')}>{task.title}</span>{task.notes && <span className="line-clamp-1 max-w-72 text-xs text-muted-foreground">{task.notes}</span>}</span> },
            { key: 'activity', label: 'Actividad', render: (task) => <button type="button" onClick={() => setOpened(task.activityId)} className="text-left hover:text-primary"><span className="block">{task.activityTitle}</span><span className="text-xs text-muted-foreground">{task.activityCode} · {dmy(task.activityDate)}</span></button> },
            { key: 'responsible', label: 'Responsable' },
            { key: 'due', label: 'Fecha límite', render: (task) => (task.dueDate ? <span className={cn('whitespace-nowrap', isOverdue(task, today) && 'font-semibold text-destructive')}>{dmy(task.dueDate)}{isOverdue(task, today) && <span className="block text-xs">Vencida</span>}</span> : '—') },
            { key: 'status', label: 'Estado', render: (task) => <Pill value={task.status} /> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (task) => (
              <span className="flex gap-1">
                {task.status === 'Pendiente' && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setTaskStatus(task, 'En proceso')}>Iniciar</Button>}
                {task.status !== 'Completada' && <Button type="button" variant="ghost" size="icon" className="size-8 text-[#3f7d5c]" title="Marcar como completada" aria-label="Marcar como completada" onClick={() => setTaskStatus(task, 'Completada')}><CheckCircle2 /></Button>}
                <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar tarea" aria-label="Editar tarea" onClick={() => setEditing(task)}><Pencil /></Button>
              </span>
            ) },
          ]}
        />
      </Panel>

      {editing && <TaskForm activityId={editing.activityId} task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {adding && <NewTask activities={activities.filter((item) => !['Realizada', 'Cancelada'].includes(item.status))} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {opened && <ActivityDetail id={opened} initialTab="tasks" onClose={() => setOpened(null)} onChanged={load} />}
    </div>
  )
}

/** Picks the activity, then opens the task form. */
function NewTask({ activities, onClose, onSaved }) {
  const [activityId, setActivityId] = useState('')
  const [ready, setReady] = useState(false)
  if (ready) return <TaskForm activityId={Number(activityId)} onClose={onClose} onSaved={onSaved} />
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Elige la actividad a la que pertenece la tarea.</DialogDescription>
        </DialogHeader>
        <Select value={activityId} onChange={setActivityId} options={[{ value: '', label: activities.length ? 'Seleccione una actividad' : 'No hay actividades en curso' }, ...activities.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.title} (${dmy(item.startDate)})` }))]} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!activityId} onClick={() => setReady(true)}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
