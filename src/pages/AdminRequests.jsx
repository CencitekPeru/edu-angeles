import { useMemo, useState } from 'react'
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Eraser,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Info,
  LayoutGrid,
  List,
  Search,
  Unlock,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCan } from '../lib/permissions'
import { STATUS, conflictingRequests, personName } from '../lib/reservations'
import { isPastEnd } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, StatCard } from './campus/kit'
import { FilterLabel, Pager, Select, StatusChip, allOption, dmy, longDate, tableHead, td, th, usePaged } from './attendance/shared'
import { REQUEST_META, createdParts, requestCode } from './reservations/shared'

const EMPTY_FILTERS = { room: '', status: '', grade: '', section: '', teacher: '', from: '', to: '' }

export default function AdminRequests() {
  const { requests, users, rooms, decideRequest, cancelRequest, toast } = useApp()
  const canDecide = useCan()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState(null)
  const [modal, setModal] = useState(null)
  const [note, setNote] = useState('')
  const [modalError, setModalError] = useState('')

  const grades = useMemo(() => [...new Set(requests.map((item) => item.grade))].sort(), [requests])
  const sections = useMemo(() => [...new Set(requests.map((item) => item.section))].sort(), [requests])

  const visible = useMemo(() => {
    const text = filters.teacher.trim().toLowerCase()
    return requests
      .filter((item) => !filters.room || String(item.roomId) === filters.room)
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.grade || item.grade === filters.grade)
      .filter((item) => !filters.section || item.section === filters.section)
      .filter((item) => !filters.from || item.date >= filters.from)
      .filter((item) => !filters.to || item.date <= filters.to)
      .filter((item) => !text || `${personName(users, item.teacherId)} ${item.purpose}`.toLowerCase().includes(text))
      .sort((a, b) => {
        const rank = { pending: 0, approved: 1, rejected: 2, cancelled: 3 }
        return rank[a.status] - rank[b.status] || (b.date + b.startTime).localeCompare(a.date + a.startTime)
      })
  }, [requests, users, filters])

  const { rows, pager } = usePaged(visible, 10)
  const selected = requests.find((item) => item.id === selectedId) || visible[0] || null
  const count = (status) => requests.filter((item) => item.status === status).length

  function open(type, request) {
    setNote('')
    setModalError('')
    setModal({ type, request })
  }

  async function approve() {
    const result = await decideRequest(modal.request.id, 'approved')
    if (!result.ok) {
      const who = (result.conflicts || []).map((item) => personName(users, item.teacherId)).join(', ')
      setModalError(who ? `${result.error} Cruce con ${who}.` : result.error)
      return
    }
    toast('Solicitud aprobada.')
    setModal(null)
  }

  async function reject() {
    const result = await decideRequest(modal.request.id, 'rejected', note)
    if (!result.ok) return setModalError(result.error)
    toast('Solicitud rechazada.')
    setModal(null)
  }

  async function release() {
    const result = await cancelRequest(modal.request.id)
    if (!result.ok) return setModalError(result.error)
    toast('Horario liberado.')
    setModal(null)
  }

  function rowState(item) {
    const conflicts = conflictingRequests(requests, { date: item.date, start: item.startTime, end: item.endTime, ignoreId: item.id, roomId: item.roomId })
    return { conflicts, finished: isPastEnd(item.date, item.endTime) }
  }

  const detail = selected ? rowState(selected) : null

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarCheck} title="Solicitudes de reserva" description="Gestión, revisión y aprobación de solicitudes de uso de ambientes." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={FileText} value={requests.length} label="Total de solicitudes" onClick={() => setFilters({ ...filters, status: '' })} />
        <StatCard tone="amber" icon={Clock} value={String(count('pending')).padStart(2, '0')} label="Pendientes" onClick={() => setFilters({ ...filters, status: 'pending' })} />
        <StatCard tone="green" icon={CheckCircle2} value={String(count('approved')).padStart(2, '0')} label="Aprobadas" onClick={() => setFilters({ ...filters, status: 'approved' })} />
        <StatCard tone="red" icon={XCircle} value={String(count('rejected')).padStart(2, '0')} label="Rechazadas" onClick={() => setFilters({ ...filters, status: 'rejected' })} />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <p className="flex items-center gap-2 rounded-t-xl border-b border-border bg-slate-50 px-4 py-2.5 text-[15px] font-bold dark:bg-muted/60"><Filter className="size-[18px] text-primary" /> Filtros de búsqueda</p>
        <div className="grid items-end gap-3 p-4 sm:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)_minmax(0,2fr)_auto]">
          <FilterLabel label="Ambiente"><Select value={filters.room} onChange={(room) => setFilters({ ...filters, room })} options={[allOption(), ...rooms.map((room) => ({ value: String(room.id), label: room.name }))]} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[allOption(), ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} /></FilterLabel>
          <FilterLabel label="Grado"><Select value={filters.grade} onChange={(grade) => setFilters({ ...filters, grade })} options={[allOption(), ...grades.map((value) => ({ value, label: value }))]} /></FilterLabel>
          <FilterLabel label="Sección"><Select value={filters.section} onChange={(section) => setFilters({ ...filters, section })} options={[allOption(), ...sections.map((value) => ({ value, label: value }))]} /></FilterLabel>
          <FilterLabel label="Docente">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filters.teacher} onChange={(event) => setFilters({ ...filters, teacher: event.target.value })} placeholder="Buscar docente…" className="pl-9" />
            </span>
          </FilterLabel>
          <FilterLabel label="Rango de fechas">
            <span className="flex items-center gap-1.5">
              <Input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-label="Desde" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-label="Hasta" />
            </span>
          </FilterLabel>
          <Button type="button" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}><Eraser /> Limpiar</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <p className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2.5 text-[15px] font-bold dark:bg-muted/60"><List className="size-[18px] text-primary" /> Listado de solicitudes</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>{['N.º', 'Docente', 'Ambiente', 'Grado', 'Sección', 'Estudiantes', 'Fecha', 'Horario', 'Actividad / Motivo', 'Estado', 'Fecha de registro', 'Acciones'].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const { conflicts, finished } = rowState(item)
                const created = createdParts(item.createdAt)
                return (
                  <tr key={item.id} onClick={() => setSelectedId(item.id)} className={cn('cursor-pointer border-t border-border/70 hover:bg-muted/30', selected?.id === item.id && 'bg-slate-50 dark:bg-blue-500/10')}>
                    <td className={cn(td, 'whitespace-nowrap font-semibold')}>{requestCode(item.id)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>{personName(users, item.teacherId)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>{item.roomName || '—'}</td>
                    <td className={td}>{item.grade}</td>
                    <td className={td}>{item.section}</td>
                    <td className={cn(td, 'text-center tabular-nums')}>{item.students}</td>
                    <td className={cn(td, 'tabular-nums')}>{dmy(item.date)}</td>
                    <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{item.startTime} – {item.endTime}</td>
                    <td className={cn(td, 'max-w-[200px] truncate')} title={item.purpose}>{item.purpose}</td>
                    <td className={td}>
                      <StatusChip status={item.status} meta={REQUEST_META} />
                      {item.status === 'pending' && conflicts.length > 0 && <p className="mt-1 text-[11px] font-semibold text-[#8a5a12]">Horario cruzado</p>}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{created.date} <span className="ml-1 text-muted-foreground">{created.time}</span></td>
                    <td className={td} onClick={(event) => event.stopPropagation()}>
                      <div className="flex gap-1">
                        <ActionButton label="Ver detalle" onClick={() => setSelectedId(item.id)} className="border-border text-primary hover:bg-muted"><Eye /></ActionButton>
                        {canDecide && item.status === 'pending' && (
                          <>
                            <ActionButton label="Aprobar" disabled={conflicts.length > 0 || finished} onClick={() => open('approve', item)} className="border-border text-[#2f6447] hover:bg-muted"><Check /></ActionButton>
                            <ActionButton label="Rechazar" onClick={() => open('reject', item)} className="border-border text-[#b4413c] hover:bg-muted"><X /></ActionButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">No hay solicitudes con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager {...pager} label="solicitudes" />
      </div>

      {selected && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <p className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2.5 text-[15px] font-bold dark:bg-muted/60"><Info className="size-[18px] text-primary" /> Detalle de la solicitud · {requestCode(selected.id)}</p>
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr_auto]">
            <dl className="space-y-3 text-sm">
              <DetailRow icon={UserRound} label="Docente" value={personName(users, selected.teacherId)} />
              <DetailRow icon={CalendarDays} label="Fecha de uso" value={longDate(selected.date)} />
              <DetailRow icon={Clock} label="Horario" value={`${selected.startTime} – ${selected.endTime}`} />
              <DetailRow icon={LayoutGrid} label="Actividad" value={selected.purpose} />
            </dl>
            <dl className="space-y-3 border-border text-sm lg:border-l lg:pl-5">
              <DetailRow icon={Building2} label="Ambiente" value={selected.roomName || '—'} />
              <DetailRow icon={GraduationCap} label="Grado / Sección" value={`${selected.grade} "${selected.section}"`} />
              <DetailRow icon={Users} label="Cantidad de estudiantes" value={<span className="rounded-md bg-slate-50 px-2.5 py-0.5 font-bold text-primary dark:bg-blue-500/15 dark:text-blue-200">{selected.students}</span>} />
              <DetailRow icon={FileText} label="Observaciones" value={selected.notes || selected.adminNote || '—'} />
            </dl>
            <div className="flex min-w-56 flex-col justify-center gap-3 border-border lg:border-l lg:pl-5">
              <StatusChip status={selected.status} meta={REQUEST_META} className="self-start" />
              {canDecide && selected.status === 'pending' && (
                <>
                  {detail.conflicts.length > 0 && (
                    <p className="text-xs font-semibold text-[#8a5a12] dark:text-amber-400">
                      Se cruza con {detail.conflicts.map((conflict) => `${personName(users, conflict.teacherId)} (${STATUS[conflict.status]})`).join(', ')}.
                    </p>
                  )}
                  {detail.finished && <p className="text-xs text-muted-foreground">Este horario ya transcurrió. Recházalo para archivarla.</p>}
                  <Button type="button" variant="outline" size="lg" className="border-border text-[#2f6447] hover:bg-muted" disabled={detail.conflicts.length > 0 || detail.finished} onClick={() => open('approve', selected)}><Check /> Aprobar solicitud</Button>
                  <Button type="button" variant="outline" size="lg" className="border-border text-[#b4413c] hover:bg-muted" onClick={() => open('reject', selected)}><X /> Rechazar solicitud</Button>
                </>
              )}
              {canDecide && selected.status === 'approved' && !detail.finished && (
                <Button type="button" variant="outline" onClick={() => open('release', selected)}><Unlock /> Liberar horario</Button>
              )}
              {selected.adminNote && selected.status !== 'pending' && <p className="text-xs text-muted-foreground">Nota: {selected.adminNote}</p>}
            </div>
          </div>
        </div>
      )}

      <Dialog open={Boolean(modal)} onOpenChange={(next) => { if (!next) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.type === 'approve' ? 'Aprobar solicitud de sala' : modal?.type === 'reject' ? 'Rechazar solicitud' : 'Liberar horario reservado'}
            </DialogTitle>
            <DialogDescription>
              {modal && `${personName(users, modal.request.teacherId)} · ${dmy(modal.request.date)} · ${modal.request.startTime}–${modal.request.endTime} (${modal.request.grade} ${modal.request.section})`}
            </DialogDescription>
          </DialogHeader>
          {modal && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-foreground">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Propósito pedagógico:</span>
              {modal.request.purpose}
            </div>
          )}
          {modal?.type === 'reject' && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold">Motivo del rechazo (opcional)</span>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. El bloque coincide con mantenimiento programado de la sala." />
            </div>
          )}
          {modalError && <p className="rounded-md bg-destructive/10 p-2.5 text-xs font-medium text-destructive">{modalError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            {modal?.type === 'approve' && <Button type="button" onClick={approve}>Confirmar aprobación</Button>}
            {modal?.type === 'reject' && <Button type="button" variant="destructive" onClick={reject}>Confirmar rechazo</Button>}
            {modal?.type === 'release' && <Button type="button" variant="destructive" onClick={release}>Confirmar liberación</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionButton({ label, onClick, disabled, className, children }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={cn('flex size-7 items-center justify-center rounded-md border bg-card transition-colors disabled:opacity-35 [&_svg]:size-4', className)}>
      {children}
    </button>
  )
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="grid grid-cols-[20px_150px_1fr] items-start gap-2">
      <Icon className="mt-0.5 size-4 text-foreground/70" />
      <dt className="font-semibold text-foreground">{label}:</dt>
      <dd className="text-foreground/85">{value}</dd>
    </div>
  )
}
