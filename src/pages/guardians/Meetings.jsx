import { useRef, useState } from 'react'
import {
  CalendarCheck, CalendarDays, CalendarPlus, ClipboardCheck, Clock, Coins, Eraser, FileSpreadsheet, Lock, MapPin, Pencil, Plus, Save, ScanLine, Search, Trash2, Users, X,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { GUARDIAN_ATTENDANCE, GUARDIAN_ATTENDANCE_LABEL, MEETING_STATUS, MEETING_TYPES, soles } from '../../lib/guardianMeetings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { GRADES, LEVELS, SECTIONS, todayLima } from '../attendance/shared'
import { CountedText, Field, FilterLabel, FORM_DIALOG, FormHeader, FormNote, Section, Select, dmy, opts, useList } from '../documents/shared'
import { AttendancePill, scopeLabel } from './shared'

const ATTENDANCE_TONE = {
  presente: 'border-[#3f7d5c] bg-[#f1f7f3] text-[#2f6447] dark:bg-emerald-500/10 dark:text-emerald-300',
  tardanza: 'border-[#b7832f] bg-[#fbf6ec] text-[#8a5a12] dark:bg-amber-500/10 dark:text-amber-300',
  falta: 'border-[#b4413c] bg-[#fbf1f0] text-[#9a2f2a] dark:bg-red-500/10 dark:text-red-300',
  justificado: 'border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

/** «Control de asistencia» of parents: meetings, assemblies and calls, and the roll call of each one. */
export default function MeetingsPage() {
  const { toast } = useApp()
  const canEdit = useCan('padres')
  const [meetings, loading, reload] = useList('/api/parent-meetings', 'meetings')
  const year = todayLima().slice(0, 4)
  const emptyFilters = { year, type: '', status: '', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState(undefined)
  const [roll, setRoll] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const ofYear = meetings.filter((item) => !filters.year || item.date.startsWith(filters.year))
  const term = filters.q.trim().toLowerCase()
  const visible = ofYear.filter((item) =>
    (!filters.type || item.type === filters.type) && (!filters.status || item.status === filters.status)
    && (!term || `${item.title} ${item.place} ${item.type}`.toLowerCase().includes(term)))
  const years = [...new Set([year, ...meetings.map((item) => item.date.slice(0, 4))])].sort().reverse()

  async function remove() {
    const result = await api(`/api/parent-meetings/${deleting.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar.', 'bad')
    toast('Convocatoria eliminada.')
    setDeleting(null)
    reload()
  }

  function exportData() {
    if (!visible.length) return toast('No hay convocatorias para exportar.', 'bad')
    exportTableXlsx({
      title: 'Reuniones de padres · Convocatorias',
      subtitle: filters.year ? `Año ${filters.year}` : 'Todos los años',
      headers: ['Fecha', 'Hora', 'Tipo', 'Tema', 'Lugar', 'Convocados', 'Multa por falta', 'Asistieron', 'Faltaron', 'Justificados', 'Multas pendientes', 'Estado'],
      widths: [12, 8, 22, 36, 20, 26, 12, 11, 10, 11, 14, 12],
      rows: visible.map((item) => [dmy(item.date), item.time || '—', item.type, item.title, item.place || '—', scopeLabel(item), soles(item.fineAmount),
        item.stats.attended, item.stats.absent, item.stats.justified, soles(item.stats.pending), item.status]),
    }).then(() => toast('Convocatorias exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardCheck}
        title="Control de asistencia de padres"
        description="Reuniones, asambleas y convocatorias institucionales | Registro de inasistencias de padres y apoderados."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Nueva convocatoria</Button>}
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarDays} value={ofYear.length} label="Convocatorias del año" onClick={() => setFilters({ ...filters, status: '' })} />
        <StatCard tone="blue" icon={CalendarPlus} value={ofYear.filter((item) => item.status === 'Programada').length} label="Programadas" onClick={() => setFilters({ ...filters, status: 'Programada' })} />
        <StatCard tone="green" icon={CalendarCheck} value={ofYear.filter((item) => item.status === 'Realizada').length} label="Realizadas" onClick={() => setFilters({ ...filters, status: 'Realizada' })} />
        <StatCard tone="red" icon={Coins} value={soles(ofYear.reduce((total, item) => total + item.stats.pending, 0))} label="Multas pendientes de cobro" />
      </div>

      <Panel title={`Convocatorias (${visible.length})`} icon={CalendarDays}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterLabel label="Año"><Select value={filters.year} onChange={(value) => setFilters({ ...filters, year: value })} options={opts(years, 'Todos')} /></FilterLabel>
          <FilterLabel label="Tipo"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(MEETING_TYPES, 'Todos')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(MEETING_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Buscar" className="sm:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por tema, lugar o tipo…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay convocatorias con estos filtros.'}
          columns={[
            { key: 'date', label: 'Fecha', render: (item) => <span className="whitespace-nowrap tabular-nums"><span className="block font-semibold">{dmy(item.date)}</span><span className="text-xs text-muted-foreground">{item.time || 'Sin hora'}</span></span> },
            { key: 'title', label: 'Convocatoria', render: (item) => (
              <span className="block max-w-72"><span className="block font-semibold">{item.title}</span><span className="text-xs text-muted-foreground">{item.type}{item.place ? ` · ${item.place}` : ''}</span></span>
            ) },
            { key: 'scope', label: 'Convocados', render: (item) => <span className="flex items-center gap-1.5 whitespace-nowrap"><Users className="size-4 text-muted-foreground" />{scopeLabel(item)}</span> },
            { key: 'fine', label: 'Multa por falta', render: (item) => <span className="tabular-nums">{item.fineAmount ? soles(item.fineAmount) : 'Sin multa'}</span> },
            { key: 'attendance', label: 'Asistencia', render: (item) => (item.closed || item.stats.attended || item.stats.absent
              ? <span className="text-xs whitespace-nowrap"><span className="font-semibold text-[#2f6447]">{item.stats.attended} asistieron</span> · <span className="font-semibold text-[#9a2f2a]">{item.stats.absent} faltaron</span>{item.stats.justified ? ` · ${item.stats.justified} just.` : ''}</span>
              : <span className="text-xs text-muted-foreground">Sin tomar</span>) },
            { key: 'status', label: 'Estado', render: (item) => <span className="flex items-center gap-1.5"><Pill value={item.status} />{item.closed && <Lock className="size-3.5 text-muted-foreground" aria-label="Asistencia cerrada" />}</span> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" variant={item.closed ? 'outline' : 'default'} disabled={item.status === 'Cancelada'} onClick={() => setRoll(item)}>
                  <ClipboardCheck /> {item.closed ? 'Ver asistencia' : 'Tomar asistencia'}
                </Button>
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar" aria-label={`Editar ${item.title}`} onClick={() => setForm(item)}><Pencil /></Button>}
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10" title="Eliminar" aria-label={`Eliminar ${item.title}`} onClick={() => setDeleting(item)}><Trash2 /></Button>}
              </span>
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <MeetingForm item={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload() }} />}
      {roll && <RollCall meeting={roll} canEdit={canEdit} onClose={() => { setRoll(null); reload() }} />}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar convocatoria</DialogTitle>
            <DialogDescription>¿Seguro que deseas eliminar «{deleting?.title}»? Se borrará su registro de asistencia y las multas pendientes que generó. No se puede deshacer.</DialogDescription>
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

/** «Nueva convocatoria». */
function MeetingForm({ item, onClose, onSaved }) {
  const { toast } = useApp()
  const editing = Boolean(item)
  const [form, setForm] = useState(() => (item
    ? { title: item.title, type: item.type, description: item.description, date: item.date, time: item.time, place: item.place, level: item.level, grade: item.grade, section: item.section, fineAmount: String(item.fineAmount), status: item.status }
    : { title: '', type: MEETING_TYPES[0], description: '', date: todayLima(), time: '', place: '', level: '', grade: '', section: '', fineAmount: '0', status: 'Programada' }))
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const locked = editing && item.closed

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const result = await api(editing ? `/api/parent-meetings/${item.id}` : '/api/parent-meetings', { method: editing ? 'PATCH' : 'POST', body: form })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Convocatoria actualizada.' : 'Convocatoria registrada. Ya puedes tomar la asistencia el día de la reunión.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={cn(FORM_DIALOG, 'sm:max-w-4xl')}>
        <FormHeader icon={CalendarPlus} title={editing ? 'Editar convocatoria' : 'Nueva convocatoria'} text="Reunión, asamblea o convocatoria institucional a padres y apoderados." />
        <form id="meeting-form" className="grid items-start gap-3 lg:grid-cols-2" onSubmit={save}>
          <Section icon={CalendarDays} title="Datos de la convocatoria" className="sm:grid-cols-2" outer="lg:row-span-2">
            <Field label="Tema / título" required className="sm:col-span-2"><Input value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={200} placeholder="Ej. Reunión de entrega de libretas – I bimestre" required /></Field>
            <Field label="Tipo" required className="sm:col-span-2"><Select value={form.type} onChange={(type) => set({ type })} options={opts(MEETING_TYPES)} /></Field>
            <Field label="Fecha" required><Input type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} required /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(event) => set({ time: event.target.value })} /></Field>
            <Field label="Lugar" className="sm:col-span-2">
              <span className="relative"><MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={form.place} onChange={(event) => set({ place: event.target.value })} maxLength={160} placeholder="Ej. Auditorio, patio principal, aula 2.° A" /></span>
            </Field>
            <Field label="Agenda / descripción" className="sm:col-span-2"><CountedText rows={3} max={1000} value={form.description} onChange={(description) => set({ description })} placeholder="Puntos a tratar…" /></Field>
          </Section>
          <Section icon={Users} title="Convocados" className="sm:grid-cols-3">
            <Field label="Nivel"><Select value={form.level} disabled={locked} onChange={(level) => set({ level, grade: '', section: '' })} options={opts(LEVELS, 'Toda la institución')} /></Field>
            <Field label="Grado"><Select value={form.grade} disabled={locked || !form.level} onChange={(grade) => set({ grade, section: '' })} options={opts(GRADES, 'Todos')} /></Field>
            <Field label="Sección"><Select value={form.section} disabled={locked || !form.grade} onChange={(section) => set({ section })} options={opts(SECTIONS, 'Todas')} /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-3">Se convoca a los padres y apoderados registrados (con DNI) en la matrícula de los estudiantes de este alcance.{locked ? ' La asistencia ya se cerró: el alcance no se puede cambiar.' : ''}</p>
          </Section>
          <Section icon={Coins} title="Multa y estado" className="sm:grid-cols-2">
            <Field label="Multa por inasistencia (S/)" required><Input type="number" min="0" step="0.50" value={form.fineAmount} onChange={(event) => set({ fineAmount: event.target.value })} required /></Field>
            <Field label="Estado" required><Select value={form.status} disabled={locked} onChange={(status) => set({ status })} options={opts(MEETING_STATUS)} /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Al cerrar la asistencia, cada apoderado que faltó recibe esta multa. Con 0 no se generan multas.</p>
          </Section>
        </form>
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <FormNote>Los campos marcados con <span className="text-destructive">*</span> son obligatorios.</FormNote>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="meeting-form" disabled={saving}><Save /> {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar convocatoria'}</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Roll call of a meeting: mark by DNI or one by one, then close it to record absences and fines. */
function RollCall({ meeting, canEdit, onClose }) {
  const { toast } = useApp()
  const [data, loading, reload] = useList(`/api/parent-meetings/${meeting.id}/roster`, 'guardians')
  const [info, setInfo] = useState(meeting)
  const [dni, setDni] = useState('')
  const [late, setLate] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const dniInput = useRef(null)
  const editable = canEdit && info.status !== 'Cancelada'

  const count = (status) => data.filter((item) => item.status === status).length
  const pending = data.filter((item) => !item.status).length
  const term = query.trim().toLowerCase()
  const shown = data.filter((item) => (!filter || (filter === 'sin' ? !item.status : item.status === filter))
    && (!term || `${item.name} ${item.dni} ${item.students}`.toLowerCase().includes(term)))

  async function mark(guardian, status) {
    const result = await api(`/api/parent-meetings/${meeting.id}/attendance`, { method: 'PUT', body: { guardianId: guardian.id, status } })
    if (!result.ok) return toast(result.error || 'No se pudo registrar.', 'bad')
    reload()
  }

  async function markDni(event) {
    event.preventDefault()
    if (!/^\d{8}$/.test(dni)) return toast('El DNI debe tener 8 dígitos.', 'bad')
    const result = await api(`/api/parent-meetings/${meeting.id}/attendance/dni`, { method: 'POST', body: { dni, status: late ? 'tardanza' : 'presente' } })
    if (!result.ok) { toast(result.error || 'No se pudo registrar.', 'bad'); dniInput.current?.select(); return }
    toast(`${result.guardian.name}: ${GUARDIAN_ATTENDANCE_LABEL[result.status].toLowerCase()}.`)
    setDni('')
    dniInput.current?.focus()
    reload()
  }

  async function close() {
    setBusy(true)
    const result = await api(`/api/parent-meetings/${meeting.id}/close`, { method: 'POST' })
    setBusy(false)
    setConfirming(false)
    if (!result.ok) return toast(result.error || 'No se pudo cerrar la asistencia.', 'bad')
    toast(result.fines ? `Asistencia cerrada: ${result.absent} inasistencias y ${result.fines} multas generadas.` : `Asistencia cerrada: ${result.absent} inasistencias.`)
    setInfo({ ...info, closed: true, status: 'Realizada' })
    reload()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[96vh] w-[97vw] overflow-y-auto sm:max-w-6xl">
        <FormHeader icon={ClipboardCheck} title={`Asistencia · ${info.title}`}
          text={`${info.type} · ${dmy(info.date)}${info.time ? ` ${info.time}` : ''}${info.place ? ` · ${info.place}` : ''} · ${scopeLabel(info)} · Multa por falta: ${info.fineAmount ? soles(info.fineAmount) : 'sin multa'}`} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {editable ? (
            <form onSubmit={markDni} className="rounded-lg border border-border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><ScanLine className="size-4" /> Registrar por DNI</p>
              <div className="flex gap-2">
                <Input ref={dniInput} autoFocus inputMode="numeric" value={dni} onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="DNI del padre o apoderado" className="text-base tracking-widest" />
                <Button type="submit"><CalendarCheck /> Marcar</Button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={late} onChange={(event) => setLate(event.target.checked)} className="accent-[var(--primary)]" /> <Clock className="size-3.5" /> Registrar como tardanza</label>
            </form>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 p-3 text-sm text-muted-foreground dark:bg-muted/40"><Lock className="size-4" /> {info.status === 'Cancelada' ? 'Convocatoria cancelada.' : 'Solo consulta.'}</div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[['', 'Convocados', data.length], ['presente', 'Asistieron', count('presente')], ['tardanza', 'Tardanzas', count('tardanza')], ['falta', 'Faltaron', count('falta')], ['sin', info.closed ? 'Justificados' : 'Sin marcar', info.closed ? count('justificado') : pending]].map(([key, label, value]) => {
              const target = info.closed && key === 'sin' ? 'justificado' : key
              return (
                <button key={label} type="button" onClick={() => setFilter(filter === target ? '' : target)} aria-pressed={filter === target}
                  className={cn('rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/40', filter === target && key !== '' ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                  <p className="text-xl font-extrabold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por apoderado, DNI o estudiante…" />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="max-h-[48vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-foreground/75 dark:bg-muted">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold">Padre / Apoderado</th>
                  <th className="px-3 py-2.5 text-left font-bold">Estudiante(s)</th>
                  <th className="px-3 py-2.5 text-left font-bold">Asistencia</th>
                  {info.closed && <th className="px-3 py-2.5 text-left font-bold">Multa</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2"><span className="block font-semibold">{item.name}</span><span className="text-xs text-muted-foreground tabular-nums">DNI {item.dni}{item.phone ? ` · ${item.phone}` : ''}</span></td>
                    <td className="max-w-80 px-3 py-2 text-xs text-muted-foreground">{item.students || '—'}</td>
                    <td className="px-3 py-2">
                      {editable ? (
                        <span className="flex flex-wrap gap-1">
                          {GUARDIAN_ATTENDANCE.map((status) => (
                            <button key={status} type="button" onClick={() => mark(item, status)} aria-pressed={item.status === status}
                              className={cn('rounded-md border px-2 py-1 text-xs font-semibold transition-colors', item.status === status ? ATTENDANCE_TONE[status] : 'border-border text-muted-foreground hover:bg-muted')}>
                              {GUARDIAN_ATTENDANCE_LABEL[status]}
                            </button>
                          ))}
                          {item.markedAt && <span className="self-center text-[11px] text-muted-foreground tabular-nums">{item.markedAt}</span>}
                        </span>
                      ) : <AttendancePill status={item.status} />}
                    </td>
                    {info.closed && <td className="px-3 py-2">{item.fine ? <Pill value={item.fine} /> : <span className="text-xs text-muted-foreground">—</span>}</td>}
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? 'Cargando…' : data.length ? 'Nadie coincide con la búsqueda.' : 'No hay padres o apoderados registrados con DNI para este alcance. Regístralos en la ficha del estudiante (matrícula).'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <FormNote>{info.closed
            ? 'Asistencia cerrada. Si corriges una falta, su multa pendiente se ajusta sola.'
            : 'Al cerrar, quienes no tengan registro quedan como «Faltó» y se generan sus multas.'}</FormNote>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}><X /> Cerrar ventana</Button>
            {editable && !info.closed && <Button type="button" disabled={busy || !data.length} onClick={() => setConfirming(true)}><Lock /> Cerrar asistencia y generar multas</Button>}
          </span>
        </DialogFooter>

        <Dialog open={confirming} onOpenChange={(open) => { if (!open && !busy) setConfirming(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cerrar asistencia</DialogTitle>
              <DialogDescription>
                {pending} {pending === 1 ? 'apoderado sin registro quedará' : 'apoderados sin registro quedarán'} como «Faltó».
                {info.fineAmount ? ` Se generará una multa de ${soles(info.fineAmount)} por cada inasistencia (${count('falta') + pending} en total).` : ' Esta convocatoria no tiene multa.'} Después podrás corregir asistencias si hubo un error.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button>
              <Button type="button" disabled={busy} onClick={close}><Lock /> {busy ? 'Cerrando…' : 'Cerrar asistencia'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

