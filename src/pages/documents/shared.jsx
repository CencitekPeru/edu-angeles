import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Download, Eye, FileText, Info, Pencil, Trash2, UploadCloud, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { api, download, getToken } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { todayLima } from '../attendance/shared'

export { Field } from '../psychology/shared'

/**
 * Form section: `className` lays out the fields inside it; `outer` sizes the section itself in the form grid
 * (e.g. 'lg:col-span-2' so it takes a whole row).
 */
// Same look as the sections of «Nueva Actividad» (title in the primary color, no numbering).
export function Section({ icon: Icon, title, children, className, outer }) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border', outer)}>
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-3 py-2 text-sm font-bold text-primary dark:bg-muted/40">
        {Icon && <Icon className="size-4" />} {title}
      </h3>
      <div className={cn('grid gap-3 p-3', className)}>{children}</div>
    </section>
  )
}
export { FilterLabel, Select } from '../attendance/shared'

export const DOCS = {
  instruments: '/admin/documentos/instrumentos',
  organization: '/admin/documentos/organizacion',
  external: '/admin/documentos/externos',
  administrative: '/admin/documentos/administrativos',
}

export const MAX_MB = 50
export const currentYear = () => Number(todayLima().slice(0, 4))
/** School years offered in the filters and forms. */
export const yearOptions = () => {
  const now = currentYear()
  return Array.from({ length: 12 }, (_, index) => now + 4 - index)
}
export const opts = (list, first) => [...(first !== undefined ? [{ value: '', label: first }] : []), ...list.map((value) => ({ value: String(value), label: String(value) }))]
export const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
export const yearOf = (iso) => (iso ? Number(iso.slice(0, 4)) : null)
export const pad = (number) => String(number).padStart(3, '0')
export const fileSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Sends a record with its optional PDF (multipart: `data` as JSON plus `file`). */
export async function sendWithFile(path, method, data, file) {
  const body = new FormData()
  body.append('data', JSON.stringify(data))
  if (file) body.append('file', file)
  let response
  try {
    response = await fetch(path, { method, headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body })
  } catch {
    return { ok: false, error: 'No hay conexión con el servidor.' }
  }
  const result = await response.json().catch(() => ({}))
  return { ...result, ok: response.ok }
}

/** Opens a stored PDF in a new tab (the file needs the session, so it is fetched first). */
export async function openPdf(path) {
  const tab = window.open('', '_blank')
  let response
  try {
    response = await fetch(`${path}?inline=1`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
  } catch {
    tab?.close()
    return { ok: false, error: 'No hay conexión con el servidor.' }
  }
  if (!response.ok) {
    tab?.close()
    const data = await response.json().catch(() => ({}))
    return { ok: false, error: data.error || 'No se pudo abrir el documento.' }
  }
  const url = URL.createObjectURL(await response.blob())
  if (tab) tab.location.href = url
  else window.location.assign(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { ok: true }
}

/** View / download helpers that report errors with a toast. */
export function useFileActions() {
  const { toast } = useApp()
  return {
    view: async (path) => { const result = await openPdf(path); if (!result.ok) toast(result.error, 'bad') },
    save: async (path, name) => { const result = await download(path, name); if (!result.ok) toast(result.error, 'bad') },
  }
}

/** Loads a list from the API and reloads it on demand. */
export function useList(path, key) {
  const { toast } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  async function load() {
    setLoading(true)
    const result = await api(path)
    setLoading(false)
    if (result.ok) setItems(result[key] || [])
    else toast(result.error || 'No se pudo cargar la información.', 'bad')
  }
  useEffect(() => { load() }, [path])
  return [items, loading, load]
}

/** Names of the school staff, for the responsible and member fields (free text is still allowed). */
export function StaffNames({ id }) {
  const { users } = useApp()
  return (
    <datalist id={id}>
      {[...new Set(users.filter((user) => user.active !== false).map((user) => user.name))].sort((a, b) => a.localeCompare(b, 'es')).map((name) => <option key={name} value={name} />)}
    </datalist>
  )
}

/** Textarea with a character counter. */
export function CountedText({ value, onChange, max, rows = 3, ...props }) {
  return (
    <div className="relative">
      <Textarea rows={rows} value={value} maxLength={max} onChange={(event) => onChange(event.target.value)} className="pb-5" {...props} />
      <span className="pointer-events-none absolute right-2 bottom-1 text-[11px] text-muted-foreground">{value.length} / {max}</span>
    </div>
  )
}

/** Classes for the DialogContent of the record forms (wide and scrollable, like the other forms of the panel). */
export const FORM_DIALOG = 'max-h-[94vh] w-[96vw] overflow-y-auto sm:max-w-6xl'

/** Header of the module dialogs, same as «Nueva Actividad»: icon in a tinted box, large title and description. */
export function FormHeader({ icon: Icon, title, text }) {
  return (
    <DialogHeader>
      <div className="flex items-center gap-3">
        {Icon && <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-6" /></span>}
        <div className="grid min-w-0 gap-0.5 text-left">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {text && <DialogDescription>{text}</DialogDescription>}
        </div>
      </div>
    </DialogHeader>
  )
}

export function FormNote({ children }) {
  return (
    <p className="mr-auto flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * PDF drop zone. `file` is a new File chosen now; `current` is the stored file ({ name, size }) of a record being edited.
 * `onView` opens the stored file; `onRemove` clears the new file or marks the stored one for removal.
 */
export function PdfDrop({ file, current, onFile, onRemove, onView, hint }) {
  const { toast } = useApp()
  const input = useRef(null)
  const [over, setOver] = useState(false)
  function pick(chosen) {
    if (!chosen) return
    if (chosen.type !== 'application/pdf' && !/\.pdf$/i.test(chosen.name)) return toast('Solo se aceptan archivos PDF.', 'bad')
    if (chosen.size > MAX_MB * 1024 * 1024) return toast(`El archivo supera los ${MAX_MB} MB.`, 'bad')
    onFile(chosen)
  }
  const shown = file ? { name: file.name, size: file.size } : current
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); pick(event.dataTransfer.files?.[0]) }}
        className={cn('flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40')}
      >
        <UploadCloud className="size-7 text-primary" />
        <span className="text-sm font-semibold">{shown ? 'Reemplazar documento (PDF)' : 'Subir documento (PDF)'}</span>
        <span className="text-xs text-muted-foreground">Arrastra y suelta el archivo aquí o haz clic para seleccionar</span>
        <span className="mt-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">Formato: PDF | Tamaño máximo: {MAX_MB} MB</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { pick(event.target.files?.[0]); event.target.value = '' }} />
      {hint && !shown && <p className="text-xs text-muted-foreground">{hint}</p>}
      {shown && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2 dark:bg-muted/40">
          <FileText className="size-7 shrink-0 text-[#9a2f2a]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{shown.name}</p>
            <p className="text-xs text-muted-foreground">{fileSize(shown.size)}{file ? ' · se subirá al guardar' : ''}</p>
          </div>
          {!file && onView && <Button type="button" variant="ghost" size="icon-sm" className="text-primary" onClick={onView} title="Ver documento" aria-label="Ver documento"><Eye /></Button>}
          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" onClick={onRemove} title="Quitar archivo" aria-label="Quitar archivo"><Trash2 /></Button>
        </div>
      )}
    </div>
  )
}

