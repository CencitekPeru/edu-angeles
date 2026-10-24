export const LAB = {
  name: 'Sala de cómputo',
  open: '07:00',
  close: '17:30',
  minMinutes: 30,
  maxMinutes: 180,
  capacity: 32,
  horizonDays: 45,
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

export function todayISO() {
  return toISODate(new Date())
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
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  if (nowMins >= 17 * 60) d = addDays(d, 1)
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

export function isPastEnd(iso, end) {
  return slotDate(iso, end).getTime() < Date.now()
}

export function rangesOverlap(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2
}

export function greeting(name) {
  const h = new Date().getHours()
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  return `${hello}, ${name.trim().split(/\s+/)[0]}`
}
