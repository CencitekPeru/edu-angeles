import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const pad = (value) => String(value).padStart(2, '0')
export const isoOf = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`

export function monthLabel(year, month) {
  const text = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  return text.charAt(0).toUpperCase() + text.slice(1).replace(' de ', ' ')
}

/**
 * Month grid (Monday first). `marks` maps ISO dates to a tone: approved | pending | rejected | fixed.
 */
export function MonthCalendar({ year, month, onMonth, selected, today, marks = {}, onSelect, compact = false }) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  const tones = {
    approved: 'bg-[#e3efe7] text-[#24503a] dark:bg-green-500/20 dark:text-green-200',
    pending: 'bg-[#f6ead2] text-[#6f4a10] dark:bg-amber-500/20 dark:text-amber-200',
    rejected: 'bg-[#f6dfdc] text-[#9a2f2a] dark:bg-rose-500/20 dark:text-rose-200',
    fixed: 'bg-slate-200 text-primary dark:bg-violet-500/20 dark:text-violet-200',
  }

  function shift(delta) {
    const next = new Date(year, month + delta, 1)
    onMonth(next.getFullYear(), next.getMonth())
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => shift(-1)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted" aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
        <span className={cn('font-bold text-foreground', compact ? 'text-sm' : 'text-sm sm:text-base')}>{monthLabel(year, month)}</span>
        <button type="button" onClick={() => shift(1)} className="flex size-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted" aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
      </div>
      <div className={cn('grid grid-cols-7 text-center', compact ? 'gap-0.5 text-[11px]' : 'gap-1 text-xs')}>
        {WEEK.map((day) => <span key={day} className="py-1 font-semibold text-muted-foreground">{compact ? day.slice(0, 2) : day}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />
          const iso = isoOf(year, month, day)
          const mark = marks[iso]
          const isSelected = iso === selected
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect?.(iso)}
              className={cn(
                'relative flex items-center justify-center rounded-md border font-semibold transition-colors',
                compact ? 'h-7' : 'h-8',
                isSelected ? 'border-primary bg-primary text-primary-foreground' : mark ? cn('border-transparent', tones[mark]) : 'border-border/60 bg-card text-foreground hover:bg-muted',
                iso === today && !isSelected && 'ring-2 ring-primary/50',
              )}
              aria-pressed={isSelected}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarLegend({ items }) {
  const tones = {
    approved: 'bg-[#c9dccf] dark:bg-green-500/40',
    pending: 'bg-[#ead9b8] dark:bg-amber-500/40',
    rejected: 'bg-[#e8c4c1] dark:bg-rose-500/40',
    selected: 'bg-primary',
    free: 'border border-border bg-card',
    fixed: 'bg-slate-300 dark:bg-violet-500/40',
  }
  return (
    <ul className="space-y-1.5 text-xs">
      {items.map(([tone, label]) => (
        <li key={tone} className="flex items-center gap-2 text-foreground/80"><span className={cn('size-3.5 rounded', tones[tone])} />{label}</li>
      ))}
    </ul>
  )
}
