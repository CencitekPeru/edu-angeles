import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react'
import { TONE } from '../attendance/shared'

export const REQUEST_META = {
  pending: { label: 'Pendiente', icon: Clock, chip: TONE.warn.chip, color: TONE.warn.color },
  approved: { label: 'Aprobada', icon: CheckCircle2, chip: TONE.ok.chip, color: TONE.ok.color },
  rejected: { label: 'Rechazada', icon: XCircle, chip: TONE.bad.chip, color: TONE.bad.color },
  cancelled: { label: 'Cancelada', icon: MinusCircle, chip: TONE.neutral.chip, color: TONE.neutral.color },
}

export const requestCode = (id) => `SOL-${String(id).padStart(4, '0')}`

export function shortDayDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function createdParts(value) {
  if (!value) return { date: '—', time: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: String(value).slice(0, 10), time: '' }
  return {
    date: new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date),
  }
}
