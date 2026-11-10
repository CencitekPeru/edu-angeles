import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarClock, ClipboardList, FileSpreadsheet, FileText, FolderOpen, NotebookPen, Search, Send, SlidersHorizontal, User, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Panel, Pill, Table } from '../campus/kit'
import { FilterLabel, GRADES, LEVELS, SECTIONS, Select, todayLima } from '../attendance/shared'
import { ConfidentialNote, dmy, gradeSection, matchesClassroom, opts, sessionLabel, timeRange } from './shared'
import { exportAdministrativeReport } from './reportColumns'

const TABS = [
  ['summary', 'Resumen general', BarChart3],
  ['attentions', 'Atenciones', NotebookPen],
  ['cases', 'Casos', FolderOpen],
  ['appointments', 'Citas', CalendarClock],
  ['referrals', 'Derivaciones', Send],
  ['students', 'Por estudiante', User],
]

/** Counts by a key, biggest first: [{ label, total }]. */
function countBy(items, keyOf) {
  const totals = new Map()
  for (const item of items) {
    const key = keyOf(item) || 'Sin dato'
    totals.set(key, (totals.get(key) || 0) + 1)
  }
  return [...totals.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total)
}
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0)

/* ------------------------------------------------------------------ charts
 * One series per chart, in the institution's navy: no legend needed (the title names it), the value is
 * written next to each bar, and every bar has a hover tooltip. The same numbers are in the tabs' tables.
 */

