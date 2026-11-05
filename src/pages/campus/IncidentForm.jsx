import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Armchair,
  CalendarClock,
  CloudUpload,
  FileText,
  Image as ImageIcon,
  Layers,
  Laptop,
  MapPin,
  PlusSquare,
  Save,
  Settings2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { INCIDENT_STATUS } from '../../lib/school'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Select } from '../attendance/shared'

const LEVELS = ['Primaria', 'Secundaria', 'Ambos']
const REPORTERS = ['Docente', 'Auxiliar', 'Coordinación', 'Dirección', 'Estudiante', 'Personal administrativo', 'Personal de servicio', 'Otro']
const STATES = ['Operativo', 'Con fallas', 'Inoperativo']
const STATE_DOT = { Operativo: 'bg-[#3f7d5c]', 'Con fallas': 'bg-[#b7832f]', Inoperativo: 'bg-[#b4413c]' }
export const INCIDENT_TYPES = {
  tecnologico: ['No enciende', 'No muestra imagen / pantalla', 'Sin conexión a internet', 'Lentitud del sistema', 'Ruido o sobrecalentamiento', 'Falla de software o virus', 'Periférico dañado (teclado, mouse, cable)', 'Batería o cargador', 'No imprime / atasco de papel', 'Daño físico', 'Pérdida o robo', 'Otro'],
  mobiliario: ['Rotura', 'Pieza suelta o faltante', 'Desgaste', 'Humedad o plagas', 'Daño por mal uso', 'Pérdida o robo', 'Otro'],
}
const PRIORITY_TONE = {
  alta: 'border-[#e8c4c1] bg-[#fbf1f0] text-[#9a2f2a]',
  media: 'border-[#ead9b8] bg-[#fbf6ec] text-[#8a5a12]',
  baja: 'border-[#c9dccf] bg-[#f1f7f3] text-[#2f6447]',
}
const MAX_FILES = 6
const MAX_SIZE = 5 * 1024 * 1024

