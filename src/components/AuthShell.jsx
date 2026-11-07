import campusBackground from '../assets/login-colegio.jpeg'
import schoolLogo from '../assets/logo-colegio.jpg'
import { SCHOOL } from '../lib/school'
import { Lock } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

/**
 * Background of the form column: a clean tonal gradient with layered navy waves along the
 * bottom and a lighter wave across the top. Colours stay at low opacity so text remains legible.
 */
function FormBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden text-[#0f2e6b] dark:text-[#3b5ba5]">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-[#e9eef7] dark:from-background dark:via-background dark:to-[#0f1a33]" />

      {/* Top wave */}
      <svg className="absolute inset-x-0 top-0 h-40 w-full rotate-180" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path fill="currentColor" fillOpacity="0.05" d="M0,224L80,213.3C160,203,320,181,480,186.7C640,192,800,224,960,229.3C1120,235,1280,213,1360,202.7L1440,192L1440,320L0,320Z" />
        <path fill="currentColor" fillOpacity="0.06" d="M0,288L120,266.7C240,245,480,203,720,208C960,213,1200,267,1320,293.3L1440,320L1440,320L0,320Z" />
      </svg>

      {/* Bottom waves */}
      <svg className="absolute inset-x-0 bottom-0 h-64 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path fill="currentColor" fillOpacity="0.05" d="M0,96L60,112C120,128,240,160,360,154.7C480,149,600,107,720,101.3C840,96,960,128,1080,149.3C1200,171,1320,181,1380,186.7L1440,192L1440,320L0,320Z" />
        <path fill="currentColor" fillOpacity="0.07" d="M0,192L80,176C160,160,320,128,480,138.7C640,149,800,203,960,208C1120,213,1280,171,1360,149.3L1440,128L1440,320L0,320Z" />
        <path fill="currentColor" fillOpacity="0.10" d="M0,256L96,245.3C192,235,384,213,576,218.7C768,224,960,256,1152,261.3C1344,267,1440,245,1440,245L1440,320L0,320Z" />
      </svg>
    </div>
  )
}

/** Split login layout: campus photo with message on the left, form card on the right. */
export function AuthShell({ badgeIcon: BadgeIcon, badge, title, text, children }) {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 text-foreground lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] dark:bg-background">
      <section className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
        <img src={campusBackground} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06102a]/95 via-[#0b1f4d]/45 to-[#0b1f4d]/30" />
        <div className="relative z-10 flex items-center gap-3.5 p-10">
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-lg">
            <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-full object-contain" />
          </span>
          <div className="text-white drop-shadow">
            <p className="text-xl font-extrabold uppercase tracking-wide">{SCHOOL.name}</p>
            <p className="text-xs font-medium text-white/85">{SCHOOL.place} · CIST Plataforma</p>
          </div>
        </div>
        <div className="relative z-10 max-w-xl p-10 pb-14 text-white">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/90 px-4 py-1.5 text-sm font-semibold shadow">
            {BadgeIcon && <BadgeIcon className="size-4" />} {badge}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">{title}</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-white/90">{text}</p>
          <span className="mt-6 block h-1 w-16 rounded-full bg-white/90" />
        </div>
      </section>

      <section className="relative flex min-h-svh flex-1 flex-col items-center justify-center overflow-hidden px-5 pb-20 pt-16 sm:px-10">
        <FormBackdrop />
        <div className="absolute right-6 top-6 z-20"><ThemeToggle /></div>
        <div className="relative mb-6 flex items-center gap-3 lg:hidden">
          <img src={schoolLogo} alt="" className="size-12 rounded-xl bg-white object-contain p-1 shadow" />
          <div>
            <p className="font-extrabold uppercase">{SCHOOL.name}</p>
            <p className="text-xs text-muted-foreground">{SCHOOL.place}</p>
          </div>
        </div>

        <div className="relative w-full max-w-md">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-blue-950/10 sm:p-8">
            {children}
          </div>
        </div>

        <footer className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-1 px-5 text-center text-[11px] text-muted-foreground sm:flex-row sm:justify-center sm:gap-3">
          <span>© {new Date().getFullYear()} {SCHOOL.name} · CIST</span>
          <span className="hidden size-1 rounded-full bg-muted-foreground/40 sm:inline-block" />
          <span className="flex items-center gap-1"><Lock className="size-3" aria-hidden="true" /> Plataforma institucional de uso interno</span>
        </footer>
      </section>
    </div>
  )
}

export function AuthCardHeader({ title, subtitle }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <span className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-md">
        <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-full object-contain" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export function IconInput({ icon: Icon, end, ...props }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        {...props}
        className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-10 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
      />
      {end && <div className="absolute right-2 top-1/2 -translate-y-1/2">{end}</div>}
    </div>
  )
}
