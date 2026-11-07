import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  ClipboardList,
  Clock,
  Cpu,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Home,
  Layers,
  LayoutGrid,
  QrCode,
  ScanLine,
  LogOut,
  Menu,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { SCHOOL } from '../lib/school'
import schoolLogo from '../assets/logo-colegio.jpg'
import { useApp } from '../context/AppContext'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NotificationBell } from './Notifications'
import { ROLE_LABEL, canView, homePath as homeFor, isStaff } from '../lib/permissions'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: Home, end: true },
  {
    label: 'Gestión Tecnológica',
    icon: Cpu,
    children: [
      { to: '/admin/inventario', label: 'Inventario', icon: Monitor },
      { to: '/admin/incidencias', label: 'Incidencias', icon: AlertTriangle },
      { to: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
      { to: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    label: 'Gestión Escolar',
    icon: GraduationCap,
    children: [
      { to: '/admin/materiales', label: 'Bienes mobiliarios', icon: Package },
      { to: '/admin/catalogo', label: 'Categorías y ambientes', icon: Layers },
      { to: '/admin/docentes', label: 'Docentes', icon: UserPlus, end: true },
    ],
  },
  {
    label: 'Asistencia estudiantil',
    icon: ScanLine,
    children: [
      { to: '/admin/asistencia', label: 'Panel de asistencia', icon: LayoutGrid, end: true },
      { to: '/admin/asistencia/escanear', label: 'Escanear QR', icon: ScanLine },
      { to: '/admin/asistencia/estudiantes', label: 'Estudiantes', icon: UserRound },
      { to: '/admin/asistencia/qr', label: 'Códigos QR', icon: QrCode },
      { to: '/admin/asistencia/historial', label: 'Historial de asistencia', icon: History },
      { to: '/admin/asistencia/justificaciones', label: 'Justificaciones', icon: FileCheck2 },
      { to: '/admin/asistencia/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    label: 'Reservas',
    icon: CalendarDays,
    children: [
      { to: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList },
      { to: '/admin/calendario', label: 'Calendario', icon: CalendarDays },
      { to: '/admin/horarios', label: 'Horarios fijos', icon: Clock },
    ],
  },
  {
    label: 'Administración',
    icon: Settings,
    divider: true,
    children: [
      { to: '/admin/profesores', label: 'Usuarios', icon: Users, end: true },
      { to: '/admin/documentos', label: 'Documentos', icon: FileText },
    ],
  },
]

const teacherNav = [
  { to: '/panel', label: 'Inicio', icon: Home, end: true },
  {
    label: 'Reservas',
    icon: CalendarDays,
    children: [
      { to: '/panel/solicitudes', label: 'Solicitudes', icon: ClipboardList },
      { to: '/panel/calendario', label: 'Calendario', icon: CalendarDays },
    ],
  },
]

/** Admin navigation filtered by what the user's role may open. */
function navFor(user) {
  return adminNav
    .map((item) => (item.children ? { ...item, children: item.children.filter((child) => canView(user, child.to)) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : canView(user, item.to)))
}

function flatItems(items) {
  return items.flatMap((item) =>
    item.children ? item.children.map((child) => ({ ...child, section: item.label })) : [item],
  )
}

function matches(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/* Approximate row heights (px) of the expanded sidebar, used to decide how many groups fit open. */
const ROW_HEIGHT = 44 // top-level link or group header + gap
const CHILD_HEIGHT = 38 // nested link
const GROUP_PADDING = 6 // margin above the nested list
const DIVIDER_HEIGHT = 25 // border + spacing of a divided group

/**
 * Opens groups by default while they fit in the available height: first the group of the
 * current page, then the rest in menu order. Whatever doesn't fit stays collapsed.
 */
function groupsThatFit(items, height, pathname) {
  const groups = items.filter((item) => item.children)
  let used = items.reduce((total, item) => total + ROW_HEIGHT + (item.divider ? DIVIDER_HEIGHT : 0), 0)
  const current = groups.find((group) => group.children.some((child) => matches(child, pathname)))
  const ordered = current ? [current, ...groups.filter((group) => group !== current)] : groups
  const open = Object.fromEntries(groups.map((group) => [group.label, false]))
  for (const group of ordered) {
    const cost = GROUP_PADDING + group.children.length * CHILD_HEIGHT
    if (used + cost > height) continue
    open[group.label] = true
    used += cost
  }
  if (current) open[current.label] = true
  return open
}

const tooltipClass = 'bg-slate-900 text-white border border-slate-700 text-xs px-2.5 py-1 font-medium shadow-xl'

export default function Layout() {
  const { user, logout, offline } = useApp()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nodo-sidebar') === 'collapsed')
  const staff = isStaff(user)
  const items = staff ? navFor(user) : teacherNav
  const profilePath = staff ? '/admin/perfil' : '/panel/perfil'
  const homePath = homeFor(user)

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    document.title = `${SCHOOL.name} · CIST`
  }, [])

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value
      localStorage.setItem('nodo-sidebar', next ? 'collapsed' : 'open')
      return next
    })
  }

  const active = flatItems(items)
    .filter((item) => matches(item, location.pathname))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const isProfile = location.pathname === profilePath
  const activeTitle = isProfile ? 'Mi perfil' : active?.label || 'Dashboard'
  const activeSection = isProfile ? null : active?.section || null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-svh bg-background text-foreground flex flex-col">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden bg-[var(--sidebar)] text-white transition-all duration-300 ease-in-out lg:flex flex-col',
            collapsed ? 'w-[76px]' : 'w-64',
          )}
        >
          <Sidebar items={items} user={user} onLogout={logout} collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>

        {/* Mobile Drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-10 flex w-64 max-w-[85vw] flex-col bg-[var(--sidebar)] text-white shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="flex justify-end p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:bg-white/10 hover:text-white"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X className="size-5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <Sidebar items={items} user={user} onLogout={logout} collapsed={false} />
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={cn('flex flex-1 flex-col transition-all duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </Button>
              <nav aria-label="Ruta" className="flex min-w-0 items-center gap-2 text-sm">
                <Link
                  to={homePath}
                  className="hidden size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-muted hover:text-primary sm:flex"
                  aria-label="Inicio"
                >
                  <Home className="size-[18px]" />
                </Link>
                {activeSection && (
                  <>
                    <ChevronRight className="hidden size-4 text-muted-foreground/70 sm:block" />
                    <span className="hidden truncate font-medium text-muted-foreground sm:inline">{activeSection}</span>
                  </>
                )}
                <ChevronRight className="hidden size-4 text-muted-foreground/70 sm:block" />
                <h2 className="truncate font-extrabold text-foreground">{activeTitle}</h2>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative flex h-11 items-center gap-2.5 rounded-full px-2 hover:bg-muted">
                    <Avatar name={user.name} image={user.profilePhoto} size="sm" />
                    <div className="hidden flex-col text-left md:flex">
                      <span className="max-w-[160px] truncate text-[13px] font-bold leading-tight text-foreground">
                        {user.name.split(' ').slice(0, 2).join(' ')}
                      </span>
                      <span className="text-[11px] font-semibold leading-tight text-primary">
                        {user.role === 'teacher' ? user.subject || 'Docente' : ROLE_LABEL[user.role]}
                      </span>
                    </div>
                    <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-bold leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer gap-2">
                    <Link to={profilePath}>
                      <UserRound className="size-4" />
                      <span>Mi perfil</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer gap-2" disabled>
                    <Shield className="size-4 text-primary" />
                    <span>Rol: {ROLE_LABEL[user.role] || 'Docente'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                    <LogOut className="size-4" />
                    <span>Cerrar sesión</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {offline && (
            <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-center text-xs font-medium text-amber-800 sm:text-sm dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>La base de datos MySQL o la API no responden. Verifica que XAMPP esté encendido.</span>
            </div>
          )}

          {user.role === 'director' && (
            <div className="flex items-center justify-center gap-2 border-b border-border bg-slate-50 px-4 py-2 text-center text-xs font-medium text-muted-foreground dark:bg-muted">
              <Eye className="size-4 text-primary" />
              Modo consulta: como Dirección puedes ver y exportar toda la información, pero no registrar ni modificar datos.
            </div>
          )}

          <main className="w-full flex-1 px-4 py-5 sm:px-6 lg:px-7">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function Sidebar({ items, user, onLogout, collapsed, onToggle }) {
  const location = useLocation()
  const navRef = useRef(null)
  // Height available for the menu; starts with an estimate and is then measured.
  const [navHeight, setNavHeight] = useState(() => Math.max(0, window.innerHeight - 200))
  // Groups the user opened or closed by hand; they win over the automatic layout.
  const [overrides, setOverrides] = useState({})

  useEffect(() => {
    const node = navRef.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setNavHeight(Math.round(entry.contentRect.height)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [collapsed])

  // Entering a page inside a group the user had closed reopens it.
  useEffect(() => {
    const group = items.find((item) => item.children?.some((child) => matches(child, location.pathname)))
    if (group) setOverrides((current) => (current[group.label] === false ? { ...current, [group.label]: true } : current))
  }, [location.pathname, items])

  const autoGroups = useMemo(() => groupsThatFit(items, navHeight, location.pathname), [items, navHeight, location.pathname])
  const openGroups = { ...autoGroups, ...overrides }

  const linkClass = (isActive, nested) =>
    cn(
      'flex items-center gap-3 rounded-lg transition-colors',
      nested ? 'px-3 py-2 text-[13px]' : 'px-3 py-2.5 text-sm',
      isActive
        ? 'bg-white/[0.12] font-semibold text-white shadow-[inset_3px_0_0_#9db6ea]'
        : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
    )

  return (
    <div className="flex h-full flex-col px-3 py-4 text-white">
      {/* Brand */}
      {collapsed ? (
        <div className="mb-4 flex justify-center">
          {onToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggle}
                  className="flex size-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
                  aria-label="Expandir menú"
                >
                  <PanelLeftOpen className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className={tooltipClass}>
                <p className="font-semibold">Expandir menú</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3 px-1">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5">
            <img src={schoolLogo} alt={`Escudo de ${SCHOOL.name}`} className="size-full rounded-lg object-contain" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-extrabold uppercase tracking-wide text-white">{SCHOOL.name}</h1>
            <p className="text-sm font-extrabold text-white">CIST</p>
            <p className="truncate text-[11px] text-slate-400">Plataforma Tecnológica</p>
          </div>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className="hidden size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:flex"
              title="Contraer menú"
              aria-label="Contraer menú"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav ref={navRef} className={cn('min-h-0 flex-1 space-y-1 overflow-y-auto', collapsed && '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>
        {collapsed
          ? flatItems(items).map((item) => {
              const Icon = item.icon
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center">
                      <NavLink
                        to={item.to}
                        end={item.end}
                        aria-label={item.label}
                        className={({ isActive }) =>
                          cn(
                            'flex size-10 items-center justify-center rounded-xl transition-colors',
                            isActive ? 'bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(157,182,234,0.6)]' : 'text-slate-300 hover:bg-white/10 hover:text-white',
                          )
                        }
                      >
                        <Icon className="size-5 shrink-0" />
                      </NavLink>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className={tooltipClass}>
                    <p className="font-semibold">{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })
          : items.map((item) => {
              const Icon = item.icon
              if (!item.children) {
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive)}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              }
              const groupOpen = openGroups[item.label]
              const hasActive = item.children.some((child) => matches(child, location.pathname))
              return (
                <div key={item.label} className={item.divider ? 'mt-3 border-t border-white/10 pt-3' : ''}>
                  <button
                    type="button"
                    onClick={() => setOverrides((current) => ({ ...current, [item.label]: !openGroups[item.label] }))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.07]',
                      hasActive ? 'font-semibold text-white' : 'text-slate-300 hover:text-white',
                    )}
                    aria-expanded={groupOpen}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                    <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', groupOpen && 'rotate-180')} />
                  </button>
                  {groupOpen && (
                    <div className="mt-1 space-y-0.5 pl-3">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon
                        return (
                          <NavLink key={child.to} to={child.to} end={child.end} className={({ isActive }) => linkClass(isActive, true)}>
                            <ChildIcon className="size-4 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
      </nav>

      {/* Footer */}
      <div className="mt-auto border-t border-white/10 pt-4">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex size-10 items-center justify-center rounded-xl text-slate-300 hover:bg-rose-500/20 hover:text-rose-300"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="size-5" />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className={tooltipClass}>
              <p className="font-semibold">Cerrar sesión</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-left hover:bg-white/10">
                <Avatar name={user.name} image={user.profilePhoto} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role] || 'Docente'}</p>
                </div>
                <ChevronDown className="size-4 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem asChild className="cursor-pointer gap-2">
                <Link to={isStaff(user) ? '/admin/perfil' : '/panel/perfil'}>
                  <UserRound className="size-4" />
                  <span>Mi perfil</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                <LogOut className="size-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
