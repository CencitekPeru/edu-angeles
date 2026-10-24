import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Laptop, LogIn, Sparkles } from 'lucide-react'
import campusBackground from '../assets/login-campus.jpg'
import { useApp } from '../context/AppContext'
import { SCHOOL } from '../lib/school'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Login() {
  const { login, offline } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [dni, setDni] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = `${SCHOOL.name} · Ingreso CIST`
  }, [])

  async function submit(nextEmail = email, nextDni = dni) {
    if (!nextEmail.trim() || !nextDni.trim()) {
      setError('Ingresa tu correo y DNI.')
      return
    }
    setLoading(true)
    setError('')
    const result = await login(nextEmail, nextDni)
    setLoading(false)
    if (!result.ok) {
      setError(result.error || 'Credenciales incorrectas o servidor no disponible.')
      return
    }
    navigate(result.user.role === 'admin' ? '/admin' : '/panel', { replace: true })
  }

  return (
    <div className="min-h-svh bg-background text-foreground flex flex-col lg:grid lg:grid-cols-12">
      {/* Visual Showcase Panel (Left) */}
      <section className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-10 xl:p-14 text-white">
        <img
          src={campusBackground}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950/75 via-slate-900/55 to-indigo-950/80" />
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -top-40 -left-40 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-emerald-500/15 blur-3xl" />

        {/* Brand header */}
        <div className="relative flex items-center gap-3.5 z-10">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-2xl shadow-inner">
            🎓
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider">{SCHOOL.name}</h1>
            <p className="text-xs text-slate-300 font-medium">{SCHOOL.place} · CIST Plataforma</p>
          </div>
        </div>

        <div className="relative z-10 max-w-lg py-8">
          <Badge className="mb-4 border-indigo-400/40 bg-indigo-500/25 px-3 py-1 text-indigo-200">
            <Sparkles className="size-3.5" />
            Plataforma institucional CIST
          </Badge>
          <h2 className="text-3xl xl:text-4xl font-black leading-tight tracking-tight">
            Plataforma de Gestión Institucional
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-200">
            Institución Educativa Los Ángeles
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200/90 sm:text-base sm:leading-7">
            La Institución Educativa Los Ángeles, ubicada en {SCHOOL.place}, promueve una educación integral y de calidad. Esta plataforma institucional facilita la gestión académica y tecnológica, apoyando la organización de recursos y el trabajo de la comunidad educativa.
          </p>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Laptop className="size-4 text-emerald-400" aria-hidden="true" />
            <span>CIST · {SCHOOL.name}</span>
          </div>
          <span>{SCHOOL.place}</span>
        </div>
      </section>

      {/* Login Form Panel (Right) */}
      <section className="relative flex-1 lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-6 py-12 sm:px-12 bg-background">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-sm">
          {/* Mobile school logo */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white text-lg">
              🎓
            </div>
            <div>
              <p className="text-sm font-black uppercase text-foreground">{SCHOOL.name}</p>
              <p className="text-xs text-muted-foreground">{SCHOOL.place}</p>
            </div>
          </div>

          <Card className="border-border shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-black tracking-tight text-foreground">
                Iniciar sesión
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Ingresa con tu correo institucional y tu DNI de 8 dígitos.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {offline && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>El servidor de la base de datos está desconectado. Inicia Apache y MySQL en XAMPP.</span>
                </div>
              )}

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">Correo institucional</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nombre@colegio.edu"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dni" className="text-xs font-semibold">DNI</Label>
                  <Input
                    id="dni"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={dni}
                    onChange={(event) => setDni(event.target.value.slice(0, 32))}
                    placeholder="8 dígitos"
                    maxLength={32}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Si tu cuenta antigua aún no tiene DNI registrado, usa tu contraseña anterior y actualiza el perfil al ingresar.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs font-medium text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" className="w-full gap-2 font-bold" disabled={loading}>
                  <LogIn className="size-4" />
                  {loading ? 'Ingresando...' : 'Entrar al sistema'}
                </Button>
              </form>

            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
