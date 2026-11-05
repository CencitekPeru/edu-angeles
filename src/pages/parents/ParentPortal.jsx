import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarDays, CheckCircle2, Clock, GraduationCap, LogOut, Percent, UserRound, XCircle } from 'lucide-react'
import schoolLogo from '../../assets/logo-colegio.jpg'
import { SCHOOL } from '../../lib/school'
import { getParentToken, parentApi, setParentToken } from '../../lib/parentApi'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DECISION_META, STATUS_META, StatusChip, ampm, dmy, longDate, tableHead, td, th, todayLima } from '../attendance/shared'

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

export default function ParentPortal() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [childId, setChildId] = useState(null)
  const [month, setMonth] = useState(todayLima().slice(0, 7))
  const [history, setHistory] = useState(null)

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

  return (
    <div className="min-h-svh bg-[#f3f6fb] text-foreground dark:bg-background">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1730] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <img src={schoolLogo} alt="" className="size-10 rounded-lg bg-white object-contain p-0.5" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-extrabold uppercase">{SCHOOL.name}</p>
            <p className="text-xs text-white/70">Portal de Padres y Apoderados</p>
          </div>
          <span className="hidden text-right text-sm sm:block">
            <span className="block font-semibold">{me?.guardian.name || 'Apoderado'}</span>
            <span className="text-xs text-white/70">DNI {me?.guardian.dni}</span>
          </span>
          <ThemeToggle />
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={logout}><LogOut /> <span className="hidden md:inline">Salir</span></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Consulta de Asistencia</h1>
          <p className="text-sm text-muted-foreground">{longDate(todayLima())}</p>
        </div>

        {me && !me.children.length && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertCircle className="size-5 shrink-0" /> Aún no tienes estudiantes vinculados a tu DNI. Comunícate con la coordinación de la institución.
          </div>
        )}

        {me && me.children.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {me.children.map((item) => (
              <button key={item.id} type="button" onClick={() => setChildId(item.id)} aria-pressed={item.id === childId}
                className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition', item.id === childId ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40')}>
                {item.photo ? <img src={item.photo} alt="" className="size-14 rounded-lg object-cover" /> : <span className="flex size-14 items-center justify-center rounded-lg bg-slate-200 text-slate-500 dark:bg-slate-700"><UserRound className="size-7" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{item.fullName}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><GraduationCap className="size-3.5" /> {item.level} – {item.grade} {item.section}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs">
                    Hoy: {item.today ? <StatusChip status={item.today.status} justified={item.today.justified} /> : <span className="text-muted-foreground">Sin registro aún</span>}
                    {item.today?.time && <span className="text-muted-foreground">{ampm(item.today.time)}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {child && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Asistencia de {child.firstNames}</h2>
              <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm" aria-label="Mes">
                {monthOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [CheckCircle2, totals.presente, 'Presentes', 'from-green-50 to-green-100/60 border-green-200 text-green-700 dark:from-green-500/10 dark:to-transparent dark:border-green-500/20'],
                [Clock, totals.tardanza, 'Tardanzas', 'from-amber-50 to-amber-100/60 border-amber-200 text-amber-700 dark:from-amber-500/10 dark:to-transparent dark:border-amber-500/20'],
                [XCircle, totals.inasistencia, 'Inasistencias', 'from-rose-50 to-rose-100/60 border-rose-200 text-rose-700 dark:from-rose-500/10 dark:to-transparent dark:border-rose-500/20'],
                [Percent, `${pct(totals).toFixed(1)} %`, 'Asistencia del mes', 'from-blue-50 to-blue-100/60 border-blue-200 text-blue-700 dark:from-blue-500/10 dark:to-transparent dark:border-blue-500/20'],
              ].map(([Icon, value, label, tone]) => (
                <div key={label} className={cn('flex items-center gap-3 rounded-xl border bg-gradient-to-br p-4', tone)}>
                  <Icon className="size-8" />
                  <div>
                    <p className="text-2xl font-black text-foreground">{value}</p>
                    <p className="text-sm font-medium text-foreground/80">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <p className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2.5 font-bold dark:bg-muted/60"><CalendarDays className="size-[18px] text-primary" /> Historial del mes</p>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className={cn(tableHead, 'sticky top-0')}><tr><th className={th}>Fecha</th><th className={th}>Hora de ingreso</th><th className={th}>Estado</th><th className={th}>Observación</th></tr></thead>
                    <tbody>
                      {(history?.records || []).map((row) => (
                        <tr key={row.date} className="border-t border-border/70">
                          <td className={cn(td, 'whitespace-nowrap')}>{longDate(row.date)}</td>
                          <td className={cn(td, 'tabular-nums')}>{row.time ? ampm(row.time) : '—'}</td>
                          <td className={td}><StatusChip status={row.status} justified={row.justified} /></td>
                          <td className={cn(td, 'text-foreground/80')}>{row.note || '—'}</td>
                        </tr>
                      ))}
                      {history && !history.records.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin registros en este mes.</td></tr>}
                      {!history && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="h-fit rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="mb-3 font-bold">Justificaciones</p>
                <ul className="space-y-2">
                  {(history?.justifications || []).map((item) => (
                    <li key={item.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{dmy(item.date)}</span>
                        <StatusChip status={item.status} meta={DECISION_META} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{STATUS_META[item.type]?.label} · {item.reason}</p>
                    </li>
                  ))}
                  {history && !history.justifications.length && <li className="text-sm text-muted-foreground">No hay justificaciones registradas.</li>}
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">Ingreso puntual hasta las {history?.lateAfter || '—'}. Para justificar una falta, presenta el sustento en la institución.</p>
              </div>
            </div>
          </>
        )}
      </main>

    </div>
  )
}
