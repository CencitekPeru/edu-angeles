import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, UserRound, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '@/lib/utils'
import { CHIP_BASE, TONE } from '../../lib/tones'

export const LEVELS = ['Primaria', 'Secundaria']
export const GRADES = ['1°', '2°', '3°', '4°', '5°', '6°']
export const SECTIONS = ['A', 'B', 'C', 'D', 'E']


export { TONE }

export const STATUS_META = {
  presente: { label: 'Presente', icon: CheckCircle2, chip: TONE.ok.chip, color: TONE.ok.color },
  tardanza: { label: 'Tardanza', icon: Clock, chip: TONE.warn.chip, color: TONE.warn.color },
  inasistencia: { label: 'Inasistencia', icon: XCircle, chip: TONE.bad.chip, color: TONE.bad.color },
}

export const DECISION_META = {
  pendiente: { label: 'Pendiente', icon: Clock, chip: STATUS_META.tardanza.chip },
  aprobada: { label: 'Aprobada', icon: CheckCircle2, chip: STATUS_META.presente.chip },
  rechazada: { label: 'Rechazada', icon: XCircle, chip: STATUS_META.inasistencia.chip },
}

export function StatusChip({ status, justified, meta = STATUS_META, className }) {
  const item = meta[status]
  if (!item) return <span className="text-muted-foreground">—</span>
  const Icon = item.icon
  return (
    <span className={cn(CHIP_BASE, item.chip, className)}>
      <Icon />
      {item.label}
      {justified && <span className="font-medium opacity-80">(just.)</span>}
    </span>
  )
}

export function LevelChip({ level }) {
  return (
    <span className={cn(
      'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
      level === 'Primaria' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : 'bg-[#e8edf6] text-[#1e3a8a] dark:bg-blue-500/15 dark:text-blue-200',
    )}>
      {level}
    </span>
  )
}

export function StudentPhoto({ student, size = 'size-9' }) {
  if (student?.photo) {
    return <img src={student.photo} alt="" className={cn(size, 'shrink-0 rounded-lg object-cover')} />
  }
  return (
    <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300')}>
      <UserRound className="size-1/2" />
    </span>
  )
}

/** Plain native select styled like the rest of the inputs (supports empty values for "Todos"). */
export function Select({ value, onChange, options, className, ...props }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', className)}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

export const allOption = (label = 'Todos') => ({ value: '', label })
export const levelOptions = (label) => [allOption(label), ...LEVELS.map((value) => ({ value, label: value }))]
export const gradeOptions = (label) => [allOption(label), ...GRADES.map((value) => ({ value, label: `${value} Grado` }))]
export const sectionOptions = (label) => [allOption(label), ...SECTIONS.map((value) => ({ value, label: `Sección ${value}` }))]

export function FilterLabel({ label, children, className }) {
  return (
    <label className={cn('grid gap-1 text-xs font-semibold text-foreground/80', className)}>
      {label}
      {children}
    </label>
  )
}

export function todayLima() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function addDaysISO(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function dmy(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** "06:52" → "06:52 a. m." */
export function ampm(time) {
  if (!time) return '—'
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'p. m.' : 'a. m.'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`
}

export const pct = (part, total) => (total ? `${((part / total) * 100).toFixed(1)} %` : '0.0 %')

export function DateChip({ date = todayLima(), prefix = '' }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs">
      <CalendarDays className="size-4 text-foreground/70" />
      {prefix}{longDate(date)}
    </div>
  )
}

/** Loads the student list with today's attendance; reloads when filters change. */
export function useStudents(filters) {
  const [state, setState] = useState({ students: [], stats: { total: 0, Primaria: 0, Secundaria: 0, sections: 0, qrActive: 0 }, loading: true })
  const [version, setVersion] = useState(0)
  const key = JSON.stringify(filters)
  useEffect(() => {
    let active = true
    const params = new URLSearchParams(Object.entries(JSON.parse(key)).filter(([, value]) => value))
    api(`/api/students?${params}`).then((result) => {
      if (!active) return
      if (result.ok) setState({ students: result.students, stats: result.stats, loading: false })
      else setState((current) => ({ ...current, loading: false }))
    })
    return () => { active = false }
  }, [key, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}

export function Donut({ segments, center, caption, size = 'size-40' }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className={cn('relative shrink-0', size)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="13" className="stroke-slate-200 dark:stroke-slate-700" />
        {total > 0 && segments.map((item) => {
          const length = (item.value / total) * circumference
          const node = (
            <circle key={item.label} cx="50" cy="50" r={radius} fill="none" strokeWidth="13" stroke={item.color}
              strokeDasharray={`${Math.max(0, length - (segments.length > 1 ? 0.6 : 0))} ${circumference}`} strokeDashoffset={-offset}>
              <title>{`${item.label}: ${item.value}`}</title>
            </circle>
          )
          offset += length
          return node
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-black leading-none text-foreground">{center}</span>
        {caption && <span className="mt-1 text-[11px] leading-tight text-muted-foreground">{caption}</span>}
      </div>
    </div>
  )
}

export function Pager({ page, pageCount, onPage, total, pageSize, onPageSize, label = 'registros' }) {
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total)
  const pages = []
  for (let n = Math.max(1, page - 1); n <= Math.min(pageCount, page + 1); n += 1) pages.push(n)
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>Mostrando {start} – {end} de {total.toLocaleString('es-PE')} {label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSize && (
          <span className="flex items-center gap-2">
            Filas por página:
            <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
              {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </span>
        )}
        <span className="flex items-center gap-1">
          <PageButton disabled={page <= 1} onClick={() => onPage(page - 1)} label="‹" />
          {pages[0] > 1 && <><PageButton onClick={() => onPage(1)} label="1" />{pages[0] > 2 && <span className="px-1">…</span>}</>}
          {pages.map((n) => <PageButton key={n} active={n === page} onClick={() => onPage(n)} label={String(n)} />)}
          {pages.at(-1) < pageCount && <>{pages.at(-1) < pageCount - 1 && <span className="px-1">…</span>}<PageButton onClick={() => onPage(pageCount)} label={pageCount.toLocaleString('es-PE')} /></>}
          <PageButton disabled={page >= pageCount} onClick={() => onPage(page + 1)} label="›" />
        </span>
      </div>
    </div>
  )
}

function PageButton({ label, onClick, active, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors disabled:opacity-40',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

export function usePaged(rows, initialSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pageCount)
  return {
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    pager: { page: current, pageCount, onPage: setPage, total: rows.length, pageSize, onPageSize: (size) => { setPageSize(size); setPage(1) } },
    reset: () => setPage(1),
  }
}

export const tableHead = 'bg-slate-50 text-xs text-foreground/75 dark:bg-muted/40'
export const th = 'px-3 py-2.5 text-left font-bold whitespace-nowrap'
export const td = 'px-3 py-2.5 text-foreground'
