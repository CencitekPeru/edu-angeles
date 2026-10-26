import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { isBlocking, personName } from '../lib/reservations'
import {
  LAB,
  dayParts,
  formatWeekRange,
  fromMinutes,
  parseISODate,
  schoolWeek,
  todayISO,
  toMinutes,
} from '../lib/time'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const PX = 0.84
const OPEN = toMinutes(LAB.open)
const CLOSE = toMinutes(LAB.close)
const HEIGHT = (CLOSE - OPEN) * PX
const isVisibleSchedule = (status) => status === 'fixed' || isBlocking(status)

function place(items) {
  const sorted = [...items].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || a.id.localeCompare(b.id),
  )
  const columnEnds = []
  const placed = []
  for (const item of sorted) {
    const start = toMinutes(item.startTime)
    const end = toMinutes(item.endTime)
    let col = columnEnds.findIndex((value) => value <= start)
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(end)
    } else columnEnds[col] = end
    placed.push({ item, col })
  }
  const count = Math.max(columnEnds.length, 1)
  return placed.map((entry) => ({ ...entry, count }))
}

function hours() {
  const list = []
  for (let minute = OPEN; minute < CLOSE; minute += 60) list.push(fromMinutes(minute))
  return list
}

function Blocks({ items, users, preview, showNow = false }) {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return (
    <div className="relative" style={{ height: HEIGHT }}>
      {hours().map((hour) => (
        <div
          key={hour}
          className="pointer-events-none absolute inset-x-0 border-t border-border/70"
          style={{ top: (toMinutes(hour) - OPEN) * PX }}
        >
          <span className="absolute -top-2.5 left-0 w-10 text-[10px] font-bold text-muted-foreground/60">{hour}</span>
        </div>
      ))}
      <div className="absolute inset-y-0 left-12 right-1">
        {preview && (
          <div
            className={`absolute inset-x-1 z-10 overflow-hidden rounded-md px-2 py-1 text-xs font-bold ${
              preview.tone === 'bad'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'border-2 border-dashed border-emerald-500 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
            }`}
            style={{
              top: (toMinutes(preview.start) - OPEN) * PX,
              height: Math.max((toMinutes(preview.end) - toMinutes(preview.start)) * PX - 4, 24),
            }}
          >
            {preview.label}
          </div>
        )}
        {place(items).map(({ item, col, count }) => {
          const top = (toMinutes(item.startTime) - OPEN) * PX
          const height = Math.max((toMinutes(item.endTime) - toMinutes(item.startTime)) * PX - 4, 24)
          const approved = item.status === 'approved'
          const statusLabel = item.status === 'fixed' ? 'Horario fijo' : approved ? 'Confirmada' : 'Pendiente'
          return (
            <div
              key={item.id}
              title={[
                personName(users, item.teacherId),
                `${item.startTime}–${item.endTime}`,
                `${item.grade} ${item.section}`,
                item.purpose,
                item.students ? `${item.students} estudiantes` : '',
                item.roomName,
                statusLabel,
              ].filter(Boolean).join(' · ')}
              className={`absolute overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-xs ${
                item.status === 'fixed'
                  ? 'bg-indigo-600 text-white'
                  : approved
                  ? 'bg-emerald-600 text-white'
                  : 'border border-amber-500/40 bg-amber-500/20 text-amber-900 dark:text-amber-200'
              }`}
              style={{
                top,
                height,
                width: `calc(${100 / count}% - 6px)`,
                left: `calc(${(col / count) * 100}% + 2px)`,
              }}
            >
              <p className="truncate font-bold">{personName(users, item.teacherId)}</p>
              {height > 36 && (
                <p className={`truncate text-[10px] ${approved || item.status === 'fixed' ? 'text-white/80' : 'text-amber-800 dark:text-amber-300'}`}>
                  {item.startTime}–{item.endTime}
                </p>
              )}
              {height > 50 && (
                <p className={`truncate text-[10px] font-semibold ${approved || item.status === 'fixed' ? 'text-white/90' : 'text-amber-900 dark:text-amber-100'}`}>
                  {item.grade} {item.section}
                </p>
              )}
              {height > 65 && item.purpose && (
                <p className={`truncate text-[10px] ${approved || item.status === 'fixed' ? 'text-white/80' : 'text-amber-800 dark:text-amber-300'}`}>
                  {item.purpose}
                </p>
              )}
              {height > 82 && item.students > 0 && (
                <p className={`truncate text-[10px] ${approved || item.status === 'fixed' ? 'text-white/80' : 'text-amber-800 dark:text-amber-300'}`}>
                  {item.students} estudiantes
                </p>
              )}
            </div>
          )
        })}
        {showNow && nowMins > OPEN && nowMins < CLOSE && (
          <div className="pointer-events-none absolute right-0 left-0 z-20" style={{ top: (nowMins - OPEN) * PX }}>
            <div className="h-0.5 rounded bg-rose-500 shadow-xs" />
          </div>
        )}
      </div>
    </div>
  )
}

