import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Pencil, UserX, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Panel, Pill } from '../campus/kit'
import { Select, addDaysISO, longDate, todayLima } from '../attendance/shared'
import { ConfidentialNote, PSY, SESSION_STATUS, SessionForm, caseLink, classroom, opts, shortDate } from './shared'

/** Monday of the week that contains `iso`. */
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay() || 7
  return addDaysISO(iso, 1 - weekday)
}

export default function AppointmentsPage() {
  const { toast } = useApp()
  const canEdit = useCan('psicologia')
  const today = todayLima()
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [status, setStatus] = useState('')
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [scheduling, setScheduling] = useState(false)
  const weekEnd = addDaysISO(weekStart, 6)

  async function load() {
    setLoading(true)
    const query = new URLSearchParams({ from: weekStart, to: weekEnd, ...(status ? { status } : {}) })
    const result = await api(`/api/psychology/sessions?${query}`)
    setLoading(false)
    if (result.ok) setSessions(result.sessions)
    else toast(result.error || 'No se pudieron cargar las citas.', 'bad')
  }
  useEffect(() => { load() }, [weekStart, status])

  const days = useMemo(() => {
    const byDay = new Map()
    for (const item of sessions) byDay.set(item.date, [...(byDay.get(item.date) || []), item])
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [sessions])

  async function quickStatus(item, next) {
    const result = await api(`/api/psychology/sessions/${item.id}`, { method: 'PATCH', body: { ...item, status: next } })
    if (!result.ok) return toast(result.error || 'No se pudo actualizar la cita.', 'bad')
    toast(`Cita marcada como «${next}».`)
    load()
  }

  const counts = SESSION_STATUS.map((value) => [value, sessions.filter((item) => item.status === value).length])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarClock}
        title="Seguimiento y citas"
        description="Agenda semanal de Psicología: programa citas de seguimiento y registra cómo resultaron."
        actions={canEdit && <Button type="button" onClick={() => setScheduling(true)}><CalendarPlus /> Programar cita</Button>}
      />
      <ConfidentialNote />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><ChevronLeft /></Button>
          <p className="min-w-56 text-center text-sm font-semibold">{shortDate(weekStart)} – {shortDate(weekEnd)}</p>
          <Button type="button" variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><ChevronRight /></Button>
          {weekStart !== mondayOf(today) && <Button type="button" variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(today))}>Esta semana</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">{counts.map(([label, total]) => `${label}: ${total}`).join(' · ')}</p>
          <Select className="w-44" value={status} onChange={setStatus} options={opts(SESSION_STATUS, 'Todos los estados')} />
        </div>
      </div>

      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>}
      {!loading && !days.length && (
        <Panel title="Sin citas" icon={CalendarClock}>
          <p className="text-sm text-muted-foreground">No hay citas ni sesiones en esta semana{status ? ` con estado «${status}»` : ''}.</p>
        </Panel>
      )}
      {!loading && days.map(([date, items]) => (
        <Panel key={date} title={<span className="capitalize">{longDate(date)}{date === today && <span className="ml-2 text-xs font-semibold text-primary">Hoy</span>}</span>} icon={CalendarClock} contentClassName="p-0">
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-14 shrink-0 text-sm font-bold tabular-nums">{item.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.student.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {classroom(item.student)} · {item.type} · <Link to={caseLink(item.caseId)} className="text-primary hover:underline">Caso {item.caseCode}</Link> ({item.reason})
                  </span>
                </span>
                <Pill value={item.status} />
                {canEdit && (
                  <span className="flex gap-1">
                    {item.status === 'Programada' && (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-[#3f7d5c]" title="Registrar sesión realizada" aria-label="Registrar sesión realizada" onClick={() => setEditing({ ...item, status: 'Realizada' })}><Check /></Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-[#b7832f]" title="No asistió" aria-label="Marcar que no asistió" onClick={() => quickStatus(item, 'No asistió')}><UserX /></Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" title="Cancelar cita" aria-label="Cancelar cita" onClick={() => quickStatus(item, 'Cancelada')}><XCircle /></Button>
                      </>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar" aria-label="Editar sesión" onClick={() => setEditing(item)}><Pencil /></Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      {editing && (
        <SessionForm
          caseId={editing.caseId}
          caseLabel={`Caso ${editing.caseCode} · ${editing.student.name}`}
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {scheduling && <ScheduleDialog onClose={() => setScheduling(false)} onSaved={() => { setScheduling(false); load() }} />}
    </div>
  )
}

/** Picks an active case and then opens the session form to schedule its appointment. */
function ScheduleDialog({ onClose, onSaved }) {
  const [cases, setCases] = useState(null)
  const [caseId, setCaseId] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api('/api/psychology/cases').then((result) => setCases(result.ok ? result.cases.filter((item) => item.status !== 'Cerrado') : []))
  }, [])
  const chosen = cases?.find((item) => String(item.id) === caseId)

  if (ready && chosen) {
    return <SessionForm caseId={chosen.id} caseLabel={`Caso ${chosen.code} · ${chosen.student.name}`} onClose={onClose} onSaved={onSaved} />
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Programar cita</DialogTitle>
          <DialogDescription>Elige el caso activo del estudiante. Si es un estudiante nuevo, primero registra su atención en «Registro de atenciones».</DialogDescription>
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
          {cases?.length === 0
            ? <Button asChild><Link to={PSY.attentions}>Ir a Registro de atenciones</Link></Button>
            : <Button type="button" disabled={!chosen} onClick={() => setReady(true)}>Continuar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