function HorizontalBars({ rows, total, empty = 'Sin datos en el periodo.' }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  const max = Math.max(...rows.map((row) => row.total))
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-sm" title={`${row.label}: ${row.total} (${pct(row.total, total)} %)`}>
          <span className="truncate text-foreground/80">{row.label}</span>
          <span className="h-3 rounded-r bg-muted/60">
            <span className="block h-3 rounded-r-[4px] bg-primary" style={{ width: `${(row.total / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-foreground">{row.total} <span className="text-xs text-muted-foreground">({pct(row.total, total)} %)</span></span>
        </li>
      ))}
    </ul>
  )
}

function VerticalBars({ rows, caption }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos en el periodo.</p>
  const max = Math.max(...rows.map((row) => row.total))
  return (
    <figure>
      <div className="flex h-44 items-end gap-3 border-b border-border px-2">
        {rows.map((row) => (
          <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${row.label}: ${row.total}`}>
            <span className="text-xs font-semibold tabular-nums">{row.total}</span>
            <span className="w-full max-w-10 rounded-t-[4px] bg-primary" style={{ height: `${Math.max(4, (row.total / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-2 pt-1.5">
        {rows.map((row) => <span key={row.label} className="flex-1 text-center text-xs text-muted-foreground">{row.label}</span>)}
      </div>
      {caption && <figcaption className="mt-1 text-center text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  )
}

function Kpi({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-primary dark:bg-muted"><Icon className="size-5" /></span>
      <span><span className="block text-2xl font-extrabold leading-none tabular-nums">{value}</span><span className="text-xs text-muted-foreground">{label}</span></span>
    </div>
  )
}

/** Reportes (manual §8): statistics of the area by period and level/grade/section, exportable. */
export default function PsychologyReports() {
  const { toast } = useApp()
  const today = todayLima()
  const [draft, setDraft] = useState({ from: `${today.slice(0, 7)}-01`, to: today, level: '', grade: '', section: '' })
  const [params, setParams] = useState(draft)
  const [tab, setTab] = useState('summary')
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(false)

  async function generate(next = draft) {
    if (next.from > next.to) return toast('La fecha inicial no puede ser posterior a la final.', 'bad')
    setLoading(true)
    const result = await api(`/api/psychology/report?${new URLSearchParams({ from: next.from, to: next.to })}`)
    setLoading(false)
    if (!result.ok) return toast(result.error || 'No se pudo generar el reporte.', 'bad')
    setRaw(result)
    setParams(next)
  }
  useEffect(() => { generate() }, [])

  const data = useMemo(() => {
    if (!raw) return null
    const inClass = (item) => matchesClassroom(item.student, params)
    const sessions = raw.sessions.filter(inClass)
    const attentions = sessions.filter((item) => item.status === 'Realizada')
    const appointments = sessions.filter((item) => item.caseId && item.origin === 'cita' && item.status !== 'Cancelada')
    const cases = raw.cases.filter(inClass)
    const referrals = raw.referrals.filter(inClass)
    const students = new Map()
    const studentRow = (student) => {
      if (!students.has(student.id)) students.set(student.id, { id: student.id, student, attentions: 0, cases: 0, scheduled: 0, attended: 0, missed: 0, referrals: 0 })
      return students.get(student.id)
    }
    attentions.forEach((item) => { studentRow(item.student).attentions += 1 })
    cases.forEach((item) => { studentRow(item.student).cases += 1 })
    appointments.forEach((item) => {
      const row = studentRow(item.student)
      if (item.status !== 'Reprogramada') row.scheduled += 1
      if (item.status === 'Realizada') row.attended += 1
      if (item.status === 'No asistió') row.missed += 1
    })
    referrals.forEach((item) => { studentRow(item.student).referrals += 1 })
    const gradeOrder = (label) => GRADES.indexOf(label.split(' ')[0])
    return {
      attentions,
      appointments,
      cases,
      referrals,
      students: [...students.values()].sort((a, b) => b.attentions - a.attentions || a.student.name.localeCompare(b.student.name)),
      attended: new Set(attentions.map((item) => item.student.id)).size,
      followUp: cases.filter((item) => item.status === 'En seguimiento').length,
      scheduled: appointments.filter((item) => item.status !== 'Reprogramada').length,
      byReason: countBy(attentions, (item) => item.reason),
      byGrade: countBy(attentions, (item) => item.student.grade).sort((a, b) => gradeOrder(a.label) - gradeOrder(b.label)),
      byLevel: countBy(attentions, (item) => item.student.level),
    }
  }, [raw, params])

  const period = `Del ${dmy(params.from)} al ${dmy(params.to)}${params.level ? ` · ${params.level}` : ''}${params.grade ? ` · ${params.grade}` : ''}${params.section ? ` · Sección ${params.section}` : ''}`

  /** Headers and rows of the open tab, for Excel / PDF. */
  function tabExport() {
    if (!data) return null
    switch (tab) {
      case 'attentions': return { name: 'Atenciones', headers: ['Fecha', 'Hora', 'Estudiante', 'Grado y sección', 'Tipo', 'Motivo', 'Riesgo', 'Registrado por'], rows: data.attentions.map((item) => [dmy(item.date), timeRange(item), item.student.name, gradeSection(item.student), item.caseId ? `Caso ${item.caseCode}` : 'Puntual', item.reason, item.riskLevel, item.createdBy]) }
      case 'cases': return { name: 'Casos', headers: ['Código', 'Estudiante', 'Grado y sección', 'Motivo', 'Sesiones', 'Riesgo', 'Estado', 'Apertura'], rows: data.cases.map((item) => [item.code, item.student.name, gradeSection(item.student), item.reason, item.sessionsDone, item.riskLevel, item.status, dmy(item.openedOn)]) }
      case 'appointments': return { name: 'Citas', headers: ['Fecha', 'Hora', 'Estudiante', 'Caso', 'Sesión', 'Tema', 'Modalidad', 'Estado'], rows: data.appointments.map((item) => [dmy(item.date), timeRange(item), item.student.name, item.caseCode, sessionLabel(item), item.topic, item.modality, item.status]) }
      case 'referrals': return { name: 'Derivaciones', headers: ['Código', 'Fecha', 'Estudiante', 'Grado y sección', 'Motivo', 'Destino', 'Estado'], rows: data.referrals.map((item) => [item.code, dmy(item.date), item.student.name, gradeSection(item.student), item.motive, item.institution, item.status]) }
      case 'students': return { name: 'Por estudiante', headers: ['Estudiante', 'Código', 'Grado y sección', 'Atenciones', 'Casos', 'Citas programadas', 'Asistidas', 'No asistió', 'Derivaciones'], rows: data.students.map((row) => [row.student.name, row.student.code, gradeSection(row.student), row.attentions, row.cases, row.scheduled, row.attended, row.missed, row.referrals]) }
      default: return {
        name: 'Resumen general',
        headers: ['Indicador', 'Detalle', 'Cantidad'],
        rows: [
          ['Resumen', 'Estudiantes atendidos', data.attended], ['Resumen', 'Total de atenciones', data.attentions.length], ['Resumen', 'Casos en seguimiento', data.followUp],
          ['Resumen', 'Citas programadas', data.scheduled], ['Resumen', 'Derivaciones', data.referrals.length],
          ...data.byReason.map((row) => ['Atenciones por motivo', row.label, row.total]),
          ...data.byGrade.map((row) => ['Atenciones por grado', `${row.label} grado`, row.total]),
          ...data.byLevel.map((row) => ['Atenciones por nivel', row.label, row.total]),
        ],
      }
    }
  }
  function exportExcel() {
    const sheet = tabExport()
    if (!sheet?.rows.length) return toast('No hay datos para exportar con estos parámetros.', 'bad')
    exportTableXlsx({ title: `Reporte de Atención Psicológica · ${sheet.name}`, subtitle: `${period} · Información confidencial`, headers: sheet.headers, rows: sheet.rows })
      .then(() => toast('Reporte exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    const sheet = tabExport()
    if (!sheet?.rows.length) return toast('No hay datos para exportar con estos parámetros.', 'bad')
    exportTablePdf({ title: `Reporte de Atención Psicológica · ${sheet.name}`, subtitle: `${period} · Información confidencial`, headers: sheet.headers, rows: sheet.rows })
      .then(() => toast('Reporte exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }
  async function exportAdministrative() {
    const result = await api(`/api/psychology/export?${new URLSearchParams({ from: params.from, to: params.to })}`)
    if (!result.ok) return toast(result.error || 'No se pudo preparar el reporte.', 'bad')
    const rows = result.rows.filter((row) => matchesClassroom(row, params))
    if (!rows.length) return toast('No hay registros en el periodo.', 'bad')
    exportAdministrativeReport(rows, period).then(() => toast('Reporte administrativo exportado.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-card text-primary"><BarChart3 className="size-6" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Reportes de Atención Psicológica</h1>
            <p className="text-sm text-muted-foreground">Consulta y generación de reportes estadísticos y operativos.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportAdministrative} title="Formato institucional de 40 columnas, sin información clínica"><ClipboardList /> Reporte administrativo</Button>
          <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
          <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
        </div>
      </div>
      <ConfidentialNote />

      <nav className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Tipo de reporte">
        {TABS.map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}
            className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors', tab === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted')}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel title="Parámetros del reporte" icon={SlidersHorizontal} className="h-fit">
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); generate() }}>
            <FilterLabel label="Desde"><Input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></FilterLabel>
            <FilterLabel label="Hasta"><Input type="date" value={draft.to} min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></FilterLabel>
            <FilterLabel label="Nivel educativo"><Select value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={opts(LEVELS, 'Todos los niveles')} /></FilterLabel>
            <FilterLabel label="Grado"><Select value={draft.grade} onChange={(grade) => setDraft({ ...draft, grade })} options={opts(GRADES, 'Todos los grados')} /></FilterLabel>
            <FilterLabel label="Sección"><Select value={draft.section} onChange={(section) => setDraft({ ...draft, section })} options={opts(SECTIONS, 'Todas las secciones')} /></FilterLabel>
            <FilterLabel label="Tipo de reporte"><Select value={tab} onChange={setTab} options={TABS.map(([value, label]) => ({ value, label }))} /></FilterLabel>
            <Button type="submit" disabled={loading}><Search /> {loading ? 'Generando…' : 'Generar reporte'}</Button>
            <p className="text-xs text-muted-foreground">Confirma periodo y filtros antes de compartir. No divulgues detalles clínicos en reportes administrativos.</p>
          </form>
        </Panel>

        <div className="min-w-0 space-y-4">
          {!data ? <p className="py-10 text-center text-sm text-muted-foreground">{loading ? 'Generando reporte…' : 'Pulsa «Generar reporte».'}</p> : (
            <>
              <p className="text-xs font-semibold text-muted-foreground">{period}</p>
              {tab === 'summary' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Kpi icon={Users} value={data.attended} label="Estudiantes atendidos" />
                    <Kpi icon={NotebookPen} value={data.attentions.length} label="Total de atenciones" />
                    <Kpi icon={FolderOpen} value={data.followUp} label="Casos en seguimiento" />
                    <Kpi icon={CalendarClock} value={data.scheduled} label="Citas programadas" />
                    <Kpi icon={Send} value={data.referrals.length} label="Derivaciones" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Panel title="Atenciones por motivo" icon={BarChart3}><HorizontalBars rows={data.byReason} total={data.attentions.length} /></Panel>
                    <Panel title="Atenciones por grado" icon={BarChart3}><VerticalBars rows={data.byGrade} caption={params.level ? `Grado (${params.level})` : 'Grado'} /></Panel>
                    <Panel title="Últimas atenciones registradas" icon={NotebookPen} contentClassName="p-0">
                      <ul className="divide-y divide-border text-sm">
                        {data.attentions.slice(0, 6).map((item) => (
                          <li key={item.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem] gap-3 px-5 py-2.5">
                            <span className="text-muted-foreground">{dmy(item.date)}</span>
                            <span className="min-w-0"><span className="block truncate font-medium">{item.student.name}</span><span className="block truncate text-xs text-muted-foreground">{item.reason}</span></span>
                            <span className="text-right text-xs">{gradeSection(item.student)}</span>
                          </li>
                        ))}
                        {!data.attentions.length && <li className="px-5 py-6 text-center text-muted-foreground">Sin atenciones en el periodo.</li>}
                      </ul>
                    </Panel>
                    <Panel title="Distribución de atenciones por nivel" icon={BarChart3}><HorizontalBars rows={data.byLevel} total={data.attentions.length} /></Panel>
                  </div>
                </>
              )}
              {tab === 'attentions' && (
                <Panel title={`Atenciones (${data.attentions.length})`} icon={NotebookPen}>
                  <Table rows={data.attentions} empty="Sin atenciones en el periodo." columns={[
                    { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap">{dmy(item.date)}<span className="block text-xs text-muted-foreground">{timeRange(item)}</span></span> },
                    { key: 'student', label: 'Estudiante', render: (item) => item.student.name },
                    { key: 'grade', label: 'Grado', render: (item) => gradeSection(item.student) },
                    { key: 'kind', label: 'Tipo', render: (item) => (item.caseId ? `Caso ${item.caseCode}` : 'Puntual') },
                    { key: 'reason', label: 'Motivo' },
                    { key: 'risk', label: 'Riesgo', render: (item) => (item.riskLevel ? <Pill value={item.riskLevel} /> : '—') },
                  ]} />
                </Panel>
              )}
              {tab === 'cases' && (
                <Panel title={`Casos (${data.cases.length})`} icon={FolderOpen}>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">{countBy(data.cases, (item) => item.status).map((row) => <span key={row.label} className="rounded-full border border-border px-3 py-1">{row.label}: <strong>{row.total}</strong></span>)}</div>
                  <Table rows={data.cases} empty="Sin casos en el periodo." columns={[
                    { key: 'code', label: 'Código', render: (item) => <span className="font-semibold">{item.code}</span> },
                    { key: 'student', label: 'Estudiante', render: (item) => item.student.name },
                    { key: 'grade', label: 'Grado', render: (item) => gradeSection(item.student) },
                    { key: 'reason', label: 'Motivo' },
                    { key: 'sessions', label: 'Sesiones', render: (item) => item.sessionsDone },
                    { key: 'risk', label: 'Riesgo', render: (item) => <Pill value={item.riskLevel} /> },
                    { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
                  ]} />
                </Panel>
              )}
              {tab === 'appointments' && (
                <Panel title={`Citas (${data.appointments.length})`} icon={CalendarClock}>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">{countBy(data.appointments, (item) => item.status).map((row) => <span key={row.label} className="rounded-full border border-border px-3 py-1">{row.label}: <strong>{row.total}</strong></span>)}</div>
                  <Table rows={data.appointments} empty="Sin citas en el periodo." columns={[
                    { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap">{dmy(item.date)}<span className="block text-xs text-muted-foreground">{timeRange(item)}</span></span> },
                    { key: 'student', label: 'Estudiante', render: (item) => item.student.name },
                    { key: 'case', label: 'Caso', render: (item) => item.caseCode },
                    { key: 'session', label: 'Sesión', render: (item) => <span>{sessionLabel(item)}<span className="block text-xs text-muted-foreground">{item.topic}</span></span> },
                    { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
                  ]} />
                </Panel>
              )}
              {tab === 'referrals' && (
                <Panel title={`Derivaciones (${data.referrals.length})`} icon={Send}>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">{countBy(data.referrals, (item) => item.status).map((row) => <span key={row.label} className="rounded-full border border-border px-3 py-1">{row.label}: <strong>{row.total}</strong></span>)}</div>
                  <Table rows={data.referrals} empty="Sin derivaciones en el periodo." columns={[
                    { key: 'code', label: 'Código', render: (item) => <span className="font-semibold">{item.code}</span> },
                    { key: 'date', label: 'Fecha', render: (item) => dmy(item.date) },
                    { key: 'student', label: 'Estudiante', render: (item) => item.student.name },
                    { key: 'motive', label: 'Motivo' },
                    { key: 'institution', label: 'Destino' },
                    { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
                  ]} />
                </Panel>
              )}
              {tab === 'students' && (
                <Panel title={`Por estudiante (${data.students.length})`} icon={User}>
                  <Table rows={data.students} empty="Sin actividad en el periodo." columns={[
                    { key: 'student', label: 'Estudiante', render: (row) => <span><span className="block font-medium">{row.student.name}</span><span className="text-xs text-muted-foreground">{row.student.code} · {gradeSection(row.student)}</span></span> },
                    { key: 'attentions', label: 'Atenciones' },
                    { key: 'cases', label: 'Casos' },
                    { key: 'scheduled', label: 'Citas programadas' },
                    { key: 'attended', label: 'Asistidas' },
                    { key: 'missed', label: 'No asistió' },
                    { key: 'referrals', label: 'Derivaciones' },
                  ]} />
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
