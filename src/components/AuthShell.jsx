import campusBackground from '../assets/login-colegio.jpeg'
import schoolLogo from '../assets/logo-colegio.jpg'
import { SCHOOL } from '../lib/school'
import { ThemeToggle } from './ThemeToggle'

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

      <section className="relative flex min-h-svh flex-1 flex-col items-center justify-center px-5 py-16 sm:px-10">
        <div className="absolute right-6 top-6"><ThemeToggle /></div>
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <img src={schoolLogo} alt="" className="size-12 rounded-xl bg-white object-contain p-1 shadow" />
          <div>
            <p className="font-extrabold uppercase">{SCHOOL.name}</p>
            <p className="text-xs text-muted-foreground">{SCHOOL.place}</p>
          </div>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-blue-950/5 sm:p-8">
          {children}
        </div>
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
