import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarPlus, Eye, FileSpreadsheet, Pencil, Plus, Send, Trash2, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Filters, PageHeader, Panel, Pill, Table } from '../campus/kit'
import { Select } from '../attendance/shared'
import { CASE_STATUS, CaseForm, ConfidentialNote, REASONS, RISKS, ReferralForm, SessionForm, classroom, opts, shortDate } from './shared'

export default function CasesPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const [params, setParams] = useSearchParams()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ q: '', status: 'activos', risk: '', reason: '' })
  const [editing, setEditing] = useState(undefined)
  const [version, setVersion] = useState(0)
  const openId = Number(params.get('caso')) || null

  async function load() {
    const result = await api('/api/psychology/cases')
    setLoading(false)
    if (result.ok) setCases(result.cases)
    else toast(result.error || 'No se pudieron cargar los casos.', 'bad')
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    return cases.filter((item) =>
      (filters.status === 'activos' ? item.status !== 'Cerrado' : !filters.status || item.status === filters.status)
      && (!filters.risk || item.riskLevel === filters.risk)
      && (!filters.reason || item.reason === filters.reason)
      && (!term || `${item.code} ${item.student.name} ${item.student.code} ${classroom(item.student)}`.toLowerCase().includes(term)))
  }, [cases, filters])

  const openCase = (id) => setParams(id ? { caso: String(id) } : {})

  function exportData() {
    if (!visible.length) return toast('No hay casos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Atención psicológica · Estudiantes atendidos',
      subtitle: `Exportado el ${new Date().toLocaleDateString('es-PE')} · Información confidencial`,
      summary: [['Casos', visible.length], ['Riesgo alto', visible.filter((item) => item.riskLevel === 'Alto').length]],
      headers: ['Código', 'Estudiante', 'Nivel', 'Grado y sección', 'Apertura', 'Motivo', 'Derivado por', 'Riesgo', 'Estado', 'Sesiones realizadas', 'Última sesión', 'Cierre'],
      widths: [12, 32, 12, 14, 13, 20, 24, 10, 16, 12, 14, 13],
      rows: visible.map((item) => [item.code, item.student.name, item.student.level, `${item.student.grade} ${item.student.section}`, item.openedOn, item.reason,
        [item.referredBy, item.referrerName].filter(Boolean).join(' · '), item.riskLevel, item.status, item.sessionsDone, item.lastSession || '—', item.closedOn || '—']),
    }).then(() => toast('Casos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title="Estudiantes atendidos"
        description="Un caso por estudiante con su motivo, nivel de riesgo, sesiones y derivaciones."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setEditing(null)}><Plus /> Nuevo caso</Button>}
          </>
        )}
      />
      <ConfidentialNote />

      <Panel title="Casos por estudiante" icon={Users}>
        <Filters>
          <Input placeholder="Buscar por estudiante, código o grado" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
          <Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[{ value: 'activos', label: 'Casos activos' }, { value: '', label: 'Todos los estados' }, ...opts(CASE_STATUS)]} />
          <Select value={filters.risk} onChange={(risk) => setFilters({ ...filters, risk })} options={opts(RISKS, 'Todos los riesgos')} />
          <Select value={filters.reason} onChange={(reason) => setFilters({ ...filters, reason })} options={opts(REASONS, 'Todos los motivos')} />
        </Filters>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay casos con estos filtros.'}
          columns={[
            { key: 'code', label: 'Código', render: (item) => <span className="font-semibold">{item.code}</span> },
            { key: 'student', label: 'Estudiante', render: (item) => <span><span className="block font-medium">{item.student.name}</span><span className="text-xs text-muted-foreground">{classroom(item.student)}</span></span> },
            { key: 'reason', label: 'Motivo' },
            { key: 'opened', label: 'Apertura', render: (item) => shortDate(item.openedOn) },
            { key: 'risk', label: 'Riesgo', render: (item) => <Pill value={item.riskLevel} /> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.status} /> },
            { key: 'sessions', label: 'Sesiones', render: (item) => <span>{item.sessionsDone}{item.nextSession && <span className="block text-xs text-muted-foreground">Próx.: {shortDate(item.nextSession)} {item.nextSession.slice(11)}</span>}</span> },
            { key: 'actions', label: 'Acciones', render: (item) => <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" title="Ver caso" aria-label={`Ver caso ${item.code}`} onClick={() => openCase(item.id)}><Eye /></Button> },
          ]}
        />
      </Panel>

      {editing !== undefined && <CaseForm item={editing} onClose={() => setEditing(undefined)} onSaved={(id) => { setEditing(undefined); setVersion((value) => value + 1); load(); openCase(id) }} />}
      {openId && <CaseDetail key={`${openId}-${version}`} id={openId} canEdit={canEdit} onClose={() => openCase(null)} onEdit={(item) => setEditing(item)} onChanged={load} />}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  )
}

