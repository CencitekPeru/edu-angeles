import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardPen, Eraser, Eye, FileSpreadsheet, NotebookPen, Pencil, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { FilterLabel, LEVELS, Select, addDaysISO, todayLima } from '../attendance/shared'
import { AttentionForm, ConfidentialNote, REASONS, RISKS, caseLink, classroom, dmy, opts, studentLink, timeRange } from './shared'
import { exportAdministrativeReport } from './reportColumns'

const KINDS = [['puntual', 'Atención puntual'], ['caso', 'Con seguimiento (caso)']]

/** Registro de atenciones (manual §3): every intervention actually carried out, punctual or within a case. */
export default function AttentionsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const today = todayLima()
  const [range, setRange] = useState({ from: addDaysISO(today, -30), to: today })
  const emptyFilters = { q: '', kind: '', reason: '', risk: '', level: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [attentions, setAttentions] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [exporting, setExporting] = useState(false)

  async function load() {
    setLoading(true)
    const result = await api(`/api/psychology/attentions?${new URLSearchParams(range)}`)
    setLoading(false)
    if (result.ok) setAttentions(result.attentions)
    else toast(result.error || 'No se pudieron cargar las atenciones.', 'bad')
  }
  useEffect(() => { load() }, [range.from, range.to])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return attentions.filter((item) =>
      (!filters.kind || (filters.kind === 'caso') === Boolean(item.caseId))
      && (!filters.reason || item.reason === filters.reason)
      && (!filters.risk || item.riskLevel === filters.risk)
      && (!filters.level || item.student.level === filters.level)
      && (!term || `${item.student.name} ${item.student.code} ${item.student.dni} ${item.caseCode} ${classroom(item.student)}`.toLowerCase().includes(term)))
  }, [attentions, filters])

  async function exportData() {
    if (!visible.length) return toast('No hay atenciones para exportar.', 'bad')
    setExporting(true)
    const result = await api(`/api/psychology/export?${new URLSearchParams(range)}`)
    setExporting(false)
    if (!result.ok) return toast(result.error || 'No se pudo preparar el reporte.', 'bad')
    const shown = new Set(visible.map((item) => item.id))
    exportAdministrativeReport(result.rows.filter((row) => shown.has(row.attentionId)), `Del ${dmy(range.from)} al ${dmy(range.to)}`)
      .then(() => toast('Reporte de atenciones exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  const punctual = attentions.filter((item) => !item.caseId).length
  return (
    <div className="space-y-4">
      <PageHeader
        icon={NotebookPen}
        title="Registro de atenciones"
        description="Cada intervención psicológica realizada, puntual o con necesidad de seguimiento."
        actions={(
          <>
            <Button type="button" variant="outline" disabled={exporting} onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> {exporting ? 'Preparando…' : 'Exportar Excel'}</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Registrar atención</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardPen} value={attentions.length} label="Atenciones en el periodo" />
        <StatCard tone="green" icon={NotebookPen} value={punctual} label="Atenciones puntuales" onClick={() => setFilters({ ...filters, kind: 'puntual' })} />
        <StatCard tone="amber" icon={NotebookPen} value={attentions.length - punctual} label="Con seguimiento (caso)" onClick={() => setFilters({ ...filters, kind: 'caso' })} />
        <StatCard tone="blue" icon={NotebookPen} value={new Set(attentions.map((item) => item.student.id)).size} label="Estudiantes atendidos" />
      </div>

      <Panel title="Atenciones registradas" icon={ClipboardPen}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <FilterLabel label="Buscar" className="sm:col-span-2"><Input placeholder="Estudiante, código, DNI o caso" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <FilterLabel label="Tipo"><Select value={filters.kind} onChange={(kind) => setFilters({ ...filters, kind })} options={[{ value: '', label: 'Todos' }, ...KINDS.map(([value, label]) => ({ value, label }))]} /></FilterLabel>
          <FilterLabel label="Motivo"><Select value={filters.reason} onChange={(reason) => setFilters({ ...filters, reason })} options={opts(REASONS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Riesgo"><Select value={filters.risk} onChange={(risk) => setFilters({ ...filters, risk })} options={opts(RISKS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Nivel"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVELS, 'Todos')} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar filtros</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay atenciones registradas en este periodo.'}
          columns={[
            { key: 'date', label: 'Fecha y hora', render: (item) => <span className="whitespace-nowrap">{dmy(item.date)}<span className="block text-xs text-muted-foreground">{timeRange(item)}</span></span> },
            { key: 'student', label: 'Estudiante', render: (item) => <Link to={studentLink(item.student.id)} className="hover:text-primary"><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{item.student.code} · {classroom(item.student)}</span></Link> },
            { key: 'kind', label: 'Tipo', render: (item) => (item.caseId ? <Link to={caseLink(item.caseId)} className="font-semibold text-primary hover:underline">Caso {item.caseCode}</Link> : <span className="text-muted-foreground">Puntual</span>) },
            { key: 'reason', label: 'Motivo' },
            { key: 'risk', label: 'Riesgo', render: (item) => (item.riskLevel ? <Pill value={item.riskLevel} /> : '—') },
            { key: 'by', label: 'Registrado por', render: (item) => <span className="text-xs">{item.createdBy || '—'}</span> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver atención" aria-label="Ver atención" onClick={() => setViewing(item)}><Eye /></Button>
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar atención" aria-label="Editar atención" onClick={() => setForm(item)}><Pencil /></Button>}
              </span>
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <AttentionForm attention={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load() }} />}
      {viewing && <AttentionView item={viewing} onClose={() => setViewing(null)} onEdit={canEdit ? () => { setForm(viewing); setViewing(null) } : null} />}
    </div>
  )
}

function Row({ label, children }) {
  return <><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd></>
}

export function AttentionView({ item, onClose, onEdit }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atención del {dmy(item.date)}</DialogTitle>
          <DialogDescription>{item.student.name} · {item.student.code} · {classroom(item.student)}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1.5 text-sm">
          <Row label="Horario">{timeRange(item)}</Row>
          <Row label="Tipo">{item.caseId ? `Con seguimiento · Caso ${item.caseCode}` : 'Atención puntual'}</Row>
          <Row label="Motivo">{item.reason}</Row>
          <Row label="Derivado por">{[item.referredBy, item.referrerName].filter(Boolean).join(' · ')}</Row>
          <Row label="Nivel de riesgo">{item.riskLevel}</Row>
          <Row label="Descripción">{item.notes}</Row>
          <Row label="Acuerdos / Orientaciones">{item.agreements}</Row>
          <Row label="Motivo administrativo">{item.adminReason}</Row>
          <Row label="Observación administrativa">{item.adminNotes}</Row>
          <Row label="Registrado por">{item.createdBy}</Row>
        </dl>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          {onEdit && <Button type="button" onClick={onEdit}><Pencil /> Editar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
