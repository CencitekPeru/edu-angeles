import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarCheck, CalendarClock, FolderCheck, FolderOpen, HeartHandshake, PieChart } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { PageHeader, Panel, Pill, StatCard } from '../campus/kit'
import { ConfidentialNote, classroom, shortDate } from './shared'

export default function PsychologyPanel() {
  const { toast } = useApp()
  const [data, setData] = useState(null)

  useEffect(() => {
    api('/api/psychology/summary').then((result) => {
      if (result.ok) setData(result)
      else toast(result.error || 'No se pudo cargar el panel.', 'bad')
    })
  }, [])

  const stats = data?.stats
  const maxReason = Math.max(1, ...(data?.byReason || []).map((item) => item.total))

  return (
    <div className="space-y-5">
      <PageHeader icon={HeartHandshake} title="Atención psicológica" description="Seguimiento del bienestar emocional de los estudiantes: casos, sesiones y citas." />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} value={stats?.openCases ?? '—'} label="Casos activos" hint={`${stats?.totalCases ?? 0} registrados en total`} to="/admin/psicologia/casos" />
        <StatCard tone="red" icon={AlertTriangle} value={stats?.highRisk ?? '—'} label="Riesgo alto" hint="Casos activos con prioridad" to="/admin/psicologia/casos" />
        <StatCard tone="green" icon={CalendarCheck} value={stats?.sessionsMonth ?? '—'} label="Sesiones este mes" hint="Atenciones realizadas" />
        <StatCard tone="amber" icon={CalendarClock} value={stats?.scheduled ?? '—'} label="Citas programadas" hint={`${stats?.closedMonth ?? 0} casos cerrados este mes`} to="/admin/psicologia/citas" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Próximas citas" icon={CalendarClock} action={<Link to="/admin/psicologia/citas" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver agenda <ArrowRight className="size-3.5" /></Link>} contentClassName="p-0">
          <ul className="divide-y divide-border">
            {(data?.upcoming || []).map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-24 shrink-0">
                  <span className="block font-semibold">{shortDate(item.date)}</span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <Link to={`/admin/psicologia/casos?caso=${item.caseId}`} className="block truncate font-medium hover:text-primary">{item.student.name}</Link>
                  <span className="block text-xs text-muted-foreground">{classroom(item.student)} · {item.type} · {item.reason}</span>
                </span>
                <Pill value={item.riskLevel} />
              </li>
            ))}
            {data && !data.upcoming.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No hay citas programadas.</li>}
          </ul>
        </Panel>

        <Panel title="Casos activos por motivo" icon={PieChart}>
          <ul className="space-y-3">
            {(data?.byReason || []).map((item) => (
              <li key={item.reason} className="text-sm">
                <div className="mb-1 flex justify-between"><span>{item.reason}</span><span className="font-semibold">{item.total}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(item.total / maxReason) * 100}%` }} /></div>
              </li>
            ))}
            {data && !data.byReason.length && (
              <li className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <FolderCheck className="size-6" /> No hay casos activos.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