/** Icon buttons of a table row. Each action is shown only when given. */
export function RowActions({ label, onView, onFile, onDownload, onEdit, onDelete }) {
  const button = 'size-8 rounded-md border border-border'
  return (
    <span className="flex items-center gap-1">
      {onFile && <Button type="button" variant="ghost" size="icon" className={cn(button, 'text-primary')} title="Ver documento PDF" aria-label={`Ver documento de ${label}`} onClick={onFile}><FileText /></Button>}
      {onView && <Button type="button" variant="ghost" size="icon" className={cn(button, 'text-primary')} title="Ver detalle" aria-label={`Ver ${label}`} onClick={onView}><Eye /></Button>}
      {onDownload && <Button type="button" variant="ghost" size="icon" className={cn(button, 'text-primary')} title="Descargar PDF" aria-label={`Descargar ${label}`} onClick={onDownload}><Download /></Button>}
      {onEdit && <Button type="button" variant="ghost" size="icon" className={button} title="Editar" aria-label={`Editar ${label}`} onClick={onEdit}><Pencil /></Button>}
      {onDelete && <Button type="button" variant="ghost" size="icon" className={cn(button, 'text-destructive hover:bg-destructive/10')} title="Eliminar" aria-label={`Eliminar ${label}`} onClick={onDelete}><Trash2 /></Button>}
    </span>
  )
}

/** Date with a calendar icon, as in the tables of the module. */
export function DateCell({ iso }) {
  if (!iso) return <span className="text-muted-foreground">—</span>
  return <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums"><CalendarDays className="size-4 text-muted-foreground" />{dmy(iso)}</span>
}

/** Small neutral tag (document type, version…). */
export function Tag({ icon: Icon, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#cfd8ea] bg-[#f2f5fb] px-2 py-0.5 text-xs font-semibold text-[#1e3a8a] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300', className)}>
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  )
}

/** Delete confirmation. */
export function ConfirmDelete({ item, title, text, path, onClose, onDone }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  async function remove() {
    setBusy(true)
    const result = await api(path, { method: 'DELETE' })
    setBusy(false)
    if (!result.ok) return toast(result.error || 'No se pudo eliminar.', 'bad')
    toast('Registro eliminado.')
    onDone()
  }
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text} Esta acción no se puede deshacer y también se eliminará el PDF adjunto.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}><X /> Cancelar</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={remove}><Trash2 /> {busy ? 'Eliminando…' : 'Eliminar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Label / value list of the detail dialogs. */
export function Details({ rows }) {
  return (
    <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.filter(Boolean).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
