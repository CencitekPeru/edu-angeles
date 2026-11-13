import { useState } from 'react'
import {
  Award, BookOpen, Bus, CheckCircle2, Church, CircleAlert, CirclePlay, CircleX, Clock, Drama, Landmark, Leaf, Presentation, ShieldAlert, Trophy, Users, UsersRound,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { staffLevels } from './shared'

/* Colours, icons and small pieces shared by the calendar and the activity list. */

/** How each stored status is shown to the user. */
export const STATUS_VIEW = {
  'Planificada': { label: 'Programada', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200' },
  'En preparación': { label: 'En preparación', icon: Clock, className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200' },
  'En ejecución': { label: 'En ejecución', icon: CirclePlay, className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200' },
  'Realizada': { label: 'Realizada', icon: CheckCircle2, className: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200' },
  'Postergada': { label: 'Por programar', icon: CircleAlert, className: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200' },
  'Cancelada': { label: 'Cancelada', icon: CircleX, className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300' },
}
export function StatusBadge({ status, className }) {
  const view = STATUS_VIEW[status] || STATUS_VIEW.Planificada
  const Icon = view.icon
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold', view.className, className)}><Icon className="size-3.5" /> {view.label}</span>
}

export const LEVEL_VIEW = {
  Institucional: { label: 'Toda la IE', long: 'Toda la institución', className: 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' },
  Secundaria: { label: 'Secundaria', long: 'Secundaria', className: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200' },
  Primaria: { label: 'Primaria', long: 'Primaria', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' },
}
export function LevelBadge({ level }) {
  const view = LEVEL_VIEW[level] || LEVEL_VIEW.Institucional
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', view.className)}>{view.label}</span>
}

/** 24 h "09:00" → "09:00 a. m.". */
export function clock12(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}
export const hoursLabel = (item) => (item.startTime ? (item.endTime ? `${clock12(item.startTime)} – ${clock12(item.endTime)}` : clock12(item.startTime)) : 'Todo el día')

export function DeleteActivityDialog({ activity, onClose, onDeleted }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  async function remove() {
    setBusy(true)
    const result = await api(`/api/activities/${activity.id}`, { method: 'DELETE' })
    setBusy(false)
    onClose()
    if (!result.ok) return toast(result.error || 'No se pudo eliminar la actividad.', 'bad')
    toast('Actividad eliminada.')
    return onDeleted()
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Eliminar «{activity.title}»?</DialogTitle>
          <DialogDescription>Se eliminarán también sus tareas, recursos e informe. Si solo cambió la fecha o no se realizará, es mejor marcarla como «Por programar» o «Cancelada».</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={remove}>{busy ? 'Eliminando…' : 'Sí, eliminar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Muted tones (formal palette): the colour only tells the type apart.
export const TONES = {
  blue: { chip: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100', dot: 'bg-blue-600', bar: 'border-l-blue-600', icon: 'text-blue-700 dark:text-blue-300' },
  violet: { chip: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100', dot: 'bg-violet-600', bar: 'border-l-violet-600', icon: 'text-violet-700 dark:text-violet-300' },
  amber: { chip: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100', dot: 'bg-amber-500', bar: 'border-l-amber-500', icon: 'text-amber-700 dark:text-amber-300' },
  green: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100', dot: 'bg-emerald-600', bar: 'border-l-emerald-600', icon: 'text-emerald-700 dark:text-emerald-300' },
  rose: { chip: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-100', dot: 'bg-rose-500', bar: 'border-l-rose-500', icon: 'text-rose-700 dark:text-rose-300' },
  cyan: { chip: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-100', dot: 'bg-cyan-600', bar: 'border-l-cyan-600', icon: 'text-cyan-700 dark:text-cyan-300' },
  sky: { chip: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100', dot: 'bg-sky-500', bar: 'border-l-sky-500', icon: 'text-sky-700 dark:text-sky-300' },
  orange: { chip: 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-100', dot: 'bg-orange-500', bar: 'border-l-orange-500', icon: 'text-orange-700 dark:text-orange-300' },
  teal: { chip: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-100', dot: 'bg-teal-600', bar: 'border-l-teal-600', icon: 'text-teal-700 dark:text-teal-300' },
  slate: { chip: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100', dot: 'bg-slate-500', bar: 'border-l-slate-500', icon: 'text-slate-600 dark:text-slate-300' },
}
export const TYPE_STYLE = {
  'Cívica': { label: 'Acto cívico', tone: 'blue', icon: Landmark },
  'Cultural': { label: 'Cultural', tone: 'violet', icon: Drama },
  'Deportiva': { label: 'Deportivo', tone: 'amber', icon: Trophy },
  'Ambiental': { label: 'Ambiental', tone: 'green', icon: Leaf },
  'Académica': { label: 'Académica', tone: 'rose', icon: Award },
  'Gestión del riesgo': { label: 'Gestión del riesgo', tone: 'cyan', icon: ShieldAlert },
  'Religiosa': { label: 'Religiosa', tone: 'sky', icon: Church },
  'Escuela de padres': { label: 'Escuela de padres', tone: 'orange', icon: UsersRound },
  'Salida / visita de estudio': { label: 'Salida de estudio', tone: 'teal', icon: Bus },
  'Reunión institucional': { label: 'Reunión', tone: 'slate', icon: Users },
  'Capacitación': { label: 'Capacitación', tone: 'slate', icon: Presentation },
  'Otra': { label: 'Otra', tone: 'slate', icon: BookOpen },
}
export const MAIN_TYPES = ['Cívica', 'Cultural', 'Deportiva', 'Ambiental', 'Académica']
export const styleOf = (type) => { const style = TYPE_STYLE[type] || TYPE_STYLE['Otra']; return { ...style, ...TONES[style.tone] } }
export const inactive = (item) => ['Cancelada', 'Postergada'].includes(item.status)

/** Lead teachers and supporting teachers of an activity (falls back to the free-text responsible). */
export function peopleOf(item) {
  const levels = staffLevels(item.level).filter((level) => item.staff?.[level]?.lead)
  const leads = levels.map((level) => item.staff[level].lead)
  const support = [...new Set(levels.flatMap((level) => item.staff[level].support || []))]
  return { leads: leads.length ? leads : item.responsible ? [item.responsible] : [], support }
}
