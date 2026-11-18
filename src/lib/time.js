export const LAB = {
  name: 'Sala de cómputo',
  open: '07:00',
  close: '17:30',
  minMinutes: 30,
  maxMinutes: 180,
  capacity: 32,
  horizonDays: 45,
}

/** Time zone of the school. Every «now» is taken here, never from the server's or browser's own clock settings. */
export const TIME_ZONE = 'America/Lima'

/**
 * Current date and time in Lima: { date: 'YYYY-MM-DD', time: 'HH:MM', minutes, weekday }.
 * The server may run in UTC (or another zone) and a browser may have a wrong zone; this is always Peru's time.
 */
export function nowLima(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((part) => [part.type, part.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  return { date, time: `${parts.hour}:${parts.minute}`, minutes, weekday: new Date(`${date}T12:00:00`).getDay() }
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function timeOptions() {
  const list = []
  for (let m = toMinutes(LAB.open); m <= toMinutes(LAB.close); m += 30) {
    list.push(fromMinutes(m))
  }
  return list
}

export function startOptions() {
  const last = toMinutes(LAB.close) - LAB.minMinutes
  return timeOptions().filter((t) => toMinutes(t) <= last)
}

export function endOptions(start) {
  const s = toMinutes(start)
  return timeOptions().filter((t) => {
    const diff = toMinutes(t) - s
    return diff >= LAB.minMinutes && diff <= LAB.maxMinutes
  })
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(date, n) {
  const d = date instanceof Date ? new Date(date.getTime()) : parseISODate(date)
  d.setDate(d.getDate() + n)
  d.setHours(12, 0, 0, 0)
  return d
}

/** Today's date in Lima. */
export function todayISO() {
  return nowLima().date
}

export function isWeekend(iso) {
  const day = parseISODate(iso).getDay()
  return day === 0 || day === 6
}

export function startOfWeek(input) {
  const d = input instanceof Date ? new Date(input.getTime()) : parseISODate(input)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function nextBookableDate() {
  const now = nowLima()
  let d = parseISODate(now.date)
  if (now.minutes >= 17 * 60) d = addDays(d, 1)
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1)
  return toISODate(d)
}

export function upcomingWeekdays(count, fromISO) {
  const days = []
  let d = parseISODate(fromISO || nextBookableDate())
  while (days.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(toISODate(d))
    d = addDays(d, 1)
  }
  return days
}

export function schoolWeek(anchor) {
  const monday = startOfWeek(anchor instanceof Date ? anchor : parseISODate(anchor))
  return [0, 1, 2, 3, 4].map((i) => toISODate(addDays(monday, i)))
}

export function formatDuration(start, end) {
  return formatMinutes(toMinutes(end) - toMinutes(start))
}

export function formatMinutes(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h} h ${m} min`
  if (h) return h === 1 ? '1 hora' : `${h} horas`
  return `${m} min`
}

export function formatLongDate(iso) {
  const text = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseISODate(iso))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatWeekRange(days) {
  const a = parseISODate(days[0])
  const b = parseISODate(days[days.length - 1])
  const fmt = new Intl.DateTimeFormat('es-CO', { month: 'short' })
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${fmt.format(b)} ${b.getFullYear()}`
  }
  return `${a.getDate()} ${fmt.format(a)} – ${b.getDate()} ${fmt.format(b)} ${b.getFullYear()}`
}

export function dayParts(iso) {
  const d = parseISODate(iso)
  const w = new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(d).replace('.', '')
  return {
    weekday: w.charAt(0).toUpperCase() + w.slice(1, 3),
    number: d.getDate(),
  }
}

export function slotDate(iso, hhmm) {
  const d = parseISODate(iso)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

/** Whether a time of a day (Lima) has already passed: earlier days, or today at or before the current minute. */
export function isPastTime(iso, hhmm) {
  const now = nowLima()
  return iso < now.date || (iso === now.date && toMinutes(hhmm) <= now.minutes)
}

/** Whether a reservation already ended (its end time, in Lima, is behind us). */
export function isPastEnd(iso, end) {
  const now = nowLima()
  return iso < now.date || (iso === now.date && toMinutes(end) < now.minutes)
}

export function rangesOverlap(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2
}

export function greeting(name) {
  const h = Math.floor(nowLima().minutes / 60)
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  return `${hello}, ${name.trim().split(/\s+/)[0]}`
}
