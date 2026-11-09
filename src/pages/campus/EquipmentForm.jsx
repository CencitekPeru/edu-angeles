import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Cable,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileText,
  Headphones,
  Image as ImageIcon,
  Layers,
  Link2,
  Monitor,
  Mouse,
  Keyboard,
  PlusCircle,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Webcam,
  Briefcase,
  CalendarDays,
  MapPin,
  X,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { ROLE_LABEL } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Select } from '../attendance/shared'
import { PatrimonialCodePicker } from './PatrimonialCodePicker'

export const LEVELS = ['Primaria', 'Secundaria', 'Ambos']
export const PHYSICAL = ['Bueno', 'Regular', 'Malo']
export const OPERATIONAL = ['Operativo', 'Con fallas', 'Inoperativo']
const TYPES = ['Portátil', 'Computadora de escritorio', 'All-in-one', 'Tablet', 'Proyector', 'Impresora', 'Escáner', 'Router', 'Switch', 'Access point', 'Televisor', 'Parlante', 'Pizarra digital', 'Otro']
const COMPUTER_TYPES = ['Portátil', 'Computadora de escritorio', 'All-in-one', 'Tablet']
const PROCESSORS = ['Intel Celeron', 'Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Athlon', 'Apple M1', 'MediaTek']
const RAM = ['2 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '32 GB', '64 GB']
const OS = ['Windows 11', 'Windows 10', 'Windows 8.1', 'Windows 7', 'Ubuntu / Linux', 'ChromeOS', 'macOS', 'Android', 'Sin sistema operativo']
const COLORS = ['Negro', 'Gris', 'Gris plata', 'Plateado', 'Blanco', 'Azul', 'Rojo', 'Marrón', 'Caoba']
const ASSIGNMENT = ['Uso institucional', 'Uso pedagógico', 'Uso administrativo', 'Préstamo']
const CONDITION = ['Permanente', 'Temporal']
const ORIGIN = ['Compra', 'Donación', 'MINEDU', 'Transferencia', 'Otro']
const INVENTORY_STATUS = ['Activo', 'En mantenimiento', 'En préstamo', 'Dado de baja']
const PATRIMONIAL = ['Asignado', 'Disponible', 'En préstamo', 'En custodia']
const ACCESSORIES = [
  ['Cargador (adaptador)', Cable],
  ['Mouse', Mouse],
  ['Teclado', Keyboard],
  ['Maletín / Estuche', Briefcase],
  ['Audífonos', Headphones],
  ['Cámara web', Webcam],
]
const today = () => new Date().toISOString().slice(0, 10)

export const emptyEquipment = () => ({
  code: '', patrimonial: '', level: '', name: '', categoryId: '', type: '', brand: '', model: '', serial: '', mac: '',
  processor: '', ram: '', storageValue: '', storageUnit: 'GB', os: '', color: '', dimensions: '',
  placeId: '', placeDetail: '', responsibleId: '', responsibleRole: '', assignmentType: '', useCondition: '',
  accessories: ACCESSORIES.map(([name]) => ({ name, included: false, brand: '', model: '', notes: '' })), otherAccessories: '',
  physicalState: 'Bueno', operationalState: 'Operativo', registeredOn: today(), acquisitionDate: '', acquisitionOrigin: '', documentNumber: '',
  usefulLife: '', warrantyStart: '', warrantyEnd: '', inventoryStatus: 'Activo', patrimonialCondition: '', notes: '',
})

/** Converts an API equipment row into form state. */
export function equipmentToForm(row) {
  const base = emptyEquipment()
  const [storageValue = '', storageUnit = 'GB'] = String(row.storage || '').split(/\s+/)
  const saved = Array.isArray(row.accessories) ? row.accessories : []
  const others = saved.find((item) => item.name === 'Otros')
  return {
    ...base,
    ...Object.fromEntries(Object.entries(row).filter(([key]) => key in base && row[key] != null)),
    categoryId: row.categoryId ? String(row.categoryId) : '',
    placeId: row.placeId ? String(row.placeId) : '',
    responsibleId: row.responsibleId ? String(row.responsibleId) : '',
    usefulLife: row.usefulLife ? String(row.usefulLife) : '',
    storageValue,
    storageUnit: ['GB', 'TB'].includes(storageUnit) ? storageUnit : 'GB',
    accessories: base.accessories.map((item) => ({ ...item, ...(saved.find((entry) => entry.name === item.name) || {}) })),
    otherAccessories: others?.notes || '',
  }
}

function formToPayload(form) {
  const accessories = form.accessories.filter((item) => item.included || item.brand || item.model || item.notes)
  if (form.otherAccessories.trim()) accessories.push({ name: 'Otros', included: true, notes: form.otherAccessories.trim() })
  const { storageValue, storageUnit, otherAccessories, ...rest } = form
  void otherAccessories
  return {
    ...rest,
    storage: storageValue ? `${storageValue} ${storageUnit}` : '',
    accessories,
    categoryId: form.categoryId || null,
    placeId: form.placeId || null,
    responsibleId: form.responsibleId || null,
  }
}

const TABS = [
  { id: 'general', label: 'Datos generales y ubicación', icon: FileText },
  { id: 'accessories', label: 'Accesorios', icon: Box },
  { id: 'states', label: 'Estados y registro', icon: CheckCircle2 },
]

function Section({ icon: Icon, title, children, className }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2 text-[15px] font-bold text-foreground dark:bg-muted/60">
        <Icon className="size-[18px] text-primary" /> {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  )
}

function F({ label, required, children, className, error }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
      {error && <span className="text-[11px] font-medium text-destructive">{error}</span>}
    </label>
  )
}

