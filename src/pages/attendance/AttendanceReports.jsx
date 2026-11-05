import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Info,
  PieChart,
  Search,
  Users,
  XCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { SCHOOL } from '../../lib/school'
import schoolLogo from '../../assets/logo-colegio.jpg'
import { useApp } from '../../context/AppContext'
import { PageHeader, StatCard } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { firstOfMonth } from './AttendanceHistory'
import { Donut, FilterLabel, STATUS_META, Select, dmy, gradeOptions, levelOptions, sectionOptions, tableHead, todayLima } from './shared'

const KINDS = [
  { id: 'asistencia', title: 'Reporte de asistencia', text: 'Asistencia por fecha, grado y sección', icon: CalendarDays },
  { id: 'mensual', title: 'Reporte mensual', text: 'Resumen de asistencia día por día', icon: BarChart3 },
  { id: 'grado', title: 'Reporte por grado', text: 'Consolidado de asistencia por grado', icon: GraduationCap },
  { id: 'tardanzas', title: 'Reporte de tardanzas', text: 'Detalle de estudiantes con tardanzas', icon: Clock },
  { id: 'inasistencias', title: 'Reporte de inasistencias', text: 'Justificadas e injustificadas', icon: XCircle },
  { id: 'porcentaje', title: 'Porcentaje de asistencia', text: 'Porcentaje por estudiante', icon: PieChart },
]

const percent = (attended, total) => (total ? `${((attended / total) * 100).toFixed(1)} %` : '—')

function aggregate(records, keyOf, labelOf) {
  const groups = new Map()
  for (const row of records) {
    const key = keyOf(row)
    if (!groups.has(key)) groups.set(key, { label: labelOf(row), students: new Set(), presente: 0, tardanza: 0, inasistencia: 0 })
    const group = groups.get(key)
    group.students.add(row.studentId)
    group[row.status] += 1
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => group)
}

/** Builds the selected report (headers, rows, footer) from the attendance history records. */
function buildReport(kind, records) {
  const classKey = (row) => `${row.level === 'Primaria' ? 1 : 2}|${row.grade}|${row.section}`
  const groupRows = (groups, withStudents = true) => {
    const rows = groups.map((group, index) => {
      const total = group.presente + group.tardanza + group.inasistencia
      return [index + 1, group.label, ...(withStudents ? [group.students.size] : []), group.presente, group.tardanza, group.inasistencia, percent(group.presente + group.tardanza, total)]
    })
    const sum = (field) => groups.reduce((acc, group) => acc + group[field], 0)
    const total = sum('presente') + sum('tardanza') + sum('inasistencia')
    const students = new Set(records.map((row) => row.studentId)).size
    return { rows, footer: ['', 'Total general', ...(withStudents ? [students] : []), sum('presente'), sum('tardanza'), sum('inasistencia'), percent(sum('presente') + sum('tardanza'), total)] }
  }
  if (kind === 'asistencia') {
    const { rows, footer } = groupRows(aggregate(records, classKey, (row) => `${row.level} – ${row.grade} ${row.section}`))
    return { headers: ['N.°', 'Grado y sección', 'Matriculados', 'Presentes', 'Tardanzas', 'Inasistencias', '% Asistencia'], rows, footer }
  }
  if (kind === 'grado') {
    const { rows, footer } = groupRows(aggregate(records, (row) => `${row.level === 'Primaria' ? 1 : 2}|${row.grade}`, (row) => `${row.level} – ${row.grade} Grado`))
    return { headers: ['N.°', 'Nivel y grado', 'Matriculados', 'Presentes', 'Tardanzas', 'Inasistencias', '% Asistencia'], rows, footer }
  }
  if (kind === 'mensual') {
    const { rows, footer } = groupRows(aggregate(records, (row) => row.date, (row) => dmy(row.date)), false)
    return { headers: ['N.°', 'Fecha', 'Presentes', 'Tardanzas', 'Inasistencias', '% Asistencia'], rows, footer }
  }
  if (kind === 'tardanzas') {
    const list = records.filter((row) => row.status === 'tardanza').sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    return {
      headers: ['N.°', 'Fecha', 'Hora', 'Código', 'Estudiante', 'Grado y sección', 'Justificada'],
      rows: list.map((row, index) => [index + 1, dmy(row.date), row.time || '—', row.code, row.fullName, `${row.level} – ${row.grade} ${row.section}`, row.justified ? 'Sí' : 'No']),
      footer: ['', 'Total de tardanzas', '', '', list.length, '', `${list.filter((row) => row.justified).length} justificadas`],
    }
  }
  if (kind === 'inasistencias') {
    const list = records.filter((row) => row.status === 'inasistencia').sort((a, b) => a.date.localeCompare(b.date) || a.fullName.localeCompare(b.fullName))
    return {
      headers: ['N.°', 'Fecha', 'Código', 'Estudiante', 'Grado y sección', 'Condición', 'Observación'],
      rows: list.map((row, index) => [index + 1, dmy(row.date), row.code, row.fullName, `${row.level} – ${row.grade} ${row.section}`, row.justified ? 'Justificada' : 'Injustificada', row.note || '—']),
      footer: ['', 'Total de inasistencias', '', list.length, '', `${list.filter((row) => row.justified).length} justificadas`, ''],
    }
  }
  // porcentaje por estudiante
  const groups = aggregate(records, (row) => `${classKey(row)}|${row.fullName}|${row.studentId}`, (row) => row)
  const rows = groups
    .map((group) => {
      const total = group.presente + group.tardanza + group.inasistencia
      return { group, total, ratio: total ? (group.presente + group.tardanza) / total : 0 }
    })
    .sort((a, b) => a.ratio - b.ratio)
    .map(({ group, total }, index) => [index + 1, group.label.code, group.label.fullName, `${group.label.level} – ${group.label.grade} ${group.label.section}`, total, group.presente, group.tardanza, group.inasistencia, percent(group.presente + group.tardanza, total)])
  return { headers: ['N.°', 'Código', 'Estudiante', 'Grado y sección', 'Días', 'Presentes', 'Tardanzas', 'Inasistencias', '% Asistencia'], rows, footer: null }
}

