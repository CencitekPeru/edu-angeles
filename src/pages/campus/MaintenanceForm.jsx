import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarCheck,
  CalendarDays,
  CloudUpload,
  FileText,
  Image as ImageIcon,
  Layers,
  ListChecks,
  MapPin,
  Save,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Select } from '../attendance/shared'

const LEVELS = ['Primaria', 'Secundaria', 'Ambos']
export const MAINTENANCE_STATUS = ['Programado', 'En proceso', 'Realizado', 'Pendiente']
const STATUS_DOT = { Programado: 'bg-primary', 'En proceso': 'bg-[#b7832f]', Realizado: 'bg-[#3f7d5c]', Pendiente: 'bg-[#b4413c]' }
export const CHECKLIST = ['Limpieza física (polvo)', 'Verificación de funcionamiento', 'Actualización de software / firmware', 'Cambio de componentes', 'Ajustes y configuración']
const OTHER = 'Otras (especificar)'
const PRIORITY_TONE = {
  alta: 'border-[#e8c4c1] bg-[#fbf1f0] text-[#9a2f2a]',
  media: 'border-[#ead9b8] bg-[#fbf6ec] text-[#8a5a12]',
  baja: 'border-[#c9dccf] bg-[#f1f7f3] text-[#2f6447]',
}
const TIC = '__soporte_tic__'
const MAX_FILES = 6
const MAX_SIZE = 5 * 1024 * 1024

function Section({ number, icon: Icon, title, children, className, extra }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2 text-[15px] font-bold text-foreground dark:bg-muted/60">
        <Icon className="size-[18px] text-primary" /> {number}. {title} {extra}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  )
}

function F({ label, required, optional, children, className }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}{required && <span className="text-destructive"> *</span>}{optional && <span className="font-normal text-muted-foreground"> (opcional)</span>}</span>
      {children}
    </label>
  )
}