function SuggestInput({ id, options, ...props }) {
  return (
    <>
      <Input list={id} {...props} />
      <datalist id={id}>{options.map((option) => <option key={option} value={option} />)}</datalist>
    </>
  )
}

const opts = (list, placeholder = 'Seleccione') => [{ value: '', label: placeholder }, ...list.map((value) => ({ value, label: value }))]

export function EquipmentForm({ row, categories, places, users, onClose, onSaved }) {
  const { toast } = useApp()
  const editing = Boolean(row?.id)
  const [form, setForm] = useState(() => (row ? equipmentToForm(row) : emptyEquipment()))
  const [tab, setTab] = useState('general')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  // Alternative to the file: an image published on the internet.
  const [photoUrl, setPhotoUrl] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [checkingUrl, setCheckingUrl] = useState(false)
  const [savedPhotos, setSavedPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (!editing) return undefined
    let active = true
    api(`/api/equipment/${row.id}`).then((result) => {
      if (active && result.ok) setSavedPhotos(result.equipment.photos || [])
    })
    return () => { active = false }
  }, [editing, row?.id])

  useEffect(() => {
    if (!photo) { setPreview(null); return undefined }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const isComputer = COMPUTER_TYPES.includes(form.type)
  const activeUsers = users.filter((item) => item.active !== false)

  // Required fields per tab; specs are only required for computers.
  const errors = useMemo(() => {
    const list = {}
    const need = (key, label) => { if (!String(form[key] ?? '').trim()) list[key] = `${label} es obligatorio.` }
    need('patrimonial', 'El código patrimonial')
    need('level', 'El nivel educativo')
    need('name', 'La descripción')
    need('categoryId', 'La categoría')
    need('type', 'El tipo')
    need('brand', 'La marca')
    need('model', 'El modelo')
    if (isComputer) {
      need('processor', 'El procesador')
      need('ram', 'La memoria RAM')
      need('storageValue', 'El almacenamiento')
      need('os', 'El sistema operativo')
    }
    need('placeId', 'El ambiente')
    need('responsibleId', 'El responsable')
    need('responsibleRole', 'El cargo o rol')
    need('assignmentType', 'El tipo de asignación')
    need('physicalState', 'El estado físico')
    need('operationalState', 'El estado operativo')
    need('registeredOn', 'La fecha de registro')
    need('acquisitionOrigin', 'El origen de adquisición')
    need('inventoryStatus', 'El estado en inventario')
    if (form.warrantyStart && form.warrantyEnd && form.warrantyEnd < form.warrantyStart) list.warrantyEnd = 'El fin de garantía debe ser posterior al inicio.'
    return list
  }, [form, isComputer])

  const STATE_KEYS = ['physicalState', 'operationalState', 'registeredOn', 'acquisitionOrigin', 'inventoryStatus', 'warrantyEnd']
  const err = (key) => (showErrors ? errors[key] : '')

  function chooseResponsible(id) {
    const person = users.find((item) => String(item.id) === String(id))
    const role = person ? (person.role === 'teacher' ? `Docente${person.subject ? ` – ${person.subject}` : ''}` : ROLE_LABEL[person.role] || '') : ''
    set({ responsibleId: id, responsibleRole: form.responsibleRole && form.responsibleId ? form.responsibleRole : role })
  }

  async function save(event) {
    event?.preventDefault()
    setShowErrors(true)
    const missing = Object.keys(errors)
    if (missing.length) {
      setTab(missing.some((key) => !STATE_KEYS.includes(key)) ? 'general' : 'states')
      return toast(`Completa los campos obligatorios: ${Object.values(errors).slice(0, 3).join(' ')}`, 'bad')
    }
    setBusy(true)
    const payload = formToPayload(form)
    const result = editing
      ? await api(`/api/equipment/${row.id}`, { method: 'PATCH', body: payload })
      : await api('/api/equipment', { method: 'POST', body: payload })
    if (!result.ok) {
      setBusy(false)
      return toast(result.error || 'No se pudo guardar el bien.', 'bad')
    }
    const id = result.id || row.id
    if (photo) {
      const sent = await upload(`/api/equipment/${id}/photos`, [photo])
      if (!sent.ok) toast(`El bien se guardó, pero no la imagen. ${sent.error || ''}`.trim(), 'bad')
    } else if (photoUrl) {
      const sent = await api(`/api/equipment/${id}/photo-url`, { method: 'POST', body: { url: photoUrl } })
      if (!sent.ok) toast(`El bien se guardó, pero no la imagen. ${sent.error || ''}`.trim(), 'bad')
    }
    setBusy(false)
    toast(editing ? 'Bien tecnológico actualizado.' : `Bien ${result.code || ''} registrado en el inventario.`)
    onSaved()
  }

  async function removeSaved(item) {
    const result = await api(`/api/equipment/${row.id}/photos/${item.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar la imagen.', 'bad')
    setSavedPhotos((current) => current.filter((entry) => entry.id !== item.id))
  }

  /** Checks that the link is http(s) and really loads as an image before using it. */
  function applyImageUrl() {
    const value = urlDraft.trim()
    let parsed = null
    try { parsed = new URL(value) } catch { parsed = null }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return toast('Escribe un enlace que empiece con http:// o https://.', 'bad')
    if (value.length > 1024) return toast('El enlace es demasiado largo.', 'bad')
    setCheckingUrl(true)
    const probe = new window.Image()
    probe.onload = () => { setCheckingUrl(false); setPhoto(null); setPhotoUrl(parsed.href); setUrlDraft('') }
    probe.onerror = () => { setCheckingUrl(false); toast('No se pudo cargar una imagen desde ese enlace. Verifica que sea la dirección directa de una imagen pública.', 'bad') }
    probe.src = parsed.href
  }

  const tabIndex = TABS.findIndex((item) => item.id === tab)
  const pendingImage = Boolean(preview || photoUrl)
  const imageSrc = preview || photoUrl || savedPhotos[0]?.path
  const hasSaved = savedPhotos.length > 0 && !pendingImage

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border px-6 pb-3 pt-5">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-slate-50 text-primary dark:bg-muted"><Monitor className="size-6" /></span>
          <div className="flex-1">
            <DialogTitle className="text-2xl font-extrabold">{editing ? `Editar bien tecnológico · ${row.code}` : 'Registrar bien tecnológico'}</DialogTitle>
            <DialogDescription>Complete la información del equipo para {editing ? 'actualizarlo en' : 'incorporarlo al'} inventario institucional.</DialogDescription>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 border-b border-border bg-slate-50 px-6 pt-2 dark:bg-muted/40">
          {TABS.map((item) => {
            const Icon = item.icon
            const active = item.id === tab
            const hasError = showErrors && (item.id === 'states' ? STATE_KEYS.some((key) => errors[key]) : item.id === 'general' && Object.keys(errors).some((key) => !STATE_KEYS.includes(key)))
            return (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={active}
                className={cn('-mb-px flex items-center justify-center gap-2 rounded-t-lg border px-3 py-2.5 text-sm font-semibold transition-colors', active ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Icon className="size-4" /> <span className="truncate">{item.label}</span>
                {hasError && <span className="size-2 rounded-full bg-destructive" title="Hay campos pendientes" />}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <form id="equipment-form" onSubmit={save} className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] p-5 dark:bg-background">
          {tab === 'general' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                <Section icon={Layers} title="Identificación del bien">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <F label="Código interno"><Input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder={editing ? '' : 'Automático (EQ-…)'} /></F>
                    <F label="Código patrimonial MINEDU" required className="sm:col-span-2" error={err('patrimonial')}><PatrimonialCodePicker value={form.patrimonial} invalid={Boolean(err('patrimonial'))} onChange={(patrimonial, entry) => set({ patrimonial, ...(entry ? { name: entry.description.toUpperCase() } : {}) })} /></F>
                    <F label="Nivel educativo" required error={err('level')}><Select value={form.level} onChange={(level) => set({ level })} options={opts(LEVELS)} /></F>
                    <F label="Descripción" required className="sm:col-span-2 lg:col-span-4" error={err('name')}><Input value={form.name} onChange={(e) => set({ name: e.target.value.toUpperCase() })} placeholder="COMPUTADORA PERSONAL PORTÁTIL" /></F>
                    <F label="Categoría" required error={err('categoryId')}><Select value={form.categoryId} onChange={(categoryId) => set({ categoryId })} options={[{ value: '', label: 'Seleccione' }, ...categories.map((item) => ({ value: String(item.id), label: item.name }))]} /></F>
                    <F label="Tipo" required error={err('type')}><SuggestInput id="eq-types" options={TYPES} value={form.type} onChange={(e) => set({ type: e.target.value })} placeholder="Portátil" /></F>
                    <F label="Marca" required error={err('brand')}><Input value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Lenovo" /></F>
                    <F label="Modelo" required error={err('model')}><Input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="B50-70" /></F>
                    <F label="Número de serie" className="lg:col-span-2"><Input value={form.serial} onChange={(e) => set({ serial: e.target.value.toUpperCase() })} /></F>
                    <F label="Dirección MAC" className="lg:col-span-2"><Input value={form.mac} onChange={(e) => set({ mac: e.target.value.toUpperCase() })} placeholder="00:1A:2B:3C:4D:5E" /></F>
                  </div>
                </Section>

                <Section icon={Cpu} title="Especificaciones técnicas">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <F label="Procesador" required={isComputer} error={err('processor')}><SuggestInput id="eq-cpu" options={PROCESSORS} value={form.processor} onChange={(e) => set({ processor: e.target.value })} /></F>
                    <F label="Memoria RAM" required={isComputer} error={err('ram')}><Select value={form.ram} onChange={(ram) => set({ ram })} options={opts(RAM)} /></F>
                    <F label="Almacenamiento" required={isComputer} error={err('storageValue')}>
                      <div className="flex gap-2">
                        <Input type="number" min="0" value={form.storageValue} onChange={(e) => set({ storageValue: e.target.value })} placeholder="250" />
                        <Select className="w-20" value={form.storageUnit} onChange={(storageUnit) => set({ storageUnit })} options={[{ value: 'GB', label: 'GB' }, { value: 'TB', label: 'TB' }]} />
                      </div>
                    </F>
                    <F label="Sistema operativo" required={isComputer} error={err('os')}><Select value={form.os} onChange={(os) => set({ os })} options={opts(OS)} /></F>
                    <F label="Color"><SuggestInput id="eq-colors" options={COLORS} value={form.color} onChange={(e) => set({ color: e.target.value })} placeholder="Gris plata" /></F>
                    <F label="Dimensiones (Largo × Ancho × Alto)" className="lg:col-span-2"><Input value={form.dimensions} onChange={(e) => set({ dimensions: e.target.value })} placeholder="26.5 × 38 × 3.5 cm" /></F>
                  </div>
                  {!isComputer && form.type && <p className="mt-2 text-xs text-muted-foreground">Para «{form.type}» las especificaciones de cómputo son opcionales.</p>}
                </Section>

                <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
                  <Section icon={MapPin} title="Ubicación del bien">
                    <div className="grid gap-3">
                      <F label="Ambiente / Ubicación" required error={err('placeId')}><Select value={form.placeId} onChange={(placeId) => set({ placeId })} options={[{ value: '', label: 'Seleccione' }, ...places.map((item) => ({ value: String(item.id), label: item.name }))]} /></F>
                      <F label="Ubicación específica"><Input value={form.placeDetail} onChange={(e) => set({ placeDetail: e.target.value })} placeholder="Mesa del docente" /></F>
                    </div>
                  </Section>
                  <Section icon={UserRound} title="Asignación y responsable">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <F label="Responsable del bien" required error={err('responsibleId')}><Select value={form.responsibleId} onChange={chooseResponsible} options={[{ value: '', label: 'Seleccione' }, ...activeUsers.map((item) => ({ value: String(item.id), label: item.name }))]} /></F>
                      <F label="Cargo / Rol" required error={err('responsibleRole')}><Input value={form.responsibleRole} onChange={(e) => set({ responsibleRole: e.target.value })} placeholder="Coordinador de Innovación y Soporte (CIST)" /></F>
                      <F label="Tipo de asignación" required error={err('assignmentType')}><Select value={form.assignmentType} onChange={(assignmentType) => set({ assignmentType })} options={opts(ASSIGNMENT)} /></F>
                      <F label="Condición de uso"><Select value={form.useCondition} onChange={(useCondition) => set({ useCondition })} options={opts(CONDITION)} /></F>
                    </div>
                  </Section>
                </div>
              </div>

              <Section icon={ImageIcon} title="Imagen del bien" className="h-fit">
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-slate-50 dark:bg-muted">
                  {imageSrc ? <img src={imageSrc} alt="Imagen del bien" className="size-full object-contain" /> : <Camera className="size-10 text-muted-foreground/50" />}
                  {(pendingImage || savedPhotos[0]) && (
                    <button type="button" onClick={() => (pendingImage ? (setPhoto(null), setPhotoUrl('')) : removeSaved(savedPhotos[0]))} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg border border-border bg-card text-[#b4413c] shadow-sm hover:bg-muted" aria-label="Quitar imagen"><Trash2 className="size-4" /></button>
                  )}
                </div>
                <label className={cn('mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/30 bg-slate-50 px-3 py-2 text-sm font-semibold text-primary hover:bg-muted dark:bg-muted', hasSaved && 'pointer-events-none opacity-50')}>
                  <Upload className="size-4" /> Seleccionar imagen
                  <input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={hasSaved} onChange={(e) => { const file = e.target.files?.[0] || null; if (file) setPhotoUrl(''); setPhoto(file); e.target.value = '' }} />
                </label>
                <div className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> o usa un enlace <span className="h-px flex-1 bg-border" />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    inputMode="url"
                    value={urlDraft}
                    disabled={hasSaved}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (urlDraft.trim()) applyImageUrl() } }}
                    placeholder="https://…/imagen.jpg"
                    aria-label="Enlace de la imagen"
                  />
                  <Button type="button" variant="outline" disabled={hasSaved || !urlDraft.trim() || checkingUrl} onClick={applyImageUrl}>
                    <Link2 /> {checkingUrl ? 'Verificando…' : 'Usar'}
                  </Button>
                </div>
                {photoUrl && <p className="mt-1.5 truncate text-xs text-muted-foreground" title={photoUrl}>Enlace: {photoUrl}</p>}
                <p className="mt-2 text-center text-xs text-muted-foreground">Archivo: JPG o PNG, máx. 5 MB. Enlace: dirección directa de una imagen pública.{hasSaved ? ' Quita la imagen actual para reemplazarla.' : ''}</p>
              </Section>
            </div>
          )}

          {tab === 'accessories' && (
            <div className="space-y-4">
              <Section icon={Box} title="Accesorios del bien">
                <p className="mb-3 text-xs text-muted-foreground">Registre los accesorios que acompañan al equipo (marque los que aplica).</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-foreground/75 dark:bg-muted/40">
                      <tr>{['Accesorio', '¿Incluye?', 'Marca', 'Modelo', 'N.° Serie / Observación'].map((label) => <th key={label} className="px-3 py-2 text-left font-bold">{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {form.accessories.map((item, index) => {
                        const Icon = ACCESSORIES[index][1]
                        const update = (patch) => set({ accessories: form.accessories.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)) })
                        return (
                          <tr key={item.name} className="border-t border-border/70">
                            <td className="px-3 py-2"><span className="flex items-center gap-2 font-medium"><Icon className="size-4 text-muted-foreground" />{item.name}</span></td>
                            <td className="px-3 py-2">
                              <label className="flex cursor-pointer items-center gap-2 text-sm">
                                <input type="checkbox" checked={item.included} onChange={(e) => update({ included: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {item.included ? 'Sí' : 'No'}
                              </label>
                            </td>
                            <td className="px-3 py-2"><Input disabled={!item.included} value={item.brand} onChange={(e) => update({ brand: e.target.value })} placeholder="Marca" className="h-8" /></td>
                            <td className="px-3 py-2"><Input disabled={!item.included} value={item.model} onChange={(e) => update({ model: e.target.value })} placeholder="Modelo" className="h-8" /></td>
                            <td className="px-3 py-2"><Input disabled={!item.included} value={item.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Observación" className="h-8" /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section icon={PlusCircle} title="Otros accesorios">
                <Textarea value={form.otherAccessories} maxLength={200} onChange={(e) => set({ otherAccessories: e.target.value })} placeholder="Cable HDMI, adaptador VGA…" />
                <p className="mt-1 text-right text-xs text-muted-foreground">{form.otherAccessories.length} / 200</p>
              </Section>
            </div>
          )}

          {tab === 'states' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Section icon={ClipboardCheck} title="Estados del bien">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Estado físico" required error={err('physicalState')}><Select value={form.physicalState} onChange={(physicalState) => set({ physicalState })} options={opts(PHYSICAL)} /></F>
                    <F label="Estado operativo" required error={err('operationalState')}><Select value={form.operationalState} onChange={(operationalState) => set({ operationalState })} options={opts(OPERATIONAL)} /></F>
                    <p className="text-[11px] text-muted-foreground">Condición general del equipo (bueno, regular o malo).</p>
                    <p className="text-[11px] text-muted-foreground">Funcionamiento (operativo, con fallas o inoperativo).</p>
                  </div>
                </Section>
                <Section icon={CalendarDays} title="Registro y control">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Fecha de registro" required error={err('registeredOn')}><Input type="date" value={form.registeredOn} onChange={(e) => set({ registeredOn: e.target.value })} /></F>
                    <F label="Fecha de adquisición"><Input type="date" value={form.acquisitionDate} onChange={(e) => set({ acquisitionDate: e.target.value })} /></F>
                    <F label="Origen de adquisición" required error={err('acquisitionOrigin')}><Select value={form.acquisitionOrigin} onChange={(acquisitionOrigin) => set({ acquisitionOrigin })} options={opts(ORIGIN)} /></F>
                    <F label="N.° de documento (Guía / Factura / O/C)"><Input value={form.documentNumber} onChange={(e) => set({ documentNumber: e.target.value })} placeholder="F001-000123" /></F>
                  </div>
                </Section>
                <Section icon={ShieldCheck} title="Vida útil y garantía">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <F label="Vida útil (años)"><Input type="number" min="1" max="99" value={form.usefulLife} onChange={(e) => set({ usefulLife: e.target.value })} /></F>
                    <F label="Inicio de garantía"><Input type="date" value={form.warrantyStart} onChange={(e) => set({ warrantyStart: e.target.value })} /></F>
                    <F label="Fin de garantía" error={err('warrantyEnd')}><Input type="date" value={form.warrantyEnd} min={form.warrantyStart || undefined} onChange={(e) => set({ warrantyEnd: e.target.value })} /></F>
                  </div>
                </Section>
                <Section icon={Layers} title="Estado de inventario">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Estado en inventario" required error={err('inventoryStatus')}><Select value={form.inventoryStatus} onChange={(inventoryStatus) => set({ inventoryStatus })} options={opts(INVENTORY_STATUS)} /></F>
                    <F label="Condición patrimonial"><Select value={form.patrimonialCondition} onChange={(patrimonialCondition) => set({ patrimonialCondition })} options={opts(PATRIMONIAL)} /></F>
                  </div>
                </Section>
              </div>
              <Section icon={FileText} title="Observaciones">
                <Textarea value={form.notes} maxLength={300} onChange={(e) => set({ notes: e.target.value })} placeholder="Equipo en buen estado, asignado a Sala 1 (mesa del docente). Incluye cargador y mouse." />
                <p className="mt-1 text-right text-xs text-muted-foreground">{form.notes.length} / 300</p>
              </Section>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-3">
          <p className="text-xs text-muted-foreground">Los campos marcados con <span className="text-destructive">*</span> son obligatorios.</p>
          <div className="flex gap-2">
            {tabIndex > 0 ? (
              <Button type="button" variant="outline" onClick={() => setTab(TABS[tabIndex - 1].id)}><ArrowLeft /> Anterior</Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}><X /> Cancelar</Button>
            )}
            {tabIndex < TABS.length - 1 && <Button type="button" variant="outline" onClick={() => setTab(TABS[tabIndex + 1].id)}>Siguiente <ArrowRight /></Button>}
            <Button type="submit" form="equipment-form" disabled={busy}><Save /> {busy ? 'Guardando…' : 'Guardar registro'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
