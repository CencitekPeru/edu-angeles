import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Home,
  Layers,
  LogOut,
  Menu,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Shield,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { SCHOOL } from '../lib/school'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NotificationBell } from './Notifications'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const adminNav = [
  { section: 'Inicio', to: '/admin', label: 'Dashboard', icon: Home, end: true },
  { section: 'Gestión tecnológica', to: '/admin/inventario', label: 'Equipos', icon: Monitor },
  { section: 'Gestión escolar', to: '/admin/materiales', label: 'Materiales', icon: Package },
  { section: 'Gestión tecnológica', to: '/admin/catalogo', label: 'Categorías y ambientes', icon: Layers },
  { section: 'Gestión tecnológica', to: '/admin/incidencias', label: 'Incidencias', icon: AlertTriangle },
  { section: 'Gestión tecnológica', to: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { section: 'Reservas', to: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList },
  { section: 'Reservas', to: '/admin/calendario', label: 'Calendario', icon: CalendarDays },
  { section: 'Reservas', to: '/admin/horarios', label: 'Horarios fijos', icon: Clock },
  { section: 'Administración', to: '/admin/reportes', label: 'Reportes', icon: FileText },
  { section: 'Administración', to: '/admin/documentos', label: 'Documentos', icon: GraduationCap },
  { section: 'Administración', to: '/admin/profesores', label: 'Usuarios', icon: Users, end: true },
  { section: 'Administración', to: '/admin/docentes', label: 'Docentes', icon: UserPlus, end: true },
]

const teacherNav = [
  { section: 'Inicio', to: '/panel', label: 'Dashboard', icon: Home, end: true },
  { section: 'Reservas', to: '/panel/solicitudes', label: 'Reservas', icon: ClipboardList },
  { section: 'Reservas', to: '/panel/calendario', label: 'Calendario', icon: CalendarDays },
]

export default function Layout() {
  const { user, logout, offline } = useApp()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nodo-sidebar') === 'collapsed')
  const items = user.role === 'admin' ? adminNav : teacherNav
  const profilePath = user.role === 'admin' ? '/admin/perfil' : '/panel/perfil'

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

  // Find active item for breadcrumb
  let activeTitle = 'Dashboard'
  let activeSection = 'Inicio'
  for (const item of items) {
    if (item.to && location.pathname === item.to) {
      activeTitle = item.label
      activeSection = item.section
      break
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-svh bg-background text-foreground flex flex-col">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden bg-black text-white border-r border-white/10 transition-all duration-300 ease-in-out lg:flex flex-col',
            collapsed ? 'w-[72px]' : 'w-64'
          )}
        >
          <Sidebar
            items={items}
            user={user}
            onLogout={logout}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
          />
        </aside>

        {/* Mobile Drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
              onClick={() => setOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-black text-white border-r border-white/10 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
              <div className="p-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-1">
                <Sidebar
                  items={items}
                  user={user}
                  onLogout={logout}
                  collapsed={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Content Wrapper */}
        <div
          className={cn(
            'flex-1 flex flex-col transition-all duration-300',
            collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
          )}
        >
          {/* Header */}
          <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden shrink-0"
                onClick={() => setOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:inline">
                    {activeSection}
                  </span>
                  <span className="text-xs text-muted-foreground/60 hidden sm:inline">›</span>
                  <h2 className="text-sm sm:text-base font-extrabold text-foreground truncate">
                    {activeTitle}
                  </h2>
                </div>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <NotificationBell />

              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative flex items-center gap-2.5 h-10 px-2 rounded-full hover:bg-muted">
                    <Avatar name={user.name} size="sm" />
                    <div className="hidden md:flex flex-col text-left">
                      <span className="text-xs font-bold text-foreground leading-tight truncate max-w-[120px]">
                        {user.name.split(' ')[0]}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight capitalize">
                        {user.role === 'admin' ? 'Coordinador' : user.subject || 'Docente'}
                      </span>
                    </div>
                    <ChevronDown className="size-3.5 text-muted-foreground hidden sm:block" />
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
                  <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                    <Link to={profilePath}>
                      <UserRound className="size-4" />
                      <span>Mi perfil</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 cursor-pointer" disabled>
                    <Shield className="size-4 text-primary" />
                    <span>Rol: {user.role === 'admin' ? 'Coordinación CIST' : 'Docente'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="gap-2 text-destructive cursor-pointer focus:text-destructive">
                    <LogOut className="size-4" />
                    <span>Cerrar sesión</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Offline alert banner */}
          {offline && (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-center text-xs sm:text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center justify-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>La base de datos MySQL o la API no responden. Verifica que XAMPP esté encendido.</span>
            </div>
          )}

          {/* Main page content - full fluid width without huge side margins */}
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function Sidebar({ items, user, onLogout, collapsed, onToggle }) {
  return (
    <div className="flex h-full flex-col px-2.5 py-4 bg-black text-white">
      {/* Brand Header */}
      {collapsed ? (
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onToggle}
                  className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors shadow-sm cursor-pointer"
                  aria-label="Expandir menú"
                  title="Expandir menú"
                >
                  <span className="text-xl">🎓</span>
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-neutral-900 text-white border border-neutral-700 text-xs px-2.5 py-1 font-medium shadow-xl">
              <p className="font-semibold">{SCHOOL.name}</p>
            </TooltipContent>
          </Tooltip>
          {onToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={onToggle}
                    className="flex size-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label="Expandir menú"
                    title="Expandir menú"
                  >
                    <PanelLeftOpen className="size-4" style={{ color: '#ffffff' }} />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-neutral-900 text-white border border-neutral-700 text-xs px-2.5 py-1 font-medium shadow-xl">
                <p className="font-semibold">Expandir menú</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white text-xl">
            🎓
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs font-black uppercase tracking-wider text-white truncate">
              {SCHOOL.name}
            </h1>
            <p className="text-[10px] text-white/60 truncate">
              CIST · Plataforma Tecnológica
            </p>
          </div>
          {onToggle && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggle}
              className="hidden lg:inline-flex text-white/60 hover:text-white hover:bg-white/10 rounded-lg ml-auto size-8"
              title="Contraer menú"
            >
              <PanelLeftClose className="size-4" style={{ color: '#ffffff' }} />
            </Button>
          )}
        </div>
      )}

      {/* Navigation List - Flat direct buttons */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto">
        {items.map((item, index) => {
          const Icon = item.icon
          const newSection = item.section !== items[index - 1]?.section

          return (
            <div key={item.to} className={newSection ? 'pt-3 first:pt-0' : ''}>
              {newSection && !collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {item.section}
                </p>
              )}

              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center w-full">
                      <NavLink
                        to={item.to}
                        end={item.end}
                        title={item.label}
                        aria-label={item.label}
                        className={({ isActive }) =>
                          cn(
                            'flex size-10 items-center justify-center rounded-xl transition-all duration-150',
                            isActive
                              ? '!bg-white !text-black shadow-md font-bold'
                              : 'text-white/80 hover:!bg-white/15 hover:!text-white'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <Icon
                            className="size-5 shrink-0"
                            style={{ color: isActive ? '#000000' : '#ffffff' }}
                          />
                        )}
                      </NavLink>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-neutral-900 text-white border border-neutral-700 text-xs px-2.5 py-1 font-medium shadow-xl">
                    <p className="font-semibold">{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? '!bg-white !text-black font-bold shadow-xs'
                        : 'text-white/80 hover:!bg-white/10 hover:!text-white'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className="size-4 shrink-0"
                        style={{ color: isActive ? '#000000' : '#ffffff' }}
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              )}
            </div>
          )
        })}
      </nav>

      {/* Sidebar Footer User Info */}
      <div className="mt-auto pt-4 border-t border-white/10 space-y-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center w-full">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex size-10 items-center justify-center rounded-xl text-white/80 hover:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <LogOut className="size-5 shrink-0" style={{ color: '#ffffff' }} />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-neutral-900 text-white border border-neutral-700 text-xs px-2.5 py-1 font-medium shadow-xl">
              <p className="font-semibold">Cerrar sesión</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-white/60 truncate">{user.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full text-white/70 hover:text-rose-400 hover:bg-rose-500/10 justify-start text-xs font-semibold"
              onClick={onLogout}
            >
              <LogOut className="size-4 shrink-0 mr-2" style={{ color: '#ffffff' }} />
              <span>Cerrar sesión</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