function FilePreview({ name, url, pdf, onRemove }) {
  return (
    <div className="relative h-28 overflow-hidden rounded-lg border border-border bg-slate-50 dark:bg-muted">
      {pdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-xs">
          <FileText className="size-8 text-[#b4413c]" /><span className="line-clamp-2 break-all">{name || 'Documento PDF'}</span>
        </a>
      ) : <img src={url} alt={name || 'Evidencia'} className="size-full object-cover" />}
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md border border-border bg-card text-[#b4413c] shadow-sm hover:bg-muted" aria-label="Quitar archivo">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}

export function MaintenanceForm({ row, equipment, materials, places, users, onClose, onSaved }) {
  const { toast } = useApp()
  const editing = Boolean(row?.id)
  const saved = row?.checklist || []
  const [form, setForm] = useState(() => ({
    assetKind: row?.assetKind || 'tecnologico',
    equipmentId: row?.equipmentId ? String(row.equipmentId) : '',
    materialId: row?.materialId ? String(row.materialId) : '',
    type: row?.type || 'Preventivo',
    priority: row?.priority || 'media',
    level: row?.level || '',
    place: row?.place || '',
    placeDetail: row?.placeDetail || '',
    scheduledDate: row?.date || '',
    executedDate: row?.executedDate || '',
    startTime: row?.startTime || '',
    endTime: row?.endTime || '',
    nextDate: row?.nextDate || '',
    activities: row?.activities || '',
    checklist: saved.filter((item) => CHECKLIST.includes(item)),
    other: saved.includes(OTHER) || Boolean(row?.otherActivity),
    otherActivity: row?.otherActivity || '',
    responsible: row?.responsibleId ? String(row.responsibleId) : (row?.responsibleLabel ? TIC : ''),
    status: row?.status || 'Programado',
  }))
  const [files, setFiles] = useState([])
  const [urls, setUrls] = useState([])
  const [savedFiles, setSavedFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file))
    setUrls(next)
    return () => next.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  useEffect(() => {
    if (!editing) return undefined
    let active = true
    api(`/api/maintenance/${row.id}`).then((result) => { if (active && result.ok) setSavedFiles(result.photos) })
    return () => { active = false }
  }, [editing, row?.id])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const technological = form.assetKind === 'tecnologico'
  const assets = technological ? equipment : materials
  const asset = technological
    ? equipment.find((item) => String(item.id) === form.equipmentId)
    : materials.find((item) => String(item.id) === form.materialId)
  const staff = users.filter((item) => item.role !== 'teacher' && item.active !== false)

  function chooseAsset(id) {
    const item = assets.find((entry) => String(entry.id) === id)
    set({
      [technological ? 'equipmentId' : 'materialId']: id,
      level: item?.level || form.level,
      place: item?.place || form.place,
      placeDetail: (technological && item?.placeDetail) || form.placeDetail,
    })
  }

  function toggle(item) {
    set({ checklist: form.checklist.includes(item) ? form.checklist.filter((entry) => entry !== item) : [...form.checklist, item] })
  }

  function addFiles(list) {
    const incoming = Array.from(list || [])
    const valid = incoming.filter((file) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) && file.size <= MAX_SIZE)
    if (valid.length < incoming.length) toast('Solo se aceptan JPG, PNG o PDF de hasta 5 MB por archivo.', 'bad')
    const room = MAX_FILES - files.length - savedFiles.length
    if (valid.length > room) toast(`Máximo ${MAX_FILES} archivos por mantenimiento.`, 'bad')
    setFiles([...files, ...valid.slice(0, Math.max(0, room))])
  }

  const errors = useMemo(() => {
    const list = []
    if (!(technological ? form.equipmentId : form.materialId)) list.push('el bien')
    if (!form.level) list.push('el nivel educativo')
    if (!form.place) list.push('el ambiente')
    if (!form.scheduledDate) list.push('la fecha programada')
    if (form.startTime && form.endTime && form.endTime <= form.startTime) list.push('una hora de fin posterior al inicio')
    if (form.activities.trim().length < 8) list.push('la descripción (mín. 8 caracteres)')
    if (form.other && !form.otherActivity.trim()) list.push('la otra actividad')
    if (!form.responsible) list.push('el responsable')
    if (form.status === 'Realizado' && !form.executedDate) list.push('la fecha de ejecución')
    return list
  }, [form, technological])

  async function save(event) {
    event.preventDefault()
    setShowErrors(true)
    if (errors.length) return toast(`Completa: ${errors.join(', ')}.`, 'bad')
    setBusy(true)
    const payload = {
      ...form,
      equipmentId: technological ? form.equipmentId : null,
      materialId: technological ? null : form.materialId,
      checklist: form.other ? [...form.checklist, OTHER] : form.checklist,
      otherActivity: form.other ? form.otherActivity : '',
      responsibleId: form.responsible === TIC ? null : form.responsible,
      responsibleLabel: form.responsible === TIC ? 'Soporte TIC' : '',
    }
    const result = editing
      ? await api(`/api/maintenance/${row.id}`, { method: 'PATCH', body: payload })
      : await api('/api/maintenance', { method: 'POST', body: payload })
    if (!result.ok) {
      setBusy(false)
      return toast(result.error || 'No se pudo guardar el mantenimiento.', 'bad')
    }
    const id = result.id || row.id
    if (files.length) {
      const sent = await upload(`/api/maintenance/${id}/photos`, files)
      if (!sent.ok) toast('El mantenimiento se guardó, pero algunos archivos no se subieron.', 'bad')
    }
    setBusy(false)
    toast(editing ? 'Mantenimiento actualizado.' : `Mantenimiento ${result.code} registrado.`)
    onSaved()
  }

  async function removeSaved(file) {
    const result = await api(`/api/maintenance/${row.id}/photos/${file.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo quitar el archivo.', 'bad')
    setSavedFiles(savedFiles.filter((item) => item.id !== file.id))
  }

  const missing = (condition) => showErrors && condition && 'border-destructive ring-1 ring-destructive/40'

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex items-start gap-4 border-b border-border px-6 pb-4 pt-5">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-slate-50 text-primary dark:bg-muted"><Wrench className="size-6" /></span>
          <div className="flex-1">
            <DialogTitle className="text-2xl font-extrabold">{editing ? `Editar mantenimiento · ${row.code}` : 'Registrar mantenimiento'}</DialogTitle>
            <DialogDescription>Registre y programe el mantenimiento del bien (preventivo o correctivo).</DialogDescription>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <form id="maintenance-form" onSubmit={save} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#f7f8fa] p-5 dark:bg-background">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section number={1} icon={Layers} title="Tipo y bien">
              <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
                <F label="Tipo de bien" required>
                  <Select value={form.assetKind} disabled={editing} onChange={(assetKind) => set({ assetKind, equipmentId: '', materialId: '' })} options={[{ value: 'tecnologico', label: 'Bien tecnológico' }, { value: 'mobiliario', label: 'Bien mobiliario' }]} />
                </F>
                <F label="Equipo / Bien" required>
                  <Select className={missing(!asset)} value={technological ? form.equipmentId : form.materialId} onChange={chooseAsset}
                    options={[{ value: '', label: 'Seleccione el bien' }, ...assets.map((item) => ({ value: String(item.id), label: technological ? `${item.name} · ${[item.brand, item.model].filter(Boolean).join(' ')}` : item.name }))]} />
                </F>
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span><b className="text-foreground">Código patrimonial:</b> {asset ? (technological ? asset.patrimonial : asset.codMinedu) || '—' : '—'}</span>
                <span><b className="text-foreground">Categoría:</b> {asset?.category || '—'}</span>
              </p>
            </Section>

            <Section number={2} icon={Wrench} title="Tipo de mantenimiento">
              <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
                <F label="Tipo de mantenimiento" required>
                  <div className="grid grid-cols-2 gap-2">
                    {[['Preventivo', CalendarCheck], ['Correctivo', Wrench]].map(([value, Icon]) => (
                      <button key={value} type="button" onClick={() => set({ type: value })} aria-pressed={form.type === value}
                        className={cn('flex h-9 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors', form.type === value ? 'border-primary bg-slate-50 text-primary ring-1 ring-primary dark:bg-muted' : 'border-border bg-card text-foreground hover:bg-muted')}>
                        <span className={cn('flex size-3.5 items-center justify-center rounded-full border', form.type === value ? 'border-primary' : 'border-muted-foreground/50')}>{form.type === value && <span className="size-1.5 rounded-full bg-primary" />}</span>
                        <Icon className="size-4" /> {value}
                      </button>
                    ))}
                  </div>
                </F>
                <F label="Prioridad" required>
                  <Select className={cn('font-semibold', PRIORITY_TONE[form.priority])} value={form.priority} onChange={(priority) => set({ priority })} options={[{ value: 'alta', label: '⇈ Alta' }, { value: 'media', label: '= Media' }, { value: 'baja', label: '⇊ Baja' }]} />
                </F>
              </div>
            </Section>

            <Section number={3} icon={MapPin} title="Ubicación del bien">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Nivel educativo" required><Select className={missing(!form.level)} value={form.level} onChange={(level) => set({ level })} options={[{ value: '', label: 'Seleccione' }, ...LEVELS.map((value) => ({ value, label: value }))]} /></F>
                <F label="Ambiente" required><Select className={missing(!form.place)} value={form.place} onChange={(place) => set({ place })} options={[{ value: '', label: 'Seleccione' }, ...places.map((item) => ({ value: item.name, label: item.name }))]} /></F>
                <F label="Ubicación específica" className="sm:col-span-2"><Input value={form.placeDetail} onChange={(e) => set({ placeDetail: e.target.value })} placeholder="Mesa del docente" /></F>
              </div>
            </Section>

            <Section number={4} icon={CalendarDays} title="Planificación / Ejecución">
              <div className="grid gap-3 sm:grid-cols-4">
                <F label="Fecha programada" required><Input type="date" className={missing(!form.scheduledDate)} value={form.scheduledDate} onChange={(e) => set({ scheduledDate: e.target.value })} /></F>
                <F label="Fecha de ejecución" required={form.status === 'Realizado'}><Input type="date" className={missing(form.status === 'Realizado' && !form.executedDate)} value={form.executedDate} onChange={(e) => set({ executedDate: e.target.value })} /></F>
                <F label="Hora de inicio"><Input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} /></F>
                <F label="Hora de fin"><Input type="time" className={missing(form.startTime && form.endTime && form.endTime <= form.startTime)} value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} /></F>
                <F label="Próximo mantenimiento" optional className="sm:col-span-2"><Input type="date" value={form.nextDate} min={form.scheduledDate || undefined} onChange={(e) => set({ nextDate: e.target.value })} /></F>
              </div>
            </Section>
          </div>

          <Section number={5} icon={ListChecks} title="Actividades a realizar">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <F label="Descripción del mantenimiento" required>
                <Textarea className={missing(form.activities.trim().length < 8)} value={form.activities} maxLength={300} onChange={(e) => set({ activities: e.target.value })} placeholder="Limpieza interna y externa del equipo, verificación de temperatura, actualización de sistema y pruebas de funcionamiento." />
                <span className="text-right text-[11px] font-normal text-muted-foreground">{form.activities.length} / 300</span>
              </F>
              <div>
                <p className="mb-1.5 text-xs font-semibold">Actividades <span className="font-normal text-muted-foreground">(opcional)</span></p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {CHECKLIST.map((item) => (
                    <label key={item} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.checklist.includes(item)} onChange={() => toggle(item)} className="size-4 accent-[var(--primary)]" /> {item}
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.other} onChange={(e) => set({ other: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {OTHER}
                  </label>
                </div>
                {form.other && <Input className={cn('mt-2', missing(!form.otherActivity.trim()))} value={form.otherActivity} maxLength={160} onChange={(e) => set({ otherActivity: e.target.value })} placeholder="Especifique la actividad" />}
              </div>
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <Section number={6} icon={UserRound} title="Responsable y estado">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Responsable del mantenimiento" required>
                  <Select className={missing(!form.responsible)} value={form.responsible} onChange={(responsible) => set({ responsible })}
                    options={[{ value: '', label: 'Seleccione' }, { value: TIC, label: 'Soporte TIC' }, ...staff.map((item) => ({ value: String(item.id), label: item.name }))]} />
                </F>
                <F label="Estado del mantenimiento" required>
                  <div className="relative">
                    <span className={cn('pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full', STATUS_DOT[form.status])} />
                    <Select className="pl-7" value={form.status} onChange={(status) => set({ status })} options={MAINTENANCE_STATUS.map((value) => ({ value, label: value }))} />
                  </div>
                </F>
              </div>
            </Section>

            <Section number={7} icon={ImageIcon} title="Evidencia" extra={<span className="font-normal text-primary">(antes/durante/después)</span>}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {savedFiles.map((file) => <FilePreview key={file.id} name={file.fileName} url={file.path} pdf={/\.pdf$/i.test(file.path)} onRemove={() => removeSaved(file)} />)}
                {files.map((file, index) => <FilePreview key={`${file.name}-${index}`} name={file.name} url={urls[index]} pdf={file.type === 'application/pdf'} onRemove={() => setFiles(files.filter((_, position) => position !== index))} />)}
                {files.length + savedFiles.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                    className={cn('flex h-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-2 text-center text-xs transition-colors', dragging ? 'border-primary bg-slate-100 dark:bg-muted' : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-muted')}
                  >
                    <CloudUpload className="size-7 text-primary" />
                    <span className="font-semibold text-foreground">Agregar evidencia</span>
                    <span>o arrastrar y soltar aquí</span>
                  </button>
                )}
              </div>
              <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
              <p className="mt-2 text-center text-xs text-muted-foreground">Formatos: JPG, PNG, PDF. Máx. 5 MB por archivo.</p>
            </Section>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-3">
          <p className="text-xs text-muted-foreground">Los campos marcados con <span className="text-destructive">*</span> son obligatorios.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="maintenance-form" disabled={busy}><Save /> {busy ? 'Guardando…' : 'Guardar mantenimiento'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

