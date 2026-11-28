import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Clock, FileCheck2, GraduationCap, LogOut, Percent, UserRound, Users, Wallet, XCircle } from 'lucide-react'
import schoolLogo from '../../assets/logo-colegio.jpg'
import { SCHOOL } from '../../lib/school'
import { getParentToken, parentApi, setParentToken } from '../../lib/parentApi'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DECISION_META, STATUS_META, StatusChip, ampm, dmy, longDate, tableHead, td, th, todayLima } from '../attendance/shared'
import { soles } from '../../lib/guardianMeetings'
import { Pill } from '../campus/kit'
import { DebtBanner } from '../guardians/shared'

const pct = (totals) => (totals.total ? ((totals.presente + totals.tardanza) / totals.total) * 100 : 0)

export function AttendanceSummary({ student, totals, records, subtitle }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
        {student.photo ? <img src={student.photo} alt="" className="size-12 rounded-lg object-cover" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-slate-200 text-slate-500 dark:bg-slate-700"><UserRound className="size-6" /></span>}
        <div>
          <p className="font-extrabold text-foreground">{student.firstNames} {student.lastNames}</p>
          <p className="text-xs text-muted-foreground">{student.level} – {student.grade} Grado – Sección {student.section}</p>
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{subtitle}</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['presente', totals.presente], ['tardanza', totals.tardanza], ['inasistencia', totals.inasistencia]].map(([status, value]) => (
          <div key={status} className={cn('rounded-lg border py-2', STATUS_META[status].chip)}>
            <p className="text-xl font-black">{value}</p>
            <p className="text-[11px]">{STATUS_META[status].label}s</p>
          </div>
        ))}
        <div className="rounded-lg border border-blue-200 bg-blue-50 py-2 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          <p className="text-xl font-black">{pct(totals).toFixed(0)}%</p>
          <p className="text-[11px]">Asistencia</p>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {records.map((row) => (
          <li key={row.date} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="tabular-nums">{dmy(row.date)} <span className="ml-1 text-muted-foreground">{row.time ? ampm(row.time) : ''}</span></span>
            <StatusChip status={row.status} justified={row.justified} />
          </li>
        ))}
        {!records.length && <li className="px-3 py-4 text-center text-muted-foreground">Sin registros en este periodo.</li>}
      </ul>
    </div>
  )
}

function monthOptions() {
  const today = todayLima()
  const [year, month] = today.split('-').map(Number)
  const list = []
  for (let offset = 0; offset < 10; offset += 1) {
    const date = new Date(year, month - 1 - offset, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(date)
    list.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return list
}

/* Sections of the portal: each summary card opens one of them. */
const SECTIONS = {
  presente: { title: 'Días presentes', icon: CheckCircle2 },
  tardanza: { title: 'Tardanzas', icon: Clock },
  inasistencia: { title: 'Inasistencias', icon: XCircle },
  asistencia: { title: 'Historial de asistencia del mes', icon: CalendarDays },
  justificaciones: { title: 'Justificaciones', icon: FileCheck2 },
  deudas: { title: 'Deudas y multas', icon: Wallet },
  reuniones: { title: 'Reuniones y asambleas', icon: Users },
}

const CARD_TONE = {
  green: 'from-green-50 to-green-100/60 border-green-200 text-green-700 dark:from-green-500/10 dark:to-transparent dark:border-green-500/20',
  amber: 'from-amber-50 to-amber-100/60 border-amber-200 text-amber-700 dark:from-amber-500/10 dark:to-transparent dark:border-amber-500/20',
  rose: 'from-rose-50 to-rose-100/60 border-rose-200 text-rose-700 dark:from-rose-500/10 dark:to-transparent dark:border-rose-500/20',
  blue: 'from-blue-50 to-blue-100/60 border-blue-200 text-blue-700 dark:from-blue-500/10 dark:to-transparent dark:border-blue-500/20',
  slate: 'from-slate-50 to-slate-100/60 border-slate-200 text-slate-700 dark:from-slate-500/10 dark:to-transparent dark:border-slate-500/20',
}

/** A titled group of the summary: the students' block or the guardian's own block. */
function PortalBlock({ icon: Icon, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-start gap-3 border-b border-border bg-slate-50 px-4 py-3 sm:px-5 dark:bg-muted/50">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight sm:text-lg">{title}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
        </div>
      </header>
      <div className="space-y-4 p-3 sm:p-5">{children}</div>
    </section>
  )
}

/** Summary card that opens its own section. */
function SummaryCard({ icon: Icon, value, label, hint, tone, onClick, className }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(className, 'group flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-gradient-to-br p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-3 sm:p-4', CARD_TONE[tone])}>
      <Icon className="size-6 shrink-0 sm:size-8" />
      <span className="w-full min-w-0 flex-1">
        <span className="block truncate text-xl font-black text-foreground tabular-nums sm:text-2xl">{value}</span>
        <span className="block text-[13px] font-medium leading-tight text-foreground/80 sm:text-sm">{label}</span>
        {hint && <span className="mt-0.5 block truncate text-[11px] text-foreground/60 sm:text-xs">{hint}</span>}
      </span>
      <ChevronRight className="hidden size-5 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80 sm:block" aria-hidden />
    </button>
  )
}