const nowLocal = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function Section({ number, icon: Icon, title, children, className, extra }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2 text-[15px] font-bold text-foreground dark:bg-muted/60">
        <Icon className="size-[18px] text-primary" /> {number ? `${number}. ` : ''}{title} {extra}
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

function FilePreview({ file, url, onRemove }) {
  const pdf = file ? file.type === 'application/pdf' : /\.pdf$/i.test(url)
  return (
    <div className="relative h-28 overflow-hidden rounded-lg border border-border bg-slate-50 dark:bg-muted">
      {pdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-foreground">
          <FileText className="size-8 text-[#b4413c]" />
          <span className="line-clamp-2 break-all">{file?.name || 'Documento PDF'}</span>
        </a>
      ) : (
        <img src={url} alt={file?.name || 'Evidencia'} className="size-full object-cover" />
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md border border-border bg-card text-[#b4413c] shadow-sm hover:bg-muted" aria-label="Quitar archivo">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}

function useObjectUrls(files) {
  const [urls, setUrls] = useState([])
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file))
    setUrls(next)
    return () => next.forEach((url) => URL.revokeObjectURL(url))
  }, [files])
  return urls
}

export function IncidentForm({ row, equipment, materials, places, users, admin, onClose, onSaved }) {
  const { toast } = useApp()
  const editing = Boolean(row?.id)
  const [form, setForm] = useState(() => ({
    assetKind: row?.assetKind || '',
    equipmentId: row?.equipmentId ? String(row.equipmentId) : '',
    materialId: row?.materialId ? String(row.materialId) : '',
    level: row?.level || '',
    place: row?.place || '',
    placeDetail: row?.placeDetail || '',
    incidentType: row?.incidentType || '',
    priority: row?.priority || 'media',
    description: row?.description || '',
    detectedAt: row?.detectedAt || nowLocal(),
    reportedByRole: row?.reportedByRole || '',
    reporterName: row?.reporterName || '',
    initialState: row?.initialState || '',
    observations: row?.observations || '',
    status: row?.status || 'pendiente',
    assigneeId: row?.assigneeId ? String(row.assigneeId) : '',
    solution: row?.solution || '',
  }))
  const [files, setFiles] = useState([])
  const [afterFiles, setAfterFiles] = useState([])
  const [saved, setSaved] = useState({ before: [], after: [] })
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const inputRef = useRef(null)
  const urls = useObjectUrls(files)
  const afterUrls = useObjectUrls(afterFiles)

  useEffect(() => {
    if (!editing) return undefined
    let active = true
    api(`/api/incidents/${row.id}`).then((result) => { if (active && result.ok) setSaved(result.photos) })
    return () => { active = false }
  }, [editing, row?.id])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const technological = form.assetKind === 'tecnologico'
  const assets = technological ? equipment : materials
  const asset = technological
    ? equipment.find((item) => String(item.id) === form.equipmentId)
    : materials.find((item) => String(item.id) === form.materialId)
  const patrimonial = asset ? (technological ? asset.patrimonial : asset.codMinedu) : ''
  const types = INCIDENT_TYPES[form.assetKind] || []

  function chooseAsset(id) {
    const item = (technological ? equipment : materials).find((entry) => String(entry.id) === id)
    set({
      [technological ? 'equipmentId' : 'materialId']: id,
      level: item?.level || form.level,
      place: item?.place || form.place,
      placeDetail: (technological && item?.placeDetail) || form.placeDetail,
    })
  }

  function addFiles(list, setter, current) {
    const incoming = Array.from(list || [])
    const valid = incoming.filter((file) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) && file.size <= MAX_SIZE)
    if (valid.length < incoming.length) toast('Solo se aceptan JPG, PNG o PDF de hasta 5 MB por archivo.', 'bad')
    const room = MAX_FILES - current.length
    if (valid.length > room) toast(`Máximo ${MAX_FILES} archivos por incidencia.`, 'bad')
    setter([...current, ...valid.slice(0, Math.max(0, room))])
  }

  const errors = useMemo(() => {
    const list = []
    if (!form.assetKind) list.push('el tipo de bien')
    if (!(technological ? form.equipmentId : form.materialId)) list.push('el bien')
    if (!form.level) list.push('el nivel educativo')
    if (!form.place) list.push('el ambiente')
    if (!form.incidentType) list.push('el tipo de incidencia')
    if (form.description.trim().length < 8) list.push('la descripción (mín. 8 caracteres)')
    if (!form.detectedAt) list.push('la fecha y hora de detección')
    if (!form.reportedByRole) list.push('quién reporta')
    if (!form.initialState) list.push('el estado inicial del bien')
    return list
  }, [form, technological])

  async function save(event) {
    event.preventDefault()
    setShowErrors(true)
    if (errors.length) return toast(`Completa: ${errors.join(', ')}.`, 'bad')
    setBusy(true)
    const payload = { ...form, equipmentId: technological ? form.equipmentId : null, materialId: technological ? null : form.materialId, assigneeId: form.assigneeId || null }
    const result = editing
      ? await api(`/api/incidents/${row.id}`, { method: 'PATCH', body: payload })
      : await api('/api/incidents', { method: 'POST', body: payload })
    if (!result.ok) {
      setBusy(false)
      return toast(result.error || 'No se pudo guardar la incidencia.', 'bad')
    }
    const id = result.id || row.id
    const uploads = [
      files.length ? upload(`/api/incidents/${id}/photos`, files, { kind: 'before' }) : null,
      afterFiles.length ? upload(`/api/incidents/${id}/photos`, afterFiles, { kind: 'after' }) : null,
    ].filter(Boolean)
    const sent = await Promise.all(uploads)
    setBusy(false)
    if (sent.some((item) => !item.ok)) toast('La incidencia se guardó, pero algunos archivos no se subieron.', 'bad')
    else toast(editing ? 'Incidencia actualizada.' : `Incidencia ${result.code} registrada.`)
    onSaved()
  }

  async function removeSaved(photo, kind) {
    const result = await api(`/api/incidents/${row.id}/photos/${photo.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo quitar el archivo.', 'bad')
    setSaved((current) => ({ ...current, [kind]: current[kind].filter((item) => item.id !== photo.id) }))
  }

  const missing = (condition) => showErrors && condition && 'border-destructive ring-1 ring-destructive/40'

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex items-start gap-4 border-b border-border px-6 pb-4 pt-5">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-slate-50 text-primary dark:bg-muted"><PlusSquare className="size-6" /></span>
          <div className="flex-1">
            <DialogTitle className="text-2xl font-extrabold">{editing ? `Atender incidencia · ${row.code}` : 'Registrar incidencia'}</DialogTitle>
            <DialogDescription>{editing ? 'Actualiza el detalle, el seguimiento y la solución de la incidencia.' : 'Registre una nueva incidencia para bienes tecnológicos o mobiliarios.'}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <form id="incident-form" onSubmit={save} className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] p-5 dark:bg-background">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Section number={1} icon={Layers} title="Tipo de bien">
                <F label="Tipo de bien" required>
                  <div className={cn('grid grid-cols-2 gap-2 rounded-lg', missing(!form.assetKind))}>
                    {[['tecnologico', 'Bien tecnológico', Laptop], ['mobiliario', 'Bien mobiliario', Armchair]].map(([value, label, Icon]) => (
                      <button key={value} type="button" disabled={editing} onClick={() => set({ assetKind: value, equipmentId: '', materialId: '', incidentType: '' })} aria-pressed={form.assetKind === value}
                        className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-70', form.assetKind === value ? 'border-primary bg-slate-50 text-primary ring-1 ring-primary dark:bg-muted' : 'border-border bg-card text-foreground hover:bg-muted')}>
                        <Icon className="size-[18px]" /> {label}
                      </button>
                    ))}
                  </div>
                </F>
              </Section>

              <Section number={3} icon={MapPin} title="Ubicación del bien">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F label="Nivel educativo" required><Select className={missing(!form.level)} value={form.level} onChange={(level) => set({ level })} options={[{ value: '', label: 'Seleccione' }, ...LEVELS.map((value) => ({ value, label: value }))]} /></F>
                  <F label="Ambiente" required><Select className={missing(!form.place)} value={form.place} onChange={(place) => set({ place })} options={[{ value: '', label: 'Seleccione' }, ...places.map((item) => ({ value: item.name, label: item.name }))]} /></F>
                  <F label="Ubicación específica" className="sm:col-span-2"><Input value={form.placeDetail} onChange={(e) => set({ placeDetail: e.target.value })} placeholder="Mesa del docente" /></F>
                </div>
              </Section>

              <Section number={5} icon={CalendarClock} title="Registro y responsable">
                <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1.2fr]">
                  <F label="Fecha y hora de detección" required><Input type="datetime-local" className={missing(!form.detectedAt)} value={form.detectedAt} max={nowLocal()} onChange={(e) => set({ detectedAt: e.target.value })} /></F>
                  <F label="Reportado por" required><Select className={missing(!form.reportedByRole)} value={form.reportedByRole} onChange={(reportedByRole) => set({ reportedByRole })} options={[{ value: '', label: 'Seleccione' }, ...REPORTERS.map((value) => ({ value, label: value }))]} /></F>
                  <F label="Nombre" optional><Input value={form.reporterName} onChange={(e) => set({ reporterName: e.target.value })} placeholder="María Quispe Condori" /></F>
                </div>
              </Section>

              <Section number={6} icon={Settings2} title="Estado inicial y observaciones">
                <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
                  <F label="Estado inicial del bien" required>
                    <div className="relative">
                      {form.initialState && <span className={cn('pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full', STATE_DOT[form.initialState])} />}
                      <Select className={cn(form.initialState && 'pl-7', missing(!form.initialState))} value={form.initialState} onChange={(initialState) => set({ initialState })} options={[{ value: '', label: 'Seleccione' }, ...STATES.map((value) => ({ value, label: value }))]} />
                    </div>
                  </F>
                  <F label="Observaciones">
                    <Textarea value={form.observations} maxLength={200} onChange={(e) => set({ observations: e.target.value })} placeholder="El equipo no presenta daños físicos. Se requiere diagnóstico técnico." className="min-h-20" />
                    <span className="text-right text-[11px] font-normal text-muted-foreground">{form.observations.length} / 200</span>
                  </F>
                </div>
              </Section>
            </div>

            <div className="space-y-4">
              <Section number={2} icon={technological ? Laptop : Armchair} title="Bien (del inventario)">
                <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
                  <F label={technological ? 'Equipo / Bien' : 'Bien mobiliario'} required>
                    <Select
                      className={missing(!asset)}
                      disabled={!form.assetKind}
                      value={technological ? form.equipmentId : form.materialId}
                      onChange={chooseAsset}
                      options={[{ value: '', label: form.assetKind ? 'Seleccione el bien' : 'Primero elija el tipo de bien' }, ...assets.map((item) => ({ value: String(item.id), label: technological ? `${item.name} · ${[item.brand, item.model].filter(Boolean).join(' ')} (${item.patrimonial || item.code})` : `${item.name}${item.codMinedu ? ` (${item.codMinedu})` : ''}` }))]}
                    />
                  </F>
                  <F label="Código patrimonial"><Input value={patrimonial || ''} readOnly placeholder="—" className="bg-slate-50 font-semibold dark:bg-muted" /></F>
                </div>
                {asset && (
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><b className="text-foreground">Categoría:</b> {asset.category || '—'}</span>
                    {technological ? (
                      <>
                        <span><b className="text-foreground">Marca:</b> {asset.brand || '—'}</span>
                        <span><b className="text-foreground">Modelo:</b> {asset.model || '—'}</span>
                      </>
                    ) : <span><b className="text-foreground">Tipo:</b> {asset.type || '—'}</span>}
                  </p>
                )}
              </Section>

              <Section number={4} icon={AlertTriangle} title="Detalle de la incidencia">
                <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
                  <F label="Tipo de incidencia" required><Select className={missing(!form.incidentType)} disabled={!form.assetKind} value={form.incidentType} onChange={(incidentType) => set({ incidentType })} options={[{ value: '', label: 'Seleccione' }, ...[...types, ...(form.incidentType && !types.includes(form.incidentType) ? [form.incidentType] : [])].map((value) => ({ value, label: value }))]} /></F>
                  <F label="Prioridad" required><Select className={cn('font-semibold', PRIORITY_TONE[form.priority])} value={form.priority} onChange={(priority) => set({ priority })} options={[{ value: 'alta', label: '⇈ Alta' }, { value: 'media', label: '= Media' }, { value: 'baja', label: '⇊ Baja' }]} /></F>
                  <F label="Descripción del problema" required className="sm:col-span-2">
                    <Textarea className={missing(form.description.trim().length < 8)} value={form.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} placeholder="La laptop no enciende, no muestra luces de encendido ni imagen en la pantalla." />
                    <span className="text-right text-[11px] font-normal text-muted-foreground">{form.description.length} / 300</span>
                  </F>
                </div>
              </Section>

              <Section number={7} icon={ImageIcon} title="Evidencia" extra={<span className="font-normal text-primary">(fotografías o documentos)</span>}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {saved.before.map((photo) => <FilePreview key={photo.id} url={photo.path} file={photo.fileName ? { name: photo.fileName, type: /\.pdf$/i.test(photo.path) ? 'application/pdf' : 'image' } : null} onRemove={admin ? () => removeSaved(photo, 'before') : null} />)}
                  {files.map((file, index) => <FilePreview key={`${file.name}-${index}`} file={file} url={urls[index]} onRemove={() => setFiles(files.filter((_, position) => position !== index))} />)}
                  {saved.before.length + files.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files, setFiles, files) }}
                      className={cn('flex h-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-2 text-center text-xs transition-colors', dragging ? 'border-primary bg-slate-100 dark:bg-muted' : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-muted')}
                    >
                      <CloudUpload className="size-7 text-primary" />
                      <span className="font-semibold text-foreground">Agregar evidencia</span>
                      <span>o arrastrar y soltar aquí</span>
                    </button>
                  )}
                </div>
                <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files, setFiles, files); e.target.value = '' }} />
                <p className="mt-2 text-center text-xs text-muted-foreground">Formatos: JPG, PNG, PDF. Máx. 5 MB por archivo.</p>
              </Section>
            </div>

            {editing && admin && (
              <Section number={8} icon={Wrench} title="Atención y solución" className="lg:col-span-2">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
                  <F label="Estado de la incidencia" required><Select value={form.status} onChange={(status) => set({ status })} options={Object.entries(INCIDENT_STATUS).filter(([id]) => id !== 'registrada').map(([value, label]) => ({ value, label }))} /></F>
                  <F label="Responsable de la atención"><Select value={form.assigneeId} onChange={(assigneeId) => set({ assigneeId })} options={[{ value: '', label: 'Sin asignar' }, ...users.filter((item) => item.role !== 'teacher').map((item) => ({ value: String(item.id), label: item.name }))]} /></F>
                  <F label="Solución aplicada"><Textarea value={form.solution} maxLength={800} onChange={(e) => set({ solution: e.target.value })} placeholder="Se reemplazó el cargador y se verificó el encendido." className="min-h-16" /></F>
                </div>
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold">Evidencia después de la atención</p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {saved.after.map((photo) => <FilePreview key={photo.id} url={photo.path} onRemove={() => removeSaved(photo, 'after')} />)}
                    {afterFiles.map((file, index) => <FilePreview key={`${file.name}-${index}`} file={file} url={afterUrls[index]} onRemove={() => setAfterFiles(afterFiles.filter((_, position) => position !== index))} />)}
                    <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-center text-xs text-muted-foreground hover:border-primary/50">
                      <CloudUpload className="size-6 text-primary" /> Agregar
                      <input type="file" multiple accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files, setAfterFiles, afterFiles); e.target.value = '' }} />
                    </label>
                  </div>
                </div>
              </Section>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-3">
          <p className="text-xs text-muted-foreground">Los campos marcados con <span className="text-destructive">*</span> son obligatorios.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="incident-form" disabled={busy}><Save /> {busy ? 'Guardando…' : 'Guardar incidencia'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
