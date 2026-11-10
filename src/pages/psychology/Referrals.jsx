import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle2, Eraser, Eye, FileSpreadsheet, Hourglass, Pencil, Plus, Send, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { FilterLabel, LEVELS, Select, addDaysISO, todayLima } from '../attendance/shared'
import { ConfidentialNote, EXTERNAL_INSTITUTIONS, INTERNAL_AREAS, REFERRAL_STATUS, ReferralForm, caseLink, classroom, dmy, gradeSection, opts } from './shared'

/** Derivaciones (manual §6): referrals to internal areas or outside institutions, and their outcome. */
export default function ReferralsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const today = todayLima()
  const [range, setRange] = useState({ from: addDaysISO(today, -90), to: today })
  const emptyFilters = { q: '', status: '', destination: '', level: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)

  async function load() {
    setLoading(true)
    const result = await api(`/api/psychology/referrals?${new URLSearchParams(range)}`)
    setLoading(false)
    if (result.ok) setReferrals(result.referrals)
    else toast(result.error || 'No se pudieron cargar las derivaciones.', 'bad')
  }
  useEffect(() => { load() }, [range.from, range.to])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return referrals.filter((item) =>
      (!filters.status || item.status === filters.status)
      && (!filters.destination || item.institution === filters.destination)
      && (!filters.level || item.student.level === filters.level)
      && (!term || `${item.code} ${item.student.name} ${item.student.code} ${item.institution} ${item.motive}`.toLowerCase().includes(term)))
  }, [referrals, filters])
  const count = (status) => referrals.filter((item) => item.status === status).length

  function exportData() {
    if (!visible.length) return toast('No hay derivaciones para exportar.', 'bad')
    exportTableXlsx({
      title: 'Atención psicológica · Derivaciones',
      subtitle: `Del ${dmy(range.from)} al ${dmy(range.to)} · Información confidencial`,
      summary: [['Derivaciones', visible.length], ['En proceso', visible.filter((item) => item.status === 'En proceso').length]],
      headers: ['Código', 'Fecha', 'Estudiante', 'Código escolar', 'Nivel', 'Grado y sección', 'Caso', 'Motivo de derivación', 'Tipo de destino', 'Área / Institución de destino', 'Responsable / Contacto', 'Objetivo', 'Plazo de atención', 'Estado', 'Respuesta / Observaciones'],
      widths: [10, 12, 30, 13, 12, 12, 10, 24, 14, 30, 24, 36, 13, 12, 36],
      rows: visible.map((item) => [item.code, dmy(item.date), item.student.name, item.student.code, item.student.level, gradeSection(item.student), item.caseCode || '—',
        item.motive, item.destinationType === 'interna' ? 'Área interna' : 'Institución externa', item.institution, item.specialist || '—', item.objective, dmy(item.deadline) || '—', item.status, item.response || '']),
    }).then(() => toast('Derivaciones exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Send}
        title="Derivaciones"
        description="Registro y seguimiento de derivaciones a otras áreas o instituciones."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Nueva derivación</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Send} value={referrals.length} label="Derivaciones en el periodo" onClick={() => setFilters({ ...filters, status: '' })} />
        <StatCard tone="amber" icon={Hourglass} value={count('En proceso')} label="En proceso" onClick={() => setFilters({ ...filters, status: 'En proceso' })} />
        <StatCard tone="green" icon={CheckCircle2} value={count('Atendida')} label="Atendidas" onClick={() => setFilters({ ...filters, status: 'Atendida' })} />
        <StatCard tone="red" icon={XCircle} value={count('No atendida')} label="No atendidas" onClick={() => setFilters({ ...filters, status: 'No atendida' })} />
      </div>

      <Panel title={`Listado de derivaciones (${visible.length})`} icon={Send}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterLabel label="Buscar" className="sm:col-span-2 lg:col-span-4"><Input placeholder="Buscar por estudiante, código, área de destino o motivo…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></FilterLabel>
          <FilterLabel label="Desde"><Input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></FilterLabel>
          <FilterLabel label="Hasta"><Input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></FilterLabel>
          <FilterLabel label="Estado" className="lg:col-span-2"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(REFERRAL_STATUS, 'Todos los estados')} /></FilterLabel>
          <FilterLabel label="Área / Institución de destino" className="lg:col-span-2">
            <Select value={filters.destination} onChange={(destination) => setFilters({ ...filters, destination })} options={[{ value: '', label: 'Todas las áreas' }, ...[...INTERNAL_AREAS, ...EXTERNAL_INSTITUTIONS].map((value) => ({ value, label: value }))]} />
          </FilterLabel>
          <FilterLabel label="Nivel educativo"><Select value={filters.level} onChange={(level) => setFilters({ ...filters, level })} options={opts(LEVELS, 'Todos los niveles')} /></FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar filtros</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay derivaciones con estos filtros.'}
          columns={[
            { key: 'code', label: 'Código', render: (item) => <span className="font-semibold">{item.code}</span> },
            { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{item.student.code}</span></span> },
            { key: 'grade', label: 'Grado', render: (item) => gradeSection(item.student) },
            { key: 'motive', label: 'Motivo de derivación' },
            { key: 'destination', label: 'Área / Institución de destino', render: (item) => <span className="flex items-center gap-1.5"><Building2 className="size-4 shrink-0 text-muted-foreground" />{item.institution}</span> },
            { key: 'date', label: 'Fecha', render: (item) => dmy(item.date) },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver derivación" aria-label={`Ver derivación ${item.code}`} onClick={() => setViewing(item)}><Eye /></Button>
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar derivación" aria-label={`Editar derivación ${item.code}`} onClick={() => setForm(item)}><Pencil /></Button>}
              </span>
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <ReferralForm referral={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load() }} />}
      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">Derivación {viewing.code} <Pill value={viewing.status} /></DialogTitle>
              <DialogDescription>{viewing.student.name} · {viewing.student.code} · {classroom(viewing.student)}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Fecha</dt><dd>{dmy(viewing.date)}</dd>
              <dt className="text-muted-foreground">Caso</dt><dd>{viewing.caseId ? <Link className="text-primary hover:underline" to={caseLink(viewing.caseId)}>{viewing.caseCode}</Link> : 'Sin caso vinculado'}</dd>
              <dt className="text-muted-foreground">Motivo</dt><dd>{viewing.motive}</dd>
              <dt className="text-muted-foreground">Destino</dt><dd>{viewing.destinationType === 'interna' ? 'Área interna' : 'Institución externa'} · {viewing.institution}</dd>
              <dt className="text-muted-foreground">Responsable / Contacto</dt><dd>{viewing.specialist || '—'}</dd>
              <dt className="text-muted-foreground">Descripción</dt><dd className="whitespace-pre-wrap">{viewing.reason}</dd>
              <dt className="text-muted-foreground">Objetivo</dt><dd className="whitespace-pre-wrap">{viewing.objective || '—'}</dd>
              <dt className="text-muted-foreground">Plazo de atención</dt><dd>{dmy(viewing.deadline) || '—'}</dd>
              <dt className="text-muted-foreground">Respuesta / Observaciones</dt><dd className="whitespace-pre-wrap">{viewing.response || '—'}</dd>
              <dt className="text-muted-foreground">Registrado por</dt><dd>{viewing.createdBy || '—'}</dd>
            </dl>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {canEdit && <Button type="button" onClick={() => { setForm(viewing); setViewing(null) }}><Pencil /> Editar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
