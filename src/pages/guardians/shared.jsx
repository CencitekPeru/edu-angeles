import { useState } from 'react'
import { AlertTriangle, BadgeCheck, CheckCircle2, HandCoins, Receipt, RotateCcw, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { GUARDIAN_ATTENDANCE_LABEL, soles } from '../../lib/guardianMeetings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Pill } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import { CountedText, Field, FormHeader, FormNote, dmy } from '../documents/shared'

export const PARENTS = {
  meetings: '/admin/padres/reuniones',
  fines: '/admin/padres/multas',
  lookup: '/admin/padres/consulta',
}

/** Attendance of a guardian as a status pill. */
export const AttendancePill = ({ status }) => (status ? <Pill value={GUARDIAN_ATTENDANCE_LABEL[status]} /> : <span className="text-xs text-muted-foreground">Sin registro</span>)

/** Who was called: the whole school or a level / grade / section. */
export const scopeLabel = (item) => (item.level ? [item.level, item.grade && `${item.grade} grado`, item.section && `sección ${item.section}`].filter(Boolean).join(' · ') : 'Toda la institución')

/** Debt banner of a guardian: red when they owe, green when they are up to date. */
export function DebtBanner({ pendingAmount, pendingCount, className }) {
  const owes = pendingCount > 0
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3', owes ? 'border-[#e8c4c1] bg-[#fbf1f0] text-[#9a2f2a] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300' : 'border-[#c9dccf] bg-[#f1f7f3] text-[#2f6447] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300', className)}>
      {owes ? <AlertTriangle className="size-6 shrink-0" /> : <CheckCircle2 className="size-6 shrink-0" />}
      <div>
        <p className="font-bold">{owes ? `Tiene deuda pendiente: ${soles(pendingAmount)}` : 'No tiene deudas pendientes'}</p>
        <p className="text-xs opacity-80">{owes ? `${pendingCount} ${pendingCount === 1 ? 'multa pendiente' : 'multas pendientes'} por inasistencia u otras obligaciones.` : 'Está al día con sus obligaciones.'}</p>
      </div>
    </div>
  )
}

/**
 * Payment, waiver or reversal of a fine. `mode`: 'pay' | 'waive' | 'reopen'.
 */
export function FineActionDialog({ fine, mode, onClose, onDone }) {
  const { toast } = useApp()
  const [form, setForm] = useState({ paidOn: todayLima(), receipt: '', note: '' })
  const [saving, setSaving] = useState(false)
  const meta = {
    pay: { icon: HandCoins, title: 'Registrar pago de multa', status: 'Pagada', button: 'Registrar pago', done: 'Pago registrado.' },
    waive: { icon: BadgeCheck, title: 'Exonerar multa', status: 'Exonerada', button: 'Exonerar', done: 'Multa exonerada.' },
    reopen: { icon: RotateCcw, title: 'Volver a pendiente', status: 'Pendiente', button: 'Marcar como pendiente', done: 'La multa volvió a estar pendiente.' },
  }[mode]

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const result = await api(`/api/parent-fines/${fine.id}`, { method: 'PATCH', body: { ...form, status: meta.status } })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(meta.done)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <FormHeader icon={meta.icon} title={meta.title} text={`${fine.guardian.name} · DNI ${fine.guardian.dni}`} />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-slate-50 p-3 text-sm dark:bg-muted/40">
          <span><span className="block font-semibold">{fine.concept}</span><span className="text-xs text-muted-foreground">Emitida el {dmy(fine.issuedOn)}</span></span>
          <span className="text-lg font-extrabold tabular-nums">{soles(fine.amount)}</span>
        </div>
        <form id="fine-action" className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
          {mode === 'pay' && (
            <>
              <Field label="Fecha de pago" required><Input type="date" value={form.paidOn} max={todayLima()} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} required /></Field>
              <Field label="N.° de recibo / comprobante"><Input value={form.receipt} onChange={(event) => setForm({ ...form, receipt: event.target.value })} maxLength={60} placeholder="Ej. 001-000245" /></Field>
            </>
          )}
          <Field label={mode === 'waive' ? 'Motivo de la exoneración' : 'Observación'} required={mode === 'waive'} className="sm:col-span-2">
            <CountedText rows={2} max={255} value={form.note} onChange={(note) => setForm({ ...form, note })} required={mode === 'waive'}
              placeholder={mode === 'waive' ? 'Ej. Presentó constancia médica; acuerdo de la directiva…' : 'Opcional'} />
          </Field>
        </form>
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <FormNote>{mode === 'pay' ? 'El pago queda registrado y la deuda se descuenta.' : mode === 'waive' ? 'La multa deja de contarse como deuda.' : 'La multa vuelve a contarse como deuda.'}</FormNote>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="fine-action" disabled={saving}><Receipt /> {saving ? 'Guardando…' : meta.button}</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
