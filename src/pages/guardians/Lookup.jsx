import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, CalendarDays, GraduationCap, HandCoins, IdCard, Phone, RotateCcw, Search, UserRound, Wallet } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { useCan } from '../../lib/permissions'
import { soles } from '../../lib/guardianMeetings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill } from '../campus/kit'
import { dmy } from '../documents/shared'
import { AttendancePill, DebtBanner, FineActionDialog } from './shared'

/**
 * «Consulta y vinculación mediante DNI»: the guardian registered at enrolment, their children,
 * their attendance to meetings and whether they owe fines.
 */
export default function GuardianLookupPage() {
  const { toast } = useApp()
  const canEdit = useCan('padres')
  const [params, setParams] = useSearchParams()
  const [dni, setDni] = useState(params.get('dni') || '')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(null)

  async function search(value = dni) {
    if (!/^\d{8}$/.test(value)) return toast('El DNI debe tener 8 dígitos.', 'bad')
    setLoading(true)
    const data = await api(`/api/guardians/lookup?dni=${value}`)
    setLoading(false)
    setResult(data.ok ? data : { error: data.error || 'No se pudo consultar.' })
    setParams({ dni: value }, { replace: true })
  }
  useEffect(() => { if (/^\d{8}$/.test(params.get('dni') || '')) search(params.get('dni')) }, [])

  return (
    <div className="space-y-4">
      <PageHeader icon={IdCard} title="Consulta de padre o apoderado" description="Consulta por DNI: datos registrados en la matrícula, asistencia a reuniones y deudas por multas." />

      <Panel title="Buscar por DNI" icon={Search}>
        <form className="flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); search() }}>
          <Input autoFocus inputMode="numeric" className="h-11 text-lg tracking-widest" value={dni} onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="DNI (8 dígitos)" aria-label="DNI del padre o apoderado" />
          <Button type="submit" className="h-11" disabled={loading}><Search /> {loading ? 'Buscando…' : 'Consultar'}</Button>
        </form>
        {result?.error && <p className="mt-3 text-sm font-semibold text-destructive">{result.error}</p>}
      </Panel>

      {result?.guardian && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Panel title="Padre / Apoderado" icon={UserRound}>
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-extrabold">{result.guardian.name}</p>
                  <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5 tabular-nums"><IdCard className="size-4" /> DNI {result.guardian.dni}</span>
                    {result.guardian.phone && <span className="flex items-center gap-1.5"><Phone className="size-4" /> {result.guardian.phone}</span>}
                  </p>
                  {!result.guardian.active && <Pill value="Inactivo" className="mt-1" />}
                </div>
                <DebtBanner pendingAmount={result.pendingAmount} pendingCount={result.pendingCount} />
              </div>
            </Panel>
            <Panel title={`Estudiantes vinculados (${result.students.length})`} icon={GraduationCap}>
              <ul className="divide-y divide-border">
                {result.students.map((student) => (
                  <li key={student.id} className="flex items-center gap-3 py-2">
                    {student.photo ? <img src={student.photo} alt="" className="size-10 rounded-lg object-cover" /> : <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-muted-foreground dark:bg-muted"><UserRound className="size-5" /></span>}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{student.name}</span>
                      <span className="text-xs text-muted-foreground">{student.level} · {student.grade} {student.section} · Cód. {student.code}{student.relationship ? ` · ${student.relationship}` : ''}</span>
                    </span>
                  </li>
                ))}
                {!result.students.length && <li className="py-3 text-sm text-muted-foreground">No tiene estudiantes activos vinculados.</li>}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Multas y obligaciones (${result.fines.length})`} icon={Wallet}>
              <ul className="space-y-2">
                {result.fines.map((fine) => (
                  <li key={fine.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{fine.concept}</span>
                      <span className="text-xs text-muted-foreground">
                        {dmy(fine.issuedOn)}
                        {fine.status === 'Pagada' && ` · Pagada el ${dmy(fine.paidOn)}${fine.receipt ? ` (rec. ${fine.receipt})` : ''}`}
                        {fine.status === 'Exonerada' && fine.note && ` · ${fine.note}`}
                      </span>
                    </span>
                    <span className="font-bold tabular-nums">{soles(fine.amount)}</span>
                    <Pill value={fine.status} />
                    {canEdit && fine.status === 'Pendiente' && (
                      <span className="flex gap-1">
                        <Button type="button" size="sm" onClick={() => setAction({ fine: { ...fine, guardian: result.guardian }, mode: 'pay' })}><HandCoins /> Cobrar</Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8" title="Exonerar" aria-label="Exonerar multa" onClick={() => setAction({ fine: { ...fine, guardian: result.guardian }, mode: 'waive' })}><BadgeCheck /></Button>
                      </span>
                    )}
                    {canEdit && fine.status !== 'Pendiente' && (
                      <Button type="button" variant="ghost" size="icon" className="size-8" title="Volver a pendiente" aria-label="Volver a pendiente" onClick={() => setAction({ fine: { ...fine, guardian: result.guardian }, mode: 'reopen' })}><RotateCcw /></Button>
                    )}
                  </li>
                ))}
                {!result.fines.length && <li className="py-3 text-sm text-muted-foreground">No tiene multas registradas.</li>}
              </ul>
            </Panel>
            <Panel title={`Asistencia a reuniones (${result.meetings.length})`} icon={CalendarDays}>
              <ul className="divide-y divide-border">
                {result.meetings.map((meeting) => (
                  <li key={meeting.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{meeting.title}</span>
                      <span className="text-xs text-muted-foreground">{meeting.type} · {dmy(meeting.date)}</span>
                    </span>
                    <AttendancePill status={meeting.status} />
                  </li>
                ))}
                {!result.meetings.length && <li className="py-3 text-sm text-muted-foreground">Aún no tiene asistencia registrada a reuniones.</li>}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {action && <FineActionDialog fine={action.fine} mode={action.mode} onClose={() => setAction(null)} onDone={() => { setAction(null); search(result.guardian.dni) }} />}
    </div>
  )
}
