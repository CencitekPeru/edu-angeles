import { useEffect, useState } from 'react'
import { History, Send, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Pill } from '../campus/kit'
import { CountedText, Field, FormHeader, Select, dmy, opts } from './shared'

/** Follow-up history of an external or administrative document; staff who can edit may add a note and move its status. */
export default function TrackingDialog({ record, statuses, canEdit, onClose, onChanged }) {
  const { toast } = useApp()
  const [entries, setEntries] = useState(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState(record.status)
  const [saving, setSaving] = useState(false)

  async function load() {
    const result = await api(`/api/docs/records/${record.id}/tracking`)
    if (result.ok) setEntries(result.tracking)
    else { setEntries([]); toast(result.error || 'No se pudo cargar el seguimiento.', 'bad') }
  }
  useEffect(() => { load() }, [record.id])

  async function add(event) {
    event.preventDefault()
    setSaving(true)
    const result = await api(`/api/docs/records/${record.id}/tracking`, { method: 'POST', body: { note, status } })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo registrar el seguimiento.', 'bad')
    toast('Seguimiento registrado.')
    setNote('')
    load()
    onChanged()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl [&>button:last-child]:top-5 [&>button:last-child]:text-white">
        <FormHeader icon={History} title={`Seguimiento · ${record.number}`} text={record.title} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Estado actual:</span> <Pill value={record.displayStatus} />
          {record.deadline && <span className="text-muted-foreground">· Plazo de atención: {dmy(record.deadline)}</span>}
          {record.responsible && <span className="text-muted-foreground">· Responsable: {record.responsible}</span>}
        </div>
        {record.actions && <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-muted/40"><span className="block text-xs font-semibold text-muted-foreground">Acciones registradas</span>{record.actions}</p>}

        <ol className="relative space-y-3 border-l border-border pl-5">
          {entries === null && <li className="text-sm text-muted-foreground">Cargando…</li>}
          {entries?.length === 0 && <li className="text-sm text-muted-foreground">Aún no hay acciones de seguimiento.</li>}
          {entries?.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{dmy(entry.createdAt)} {entry.createdAt.slice(11)}</span>
                <Pill value={entry.status} />
                {entry.user && <span>· {entry.user}</span>}
              </div>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{entry.note}</p>
            </li>
          ))}
        </ol>

        {canEdit && (
          <form id="tracking-form" onSubmit={add} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_200px]">
            <Field label="Nueva acción de seguimiento" required><CountedText rows={2} max={500} value={note} onChange={setNote} placeholder="Ej. Se derivó a Coordinación Académica para su atención…" required /></Field>
            <Field label="Estado del documento"><Select value={status} onChange={setStatus} options={opts(statuses)} /></Field>
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cerrar</Button>
          {canEdit && <Button type="submit" form="tracking-form" disabled={saving || note.trim().length < 3}><Send /> {saving ? 'Guardando…' : 'Registrar seguimiento'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
