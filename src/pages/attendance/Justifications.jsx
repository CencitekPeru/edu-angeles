import { useEffect, useState } from 'react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  Paperclip,
  Plus,
  QrCode,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { PageHeader, StatCard } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { JUSTIFY_REASONS } from './AttendanceScan'
import { firstOfMonth } from './AttendanceHistory'
import {
  DECISION_META,
  FilterLabel,
  LevelChip,
  Pager,
  STATUS_META,
  Select,
  StatusChip,
  StudentPhoto,
  dmy,
  gradeOptions,
  levelOptions,
  longDate,
  sectionOptions,
  tableHead,
  td,
  th,
  todayLima,
  usePaged,
  useStudents,
} from './shared'

const TABS = [
  { id: 'pendiente', label: 'Pendientes', icon: Clock },
  { id: 'aprobada', label: 'Aprobadas', icon: CheckCircle2 },
  { id: 'rechazada', label: 'Rechazadas', icon: XCircle },
  { id: '', label: 'Todas', icon: Layers },
]

export default function JustificationsPage() {
  const { toast } = useApp()
  const canEdit = useCan('asistencia')
  const today = todayLima()
  const [draft, setDraft] = useState({ from: firstOfMonth(today), to: today, level: '', grade: '', section: '', q: '' })
  const [filters, setFilters] = useState(draft)
  const [tab, setTab] = useState('pendiente')
  const [data, setData] = useState({ justifications: [], counts: { total: 0, pendiente: 0, aprobada: 0, rechazada: 0 } })
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [currentId, setCurrentId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    api(`/api/justifications?${params}`).then((result) => {
      if (!active) return
      setLoading(false)
      if (result.ok) setData(result)
    })
    return () => { active = false }
  }, [filters, version])

  const visible = tab ? data.justifications.filter((item) => item.status === tab) : data.justifications
  const { rows, pager } = usePaged(visible, 5)
  const current = data.justifications.find((item) => item.id === currentId) || visible[0] || null

  async function decide(status) {
    if (!current) return
    setDeciding(status)
    const result = await api(`/api/justifications/${current.id}/decide`, { method: 'POST', body: { status } })
    setDeciding('')
    if (!result.ok) return toast(result.error || 'No se pudo registrar la decisión.', 'bad')
    toast(status === 'aprobada' ? 'Justificación aprobada. La asistencia del día quedó justificada.' : 'Justificación rechazada.')
    setCurrentId(null)
    setVersion((value) => value + 1)
  }

  function exportData(format) {
    if (!visible.length) return toast('No hay justificaciones para exportar.', 'bad')
    const payload = {
      title: 'Justificaciones de asistencia',
      subtitle: `Del ${dmy(filters.from)} al ${dmy(filters.to)} · ${TABS.find((item) => item.id === tab).label}`,
      headers: ['Fecha', 'Código', 'Estudiante', 'Nivel', 'Grado', 'Sección', 'Tipo', 'Motivo', 'Descripción', 'Estado', 'Revisado por'],
      widths: [12, 12, 30, 12, 8, 9, 13, 22, 40, 12, 22],
      rows: visible.map((item) => [dmy(item.date), item.code, item.fullName, item.level, item.grade, item.section, STATUS_META[item.type].label, item.reason, item.description || '—', DECISION_META[item.status].label, item.decidedBy || '—']),
    }
    const task = format === 'pdf' ? exportTablePdf(payload) : exportTableXlsx(payload)
    task.then(() => toast('Archivo exportado.')).catch(() => toast('No se pudo exportar.', 'bad'))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="Justificaciones"
        description="Gestión de inasistencias y tardanzas justificadas por los estudiantes."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => exportData('xlsx')}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar a Excel</Button>
            <Button type="button" variant="outline" onClick={() => exportData('pdf')}><FileText className="text-[#b4413c]" /> Exportar a PDF</Button>
            {canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Nueva justificación</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={FileText} value={data.counts.total} label="Solicitudes totales" onClick={() => setTab('')} />
        <StatCard tone="green" icon={CheckCircle2} value={data.counts.aprobada} label="Aprobadas" onClick={() => setTab('aprobada')} />
        <StatCard tone="amber" icon={Clock} value={data.counts.pendiente} label="Pendientes" onClick={() => setTab('pendiente')} />
        <StatCard tone="red" icon={XCircle} value={data.counts.rechazada} label="Rechazadas" onClick={() => setTab('rechazada')} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,8fr)_minmax(300px,3.5fr)]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            {TABS.map((item) => {
              const Icon = item.icon
              const count = item.id ? data.counts[item.id] : data.counts.total
              return (
                <button key={item.label} type="button" onClick={() => { setTab(item.id); setCurrentId(null) }}
                  className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold', tab === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted')}>
                  <Icon className="size-4" /> {item.label} ({count})
                </button>
              )
            })}
          </div>
          <form className="grid items-end gap-3 p-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.6fr)_auto]" onSubmit={(event) => { event.preventDefault(); setFilters(draft) }}>
            <FilterLabel label="Rango de fechas">
              <span className="flex items-center gap-1.5">
                <Input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} aria-label="Desde" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" value={draft.to} min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} aria-label="Hasta" />
              </span>
            </FilterLabel>
            <FilterLabel label="Nivel"><Select value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={levelOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Grado"><Select value={draft.grade} onChange={(grade) => setDraft({ ...draft, grade })} options={gradeOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Sección"><Select value={draft.section} onChange={(section) => setDraft({ ...draft, section })} options={sectionOptions('Todas')} /></FilterLabel>
            <FilterLabel label="Buscar">
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="DNI, código o nombre…" className="pl-9" />
              </span>
            </FilterLabel>
            <Button type="submit"><Filter /> Filtrar</Button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>{['Fecha', 'Estudiante', 'Nivel', 'Grado', 'Sección', 'Tipo', 'Motivo', 'Estado', 'Acciones'].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} onClick={() => setCurrentId(item.id)} className={cn('cursor-pointer border-t border-border/70 hover:bg-muted/30', current?.id === item.id && 'bg-slate-50 dark:bg-blue-500/10')}>
                    <td className={cn(td, 'tabular-nums')}>{dmy(item.date)}</td>
                    <td className={td}>
                      <span className="flex items-center gap-2.5">
                        <StudentPhoto student={item} size="size-9" />
                        <span><span className="block font-semibold leading-tight">{item.fullName}</span><span className="text-xs text-muted-foreground">{item.code}</span></span>
                      </span>
                    </td>
                    <td className={td}><LevelChip level={item.level} /></td>
                    <td className={td}>{item.grade}</td>
                    <td className={td}>{item.section}</td>
                    <td className={td}><StatusChip status={item.type} /></td>
                    <td className={cn(td, 'max-w-[160px] truncate')} title={item.reason}>{item.reason}</td>
                    <td className={td}><StatusChip status={item.status} meta={DECISION_META} /></td>
                    <td className={td}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); setCurrentId(item.id) }} className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-primary hover:bg-muted" aria-label="Ver detalle"><Eye className="size-4" /></button>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">{loading ? 'Cargando…' : 'No hay justificaciones en esta vista.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager {...pager} label="solicitudes" />
        </div>

        <div className="h-fit rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-[15px] font-bold text-foreground"><Info className="size-[18px] text-primary" /> Detalle de la justificación</p>
          {current ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <StudentPhoto student={current} size="size-16" />
                <div className="space-y-0.5">
                  <p className="font-extrabold text-foreground">{current.fullName}</p>
                  <LevelChip level={current.level} />
                  <p className="text-xs text-muted-foreground">{current.grade} Grado – Sección {current.section}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><QrCode className="size-3.5" /> Código: {current.code}</p>
                </div>
              </div>
              <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-muted-foreground" /> Fecha</dt><dd>{longDate(current.date)}</dd></div>
                <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="flex items-center gap-2 font-semibold"><XCircle className="size-4 text-muted-foreground" /> Tipo</dt><dd><StatusChip status={current.type} /></dd></div>
                <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="flex items-center gap-2 font-semibold"><Info className="size-4 text-muted-foreground" /> Motivo</dt><dd>{current.reason}</dd></div>
                <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="font-semibold">Estado</dt><dd><StatusChip status={current.status} meta={DECISION_META} /></dd></div>
              </dl>
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-muted-foreground" /> Descripción</p>
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-foreground dark:bg-blue-500/10">{current.description || 'Sin descripción.'}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4 text-muted-foreground" /> Documento adjunto</p>
                {current.evidence ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                    <FileText className="size-8 shrink-0 text-[#b4413c]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{current.evidenceName || 'Evidencia'}</span>
                    <a href={current.evidence} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full border border-border text-primary hover:bg-muted" aria-label="Ver documento"><Eye className="size-4" /></a>
                    <a href={current.evidence} download={current.evidenceName || true} className="flex size-8 items-center justify-center rounded-full border border-border text-primary hover:bg-muted" aria-label="Descargar documento"><Download className="size-4" /></a>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sin documento adjunto.</p>}
              </div>
              {current.status === 'pendiente' && !canEdit ? (
                <p className="text-xs text-muted-foreground">Pendiente de revisión por coordinación o auxiliar.</p>
              ) : current.status === 'pendiente' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="border-border text-[#2f6447] hover:bg-muted" disabled={Boolean(deciding)} onClick={() => decide('aprobada')}><Check /> Aprobar</Button>
                  <Button type="button" variant="outline" className="border-border text-[#b4413c] hover:bg-muted" disabled={Boolean(deciding)} onClick={() => decide('rechazada')}><X /> Rechazar</Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Revisado por {current.decidedBy || '—'}{current.decidedAt ? ` el ${dmy(String(current.decidedAt).slice(0, 10))}` : ''}.</p>
              )}
            </div>
          ) : <p className="py-10 text-center text-sm text-muted-foreground">Selecciona una justificación para ver su detalle.</p>}
        </div>
      </div>

      {creating && <NewJustification onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setTab('pendiente'); setVersion((value) => value + 1) }} />}
    </div>
  )
}

