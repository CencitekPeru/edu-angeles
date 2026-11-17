import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Coins, Eraser, FileSpreadsheet, HandCoins, Plus, RotateCcw, Save, Search, Trash2, UserRound, Users, Wallet, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { FINE_STATUS, soles } from '../../lib/guardianMeetings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import { CountedText, Field, FilterLabel, FormHeader, FormNote, Select, dmy, opts, useList } from '../documents/shared'
import { FineActionDialog, PARENTS } from './shared'

/** «Registro de multas»: fines for missed meetings (and other obligations), and the parents who still owe. */
export default function FinesPage() {
  const { toast } = useApp()
  const canEdit = useCan('padres')
  const [fines, loading, reload] = useList('/api/parent-fines', 'fines')
  const [tab, setTab] = useState('debtors')
  const emptyFilters = { status: 'Pendiente', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [action, setAction] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const pending = fines.filter((fine) => fine.status === 'Pendiente')
  const total = (list) => list.reduce((sum, fine) => sum + fine.amount, 0)
  const term = filters.q.trim().toLowerCase()
  const matches = (fine) => !term || `${fine.guardian.name} ${fine.guardian.dni} ${fine.guardian.students} ${fine.concept}`.toLowerCase().includes(term)
  const visible = fines.filter((fine) => (!filters.status || fine.status === filters.status) && matches(fine))

  // One row per guardian who owes, with their pending fines added up.
  const debtors = Object.values(pending.filter(matches).reduce((map, fine) => {
    const entry = map[fine.guardian.id] || { id: fine.guardian.id, guardian: fine.guardian, count: 0, amount: 0, oldest: fine.issuedOn, fines: [] }
    entry.count += 1
    entry.amount += fine.amount
    entry.fines.push(fine)
    if (fine.issuedOn < entry.oldest) entry.oldest = fine.issuedOn
    map[fine.guardian.id] = entry
    return map
  }, {})).sort((a, b) => b.amount - a.amount || a.guardian.name.localeCompare(b.guardian.name, 'es'))

  async function remove() {
    const result = await api(`/api/parent-fines/${deleting.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar.', 'bad')
    toast('Multa eliminada.')
    setDeleting(null)
    reload()
  }

  function exportData() {
    const rows = tab === 'debtors'
      ? debtors.map((item) => [item.guardian.dni, item.guardian.name, item.guardian.phone || '—', item.guardian.students, item.count, soles(item.amount), dmy(item.oldest)])
      : visible.map((fine) => [dmy(fine.issuedOn), fine.guardian.dni, fine.guardian.name, fine.guardian.students, fine.concept, soles(fine.amount), fine.status, dmy(fine.paidOn), fine.receipt || '—', fine.note || '—'])
    if (!rows.length) return toast('No hay datos para exportar.', 'bad')
    exportTableXlsx(tab === 'debtors'
      ? { title: 'Padres con obligaciones pendientes', summary: [['Padres con deuda', debtors.length], ['Deuda total', soles(total(pending))]], headers: ['DNI', 'Padre / Apoderado', 'Teléfono', 'Estudiante(s)', 'Multas pendientes', 'Deuda', 'Desde'], widths: [11, 30, 14, 44, 10, 12, 12], rows }
      : { title: 'Registro de multas', subtitle: filters.status ? `Estado: ${filters.status}` : 'Todas', headers: ['Fecha', 'DNI', 'Padre / Apoderado', 'Estudiante(s)', 'Concepto', 'Monto', 'Estado', 'Pagada el', 'Recibo', 'Observación'], widths: [12, 11, 28, 40, 36, 10, 11, 12, 14, 30], rows },
    ).then(() => toast('Exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Wallet}
        title="Registro de multas"
        description="Multas por inasistencia a reuniones y asambleas | Identificación de padres con obligaciones pendientes."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setCreating(true)}><Plus /> Registrar multa</Button>}
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="red" icon={Coins} value={soles(total(pending))} label="Deuda pendiente total" onClick={() => setTab('debtors')} />
        <StatCard tone="amber" icon={Users} value={new Set(pending.map((fine) => fine.guardian.id)).size} label="Padres con deuda" onClick={() => setTab('debtors')} />
        <StatCard icon={Wallet} value={pending.length} label="Multas pendientes" onClick={() => { setTab('fines'); setFilters({ ...filters, status: 'Pendiente' }) }} />
        <StatCard tone="green" icon={HandCoins} value={soles(total(fines.filter((fine) => fine.status === 'Pagada')))} label="Total cobrado" onClick={() => { setTab('fines'); setFilters({ ...filters, status: 'Pagada' }) }} />
      </div>

      <Panel title={tab === 'debtors' ? `Padres con obligaciones pendientes (${debtors.length})` : `Multas (${visible.length})`} icon={tab === 'debtors' ? Users : Wallet}>
        <div className="mb-4 flex flex-wrap items-end gap-2.5">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="tablist">
            {[['debtors', 'Padres con deuda'], ['fines', 'Todas las multas']].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', tab === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{label}</button>
            ))}
          </div>
          {tab === 'fines' && <FilterLabel label="Estado" className="w-44"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(FINE_STATUS, 'Todos')} /></FilterLabel>}
          <FilterLabel label="Buscar" className="min-w-64 flex-1">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por apoderado, DNI, estudiante o concepto…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button>
        </div>

        {tab === 'debtors' ? (
          <Table
            rows={debtors}
            empty={loading ? 'Cargando…' : 'Ningún padre o apoderado tiene deudas pendientes.'}
            columns={[
              { key: 'guardian', label: 'Padre / Apoderado', render: (item) => <span><span className="block font-semibold">{item.guardian.name}</span><span className="text-xs text-muted-foreground tabular-nums">DNI {item.guardian.dni}{item.guardian.phone ? ` · ${item.guardian.phone}` : ''}</span></span> },
              { key: 'students', label: 'Estudiante(s)', render: (item) => <span className="block max-w-80 text-xs text-muted-foreground">{item.guardian.students || '—'}</span> },
              { key: 'count', label: 'Multas', render: (item) => <span className="tabular-nums">{item.count}</span> },
              { key: 'amount', label: 'Deuda', render: (item) => <span className="font-extrabold text-[#9a2f2a] tabular-nums dark:text-red-300">{soles(item.amount)}</span> },
              { key: 'oldest', label: 'Desde', render: (item) => <span className="tabular-nums">{dmy(item.oldest)}</span> },
              { key: 'actions', label: 'Acciones', render: (item) => (
                <span className="flex gap-1">
                  <Button asChild size="sm" variant="outline"><Link to={`${PARENTS.lookup}?dni=${item.guardian.dni}`}><UserRound /> Ver detalle</Link></Button>
                  {canEdit && item.count === 1 && <Button type="button" size="sm" onClick={() => setAction({ fine: item.fines[0], mode: 'pay' })}><HandCoins /> Cobrar</Button>}
                </span>
              ) },
            ]}
          />
        ) : (
          <Table
            rows={visible}
            empty={loading ? 'Cargando…' : 'No hay multas con estos filtros.'}
            columns={[
              { key: 'issued', label: 'Fecha', render: (fine) => <span className="whitespace-nowrap tabular-nums">{dmy(fine.issuedOn)}</span> },
              { key: 'guardian', label: 'Padre / Apoderado', render: (fine) => <span><span className="block font-semibold">{fine.guardian.name}</span><span className="text-xs text-muted-foreground tabular-nums">DNI {fine.guardian.dni}</span></span> },
              { key: 'concept', label: 'Concepto', render: (fine) => <span className="block max-w-72">{fine.concept}{fine.meeting && <span className="block text-xs text-muted-foreground">{fine.meeting.type} · {dmy(fine.meeting.date)}</span>}</span> },
              { key: 'amount', label: 'Monto', render: (fine) => <span className="font-semibold tabular-nums">{soles(fine.amount)}</span> },
              { key: 'status', label: 'Estado', render: (fine) => (
                <span><Pill value={fine.status} />
                  {fine.status === 'Pagada' && <span className="mt-0.5 block text-[11px] text-muted-foreground">{dmy(fine.paidOn)}{fine.receipt ? ` · Rec. ${fine.receipt}` : ''}</span>}
                  {fine.status === 'Exonerada' && fine.note && <span className="mt-0.5 block max-w-52 truncate text-[11px] text-muted-foreground" title={fine.note}>{fine.note}</span>}
                </span>
              ) },
              { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (fine) => (
                <span className="flex gap-1">
                  {fine.status === 'Pendiente' && <Button type="button" size="sm" onClick={() => setAction({ fine, mode: 'pay' })}><HandCoins /> Cobrar</Button>}
                  {fine.status === 'Pendiente' && <Button type="button" variant="ghost" size="icon" className="size-8" title="Exonerar" aria-label="Exonerar multa" onClick={() => setAction({ fine, mode: 'waive' })}><BadgeCheck /></Button>}
                  {fine.status !== 'Pendiente' && <Button type="button" variant="ghost" size="icon" className="size-8" title="Volver a pendiente" aria-label="Volver a pendiente" onClick={() => setAction({ fine, mode: 'reopen' })}><RotateCcw /></Button>}
                  {fine.status !== 'Pagada' && <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10" title="Eliminar" aria-label="Eliminar multa" onClick={() => setDeleting(fine)}><Trash2 /></Button>}
                </span>
              ) },
            ]}
          />
        )}
      </Panel>

      {action && <FineActionDialog fine={action.fine} mode={action.mode} onClose={() => setAction(null)} onDone={() => { setAction(null); reload() }} />}
      {creating && <ManualFineForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar multa</DialogTitle>
            <DialogDescription>¿Eliminar la multa de {deleting?.guardian.name} por «{deleting?.concept}» ({soles(deleting?.amount)})? Si fue por una inasistencia equivocada, es mejor corregir la asistencia de la reunión.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={remove}><Trash2 /> Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Fine not tied to a meeting (another obligation). The guardian is found by DNI. */
function ManualFineForm({ onClose, onSaved }) {
  const { toast } = useApp()
  const [form, setForm] = useState({ dni: '', concept: '', amount: '', issuedOn: todayLima(), note: '' })
  const [found, setFound] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function check(dni) {
    set({ dni })
    setFound(null)
    if (dni.length !== 8) return
    const result = await api(`/api/guardians/lookup?dni=${dni}`)
    setFound(result.ok ? result : { error: result.error })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const result = await api('/api/parent-fines', { method: 'POST', body: form })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo registrar.', 'bad')
    toast('Multa registrada.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <FormHeader icon={Wallet} title="Registrar multa" text="Multa u obligación que no proviene de una reunión (las de inasistencia se generan solas)." />
        <form id="manual-fine" className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
          <Field label="DNI del padre o apoderado" required className="sm:col-span-2">
            <Input inputMode="numeric" value={form.dni} onChange={(event) => check(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 dígitos" required />
          </Field>
          {found?.guardian && <p className="rounded-lg border border-border bg-slate-50 p-2.5 text-sm sm:col-span-2 dark:bg-muted/40"><span className="font-semibold">{found.guardian.name}</span> · {found.students.map((student) => student.name).join('; ') || 'sin estudiantes activos'}{found.pendingCount ? <span className="block text-xs font-semibold text-[#9a2f2a]">Ya debe {soles(found.pendingAmount)}</span> : null}</p>}
          {found?.error && <p className="text-xs font-semibold text-destructive sm:col-span-2">{found.error}</p>}
          <Field label="Concepto" required className="sm:col-span-2"><Input value={form.concept} onChange={(event) => set({ concept: event.target.value })} maxLength={200} placeholder="Ej. Inasistencia a faena de limpieza" required /></Field>
          <Field label="Monto (S/)" required><Input type="number" min="0.5" step="0.50" value={form.amount} onChange={(event) => set({ amount: event.target.value })} required /></Field>
          <Field label="Fecha" required><Input type="date" value={form.issuedOn} onChange={(event) => set({ issuedOn: event.target.value })} required /></Field>
          <Field label="Observación" className="sm:col-span-2"><CountedText rows={2} max={255} value={form.note} onChange={(note) => set({ note })} /></Field>
        </form>
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <FormNote>Los campos marcados con <span className="text-destructive">*</span> son obligatorios.</FormNote>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="manual-fine" disabled={saving || !found?.guardian}><Save /> {saving ? 'Guardando…' : 'Registrar multa'}</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
