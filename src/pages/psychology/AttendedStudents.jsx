import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, Eraser, Eye, FileSpreadsheet, FileText, FolderOpen, List, NotebookPen, Send, User, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, Table } from '../campus/kit'
import { FilterLabel, GRADES, LEVELS, SECTIONS, Select, StudentPhoto, addDaysISO, todayLima } from '../attendance/shared'
import { ConfidentialNote, StudentChooser, caseLink, classroom, dmy, gradeSection, matchesClassroom, opts, sessionLabel, timeRange, usePsyStudents } from './shared'

const STATES = ['En seguimiento', 'Concluido']

/**
 * Estudiantes atendidos (manual §7): who received attention in a period, one row per student, and the
 * per-student view with everything related. Nothing is registered here: records are created at their origin.
 */
export default function AttendedStudentsPage() {
  const { toast } = useApp()
  const [params, setParams] = useSearchParams()
  const today = todayLima()
  const [range, setRange] = useState({ from: addDaysISO(today, -30), to: today })
  const emptyFilters = { q: '', level: '', grade: '', section: '', kind: '', state: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [attentions, setAttentions] = useState([])
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const selectedId = Number(params.get('estudiante')) || null
  const tab = selectedId || params.get('vista') === 'estudiante' ? 'student' : 'list'

  useEffect(() => {
    setLoading(true)
    Promise.all([api(`/api/psychology/attentions?${new URLSearchParams(range)}`), api('/api/psychology/cases')]).then(([attentionResult, caseResult]) => {
      setLoading(false)
      if (!attentionResult.ok || !caseResult.ok) return toast('No se pudo cargar la información.', 'bad')
      setAttentions(attentionResult.attentions)
      setCases(caseResult.cases)
    })
  }, [range.from, range.to])

  /** One row per student: total attentions, last one, kinds and follow-up state. */
  const rows = useMemo(() => {
    const byStudent = new Map()
    for (const item of attentions) {
      const entry = byStudent.get(item.student.id) || { student: item.student, total: 0, last: '', punctual: 0, followUp: 0 }
      entry.total += 1
      if (item.date > entry.last) entry.last = item.date
      if (item.caseId) entry.followUp += 1
      else entry.punctual += 1
      byStudent.set(item.student.id, entry)
    }
    const active = new Set(cases.filter((item) => item.status !== 'Cerrado').map((item) => item.student.id))
    return [...byStudent.values()].map((entry) => ({ ...entry, id: entry.student.id, state: active.has(entry.student.id) ? 'En seguimiento' : 'Concluido' }))
      .sort((a, b) => b.last.localeCompare(a.last))
  }, [attentions, cases])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return rows.filter((row) =>
      matchesClassroom(row.student, filters)
      && (!filters.kind || (filters.kind === 'caso' ? row.followUp > 0 : row.punctual > 0))
      && (!filters.state || row.state === filters.state)
      && (!term || `${row.student.name} ${row.student.code} ${row.student.dni}`.toLowerCase().includes(term)))
  }, [rows, filters])

  const exportPayload = () => ({
    title: 'Atención psicológica · Estudiantes atendidos',
    subtitle: `Del ${dmy(range.from)} al ${dmy(range.to)} · Información confidencial`,
    summary: [['Estudiantes', visible.length], ['Atenciones', visible.reduce((total, row) => total + row.total, 0)]],
    headers: ['N.°', 'Estudiante', 'Código', 'Nivel', 'Grado y sección', 'Total de atenciones', 'Puntuales', 'Con seguimiento', 'Última atención', 'Estado'],
    rows: visible.map((row, index) => [index + 1, row.student.name, row.student.code, row.student.level, gradeSection(row.student), row.total, row.punctual, row.followUp, dmy(row.last), row.state]),
  })
  function exportExcel() {
    if (!visible.length) return toast('No hay estudiantes para exportar.', 'bad')
    exportTableXlsx({ ...exportPayload(), widths: [6, 32, 13, 12, 13, 12, 10, 12, 13, 15] }).then(() => toast('Listado exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }
  function exportPdf() {
    if (!visible.length) return toast('No hay estudiantes para exportar.', 'bad')
    exportTablePdf(exportPayload()).then(() => toast('Listado exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  const openStudent = (id) => setParams(id ? { estudiante: String(id) } : { vista: 'estudiante' })
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title="Estudiantes atendidos"
        description="Consulta de estudiantes que han recibido atención psicológica en un periodo."
        actions={tab === 'list' && (
          <>
            <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
          </>
        )}
      />
      <ConfidentialNote />

      <nav className="flex gap-1 border-b border-border" aria-label="Vistas">
        {[['list', 'Listado de estudiantes', List, () => setParams({})], ['student', 'Vista por estudiante', User, () => openStudent(selectedId)]].map(([value, label, Icon, onClick]) => (
          <button key={value} type="button" onClick={onClick} aria-current={tab === value ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold ${tab === value ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'list' ? (
        <Panel title={`Listado de estudiantes (${visible.length})`} icon={Users}>
          <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            <FilterLabel label="Buscar" className="sm:col-span-2 lg:col-span-4"><Input placeholder="Buscar por estudiante, DNI o código…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
            <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
            <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
            <FilterLabel label="Nivel educativo"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVELS, 'Todos los niveles')} /></FilterLabel>
            <FilterLabel label="Grado"><Select value={filters.grade} onChange={(grade) => setFilters({ ...filters, grade })} options={opts(GRADES, 'Todos los grados')} /></FilterLabel>
            <FilterLabel label="Sección"><Select value={filters.section} onChange={(section) => setFilters({ ...filters, section })} options={opts(SECTIONS, 'Todas las secciones')} /></FilterLabel>
            <FilterLabel label="Tipo de atención"><Select value={filters.kind} onChange={(kind) => setFilters({ ...filters, kind })} options={[{ value: '', label: 'Todos los tipos' }, { value: 'puntual', label: 'Atención puntual' }, { value: 'caso', label: 'Con seguimiento' }]} /></FilterLabel>
            <FilterLabel label="Estado"><Select value={filters.state} onChange={(state) => setFilters({ ...filters, state })} options={opts(STATES, 'Todos los estados')} /></FilterLabel>
            <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar filtros</Button></div>
          </div>
          <Table
            rows={visible.map((row, index) => ({ ...row, number: index + 1 }))}
            empty={loading ? 'Cargando…' : 'Ningún estudiante recibió atención con estos filtros.'}
            columns={[
              { key: 'number', label: 'N.°' },
              { key: 'student', label: 'Estudiante', render: (row) => <span><span className="block font-semibold uppercase">{row.student.name}</span><span className="text-xs text-muted-foreground">{row.student.code}</span></span> },
              { key: 'level', label: 'Nivel', render: (row) => row.student.level },
              { key: 'grade', label: 'Grado y sección', render: (row) => gradeSection(row.student) },
              { key: 'total', label: 'Total de atenciones', render: (row) => <span>{row.total}<span className="block text-xs text-muted-foreground">{row.punctual} puntual(es) · {row.followUp} con caso</span></span> },
              { key: 'last', label: 'Última atención', render: (row) => dmy(row.last) },
              { key: 'state', label: 'Estado', render: (row) => <Pill value={row.state} /> },
              { key: 'actions', label: 'Acciones', render: (row) => <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Abrir vista por estudiante" aria-label={`Ver a ${row.student.name}`} onClick={() => openStudent(row.id)}><Eye /></Button> },
            ]}
          />
        </Panel>
      ) : (
        <StudentView studentId={selectedId} onPick={openStudent} />
      )}
    </div>
  )
}

/** Vista por estudiante: their data and every attention, case, appointment and referral, read-only. */
function StudentView({ studentId, onPick }) {
  const { toast } = useApp()
  const [students] = usePsyStudents()
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!studentId) { setData(null); return }
    api(`/api/psychology/students/${studentId}/history`).then((result) => {
      if (result.ok) setData(result)
      else toast(result.error || 'No se pudo cargar el historial.', 'bad')
    })
  }, [studentId])

  const attentions = data?.sessions.filter((item) => item.status === 'Realizada') || []
  const appointments = data?.sessions.filter((item) => item.caseId && item.origin === 'cita') || []
  return (
    <div className="space-y-4">
      <Panel title="Estudiante" icon={User}>
        <StudentChooser key={studentId || 'none'} students={students} value={studentId} onChange={onPick} />
        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
            <StudentPhoto student={data.student} size="size-14" />
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="font-semibold">{data.student.code}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Nivel, grado y sección</dt><dd className="font-semibold">{classroom(data.student)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Atenciones</dt><dd className="font-semibold">{attentions.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Casos / derivaciones</dt><dd className="font-semibold">{data.cases.length} / {data.referrals.length}</dd></div>
            </dl>
          </div>
        )}
      </Panel>
      {!studentId && <p className="text-center text-sm text-muted-foreground">Busca y selecciona a un estudiante para ver su historial.</p>}
      {data && (
        <>
          <Panel title={`Atenciones (${attentions.length})`} icon={NotebookPen} contentClassName="p-0">
            <ul className="divide-y divide-border">
              {attentions.map((item) => (
                <li key={item.id} className="px-5 py-3 text-sm">
                  <p className="font-semibold">{dmy(item.date)} · {timeRange(item)} <span className="font-normal text-muted-foreground">· {item.caseId ? `Caso ${item.caseCode} · ${sessionLabel(item)}` : 'Atención puntual'} · {item.reason}</span></p>
                  {item.agreements && <p className="mt-0.5 text-xs"><span className="font-semibold">Acuerdos:</span> {item.agreements}</p>}
                </li>
              ))}
              {!attentions.length && <li className="px-5 py-5 text-center text-sm text-muted-foreground">Sin atenciones registradas.</li>}
            </ul>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Casos (${data.cases.length})`} icon={FolderOpen} contentClassName="p-0">
              <ul className="divide-y divide-border">
                {data.cases.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <Link to={caseLink(item.id)} className="font-semibold text-primary hover:underline">{item.code}</Link>
                    <span className="text-muted-foreground">{item.reason} · {dmy(item.openedOn)}</span>
                    <Pill value={item.status} />
                  </li>
                ))}
                {!data.cases.length && <li className="px-5 py-5 text-center text-sm text-muted-foreground">Sin casos.</li>}
              </ul>
            </Panel>
            <Panel title={`Derivaciones (${data.referrals.length})`} icon={Send} contentClassName="p-0">
              <ul className="divide-y divide-border">
                {data.referrals.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span><span className="font-semibold">{item.code}</span> · {item.institution}</span>
                    <span className="text-muted-foreground">{dmy(item.date)}</span>
                    <Pill value={item.status} />
                  </li>
                ))}
                {!data.referrals.length && <li className="px-5 py-5 text-center text-sm text-muted-foreground">Sin derivaciones.</li>}
              </ul>
            </Panel>
          </div>
          <Panel title={`Citas (${appointments.length})`} icon={CalendarClock} contentClassName="p-0">
            <ul className="divide-y divide-border">
              {appointments.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span><span className="font-semibold">{dmy(item.date)} · {timeRange(item)}</span> <span className="text-muted-foreground">· {item.caseCode} · {sessionLabel(item)} · {item.topic}</span></span>
                  <Pill value={item.status} />
                </li>
              ))}
              {!appointments.length && <li className="px-5 py-5 text-center text-sm text-muted-foreground">Sin citas.</li>}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
