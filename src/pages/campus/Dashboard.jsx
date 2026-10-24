import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Laptop,
  Wrench,
  ArrowRight,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { formatLongDate, todayISO } from '../../lib/time'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from './kit'

export default function Dashboard() {
  const { user, requests } = useApp()
  const [summary, setSummary] = useState(null)
  const today = todayISO()
  const todayClasses = requests.filter((item) => item.date === today && item.status === 'approved')

  useEffect(() => {
    api('/api/summary').then((result) => {
      if (result.ok) setSummary(result)
    })
  }, [])

  const cards = [
    {
      value: summary?.maintenance.programados || 0,
      label: 'Mantenimientos programados',
      to: '/admin/mantenimiento/cronograma',
      icon: Clock,
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      value: summary?.maintenance.realizados || 0,
      label: 'Realizados con éxito',
      to: '/admin/mantenimiento/lista',
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      value: summary?.maintenance.proceso || 0,
      label: 'En proceso',
      to: '/admin/mantenimiento/lista',
      icon: Wrench,
      color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      value: summary?.maintenance.pendientes || 0,
      label: 'Incidencias pendientes',
      to: '/admin/incidencias',
      icon: AlertTriangle,
      color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <Badge variant="outline" className="mb-2 text-primary border-primary/20 bg-primary/5">
            Panel General CIST
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {user.role === 'admin' ? 'Centro de Coordinación Tecnológica' : 'Panel de Recursos y Reservas'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.role === 'admin'
              ? 'Gestión integral de inventario de equipos, incidencias, mantenimiento y salas de cómputo.'
              : 'Consulta tus reservas activas, el estado de las salas y equipos disponibles.'}
          </p>
        </div>
        <div className="shrink-0 flex flex-col sm:items-end justify-center rounded-xl bg-muted/50 p-4 border border-border/60">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Calendar className="size-4 text-primary" />
            <span>{formatLongDate(today)}</span>
          </div>
          <span className="mt-1 text-xs text-muted-foreground">
            {todayClasses.length} clase(s) confirmada(s) hoy
          </span>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              to={user.role === 'admin' ? item.to : '/panel/historial'}
              className="group block"
            >
              <Card className="h-full border-border/80 transition-all duration-200 hover:shadow-md hover:border-primary/40">
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-3xl font-black tracking-tight text-foreground">{item.value}</p>
                    <p className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                      {item.label}
                    </p>
                  </div>
                  <div className={`size-12 rounded-xl flex items-center justify-center border shrink-0 ${item.color}`}>
                    <Icon className="size-6" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Two Columns Overview Panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Equipos que requieren atención"
          action={
            <Button variant="ghost" size="xs" asChild>
              <Link to="/admin/inventario" className="text-xs gap-1 font-semibold">
                Ver todos <ArrowRight className="size-3" />
              </Link>
            </Button>
          }
        >
          <ul className="space-y-2.5">
            {(summary?.equipment || [])
              .filter((item) => item.state !== 'Operativo')
              .map((item) => (
                <li
                  key={item.state}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Laptop className="size-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{item.state}</span>
                  </div>
                  <Badge variant={item.state === 'Inoperativo' ? 'destructive' : 'warning'} className="font-bold">
                    {item.total} equipos
                  </Badge>
                </li>
              ))}
            {summary && summary.equipment.every((item) => item.state === 'Operativo') && (
              <li className="text-sm text-muted-foreground py-6 text-center">
                🎉 Todos los equipos figuran en estado operativo.
              </li>
            )}
          </ul>
        </Panel>

        <Panel
          title="Incidencias abiertas o en proceso"
          action={
            <Button variant="ghost" size="xs" asChild>
              <Link to="/admin/incidencias" className="text-xs gap-1 font-semibold">
                Gestionar <ArrowRight className="size-3" />
              </Link>
            </Button>
          }
        >
          <ul className="space-y-2.5">
            {(summary?.incidents || [])
              .filter((item) => item.status !== 'resuelta')
              .map((item) => (
                <li
                  key={`${item.status}-${item.priority}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-500" />
                    <span className="font-medium text-foreground capitalize">
                      {item.status.replace('_', ' ')}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground">
                      Prioridad {item.priority}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="font-bold">
                    {item.total}
                  </Badge>
                </li>
              ))}
            {summary && summary.incidents.every((item) => item.status === 'resuelta') && (
              <li className="text-sm text-muted-foreground py-6 text-center">
                ✅ No hay incidencias pendientes por resolver.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
