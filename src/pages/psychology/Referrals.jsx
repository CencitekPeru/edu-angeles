import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Pencil, Plus, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Filters, PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { Select } from '../attendance/shared'
import { ConfidentialNote, INSTITUTIONS, REFERRAL_STATUS, ReferralForm, caseLink, classroom, opts, shortDate } from './shared'

/** Referrals of students to outside institutions and the answer received from each one. */
export default function ReferralsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ q: '', status: '', institution: '' })
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const result = await api('/api/psychology/referrals')
    setLoading(false)
    if (result.ok) setReferrals(result.referrals)
    else toast(result.error || 'No se pudieron cargar las derivaciones.', 'bad')
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return referrals.filter((item) =>
      (!filters.status || item.status === filters.status)
      && (!filters.institution || item.institution === filters.institution)
      && (!term || `${item.student.name} ${item.caseCode} ${item.institution} ${item.specialist}`.toLowerCase().includes(term)))
  }, [referrals, filters])
  const count = (status) => referrals.filter((item) => item.status === status).length

  function exportData() {
    if (!visible.length) return toast('No hay derivaciones para exportar.', 'bad')
    exportTableXlsx({
      title: 'Atención psicológica · Derivaciones',
      subtitle: `Exportado el ${new Date().toLocaleDateString('es-PE')} · Información confidencial`,
      summary: [['Derivaciones', visible.length], ['Pendientes', visible.filter((item) => item.status === 'Pendiente').length]],
      headers: ['Fecha', 'Estudiante', 'Grado y sección', 'Caso', 'Institución', 'Especialista / área', 'Motivo', 'Estado', 'Respuesta'],
      widths: [12, 30, 18, 11, 30, 22, 40, 13, 40],
      rows: visible.map((item) => [item.date, item.student.name, classroom(item.student), item.caseCode, item.institution, item.specialist || '', item.reason || '', item.status, item.response || '']),
    }).then(() => toast('Derivaciones exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Send}
        title="Derivaciones"
        description="Estudiantes derivados a instituciones externas (salud, DEMUNA, CEM…) y la respuesta recibida."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Nueva derivación</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {REFERRAL_STATUS.map((status) => (
          <StatCard key={status} tone={{ Pendiente: 'red', 'En atención': 'amber', Atendida: 'green' }[status] || 'blue'} icon={Send} value={count(status)} label={status} onClick={() => setFilters({ ...filters, status: filters.status === status ? '' : status })} />
        ))}
      </div>

      <Panel title="Derivaciones registradas" icon={Send}>
        <Filters className="lg:grid-cols-3">
          <Input placeholder="Buscar por estudiante, caso o institución" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
          <Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(REFERRAL_STATUS, 'Todos los estados')} />
          <Select value={filters.institution} onChange={(institution) => setFilters({ ...filters, institution })} options={opts(INSTITUTIONS, 'Todas las instituciones')} />
        </Filters>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay derivaciones con estos filtros.'}
          columns={[
            { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap">{shortDate(item.date)}</span> },
            { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{classroom(item.student)}</span></span> },
            { key: 'case', label: 'Caso', render: (item) => <Link to={caseLink(item.caseId)} className="font-semibold text-primary hover:underline">{item.caseCode}</Link> },
            { key: 'institution', label: 'Institución', render: (item) => <span>{item.institution}{item.specialist && <span className="block text-xs text-muted-foreground">{item.specialist}</span>}</span> },
            { key: 'reason', label: 'Motivo', render: (item) => <span className="line-clamp-2 max-w-72 text-xs">{item.reason || '—'}</span> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (item) => <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar derivación" aria-label="Editar derivación" onClick={() => setEditing(item)}><Pencil /></Button> },
          ]}
        />
      </Panel>

      {editing && (
        <ReferralForm
          caseId={editing.caseId}
          caseLabel={`Caso ${editing.caseCode} · ${editing.student.name}`}
          referral={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {creating && <NewReferral onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
    </div>
  )
}

/** Picks a case (any that is not closed) and opens the referral form for it. */
function NewReferral({ onClose, onSaved }) {
  const [cases, setCases] = useState(null)
  const [caseId, setCaseId] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api('/api/psychology/cases').then((result) => setCases(result.ok ? result.cases.filter((item) => item.status !== 'Cerrado') : []))
  }, [])
  const chosen = cases?.find((item) => String(item.id) === caseId)
  if (ready && chosen) return <ReferralForm caseId={chosen.id} caseLabel={`Caso ${chosen.code} · ${chosen.student.name}`} onClose={onClose} onSaved={onSaved} />
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva derivación</DialogTitle>
          <DialogDescription>Elige el caso del estudiante que se derivará a una institución externa.</DialogDescription>
        </DialogHeader>
        {cases === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
          <Select
            value={caseId}
            onChange={setCaseId}
            options={[{ value: '', label: cases.length ? 'Seleccione un caso' : 'No hay casos activos' }, ...cases.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.student.name} (${item.reason})` }))]}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!chosen} onClick={() => setReady(true)}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