const ATTENDANCE_LABEL = { presente: 'Asistió', tardanza: 'Tardanza', falta: 'Faltó', justificado: 'Justificado' }

function AttendanceTable({ records, loading, empty }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ul className="divide-y divide-border sm:hidden">
        {records.map((row) => (
          <li key={row.date} className="space-y-1 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">{dmy(row.date)}</span>
              <StatusChip status={row.status} justified={row.justified} />
            </div>
            <p className="text-xs text-muted-foreground">Ingreso: {row.time ? ampm(row.time) : '—'}{row.note ? ` · ${row.note}` : ''}</p>
          </li>
        ))}
        {!loading && !records.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</li>}
        {loading && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando…</li>}
      </ul>
      <div className="hidden max-h-[560px] overflow-auto sm:block">
        <table className="w-full text-sm">
          <thead className={cn(tableHead, 'sticky top-0')}><tr><th className={th}>Fecha</th><th className={th}>Hora de ingreso</th><th className={th}>Estado</th><th className={th}>Observación</th></tr></thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.date} className="border-t border-border/70">
                <td className={cn(td, 'whitespace-nowrap')}>{longDate(row.date)}</td>
                <td className={cn(td, 'tabular-nums')}>{row.time ? ampm(row.time) : '—'}</td>
                <td className={td}><StatusChip status={row.status} justified={row.justified} /></td>
                <td className={cn(td, 'text-foreground/80')}>{row.note || '—'}</td>
              </tr>
            ))}
            {!loading && !records.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{empty}</td></tr>}
            {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ParentPortal() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [me, setMe] = useState(null)
  const [childId, setChildId] = useState(null)
  const [month, setMonth] = useState(todayLima().slice(0, 7))
  const [history, setHistory] = useState(null)
  const section = SECTIONS[params.get('ver')] ? params.get('ver') : null

  // The open section lives in the address, so the browser's back button returns to the summary.
  const open = (key) => { setParams({ ver: key }); window.scrollTo({ top: 0 }) }
  const back = () => setParams({})

  function logout() {
    setParentToken(null)
    navigate('/padres', { replace: true })
  }

  useEffect(() => {
    if (!getParentToken()) { navigate('/padres', { replace: true }); return }
    document.title = `${SCHOOL.name} · Portal de Padres`
    parentApi('/api/parents/me').then((result) => {
      if (!result.ok) {
        if (result.status === 401) logout()
        return
      }
      setMe(result)
      setChildId((current) => current || result.children[0]?.id || null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!childId) return undefined
    let active = true
    const [y, m] = month.split('-').map(Number)
    const from = `${month}-01`
    const last = new Date(y, m, 0).getDate()
    const to = `${month}-${String(last).padStart(2, '0')}`
    setHistory(null)
    parentApi(`/api/parents/students/${childId}/attendance?from=${from}&to=${to}`).then((result) => {
      if (active && result.ok) setHistory(result)
    })
    return () => { active = false }
  }, [childId, month])

  const child = me?.children.find((item) => item.id === childId)
  const totals = history?.totals || { total: 0, presente: 0, tardanza: 0, inasistencia: 0, justificadas: 0 }
  const records = history?.records || []
  const debt = me?.debt || { pendingAmount: 0, pendingCount: 0, fines: [] }
  const meetings = me?.meetings || { held: [], upcoming: [] }
  const childSection = ['presente', 'tardanza', 'inasistencia', 'asistencia', 'justificaciones'].includes(section)
  const monthLabel = monthOptions().find((option) => option.value === month)?.label.toLowerCase() || ''
  const monthPicker = (
    <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-auto" aria-label="Mes">
      {monthOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )

  const childCards = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* `me` is still null on the first render, before the guardian's data arrives. */}
      {(me?.children || []).map((item) => (
        <button key={item.id} type="button" onClick={() => setChildId(item.id)} aria-pressed={item.id === childId}
          className={cn('flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition', item.id === childId ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40')}>
          {item.photo ? <img src={item.photo} alt="" className="size-12 shrink-0 rounded-lg object-cover sm:size-14" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-500 sm:size-14 dark:bg-slate-700"><UserRound className="size-6 sm:size-7" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold sm:text-base">{item.fullName}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><GraduationCap className="size-3.5" /> {item.level} – {item.grade} {item.section}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              Hoy: {item.today ? <StatusChip status={item.today.status} justified={item.today.justified} /> : <span className="text-muted-foreground">Sin registro aún</span>}
              {item.today?.time && <span className="text-muted-foreground">{ampm(item.today.time)}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-svh bg-[#f3f6fb] text-foreground dark:bg-background">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1730] text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4">
          <img src={schoolLogo} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain p-0.5 sm:size-10" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-extrabold uppercase sm:text-base">{SCHOOL.name}</p>
            <p className="truncate text-[11px] text-white/70 sm:text-xs">{me?.guardian.name ? <span className="sm:hidden">{me.guardian.name} · </span> : null}Portal de Padres y Apoderados</p>
          </div>
          <span className="hidden text-right text-sm sm:block">
            <span className="block font-semibold">{me?.guardian.name || 'Apoderado'}</span>
            <span className="text-xs text-white/70">DNI {me?.guardian.dni}</span>
          </span>
          <ThemeToggle />
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={logout}><LogOut /> <span className="hidden md:inline">Salir</span><span className="sr-only md:hidden">Salir</span></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-6">
        {!section && (
          <>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Consulta de Asistencia</h1>
              <p className="text-sm text-muted-foreground">{longDate(todayLima())}</p>
            </div>

            {me && (
              <PortalBlock icon={GraduationCap} title="Mis estudiantes" description="Asistencia, tardanzas y justificaciones de cada estudiante a tu cargo.">
                {!me.children.length ? (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertCircle className="size-5 shrink-0" /> Aún no tienes estudiantes vinculados a tu DNI. Comunícate con la coordinación de la institución.
                  </div>
                ) : (
                  <>
                    {childCards}
                    {child && (
                      <div className="space-y-3 border-t border-border pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="min-w-0 text-sm font-bold sm:text-base">Asistencia de {child.firstNames}</h3>
                          {monthPicker}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
                          <SummaryCard className="col-span-2 lg:col-span-1" icon={Percent} value={`${pct(totals).toFixed(1)} %`} label="Asistencia del mes" hint="Ver historial completo" tone="blue" onClick={() => open('asistencia')} />
                          <SummaryCard icon={CheckCircle2} value={totals.presente} label="Presentes" tone="green" onClick={() => open('presente')} />
                          <SummaryCard icon={Clock} value={totals.tardanza} label="Tardanzas" tone="amber" onClick={() => open('tardanza')} />
                          <SummaryCard icon={XCircle} value={totals.inasistencia} label="Inasistencias" hint={totals.justificadas ? `${totals.justificadas} justificadas` : undefined} tone="rose" onClick={() => open('inasistencia')} />
                          <SummaryCard icon={FileCheck2} value={history?.justifications?.length ?? '—'} label="Justificaciones" tone="slate" onClick={() => open('justificaciones')} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </PortalBlock>
            )}

            {me && (
              <PortalBlock icon={UserRound} title="Como apoderado" description="Tus multas pendientes y las reuniones o asambleas convocadas por la institución.">
                <button type="button" onClick={() => open('deudas')} className="block w-full text-left transition hover:opacity-90">
                  <DebtBanner pendingAmount={debt.pendingAmount} pendingCount={debt.pendingCount} />
                </button>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <SummaryCard icon={Wallet} value={soles(debt.pendingAmount)} label="Deudas por multas" hint={debt.pendingCount ? `${debt.pendingCount} pendiente(s)` : 'Al día'} tone={debt.pendingCount ? 'rose' : 'green'} onClick={() => open('deudas')} />
                  <SummaryCard icon={Users} value={meetings.upcoming.length} label="Próximas reuniones" hint={`${meetings.held.length} reuniones registradas`} tone="slate" onClick={() => open('reuniones')} />
                </div>
              </PortalBlock>
            )}
          </>
        )}

        {section && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <Button type="button" variant="outline" size="sm" onClick={back}><ArrowLeft /> Volver al resumen</Button>
                <h1 className="flex items-center gap-2 text-lg font-extrabold tracking-tight sm:text-xl">
                  {(() => { const Icon = SECTIONS[section].icon; return <Icon className="size-5 text-primary" /> })()}
                  {SECTIONS[section].title}
                </h1>
              </div>
              {childSection && child && monthPicker}
            </div>

            {childSection && me && me.children.length > 1 && childCards}
            {childSection && !child && <p className="text-sm text-muted-foreground">No tienes estudiantes vinculados.</p>}

            {childSection && child && ['presente', 'tardanza', 'inasistencia'].includes(section) && (
              <>
                <p className="text-sm text-muted-foreground">{child.fullName} · {monthLabel} · {records.filter((row) => row.status === section).length} día(s)</p>
                <AttendanceTable records={records.filter((row) => row.status === section)} loading={!history}
                  empty={section === 'presente' ? 'No hay días presentes en este mes.' : section === 'tardanza' ? 'No hay tardanzas en este mes.' : 'No hay inasistencias en este mes.'} />
                {section === 'inasistencia' && <p className="text-xs text-muted-foreground">Para justificar una falta, presenta el sustento en la institución. Ingreso puntual hasta las {history?.lateAfter || '—'}.</p>}
              </>
            )}

            {childSection && child && section === 'asistencia' && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[['Presentes', totals.presente], ['Tardanzas', totals.tardanza], ['Inasistencias', totals.inasistencia], ['Asistencia', `${pct(totals).toFixed(1)} %`]].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3"><p className="text-xl font-black">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                  ))}
                </div>
                <AttendanceTable records={records} loading={!history} empty="Sin registros en este mes." />
              </>
            )}

            {childSection && child && section === 'justificaciones' && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <ul className="space-y-2">
                  {(history?.justifications || []).map((item) => (
                    <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{dmy(item.date)}</span>
                        <StatusChip status={item.status} meta={DECISION_META} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{STATUS_META[item.type]?.label} · {item.reason}</p>
                    </li>
                  ))}
                  {history && !history.justifications.length && <li className="text-sm text-muted-foreground">No hay justificaciones registradas.</li>}
                  {!history && <li className="text-sm text-muted-foreground">Cargando…</li>}
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">Para justificar una falta, presenta el sustento en la institución.</p>
              </div>
            )}

            {section === 'deudas' && (
              <>
                <DebtBanner pendingAmount={debt.pendingAmount} pendingCount={debt.pendingCount} />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
                  {[['Deuda pendiente', soles(debt.pendingAmount)], ['Multas pendientes', debt.pendingCount],
                    ['Total pagado', soles(debt.fines.filter((fine) => fine.status === 'Pagada').reduce((total, fine) => total + fine.amount, 0))]].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3"><p className="text-xl font-black tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                  ))}
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:hidden">
                  {debt.fines.map((fine) => (
                    <li key={fine.id} className="space-y-1 px-3 py-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 font-semibold">{fine.concept}</span>
                        <span className="shrink-0 font-bold tabular-nums">{soles(fine.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{dmy(fine.issuedOn)}</span>
                        <Pill value={fine.status} />
                      </div>
                      {fine.status !== 'Pendiente' && <p className="text-xs text-muted-foreground">{fine.status === 'Pagada' ? `Pagada el ${dmy(fine.paidOn)}${fine.receipt ? ` · Recibo ${fine.receipt}` : ''}` : fine.note || fine.status}</p>}
                    </li>
                  ))}
                  {!debt.fines.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No tienes multas registradas.</li>}
                </ul>
                <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm sm:block">
                  <table className="w-full text-sm">
                    <thead className={tableHead}><tr><th className={th}>Fecha</th><th className={th}>Concepto</th><th className={th}>Monto</th><th className={th}>Estado</th><th className={th}>Detalle</th></tr></thead>
                    <tbody>
                      {debt.fines.map((fine) => (
                        <tr key={fine.id} className="border-t border-border/70">
                          <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{dmy(fine.issuedOn)}</td>
                          <td className={td}>{fine.concept}</td>
                          <td className={cn(td, 'font-bold tabular-nums')}>{soles(fine.amount)}</td>
                          <td className={td}><Pill value={fine.status} /></td>
                          <td className={cn(td, 'text-xs text-muted-foreground')}>{fine.status === 'Pagada' ? `Pagada el ${dmy(fine.paidOn)}${fine.receipt ? ` · Recibo ${fine.receipt}` : ''}` : fine.status === 'Exonerada' ? fine.note || 'Exonerada' : 'Por pagar'}</td>
                        </tr>
                      ))}
                      {!debt.fines.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No tienes multas registradas.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {debt.pendingCount > 0 && <p className="text-xs text-muted-foreground">Para regularizar tu deuda acércate a la institución. Si consideras que hay un error, comunícate con la coordinación.</p>}
              </>
            )}

            {section === 'reuniones' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <p className="border-b border-border px-4 py-2.5 font-bold">Próximas reuniones ({meetings.upcoming.length})</p>
                  <ul className="divide-y divide-border">
                    {meetings.upcoming.map((meeting) => (
                      <li key={meeting.id} className="px-4 py-3 text-sm">
                        <p className="font-semibold">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">{meeting.type} · {longDate(meeting.date)}{meeting.time ? ` · ${ampm(meeting.time)}` : ''}{meeting.place ? ` · ${meeting.place}` : ''}</p>
                        {meeting.description && <p className="mt-1 text-xs whitespace-pre-wrap text-foreground/80">{meeting.description}</p>}
                        {meeting.fineAmount > 0 && <p className="mt-1 text-xs font-semibold text-[#9a2f2a] dark:text-red-300">La inasistencia tiene una multa de {soles(meeting.fineAmount)}.</p>}
                      </li>
                    ))}
                    {!meetings.upcoming.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No hay reuniones programadas por ahora.</li>}
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <p className="border-b border-border px-4 py-2.5 font-bold">Tu asistencia a reuniones ({meetings.held.length})</p>
                  <ul className="divide-y divide-border">
                    {meetings.held.map((meeting) => (
                      <li key={meeting.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0"><span className="block truncate font-semibold">{meeting.title}</span><span className="text-xs text-muted-foreground">{meeting.type} · {dmy(meeting.date)}</span></span>
                        <Pill value={ATTENDANCE_LABEL[meeting.status] || meeting.status} />
                      </li>
                    ))}
                    {!meetings.held.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay asistencia registrada.</li>}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
