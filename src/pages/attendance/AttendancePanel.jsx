import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, CheckCircle2, CircleDashed, Clock, History, LayoutGrid, QrCode, UserRound, Users, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, StatCard } from '../campus/kit'
import { DateChip, Donut, STATUS_META, StatusChip, ampm, pct, tableHead, td, th } from './shared'
import { cn } from '@/lib/utils'

const LEVEL_BAR = { Primaria: 'bg-primary', Secundaria: 'bg-primary' }

const QUICK = [
  { to: '/admin/asistencia/escanear', title: 'Escanear QR', text: 'Registrar asistencia', icon: QrCode, tone: 'bg-slate-50 text-primary border-border dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20' },
  { to: '/admin/estudiantes', title: 'Estudiantes', text: 'Gestionar matrícula', icon: Users, tone: 'bg-slate-50 text-primary border-border dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20' },
  { to: '/admin/asistencia/historial', title: 'Historial', text: 'Consultar registros', icon: History, tone: 'bg-slate-50 text-primary border-border dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20' },
  { to: '/admin/asistencia/reportes', title: 'Reportes', text: 'Ver y exportar informes', icon: BarChart3, tone: 'bg-slate-50 text-primary border-border dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20' },
]

function LateAfterSetting({ value, onSaved }) {
  const { toast } = useApp()
  const [time, setTime] = useState(value)
  const [busy, setBusy] = useState(false)

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    const result = await api('/api/attendance/settings', { method: 'PATCH', body: { lateAfter: time } })
    setBusy(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar la hora.', 'bad')
    toast(`Desde ahora, los ingresos después de las ${result.lateAfter} se registran como tardanza.`)
    onSaved(result.lateAfter)
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Se considera tardanza todo ingreso después de las
      <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-8 w-28" aria-label="Hora límite de ingreso" />
      {time !== value && <Button type="submit" size="sm" disabled={busy}>Guardar</Button>}
    </form>
  )
}

export default function AttendancePanel() {
  const canEdit = useCan('asistencia')
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    const load = () => api('/api/attendance/today?limit=6').then((result) => { if (active && result.ok) setData(result) })
    load()
    const timer = setInterval(load, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const totals = data?.totals || { total: 0, present: 0, late: 0, absent: 0 }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Panel de Asistencia"
        description="Control y resumen de la asistencia diaria de los estudiantes."
        actions={<DateChip date={data?.date} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="green" icon={CheckCircle2} value={totals.present} label="Presentes" hint={`${pct(totals.present, totals.total)} del total`} />
        <StatCard tone="amber" icon={Clock} value={totals.late} label="Tardanzas" hint={`${pct(totals.late, totals.total)} del total`} />
        <StatCard tone="red" icon={XCircle} value={totals.absent} label="Sin registro / ausentes" hint={`${pct(totals.absent, totals.total)} del total`} />
        <StatCard tone="blue" icon={Users} value={totals.total} label="Total de estudiantes" hint="Matrícula vigente" to="/admin/estudiantes" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel plain title="Asistencia por nivel educativo" icon={BarChart3}>
          <ul className="space-y-6 py-3">
            {(data?.levels || []).map((level) => {
              const percent = level.total ? (level.attended / level.total) * 100 : 0
              return (
                <li key={level.level} className="grid grid-cols-[130px_1fr_60px] items-center gap-3 text-sm">
                  <span className="font-semibold text-foreground">Nivel {level.level}</span>
                  <span className="relative h-7 overflow-hidden rounded-md bg-slate-100 dark:bg-blue-500/15">
                    {percent > 0 && <span className={cn('absolute inset-y-0 left-0 rounded-md transition-[width] duration-500', LEVEL_BAR[level.level])} style={{ width: `${Math.max(percent, 2)}%` }} />}
                    <span className={cn('absolute inset-y-0 left-3 flex items-center whitespace-nowrap text-xs font-semibold tabular-nums', percent >= 20 ? 'text-white' : 'text-foreground/70')}>
                      {level.attended} / {level.total}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums text-foreground">{percent.toFixed(1)} %</span>
                </li>
              )
            })}
          </ul>
          {data && (canEdit
            ? <LateAfterSetting value={data.lateAfter} onSaved={(lateAfter) => setData({ ...data, lateAfter })} />
            : <p className="text-xs text-muted-foreground">Se considera tardanza todo ingreso después de las <b>{data.lateAfter}</b>.</p>)}
        </Panel>

        <Panel plain title="Resumen general del día" icon={CircleDashed}>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
            <Donut
              size="size-44"
              center={totals.present}
              caption={<>Presentes<br />({pct(totals.present, totals.total)})</>}
              segments={[
                { label: 'Presentes', value: totals.present, color: STATUS_META.presente.color },
                { label: 'Tardanzas', value: totals.late, color: STATUS_META.tardanza.color },
                { label: 'Ausentes', value: totals.absent, color: STATUS_META.inasistencia.color },
              ]}
            />
            <ul className="space-y-3 text-sm">
              {[
                ['Presentes', totals.present, STATUS_META.presente.color],
                ['Tardanzas', totals.late, STATUS_META.tardanza.color],
                ['Ausentes / sin registro', totals.absent, STATUS_META.inasistencia.color],
              ].map(([label, value, color]) => (
                <li key={label} className="flex items-center gap-2.5 font-medium text-foreground">
                  <span className="size-3.5 rounded-sm" style={{ background: color }} />
                  {label}: {value} ({pct(value, totals.total)})
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          plain
          title="Últimos registros de asistencia"
          icon={History}
          contentClassName="p-0"
          action={<Link to="/admin/asistencia/historial" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver historial <ArrowRight className="size-3.5" /></Link>}
        >
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr><th className={th} /><th className={th}>Hora</th><th className={th}>Estudiante</th><th className={th}>Grado / Sección</th><th className={th}>Estado</th></tr>
            </thead>
            <tbody>
              {(data?.recent || []).map((row) => (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="pl-4"><UserRound className="size-4 text-muted-foreground" /></td>
                  <td className={cn(td, 'tabular-nums')}>{row.time}</td>
                  <td className={cn(td, 'font-medium')}>{row.fullName}</td>
                  <td className={td}>{row.grade} Sec. {row.section}</td>
                  <td className={td}><StatusChip status={row.status} /></td>
                </tr>
              ))}
              {data && !data.recent.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Aún no hay registros hoy.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel plain title="Accesos rápidos" icon={LayoutGrid}>
          <div className="grid gap-3 sm:grid-cols-2">
            {QUICK.map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.to} to={item.to} className={cn('flex items-center gap-4 rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md', item.tone)}>
                  <Icon className="size-8 shrink-0" strokeWidth={1.7} />
                  <span>
                    <span className="block font-bold text-foreground">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">{item.text}</span>
                  </span>
                </Link>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Último registro: {data?.recent?.[0] ? `${data.recent[0].fullName} · ${ampm(data.recent[0].time)}` : '—'}</p>
        </Panel>
      </div>
    </div>
  )
}