export default function AttendanceReports() {
  const { toast } = useApp()
  const today = todayLima()
  const [kind, setKind] = useState('asistencia')
  const [draft, setDraft] = useState({ from: firstOfMonth(today), to: today, level: '', grade: '', section: '' })
  const [filters, setFilters] = useState(draft)
  const [data, setData] = useState(null)
  const [students, setStudents] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    Promise.all([api(`/api/attendance/history?${params}`), api('/api/attendance/today?limit=1')]).then(([history, today]) => {
      if (!active) return
      setLoading(false)
      if (history.ok) setData(history)
      else toast(history.error || 'No se pudo generar el reporte.', 'bad')
      if (today.ok) setStudents(today.totals.total)
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const records = useMemo(() => data?.records || [], [data])
  const report = useMemo(() => buildReport(kind, records), [kind, records])
  const totals = data?.totals || { total: 0, presente: 0, tardanza: 0, inasistencia: 0 }
  const attendance = totals.total ? ((totals.presente + totals.tardanza) / totals.total) * 100 : 0
  const meta = KINDS.find((item) => item.id === kind)

  function exportData(format) {
    if (!report.rows.length) return toast('El reporte no tiene filas para exportar.', 'bad')
    const payload = {
      title: meta.title,
      subtitle: `Del ${dmy(data.from)} al ${dmy(data.to)}${filters.level ? ` · ${filters.level}` : ''}${filters.grade ? ` · ${filters.grade} Grado` : ''}${filters.section ? ` · Sección ${filters.section}` : ''}`,
      summary: [['Asistencia', `${attendance.toFixed(1)} %`], ['Presentes', totals.presente], ['Tardanzas', totals.tardanza], ['Inasistencias', totals.inasistencia]],
      headers: report.headers,
      rows: report.footer ? [...report.rows, report.footer] : report.rows,
      widths: report.headers.map((header) => (/Estudiante|Grado|Observ|Nivel/.test(header) ? 30 : 14)),
    }
    const task = format === 'pdf' ? exportTablePdf(payload) : exportTableXlsx(payload)
    task.then(() => toast(`Reporte exportado a ${format === 'pdf' ? 'PDF' : 'Excel'}.`)).catch(() => toast('No se pudo exportar.', 'bad'))
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={FileText} title="Reportes" description="Generación de informes y estadísticas de asistencia." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Users} value={students} label="Total de estudiantes" />
        <StatCard tone="green" icon={CheckCircle2} value={`${attendance.toFixed(1)} %`} label="Asistencia promedio" hint={data ? `${data.days} día(s) hábiles` : undefined} />
        <StatCard tone="amber" icon={Clock} value={totals.tardanza} label="Tardanzas" />
        <StatCard tone="red" icon={XCircle} value={totals.inasistencia} label="Inasistencias" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(250px,3fr)_minmax(0,9fr)]">
        <div className="h-fit rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold"><FileText className="size-[18px] text-primary" /> Tipo de reporte</p>
          <ul className="space-y-2">
            {KINDS.map((item) => {
              const Icon = item.icon
              const active = item.id === kind
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => setKind(item.id)} aria-pressed={active}
                    className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors', active ? 'border-primary/40 bg-slate-50 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-border hover:bg-muted')}>
                    <Icon className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-foreground/70')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm font-semibold', active && 'text-primary')}>{item.title}</span>
                      <span className="block text-xs text-muted-foreground">{item.text}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-[15px] font-bold"><FileText className="size-[18px] text-primary" /> {meta.title}</p>
          <form className="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]" onSubmit={(event) => { event.preventDefault(); setFilters(draft) }}>
            <FilterLabel label="Rango de fechas">
              <span className="flex items-center gap-1.5">
                <Input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} aria-label="Desde" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" value={draft.to} min={draft.from} max={today} onChange={(event) => setDraft({ ...draft, to: event.target.value })} aria-label="Hasta" />
              </span>
            </FilterLabel>
            <FilterLabel label="Nivel"><Select value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={levelOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Grado"><Select value={draft.grade} onChange={(grade) => setDraft({ ...draft, grade })} options={gradeOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Sección"><Select value={draft.section} onChange={(section) => setDraft({ ...draft, section })} options={sectionOptions('Todas')} /></FilterLabel>
            <Button type="submit" disabled={loading}><Search /> {loading ? 'Generando…' : 'Generar reporte'}</Button>
          </form>

          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={schoolLogo} alt="" className="size-12 rounded-lg object-contain" />
                <div>
                  <p className="text-lg font-extrabold uppercase leading-tight">{SCHOOL.name}</p>
                  <p className="text-sm text-muted-foreground">{meta.title}</p>
                </div>
              </div>
              {data && <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">Del {dmy(data.from)} al {dmy(data.to)}</span>}
            </div>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className={cn(tableHead, 'sticky top-0')}>
                    <tr>{report.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-bold">{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 300).map((row, index) => (
                      <tr key={index} className="border-t border-border/70">
                        {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-1.5 tabular-nums">{cell}</td>)}
                      </tr>
                    ))}
                    {!report.rows.length && <tr><td colSpan={report.headers.length} className="px-3 py-8 text-center text-muted-foreground">{loading ? 'Generando…' : 'Sin datos para este reporte.'}</td></tr>}
                  </tbody>
                  {report.footer && report.rows.length > 0 && (
                    <tfoot className="sticky bottom-0 bg-slate-50 font-bold dark:bg-blue-500/15">
                      <tr>{report.footer.map((cell, index) => <td key={index} className="px-3 py-2 tabular-nums">{cell}</td>)}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="flex flex-col items-center gap-3">
                <Donut
                  center={`${attendance.toFixed(1)} %`}
                  caption="Asistencia"
                  segments={[
                    { label: 'Presentes', value: totals.presente, color: STATUS_META.presente.color },
                    { label: 'Tardanzas', value: totals.tardanza, color: STATUS_META.tardanza.color },
                    { label: 'Inasistencias', value: totals.inasistencia, color: STATUS_META.inasistencia.color },
                  ]}
                />
                <ul className="space-y-1 text-xs">
                  {[['Presentes', totals.presente, 'presente'], ['Tardanzas', totals.tardanza, 'tardanza'], ['Inasistencias', totals.inasistencia, 'inasistencia']].map(([label, value, status]) => (
                    <li key={label} className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: STATUS_META[status].color }} />{label}: {value} ({percent(value, totals.total)})</li>
                  ))}
                </ul>
              </div>
            </div>
            {report.rows.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Vista previa de las primeras 300 filas; la exportación incluye todas.</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-blue-500/10">
            <p className="flex items-center gap-2 text-sm text-foreground/80"><Info className="size-4 text-primary" /> Vista previa del reporte. Puedes exportarlo en PDF o Excel.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="border-border text-[#2f6447] hover:bg-muted" onClick={() => exportData('xlsx')}><FileSpreadsheet /> Exportar a Excel</Button>
              <Button type="button" variant="outline" className="border-border text-[#b4413c] hover:bg-muted" onClick={() => exportData('pdf')}><FileText /> Exportar a PDF</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