function NewJustification({ onClose, onSaved }) {
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [student, setStudent] = useState(null)
  const [form, setForm] = useState({ date: todayLima(), type: 'inasistencia', reason: JUSTIFY_REASONS[0], description: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])
  const { students } = useStudents({ q: debounced || '__none__' })

  async function save(event) {
    event.preventDefault()
    if (!student) return toast('Selecciona un estudiante.', 'bad')
    setBusy(true)
    const result = await upload('/api/justifications', file ? [file] : [], { studentId: student.id, ...form })
    setBusy(false)
    if (!result.ok) return toast(result.error || 'No se pudo registrar la justificación.', 'bad')
    toast('Justificación registrada como pendiente de revisión.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva justificación</DialogTitle>
          <DialogDescription>Queda pendiente hasta que coordinación la apruebe o rechace.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {student ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-slate-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
              <StudentPhoto student={student} size="size-12" />
              <div className="flex-1">
                <p className="font-bold">{student.fullName}</p>
                <p className="text-xs text-muted-foreground">{student.code} · {student.level} · {student.grade} Sec. {student.section}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setStudent(null)}>Cambiar</Button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar estudiante por DNI, código o apellidos…" className="pl-9" />
              </div>
              {debounced && (
                <ul className="mt-2 max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border">
                  {students.slice(0, 15).map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => setStudent(item)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                        <StudentPhoto student={item} size="size-8" />
                        <span className="flex-1 font-medium">{item.fullName}</span>
                        <span className="text-xs text-muted-foreground">{item.code} · {item.grade} {item.section}</span>
                      </button>
                    </li>
                  ))}
                  {!students.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Sin resultados.</li>}
                </ul>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterLabel label="Fecha *"><Input type="date" value={form.date} max={todayLima()} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></FilterLabel>
            <FilterLabel label="Tipo *"><Select value={form.type} onChange={(type) => setForm({ ...form, type })} options={[{ value: 'inasistencia', label: 'Inasistencia' }, { value: 'tardanza', label: 'Tardanza' }]} /></FilterLabel>
            <FilterLabel label="Motivo *"><Select value={form.reason} onChange={(reason) => setForm({ ...form, reason })} options={JUSTIFY_REASONS.map((value) => ({ value, label: value }))} /></FilterLabel>
          </div>
          <FilterLabel label="Descripción">
            <Textarea value={form.description} maxLength={1000} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej.: El estudiante acudió a una consulta médica en el Centro de Salud…" />
          </FilterLabel>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 px-3 py-1.5 font-semibold text-primary hover:bg-muted dark:hover:bg-blue-500/10">
              <Paperclip className="size-4" /> {file ? 'Cambiar documento' : 'Adjuntar documento'}
              <input type="file" accept=".pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <span className="text-xs text-muted-foreground">{file ? file.name : 'PDF, JPG o PNG (máx. 5 MB)'}</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || !student}>{busy ? 'Guardando…' : 'Registrar justificación'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
