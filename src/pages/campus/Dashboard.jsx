import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  FileText,
  Monitor,
  PieChart,
  Settings,
  UserRound,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { SCHOOL } from '../../lib/school'
import { personName } from '../../lib/reservations'
import { LAB, todayISO, toMinutes } from '../../lib/time'
import schoolLogo from '../../assets/logo-colegio.jpg'
import { StatusBadge } from '../../components/ui'
import { cn } from '@/lib/utils'
import { Panel, StatCard } from './kit'

// Formal palette: navy for the main series, muted status colors only where they mean something.
const STATE_COLORS = {
  Operativo: { bar: '#1e3a8a', dot: 'bg-[#1e3a8a]' },
  'Con fallas': { bar: '#b7832f', dot: 'bg-[#b7832f]' },
  'En mantenimiento': { bar: '#b7832f', dot: 'bg-[#b7832f]' },
  Inoperativo: { bar: '#b4413c', dot: 'bg-[#b4413c]' },
}
const FALLBACK_COLOR = { bar: '#94a3b8', dot: 'bg-slate-400' }

const QUICK = [
  { to: '/admin/inventario', label: 'Inventario', icon: Monitor },
  { to: '/admin/calendario', label: 'Reservar sala', icon: CalendarPlus },
  { to: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { to: '/admin/reportes', label: 'Reportes', icon: FileText },
  { to: '/admin/docentes', label: 'Docentes', icon: Users },
  { to: '/admin/catalogo', label: 'Configuración', icon: Settings },
]

function longDateWithYear(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatShort(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function Dashboard() {
  const { users, requests, rooms } = useApp()
  const [summary, setSummary] = useState(null)
  const today = todayISO()

  useEffect(() => {
    api('/api/summary').then((result) => {
      if (result.ok) setSummary(result)
    })
  }, [])

  const equipment = summary?.equipment || []
  const totalEquipment = equipment.reduce((sum, item) => sum + item.total, 0)
  const operative = equipment.find((item) => item.state === 'Operativo')?.total || 0
  const teachers = users.filter((item) => item.role === 'teacher')
  const activeTeachers = teachers.filter((item) => item.active).length
  const todayRequests = requests
    .filter((item) => item.date === today && (item.status === 'approved' || item.status === 'pending'))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const todayPending = todayRequests.filter((item) => item.status === 'pending').length
  const maintenance = summary?.maintenance || { programados: 0, proceso: 0, pendientes: 0 }
  const openMaintenance = maintenance.programados + maintenance.proceso + maintenance.pendientes
  const openIncidents = (summary?.incidents || [])
    .filter((item) => item.status !== 'resuelta')
    .reduce((sum, item) => sum + item.total, 0)
  const highIncidents = (summary?.incidents || [])
    .filter((item) => item.status !== 'resuelta' && item.priority === 'alta')
    .reduce((sum, item) => sum + item.total, 0)

  const span = toMinutes(LAB.close) - toMinutes(LAB.open)
  const roomUsage = rooms.map((room) => {
    const minutes = todayRequests
      .filter((item) => item.status === 'approved' && Number(item.roomId) === Number(room.id))
      .reduce((sum, item) => sum + toMinutes(item.endTime) - toMinutes(item.startTime), 0)
    return { ...room, percent: Math.min(100, Math.round((minutes / span) * 100)) }
  })

  const recent = [...requests]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.id - a.id)
    .slice(0, 4)

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex flex-wrap items-center justify-between gap-5 px-1 pt-1">
        <div className="flex flex-wrap items-center gap-5">
          <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-20 shrink-0 rounded-xl object-contain mix-blend-multiply dark:mix-blend-normal" />
          <div className="border-l-2 border-primary pl-5 leading-tight">
            <p className="text-sm font-extrabold uppercase tracking-wide text-foreground">{SCHOOL.name}</p>
            <p className="text-[40px] font-black leading-none tracking-tight text-primary">CIST</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">Plataforma Tecnológica</p>
          </div>
          <p className="hidden max-w-[230px] border-l border-border pl-5 text-sm leading-relaxed text-muted-foreground md:block">
            Gestión, control y soporte de los recursos tecnológicos de la institución.
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-xs">
          <CalendarDays className="size-[18px] text-primary" />
          <span>{longDateWithYear(today)}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <StatCard tone="blue" icon={Monitor} value={totalEquipment} label="Equipos registrados" hint={`${operative} operativos`} to="/admin/inventario" />
        <StatCard tone="green" icon={Users} value={teachers.length} label="Docentes" hint={`${activeTeachers} activos`} to="/admin/docentes" />
        <StatCard tone="violet" icon={CalendarDays} value={todayRequests.length} label="Reservas (hoy)" hint={`${todayPending} por aprobar`} to="/admin/solicitudes" />
        <StatCard tone="amber" icon={Wrench} value={openMaintenance} label="Mantenimientos" hint={`${maintenance.pendientes} pendiente(s)`} to="/admin/mantenimiento" />
        <StatCard tone="red" icon={AlertTriangle} value={openIncidents} label="Incidencias" hint={`${highIncidents} de prioridad alta`} to="/admin/incidencias" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left column */}
        <div className="space-y-5">
          <Panel plain title="Uso de salas de cómputo (hoy)" icon={Monitor} action={<BarChart3 className="size-4 text-primary" />}>
            {roomUsage.length ? (
              <ul className="space-y-3.5">
                {roomUsage.map((room, index) => (
                  <li key={room.id} className="grid grid-cols-[88px_1fr_44px] items-center gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">{room.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <span className={cn('block h-full rounded-full', index % 2 ? 'bg-[#4f6db3]' : 'bg-primary')} style={{ width: `${room.percent}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-foreground">{room.percent}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No hay salas de cómputo registradas.</p>
            )}
          </Panel>

          <Panel plain title="Equipos por estado" icon={PieChart}>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <Donut data={equipment} total={totalEquipment} />
              <ul className="w-full flex-1 space-y-2.5 text-sm">
                {equipment.length === 0 && <li className="text-muted-foreground">Sin equipos registrados.</li>}
                {equipment.map((item) => (
                  <li key={item.state} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-foreground">
                      <span className={cn('size-2.5 rounded-full', (STATE_COLORS[item.state] || FALLBACK_COLOR).dot)} />
                      {item.state}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {item.total}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({totalEquipment ? ((item.total / totalEquipment) * 100).toFixed(1) : 0}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>

        {/* Today's reservations */}
        <Panel plain
          title="Reservas de hoy"
          icon={CalendarDays}
          action={
            <Link to="/admin/calendario" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Ver calendario <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {todayRequests.length ? (
            <ol className="relative ml-1.5 border-l border-border">
              {todayRequests.map((item) => (
                <li key={item.id} className="relative grid grid-cols-1 items-center gap-2 border-b border-border/70 py-3.5 pl-5 last:border-b-0 sm:grid-cols-[110px_80px_minmax(0,1fr)_minmax(0,1.2fr)]">
                  <span className="absolute -left-[5px] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary" />
                  <span className="text-sm font-medium tabular-nums text-foreground">{item.startTime} – {item.endTime}</span>
                  <span className="w-fit rounded-md border border-border bg-slate-50 px-2.5 py-1 text-xs font-semibold text-primary dark:bg-muted">
                    {item.roomName || 'Sala'}
                  </span>
                  <span className="truncate text-sm font-bold text-foreground" title={item.purpose}>
                    {item.purpose}
                    {item.status === 'pending' && <StatusBadge status="pending" className="ml-2 align-middle" />}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <UserRound className="size-4 shrink-0" />
                    <span className="truncate">Prof. {personName(users, item.teacherId)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <CalendarDays className="size-8 text-muted-foreground/50" />
              No hay reservas para hoy.
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel plain
          title="Solicitudes recientes"
          icon={FileText}
          contentClassName="p-0"
          action={
            <Link to="/admin/solicitudes" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-foreground/75 dark:bg-muted/40">
                <tr>
                  <th className="px-5 py-2.5 text-left font-bold">#</th>
                  <th className="px-3 py-2.5 text-left font-bold">Docente</th>
                  <th className="px-3 py-2.5 text-left font-bold">Sala</th>
                  <th className="px-3 py-2.5 text-left font-bold">Fecha</th>
                  <th className="px-5 py-2.5 text-left font-bold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id} className="border-t border-border/70">
                    <td className="px-5 py-2.5 font-medium tabular-nums text-foreground">SR-{String(item.id).padStart(3, '0')}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-foreground">{personName(users, item.teacherId)}</td>
                    <td className="px-3 py-2.5 text-foreground">{item.roomName || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-foreground">{formatShort(item.date)}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Aún no hay solicitudes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel plain title="Accesos rápidos" icon={Zap}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {QUICK.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-slate-50 px-1.5 py-4 text-center text-[11px] font-semibold leading-tight text-foreground transition hover:border-primary/40 hover:bg-card hover:shadow-sm dark:bg-muted"
                >
                  <Icon className="size-6 text-primary" strokeWidth={1.8} />
                  <span className="text-foreground/85">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Donut({ data, total }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="13" className="stroke-slate-200 dark:stroke-slate-700" />
        {total > 0 &&
          data.map((item) => {
            const length = (item.total / total) * circumference
            const segment = (
              <circle
                key={item.state}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="13"
                stroke={(STATE_COLORS[item.state] || FALLBACK_COLOR).bar}
                strokeDasharray={`${Math.max(0, length - 0.8)} ${circumference}`}
                strokeDashoffset={-offset}
              >
                <title>{`${item.state}: ${item.total}`}</title>
              </circle>
            )
            offset += length
            return segment
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black leading-none text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">Equipos</span>
      </div>
    </div>
  )
}