export function DayTimeline({ date, requests, users, preview }) {
  const items = requests.filter((item) => item.date === date && isVisibleSchedule(item.status))
  const showNow = date === todayISO()
  return (
    <Card className="border-border/80">
      <CardContent className="p-3">
        <Blocks items={items} users={users} preview={preview} showNow={showNow} />
      </CardContent>
    </Card>
  )
}

export function WeekBoard({ requests, users, canReserve = false, initialDate = todayISO(), onReserve }) {
  const [anchor, setAnchor] = useState(() => parseISODate(initialDate))
  const [compact, setCompact] = useState(false)
  const [dayIndex, setDayIndex] = useState(0)
  const [viewMode, setViewMode] = useState('week')
  const days = schoolWeek(anchor)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const apply = () => setCompact(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const index = schoolWeek(anchor).indexOf(initialDate)
    setDayIndex(index >= 0 ? index : 0)
  }, [anchor, initialDate])

  useEffect(() => {
    setAnchor((current) => schoolWeek(current).includes(initialDate) ? current : parseISODate(initialDate))
  }, [initialDate])

  const shift = (amount) => setAnchor((current) => {
    const next = new Date(current)
    next.setDate(next.getDate() + amount)
    return next
  })

  return (
    <Card className="border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-foreground">{formatWeekRange(days)}</p>
            <p className="text-xs text-muted-foreground">Lunes a viernes · {LAB.open} a {LAB.close}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon-sm" onClick={() => shift(-7)} aria-label="Semana anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())} className="text-xs font-bold">
                Hoy
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => shift(7)} aria-label="Semana siguiente">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {!compact && (
              <div className="flex items-center rounded-lg border border-border/80 p-0.5">
                <Button
                  variant={viewMode === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setViewMode('week')}
                >
                  Semana
                </Button>
                <Button
                  variant={viewMode === 'day' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setViewMode('day')}
                >
                  Día
                </Button>
              </div>
            )}
          </div>
        </div>

        {compact || viewMode === 'day' ? (
          <CompactDays
            days={days}
            dayIndex={dayIndex}
            setDayIndex={setDayIndex}
            requests={requests}
            users={users}
            canReserve={canReserve}
            onReserve={onReserve}
          />
        ) : (
          <div className="grid grid-cols-5 gap-2.5">
            {days.map((date) => (
              <DayColumn
                key={date}
                date={date}
                requests={requests}
                users={users}
                canReserve={canReserve}
                onReserve={onReserve}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompactDays({ days, dayIndex, setDayIndex, requests, users, canReserve, onReserve }) {
  const date = days[dayIndex]
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setDayIndex((index) => (index + 4) % 5)} aria-label="Día anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-bold capitalize text-foreground">{dayParts(date).weekday} {dayParts(date).number}</p>
        <Button variant="outline" size="icon-sm" onClick={() => setDayIndex((index) => (index + 1) % 5)} aria-label="Día siguiente">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <DayColumn date={date} requests={requests} users={users} canReserve={canReserve} onReserve={onReserve} stacked />
    </div>
  )
}

function DayColumn({ date, requests, users, canReserve, onReserve }) {
  const items = requests.filter((item) => item.date === date && isVisibleSchedule(item.status))
  const parts = dayParts(date)
  const today = date === todayISO()
  const bookable = canReserve && date >= todayISO()
  const now = new Date()
  const minute = now.getHours() * 60 + now.getMinutes()

  return (
    <div className={`rounded-xl border p-2 transition-colors ${today ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-muted/20'}`}>
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{parts.weekday}</p>
          <p className="text-base font-extrabold leading-none text-foreground">{parts.number}</p>
        </div>
        {bookable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-primary hover:bg-primary hover:text-primary-foreground"
            aria-label={`Solicitar horario para el ${parts.weekday} ${parts.number}`}
            title="Solicitar horario"
            onClick={() => onReserve(date)}
          >
            <Plus className="size-3" />
          </Button>
        )}
      </div>
      <div className="relative">
        <Blocks items={items} users={users} />
        {today && minute > OPEN && minute < CLOSE && (
          <div className="pointer-events-none absolute right-1 left-12 z-20" style={{ top: (minute - OPEN) * PX }}>
            <div className="h-0.5 rounded bg-rose-500 shadow-xs" />
          </div>
        )}
      </div>
    </div>
  )
}
