import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, IdCard, LogIn, Mail, ShieldCheck, UsersRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SCHOOL } from '../lib/school'
import { homePath } from '../lib/permissions'
import { Button } from '@/components/ui/button'
import { AuthCardHeader, AuthShell, IconInput } from '../components/AuthShell'

const REMEMBER_KEY = 'nodo-remember-email'

export default function Login() {
  const { login, offline } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '')
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)))
  const [dni, setDni] = useState('')
  const [showDni, setShowDni] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = `${SCHOOL.name} · Ingreso CIST`
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!email.trim()) return setError('Ingresa tu correo institucional.')
    if (!/^\d{8}$/.test(dni)) return setError('El DNI debe contener exactamente 8 dígitos.')
    setLoading(true)
    setError('')
    const result = await login(email, dni, remember)
    setLoading(false)
    if (!result.ok) return setError(result.error || 'Credenciales incorrectas o servidor no disponible.')
    if (remember) localStorage.setItem(REMEMBER_KEY, email.trim().toLowerCase())
    else localStorage.removeItem(REMEMBER_KEY)
    navigate(homePath(result.user), { replace: true })
  }

  return (
    <AuthShell
      badgeIcon={ShieldCheck}
      badge="Plataforma institucional CIST"
      title={<>Plataforma de<br />Gestión Institucional</>}
      text="Administra el inventario tecnológico, el mantenimiento, las reservas de salas y la asistencia estudiantil desde un solo lugar."
    >
      <AuthCardHeader title="Iniciar sesión" subtitle="Acceso para docentes y coordinación" />

      {offline && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>El servidor de la base de datos está desconectado. Inicia Apache y MySQL en XAMPP.</span>
        </div>
      )}

      <form className="space-y-4" onSubmit={submit}>
        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          Correo institucional
          <IconInput icon={Mail} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@colegio.edu" required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          DNI
          <IconInput
            icon={IdCard}
            type={showDni ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="current-password"
            value={dni}
            onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Ingrese su DNI (8 dígitos)"
            maxLength={8}
            required
            end={
              <button type="button" onClick={() => setShowDni((value) => !value)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showDni ? 'Ocultar DNI' : 'Mostrar DNI'}>
                {showDni ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            }
          />
        </label>

        <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-4 cursor-pointer rounded border-input accent-[#0f2e6b] dark:accent-[var(--primary)]"
          />
          Recordarme en este equipo
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium text-destructive" role="alert">
            <AlertCircle className="size-4 shrink-0" /> {error}
          </div>
        )}

        <Button type="submit" size="lg" className="h-11 w-full bg-[#0f2e6b] text-base font-bold hover:bg-[#0b2456] dark:bg-primary" disabled={loading}>
          <LogIn /> {loading ? 'Verificando…' : 'Ingresar'}
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <Link to="/padres" className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><UsersRound className="size-5" /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-foreground">¿Eres padre o apoderado?</span>
            <span className="block text-xs text-muted-foreground">Consulta la asistencia de tus hijos</span>
          </span>
          <ArrowRight className="size-4 text-primary" />
        </Link>
      </div>
    </AuthShell>
  )
}
