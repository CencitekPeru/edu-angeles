import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Eye, FileSpreadsheet, FileText, Filter, History, Search, Users, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'
import { useApp } from '../../context/AppContext'
import { PageHeader, StatCard } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  FilterLabel,
  LevelChip,
  Pager,
  STATUS_META,
  Select,
  StatusChip,
  StudentPhoto,
  allOption,
  ampm,
  dmy,
  gradeOptions,
  levelOptions,
  pct,
  sectionOptions,
  tableHead,
  td,
  th,
  todayLima,
  usePaged,
} from './shared'

const METHOD = { qr: 'Lector QR', manual: 'Registro manual', sistema: 'Sin registro de ingreso' }

export function firstOfMonth(iso) {
  return `${iso.slice(0, 8)}01`
}

export default function AttendanceHistory() {
  const { toast } = useApp()
  const today = todayLima()
  const [draft, setDraft] = useState({ from: firstOfMonth(today), to: today, level: '', grade: '', section: '', status: '', q: '' })
  const [filters, setFilters] = useState(draft)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const records = data?.records || []
  const { rows, pager } = usePaged(records, 10)

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    api(`/api/attendance/history?${params}`).then((result) => {
      if (!active) return
      setLoading(false)
      if (result.ok) setData(result)
      else toast(result.error || 'No se pudo cargar el historial.', 'bad')
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const totals = data?.totals || { total: 0, presente: 0, tardanza: 0, inasistencia: 0 }

  function exportData(format) {
    if (!records.length) return toast('No hay registros para exportar.', 'bad')
    const payload = {
      title: 'Historial de asistencia',
      subtitle: `Del ${dmy(data.from)} al ${dmy(data.to)}${filters.level ? ` · ${filters.level}` : ''}${filters.grade ? ` · ${filters.grade}` : ''}${filters.section ? ` · Sección ${filters.section}` : ''}`,
      summary: [['Registros', totals.total], ['Presentes', totals.presente], ['Tardanzas', totals.tardanza], ['Inasistencias', totals.inasistencia]],
      headers: ['#', 'Fecha', 'Hora', 'Código', 'Apellidos y nombres', 'Nivel', 'Grado', 'Sección', 'Estado', 'Observación / Justificación'],
      widths: [6, 12, 11, 12, 34, 12, 8, 9, 16, 40],
      rows: records.map((row, index) => [index + 1, dmy(row.date), row.time || '—', row.code, row.fullName, row.level, row.grade, row.section, `${STATUS_META[row.status].label}${row.justified ? ' (justificada)' : ''}`, row.note || '—']),
    }
    const task = format === 'pdf' ? exportTablePdf(payload) : exportTableXlsx(payload)
    task.then(() => toast(`Historial exportado a ${format === 'pdf' ? 'PDF' : 'Excel'}.`)).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={History}
        title="Historial de asistencia"
        description="Consulta y detalle de los registros de asistencia de los estudiantes."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => exportData('xlsx')}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar a Excel</Button>
            <Button type="button" variant="outline" onClick={() => exportData('pdf')}><FileText className="text-[#b4413c]" /> Exportar a PDF</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Users} value={totals.total.toLocaleString('es-PE')} label="Registros totales" hint={data ? `${data.days} día(s) hábiles` : undefined} />
        <StatCard tone="green" icon={CheckCircle2} value={totals.presente.toLocaleString('es-PE')} label="Presentes" hint={pct(totals.presente, totals.total)} />
        <StatCard tone="amber" icon={Clock} value={totals.tardanza.toLocaleString('es-PE')} label="Tardanzas" hint={pct(totals.tardanza, totals.total)} />
        <StatCard tone="red" icon={XCircle} value={totals.inasistencia.toLocaleString('es-PE')} label="Inasistencias" hint={pct(totals.inasistencia, totals.total)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-[15px] font-bold text-foreground"><Search className="size-[18px] text-primary" /> Filtros de búsqueda</p>
        <form className="grid items-end gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.8fr)_auto]" onSubmit={(event) => { event.preventDefault(); setFilters(draft) }}>
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
          <FilterLabel label="Estado">
            <Select value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={[allOption(), ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))]} />
          </FilterLabel>
          <FilterLabel label="Estudiante">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="DNI, código o nombre…" className="pl-9" />
            </span>
          </FilterLabel>
          <Button type="submit"><Filter /> Filtrar</Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                {['#', 'Fecha', 'Hora', 'Código', 'Apellidos y nombres', 'Nivel', 'Grado', 'Sección', 'Estado', 'Observación / Justificación', ''].map((label) => <th key={label} className={th}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.studentId}-${row.date}`} className="border-t border-border/70 hover:bg-muted/30">
                  <td className={cn(td, 'text-muted-foreground')}>{(pager.page - 1) * pager.pageSize + index + 1}</td>
                  <td className={cn(td, 'tabular-nums')}>{dmy(row.date)}</td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{row.time ? <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-muted-foreground" />{ampm(row.time)}</span> : '—'}</td>
                  <td className={cn(td, 'font-semibold text-primary')}>{row.code}</td>
                  <td className={cn(td, 'font-medium')}>{row.fullName}</td>
                  <td className={td}><LevelChip level={row.level} /></td>
                  <td className={td}>{row.grade}</td>
                  <td className={td}>{row.section}</td>
                  <td className={td}><StatusChip status={row.status} justified={row.justified} /></td>
                  <td className={cn(td, 'max-w-[240px] truncate text-foreground/80')} title={row.note}>{row.note || (row.status === 'inasistencia' && !row.justified ? 'Sin justificación' : '—')}</td>
                  <td className={td}>
                    <button type="button" onClick={() => setViewing(row)} className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-primary hover:bg-muted" aria-label="Ver detalle"><Eye className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">{loading ? 'Cargando…' : 'No hay registros para estos filtros.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager {...pager} label="registros" />
      </div>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
        <DialogContent className="sm:max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle del registro</DialogTitle>
                <DialogDescription>{dmy(viewing.date)}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-3">
                <StudentPhoto student={viewing} size="size-14" />
                <div>
                  <p className="font-bold">{viewing.fullName}</p>
                  <p className="text-xs text-muted-foreground">{viewing.code} · {viewing.level} · {viewing.grade} Sec. {viewing.section}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Estado</dt><dd><StatusChip status={viewing.status} justified={viewing.justified} /></dd>
                <dt className="text-muted-foreground">Hora de ingreso</dt><dd>{ampm(viewing.time)}</dd>
                <dt className="text-muted-foreground">Origen</dt><dd>{METHOD[viewing.method] || viewing.method}</dd>
                <dt className="text-muted-foreground">Observación</dt><dd>{viewing.note || '—'}</dd>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
