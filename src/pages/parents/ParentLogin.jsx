import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, IdCard, Info, LogIn, ScanLine, UserRound, UsersRound } from 'lucide-react'
import { SCHOOL } from '../../lib/school'
import { getParentToken, parentApi, setParentToken } from '../../lib/parentApi'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AuthCardHeader, AuthShell, IconInput } from '../../components/AuthShell'
import { QrScanner } from './QrScanner'
import { AttendanceSummary } from './ParentPortal'

export default function ParentLogin() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('dni')
  const [dni, setDni] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = `${SCHOOL.name} · Consulta de Asistencia`
    if (getParentToken()) navigate('/padres/panel', { replace: true })
  }, [navigate])

  async function submit(event) {
    event.preventDefault()
    if (!/^\d{8}$/.test(dni)) return setError('El DNI debe tener 8 dígitos.')
    setLoading(true)
    setError('')
    const result = await parentApi('/api/parents/login', { method: 'POST', body: { dni, remember } })
    setLoading(false)
    if (!result.ok) return setError(result.error || 'No se pudo ingresar.')
    setParentToken(result.token, remember)
    navigate('/padres/panel', { replace: true })
  }

  return (
    <AuthShell
      badgeIcon={UsersRound}
      badge="Consulta de Asistencia"
      title={<>Portal de Padres<br />y Apoderados</>}
      text="Consulta la asistencia diaria y el historial de tus hijos de forma rápida y segura."
    >
      <AuthCardHeader title="Consulta de Asistencia" subtitle="Acceso para Padres de Familia o Apoderados" />

      <div className="mb-5 grid grid-cols-2 gap-2">
        {[['dni', 'Ingresar con DNI', UserRound], ['qr', 'Escanear QR', ScanLine]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => { setTab(id); setError('') }} aria-pressed={tab === id}
            className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors', tab === id ? 'border-[#0f2e6b] bg-[#0f2e6b] text-white shadow dark:border-primary dark:bg-primary' : 'border-border bg-card text-foreground hover:bg-muted')}>
            <Icon className="size-[18px]" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dni' ? (
        <form className="space-y-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-semibold text-foreground">
            DNI del padre o apoderado
            <IconInput icon={IdCard} autoFocus inputMode="numeric" autoComplete="username" value={dni} maxLength={8} onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Ingrese su DNI (8 dígitos)" required />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-foreground">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 rounded accent-[var(--primary)]" /> Recordarme
            </label>
          </div>
          <p className="flex items-start gap-2 rounded-lg border border-border bg-slate-50 p-3 text-xs text-muted-foreground dark:bg-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            Ingresa el DNI con el que la institución te registró como padre, madre o apoderado. Verás la asistencia de tus hijos matriculados.
          </p>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium text-destructive" role="alert">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </div>
          )}
          <Button type="submit" size="lg" className="h-11 w-full bg-[#0f2e6b] text-base font-bold hover:bg-[#0b2456] dark:bg-primary" disabled={loading}>
            <LogIn /> {loading ? 'Verificando…' : 'Ingresar'}
          </Button>
        </form>
      ) : (
        <QrLookup />
      )}

      <div className="mt-6 border-t border-border pt-4 text-center">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f2e6b] hover:underline dark:text-blue-300">
          <ArrowLeft className="size-4" /> Volver al acceso principal
        </Link>
      </div>
    </AuthShell>
  )
}

function QrLookup() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const last = useRef({ code: '', at: 0 })

  const onCode = useCallback(async (code) => {
    if (busy) return
    // The camera keeps decoding the same card every frame: ignore repeats for a few seconds.
    if (code === last.current.code && Date.now() - last.current.at < 4000) return
    last.current = { code, at: Date.now() }
    setBusy(true)
    setError('')
    const response = await parentApi('/api/parents/qr', { method: 'POST', body: { token: code.trim() } })
    setBusy(false)
    if (!response.ok) return setError(response.error || 'No se pudo consultar el código.')
    setResult(response)
  }, [busy])

  if (result) {
    return (
      <div className="space-y-4">
        <AttendanceSummary student={result.student} totals={result.totals} records={result.records} subtitle="Últimos 30 días" />
        <p className="text-xs text-muted-foreground">Para ver el historial completo y las justificaciones, ingresa con tu DNI.</p>
        <Button type="button" variant="outline" className="w-full" onClick={() => setResult(null)}><ScanLine /> Escanear otro carné</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <QrScanner onCode={onCode} paused={busy} />
      {busy && <p className="text-center text-sm text-muted-foreground">Consultando…</p>}
      {error && <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs font-medium text-destructive" role="alert"><AlertCircle className="size-4" /> {error}</p>}
    </div>
  )
}
