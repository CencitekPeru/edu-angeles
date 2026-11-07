import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CalendarCheck, CalendarClock, FileSpreadsheet, FileText, FolderOpen, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard } from '../campus/kit'
import { FilterLabel, todayLima } from '../attendance/shared'
import { ConfidentialNote, PSY, caseLink, classroom, shortDate } from './shared'

/** Counts items by a key, biggest first. */
function countBy(items, keyOf) {
  const totals = new Map()
  for (const item of items) {
    const key = keyOf(item) || 'Sin dato'
    totals.set(key, (totals.get(key) || 0) + 1)
  }
  return [...totals.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total)
}

function Bars({ rows, empty = 'Sin datos en el periodo.' }) {
  const max = Math.max(1, ...rows.map((row) => row.total))
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-2"><span className="truncate">{row.label}</span><span className="font-semibold">{row.total}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(row.total / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Reports of the psychology area for a period, plus the current workload (open cases, upcoming appointments). */
export default function PsychologyReports() {
  const { toast } = useApp()
  const today = todayLima()
  const [range, setRange] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today })
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState({ cases: [], sessions: [], referrals: [] })

  useEffect(() => {
    api('/api/psychology/summary').then((result) => { if (result.ok) setSummary(result) })
  }, [])

  useEffect(() => {
    Promise.all([api('/api/psychology/cases'), api(`/api/psychology/sessions?${new URLSearchParams(range)}`), api('/api/psychology/referrals')]).then(([cases, sessions, referrals]) => {
      if (!cases.ok || !sessions.ok || !referrals.ok) return toast('No se pudieron cargar los reportes.', 'bad')
      setData({ cases: cases.cases, sessions: sessions.sessions, referrals: referrals.referrals })
    })
  }, [range.from, range.to])

  const report = useMemo(() => {
    const inRange = (date) => date && date >= range.from && date <= range.to
    const opened = data.cases.filter((item) => inRange(item.openedOn))
    const done = data.sessions.filter((item) => item.status === 'Realizada')
    const referrals = data.referrals.filter((item) => inRange(item.date))
    return {
      opened,
      done,
      noShow: data.sessions.filter((item) => item.status === 'No asistió').length,
      closed: data.cases.filter((item) => inRange(item.closedOn)).length,
      studentsSeen: new Set(done.map((item) => item.student.id)).size,
      referrals,
      sections: [
        ['Casos por motivo', countBy(opened, (item) => item.reason)],
        ['Casos por nivel y grado', countBy(opened, (item) => `${item.student.level} ${item.student.grade}`)],
        ['Casos por nivel de riesgo', countBy(opened, (item) => item.riskLevel)],
        ['Casos según quién deriva', countBy(opened, (item) => item.referredBy)],
        ['Atenciones realizadas por tipo', countBy(done, (item) => item.type)],
        ['Derivaciones por institución', countBy(referrals, (item) => item.institution)],
      ],
    }
  }, [data, range])

  const period = `Del ${shortDate(range.from)} al ${shortDate(range.to)}`
  const exportRows = () => [
    ['Resumen', 'Casos abiertos en el periodo', report.opened.length],
    ['Resumen', 'Casos cerrados en el periodo', report.closed],
    ['Resumen', 'Atenciones realizadas', report.done.length],
    ['Resumen', 'Estudiantes atendidos', report.studentsSeen],
    ['Resumen', 'Citas a las que no asistió', report.noShow],
    ['Resumen', 'Derivaciones', report.referrals.length],
    ...report.sections.flatMap(([title, rows]) => rows.map((row) => [title, row.label, row.total])),
  ]

  function exportExcel() {
    exportTableXlsx({ title: 'Atención psicológica · Reporte', subtitle: `${period} · Información confidencial`, headers: ['Indicador', 'Detalle', 'Cantidad'], widths: [32, 40, 12], rows: exportRows() })
      .then(() => toast('Reporte exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    exportTablePdf({ title: 'Atención psicológica · Reporte', subtitle: `${period} · Información confidencial`, headers: ['Indicador', 'Detalle', 'Cantidad'], rows: exportRows() })
      .then(() => toast('Reporte exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  const stats = summary?.stats
  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="Reportes y atención"
        description="Situación actual del área de Psicología y estadísticas de atención por periodo."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
          </>
        )}
      />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} value={stats?.openCases ?? '—'} label="Casos activos" hint={`${stats?.totalCases ?? 0} registrados en total`} to={PSY.students} />
        <StatCard tone="red" icon={AlertTriangle} value={stats?.highRisk ?? '—'} label="Riesgo alto" hint="Casos activos con prioridad" to={PSY.students} />
        <StatCard tone="amber" icon={CalendarClock} value={stats?.scheduled ?? '—'} label="Citas programadas" hint="Desde hoy en adelante" to={PSY.followUp} />
        <StatCard tone="green" icon={Send} value={data.referrals.filter((item) => item.status === 'Pendiente' || item.status === 'En atención').length} label="Derivaciones en curso" hint="Pendientes o en atención" to={PSY.referrals} />
      </div>

      <Panel title="Próximas citas" icon={CalendarClock} action={<Link to={PSY.followUp} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver seguimiento <ArrowRight className="size-3.5" /></Link>} contentClassName="p-0">
        <ul className="divide-y divide-border">
          {(summary?.upcoming || []).map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="w-24 shrink-0"><span className="block font-semibold">{shortDate(item.date)}</span><span className="text-xs text-muted-foreground">{item.time}</span></span>
              <span className="min-w-0 flex-1">
                <Link to={caseLink(item.caseId)} className="block truncate font-medium hover:text-primary">{item.student.name}</Link>
                <span className="block text-xs text-muted-foreground">{classroom(item.student)} · {item.type} · {item.reason}</span>
              </span>
              <Pill value={item.riskLevel} />
            </li>
          ))}
          {summary && !summary.upcoming.length && <li className="px-5 py-6 text-center text-sm text-muted-foreground">No hay citas programadas.</li>}
        </ul>
      </Panel>

      <Panel title="Estadísticas del periodo" icon={BarChart3}>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <p className="pb-2 text-xs text-muted-foreground">{period}</p>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['Casos abiertos', report.opened.length, FolderOpen],
            ['Casos cerrados', report.closed, FolderOpen],
            ['Atenciones realizadas', report.done.length, CalendarCheck],
            ['Estudiantes atendidos', report.studentsSeen, CalendarCheck],
            ['No asistió', report.noShow, CalendarClock],
            ['Derivaciones', report.referrals.length, Send],
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</p>
              <p className="text-2xl font-extrabold">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {report.sections.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-3 text-sm font-bold">{title}</h3>
              <Bars rows={rows} />
            </section>
          ))}
        </div>
      </Panel>
    </div>
  )
}
