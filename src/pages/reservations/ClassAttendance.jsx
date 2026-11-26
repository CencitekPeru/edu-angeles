import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, ClipboardCheck, Clock, X, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { cn } from '@/lib/utils'
import { Panel } from '../campus/kit'
import { Pager, StatusChip, TONE, dmy, tableHead, td, th, usePaged } from '../attendance/shared'
import { requestCode, shortDayDate } from './shared'

export const CLASS_ATTENDANCE_META = {
  asistio: { label: 'Asistió', icon: CheckCircle2, chip: TONE.ok.chip, color: TONE.ok.color },
  no_asistio: { label: 'No asistió', icon: XCircle, chip: TONE.bad.chip, color: TONE.bad.color },
  unmarked: { label: 'Sin marcar', icon: Clock, chip: TONE.warn.chip, color: TONE.warn.color },
}

const FILTERS = [
  { value: 'unmarked', label: 'Sin marcar' },
  { value: 'all', label: 'Todas' },
]

/** Teacher's own classes (approved reservations and fixed schedule) to mark as attended or not. */
export default function ClassAttendance() {
  const { toast } = useApp()
  const [items, setItems] = useState(null)
  const [windowDays, setWindowDays] = useState(30)
  const [filter, setFilter] = useState('unmarked')
  const [saving, setSaving] = useState('')

  useEffect(() => {
    let cancel = false
    api('/api/my-classes').then((data) => {
      if (cancel) return
      if (!data.ok) {
        setItems([])
        toast(data.error || 'No se pudo cargar tus clases.', 'bad')
        return
      }
      setItems(data.items)
      setWindowDays(data.windowDays)
    })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markable = useMemo(() => (items || []).filter((item) => item.canMark), [items])
  const pendingCount = markable.filter((item) => !item.status).length
  const visible = filter === 'unmarked' ? markable.filter((item) => !item.status) : items || []
  const { rows, pager } = usePaged(visible, 5)

  async function mark(item, status) {
    const next = item.status === status ? null : status
    setSaving(item.key)
    const result = await api('/api/my-classes/attendance', {
      method: 'POST',
      body: { kind: item.kind, refId: item.refId, date: item.date, status: next },
    })
    setSaving('')
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    setItems(result.items)
    toast(next ? `Clase marcada como «${CLASS_ATTENDANCE_META[next].label}».` : 'Marca eliminada.')
  }

  return (
    <Panel
      title="Asistencia a mis clases"
      icon={ClipboardCheck}
      contentClassName="p-0"
      action={(
        <div className="flex items-center gap-2">
          {pendingCount > 0 && <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE.warn.chip)}>{pendingCount} sin marcar</span>}
          <div className="flex gap-1">
            {FILTERS.map((option) => (
              <button key={option.value} type="button" onClick={() => setFilter(option.value)}
                className={cn('rounded-md px-3 py-1 text-xs font-semibold', filter === option.value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted')}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    >
      <p className="border-b border-border px-5 py-2.5 text-xs text-muted-foreground">
        Marca si llegaste a dictar tus clases con reserva aprobada o en horario fijo. Puedes hacerlo desde que empieza la clase y hasta {windowDays} días después.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={tableHead}>
            <tr>{['Fecha', 'Horario', 'Origen', 'Ambiente', 'Grado / Sección', 'Actividad', 'Estado', 'Marcar'].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.key} className="border-t border-border/70">
                <td className={cn(td, 'whitespace-nowrap tabular-nums')} title={dmy(item.date)}>{shortDayDate(item.date)}</td>
                <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{item.startTime} – {item.endTime}</td>
                <td className={cn(td, 'whitespace-nowrap')}>{item.kind === 'fixed' ? 'Horario fijo' : `Reserva ${requestCode(item.refId)}`}</td>
                <td className={cn(td, 'whitespace-nowrap')}>{item.roomName || '—'}</td>
                <td className={td}>{item.grade} {item.section}</td>
                <td className={cn(td, 'max-w-[200px] truncate')} title={item.purpose}>{item.purpose}</td>
                <td className={td}>
                  {item.canMark
                    ? <StatusChip status={item.status || 'unmarked'} meta={CLASS_ATTENDANCE_META} />
                    : <span className="text-xs text-muted-foreground">Aún no empieza</span>}
                </td>
                <td className={td}>
                  <div className="flex gap-1">
                    <MarkButton active={item.status === 'asistio'} disabled={!item.canMark || saving === item.key} onClick={() => mark(item, 'asistio')}
                      label="Asistió" className="text-[#2f6447]" activeClassName={TONE.ok.chip}><Check /> Asistió</MarkButton>
                    <MarkButton active={item.status === 'no_asistio'} disabled={!item.canMark || saving === item.key} onClick={() => mark(item, 'no_asistio')}
                      label="No asistió" className="text-[#b4413c]" activeClassName={TONE.bad.chip}><X /> No asistió</MarkButton>
                  </div>
                </td>
              </tr>
            ))}
            {items === null && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Cargando clases…</td></tr>}
            {items && !rows.length && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                {filter === 'unmarked' ? 'No tienes clases pendientes de marcar.' : `No tienes clases en los últimos ${windowDays} días.`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length > 0 && <Pager {...pager} label="clases" />}
    </Panel>
  )
}

function MarkButton({ active, disabled, onClick, label, className, activeClassName, children }) {
  return (
    <button type="button" title={active ? `Quitar «${label}»` : `Marcar «${label}»`} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={cn('flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-35 [&_svg]:size-3.5', className, active && activeClassName)}>
      {children}
    </button>
  )
}
