import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, IdCard, LogIn, Mail, Sparkles } from 'lucide-react'
import campusBackground from '../assets/login-colegio.jpeg'
import schoolLogo from '../assets/logo-colegio.jpg'
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
    if (!nextEmail.trim()) {
      setError('Ingresa tu correo institucional.')
      return
    }
    if (!/^\d{8}$/.test(nextDni)) {
      setError('El DNI debe contener exactamente 8 dígitos.')
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
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white shadow-inner">
            <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-full object-contain" />
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
          <p className="mt-3 max-w-xl text-left text-sm leading-6 text-slate-200/90 sm:text-base sm:leading-7">
            Sistema para administrar el inventario tecnológico, el mantenimiento, las incidencias y las reservas de espacios de la institución.
          </p>
        </div>

      </section>

      {/* Login Form Panel (Right) */}
      <section className="relative flex min-h-svh flex-1 flex-col items-center px-6 py-12 sm:px-12 lg:col-span-6 xl:col-span-5 bg-background">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="my-auto w-full max-w-sm">
          <Card className="border-border shadow-sm">
            <div className="flex justify-center px-6 pt-6">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1 shadow-sm">
                <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-full object-contain" />
              </div>
            </div>
            <CardHeader className="items-center space-y-1 text-center">
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
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="email"
                      className="pl-9"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="nombre@colegio.edu"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dni" className="text-xs font-semibold">DNI</Label>
                  <div className="relative">
                    <IdCard
                      aria-hidden="true"
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="dni"
                      className="pl-9"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={dni}
                      onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="8 dígitos"
                      maxLength={8}
                      minLength={8}
                      pattern="[0-9]{8}"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Ingresa los 8 dígitos de tu DNI.
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
                  {loading ? 'Verificando...' : 'Ingresar'}
                </Button>
              </form>

            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
