import {
  LAB,
  addDays,
  formatMinutes,
  isWeekend,
  rangesOverlap,
  slotDate,
  todayISO,
  toISODate,
  toMinutes,
} from './time.js'

export const GRADES = ['6°', '7°', '8°', '9°', '10°', '11°', 'Capacitación']
export const SECTIONS = ['A', 'B', 'C', 'Única']

export const STATUS = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
}

export function isBlocking(status) {
  return status === 'pending' || status === 'approved'
}

export function conflictingRequests(requests, { date, start, end, ignoreId, roomId }) {
  const s = toMinutes(start)
  const e = toMinutes(end)
  return requests.filter((item) => {
    if (item.id === ignoreId) return false
    if (item.date !== date || !isBlocking(item.status)) return false
    if (roomId && item.roomId && Number(item.roomId) !== Number(roomId)) return false
    return rangesOverlap(s, e, toMinutes(item.startTime), toMinutes(item.endTime))
  })
}

export function fixedConflicts(slots, { date, start, end, roomId }) {
  const weekday = new Date(`${date}T12:00:00`).getDay()
  const s = toMinutes(start)
  const e = toMinutes(end)
  return (slots || []).filter((slot) => {
    if (roomId && Number(slot.roomId) !== Number(roomId)) return false
    if (Number(slot.weekday) !== weekday) return false
    return rangesOverlap(s, e, toMinutes(slot.startTime), toMinutes(slot.endTime))
  })
}

function isHalfHour(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return false
  const minutes = toMinutes(value)
  return minutes % 30 === 0
}

export function validateRequest(requests, input, { ignoreId, teacherId } = {}) {
  const errors = {}
  const purpose = (input.purpose || '').trim()
  const notes = (input.notes || '').trim()
  const date = input.date
  const start = input.startTime
  const end = input.endTime
  const students = Number(input.students)

  if (!date) errors.date = 'Elige una fecha.'
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Fecha inválida.'
  else if (isWeekend(date)) errors.date = 'La sala abre de lunes a viernes.'
  else if (date < todayISO()) errors.date = 'No puedes reservar una fecha que ya pasó.'
  else if (date > toISODate(addDays(new Date(), LAB.horizonDays))) {
    errors.date = `Solo puedes reservar con hasta ${LAB.horizonDays} días de anticipación.`
  }

  if (!start || !end) errors.endTime = 'Indica la hora de inicio y de fin.'
  else if (!isHalfHour(start) || !isHalfHour(end)) {
    errors.endTime = 'Usa intervalos de 30 minutos.'
  } else {
    const s = toMinutes(start)
    const e = toMinutes(end)
    const open = toMinutes(LAB.open)
    const close = toMinutes(LAB.close)
    if (s < open || e > close) {
      errors.endTime = `La sala está disponible de ${LAB.open} a ${LAB.close}.`
    } else if (e <= s) {
      errors.endTime = 'La hora de fin debe ser posterior al inicio.'
    } else if (e - s < LAB.minMinutes) {
      errors.endTime = `La reserva mínima es de ${LAB.minMinutes} minutos.`
    } else if (e - s > LAB.maxMinutes) {
      errors.endTime = 'La reserva máxima es de 3 horas.'
    } else if (date === todayISO() && !errors.date && slotDate(date, start).getTime() <= Date.now()) {
      errors.endTime = 'Ese horario ya pasó. Elige una hora más tarde.'
    }
  }

  if (!input.grade) errors.grade = 'Selecciona el grado.'
  if (!input.section) errors.section = 'Selecciona el grupo.'
  if (!Number.isInteger(students) || students < 1 || students > LAB.capacity) {
    errors.students = `Indica entre 1 y ${LAB.capacity} estudiantes.`
  }
  if (purpose.length < 8) errors.purpose = 'Describe la actividad con al menos 8 caracteres.'
  if (notes.length > 240) errors.notes = 'La nota admite hasta 240 caracteres.'

  let conflicts = []
  if (!errors.date && !errors.endTime) {
    conflicts = conflictingRequests(requests, { date, start, end, ignoreId, roomId: input.roomId })
    if (conflicts.length) {
      errors.overlap = 'Ese horario se cruza con otra solicitud pendiente o aprobada.'
    }
    if (teacherId) {
      const used = requests
        .filter(
          (item) =>
            item.id !== ignoreId &&
            item.teacherId === teacherId &&
            item.date === date &&
            isBlocking(item.status),
        )
        .reduce((total, item) => total + toMinutes(item.endTime) - toMinutes(item.startTime), 0)
      const next = toMinutes(end) - toMinutes(start)
      if (used + next > LAB.maxMinutes) {
        errors.limit = `Ya tienes ${formatMinutes(used)} en este día. Cada docente puede reservar hasta 3 horas.`
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, conflicts }
}

export function reservedMinutes(requests, date, statuses = ['approved']) {
  return requests
    .filter((item) => item.date === date && statuses.includes(item.status))
    .reduce((total, item) => total + toMinutes(item.endTime) - toMinutes(item.startTime), 0)
}

export function occupancyPercent(requests, date) {
  const span = toMinutes(LAB.close) - toMinutes(LAB.open)
  return Math.min(100, Math.round((reservedMinutes(requests, date) / span) * 100))
}

export function personName(users, id) {
  return users.find((user) => user.id === id)?.name || 'Docente'
}