/** Case card with its session history; reloads itself after every change. */
function CaseDetail({ id, canEdit, onClose, onEdit, onChanged }) {
  const { toast } = useApp()
  const [data, setData] = useState(null)
  const [session, setSession] = useState(undefined)
  const [referral, setReferral] = useState(undefined)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const result = await api(`/api/psychology/cases/${id}`)
    if (result.ok) setData(result)
    else { toast(result.error || 'No se pudo abrir el caso.', 'bad'); onClose() }
  }
  useEffect(() => { load() }, [id])

  async function removeCase() {
    const result = await api(`/api/psychology/cases/${id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el caso.', 'bad')
    toast('Caso eliminado.')
    onChanged()
    onClose()
  }

  async function removeSession(item) {
    const result = await api(`/api/psychology/sessions/${item.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar la sesión.', 'bad')
    toast('Sesión eliminada.')
    load()
    onChanged()
  }

  async function removeReferral(entry) {
    const result = await api(`/api/psychology/referrals/${entry.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar la derivación.', 'bad')
    toast('Derivación eliminada.')
    load()
    onChanged()
  }

  const item = data?.case
  const closed = item?.status === 'Cerrado'
  const caseLabel = item ? `Caso ${item.code} · ${item.student.name}` : ''
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {!item ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">Caso {item.code} <Pill value={item.status} /> <Pill value={item.riskLevel} /></DialogTitle>
              <DialogDescription>{item.student.name} · {classroom(item.student)}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <Info label="Apertura" value={shortDate(item.openedOn)} />
              <Info label="Motivo" value={item.reason} />
              <Info label="Derivado por" value={[item.referredBy, item.referrerName].filter(Boolean).join(' · ')} />
              <Info label="Sesiones realizadas" value={String(item.sessionsDone)} />
              <Info label="Registrado por" value={item.createdBy} />
              <Info label="Cierre" value={item.closedOn ? shortDate(item.closedOn) : ''} />
              <div className="sm:col-span-3"><Info label="Descripción" value={<span className="whitespace-pre-wrap">{item.description}</span>} /></div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Sesiones y citas</h3>
              {canEdit && !closed && <Button type="button" size="sm" onClick={() => setSession(null)}><CalendarPlus /> Nueva sesión</Button>}
            </div>
            {closed && <p className="text-xs text-muted-foreground">El caso está cerrado. Cambia su estado para registrar nuevas sesiones.</p>}
            <ol className="space-y-2">
              {data.sessions.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{shortDate(entry.date)} · {entry.time} <span className="font-normal text-muted-foreground">· {entry.type}</span></p>
                    <div className="flex items-center gap-1">
                      <Pill value={entry.status} />
                      {canEdit && <Button type="button" variant="ghost" size="icon" className="size-7" title="Editar sesión" aria-label="Editar sesión" onClick={() => setSession(entry)}><Pencil /></Button>}
                      {canEdit && <Button type="button" variant="ghost" size="icon" className="size-7 text-[#9a2f2a]" title="Eliminar sesión" aria-label="Eliminar sesión" onClick={() => removeSession(entry)}><Trash2 /></Button>}
                    </div>
                  </div>
                  {entry.notes && <p className="mt-1.5 whitespace-pre-wrap text-foreground/90">{entry.notes}</p>}
                  {entry.agreements && <p className="mt-1.5 whitespace-pre-wrap text-xs"><span className="font-semibold">Acuerdos:</span> {entry.agreements}</p>}
                  {entry.createdBy && <p className="mt-1 text-[11px] text-muted-foreground">Registrado por {entry.createdBy}</p>}
                </li>
              ))}
              {!data.sessions.length && <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aún no hay sesiones registradas.</li>}
            </ol>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Derivaciones</h3>
              {canEdit && <Button type="button" size="sm" variant="outline" onClick={() => setReferral(null)}><Send /> Nueva derivación</Button>}
            </div>
            <ul className="space-y-2">
              {data.referrals.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{entry.institution}{entry.specialist && <span className="font-normal text-muted-foreground"> · {entry.specialist}</span>} <span className="font-normal text-muted-foreground">· {shortDate(entry.date)}</span></p>
                    <div className="flex items-center gap-1">
                      <Pill value={entry.status} />
                      {canEdit && <Button type="button" variant="ghost" size="icon" className="size-7" title="Editar derivación" aria-label="Editar derivación" onClick={() => setReferral(entry)}><Pencil /></Button>}
                      {canEdit && <Button type="button" variant="ghost" size="icon" className="size-7 text-[#9a2f2a]" title="Eliminar derivación" aria-label="Eliminar derivación" onClick={() => removeReferral(entry)}><Trash2 /></Button>}
                    </div>
                  </div>
                  {entry.reason && <p className="mt-1.5 whitespace-pre-wrap">{entry.reason}</p>}
                  {entry.response && <p className="mt-1.5 whitespace-pre-wrap text-xs"><span className="font-semibold">Respuesta:</span> {entry.response}</p>}
                </li>
              ))}
              {!data.referrals.length && <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Sin derivaciones a otras instituciones.</li>}
            </ul>

            <DialogFooter className="gap-2 sm:justify-between">
              {canEdit ? <Button type="button" variant="ghost" className="text-[#9a2f2a]" onClick={() => setDeleting(true)}><Trash2 /> Eliminar caso</Button> : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
                {canEdit && <Button type="button" onClick={() => onEdit(item)}><Pencil /> Editar caso</Button>}
              </div>
            </DialogFooter>
          </>
        )}

        {session !== undefined && (
          <SessionForm
            caseId={id}
            caseLabel={caseLabel}
            session={session}
            onClose={() => setSession(undefined)}
            onSaved={() => { setSession(undefined); load(); onChanged() }}
          />
        )}
        {referral !== undefined && (
          <ReferralForm
            caseId={id}
            caseLabel={caseLabel}
            referral={referral}
            onClose={() => setReferral(undefined)}
            onSaved={() => { setReferral(undefined); load(); onChanged() }}
          />
        )}
        <Dialog open={deleting} onOpenChange={setDeleting}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Eliminar el caso {item?.code}?</DialogTitle>
              <DialogDescription>Se eliminarán también sus {data?.sessions.length || 0} sesiones y {data?.referrals.length || 0} derivaciones. Esta acción no se puede deshacer; si el caso terminó, es mejor cambiar su estado a «Cerrado».</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancelar</Button>
              <Button type="button" variant="destructive" onClick={removeCase}>Sí, eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
