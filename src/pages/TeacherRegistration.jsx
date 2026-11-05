import { useState } from 'react'
import {
  Briefcase,
  CalendarDays,
  FileText,
  GraduationCap,
  IdCard,
  Info,
  Layers,
  Mail,
  Pencil,
  Phone,
  Save,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCan } from '../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill, Table } from './campus/kit'

const AREAS = [
  'Matemática', 'Comunicación', 'Ciencia y Tecnología', 'Ciencias Sociales', 'Desarrollo Personal, Ciudadanía y Cívica',
  'Personal Social', 'Educación Física', 'Arte y Cultura', 'Inglés', 'Educación para el Trabajo', 'Educación Religiosa',
  'Educación Primaria (aula)', 'Computación e Informática', 'Tutoría', 'Psicología', 'Otro',
]
const CONDITIONS = ['Nombrado', 'Contratado', 'Reasignado', 'Destacado', 'Practicante', 'Otro']
const GENDERS = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir']
const emptyForm = { firstNames: '', lastNames: '', dni: '', birthDate: '', gender: '', phone: '', area: '', otherArea: '', employmentCondition: '', email: '', notes: '' }

function Section({ icon: Icon, title, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <h3 className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2 text-[15px] font-bold text-foreground dark:bg-muted/60">
        <Icon className="size-[18px] text-primary" /> {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  )
}

function F({ label, required, children, className }) {
  return (
    <label className={cn('grid content-start gap-1 text-xs font-semibold text-foreground', className)}>
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  )
}

/** Input or select with a leading icon, matching the reference design. */
function IconField({ icon: Icon, as = 'input', options, className, ...props }) {
  const base = 'h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40'
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      {as === 'select' ? (
        <select className={cn(base, 'pr-8', !props.value && 'text-muted-foreground', className)} {...props}>
          {options.map((option) => <option key={option.value} value={option.value} className="text-foreground">{option.label}</option>)}
        </select>
      ) : (
        <input className={cn(base, className)} {...props} />
      )}
    </div>
  )
}

const pick = (placeholder, list) => [{ value: '', label: placeholder }, ...list.map((value) => ({ value, label: value }))]

function teacherToForm(teacher) {
  const area = AREAS.includes(teacher.subject) ? teacher.subject : (teacher.subject ? 'Otro' : '')
  const [first = '', ...rest] = String(teacher.name || '').split(' ')
  return {
    firstNames: teacher.firstNames || (teacher.lastNames ? '' : (rest.length >= 2 ? `${first} ${rest.slice(0, rest.length - 2).join(' ')}`.trim() : first)),
    lastNames: teacher.lastNames || (rest.length >= 2 ? rest.slice(-2).join(' ') : rest.join(' ')),
    dni: teacher.dni || '',
    birthDate: teacher.birthDate || '',
    gender: teacher.gender || '',
    phone: teacher.phone || '',
    area,
    otherArea: area === 'Otro' ? teacher.subject || '' : '',
    employmentCondition: teacher.employmentCondition || '',
    email: teacher.email || '',
    notes: teacher.notes || '',
  }
}

export default function TeacherRegistration() {
  const { users, requests, addTeacher, updateTeacher, deleteTeacher, setTeacherActive, toast } = useApp()
  const canEdit = useCan()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [deletingTeacher, setDeletingTeacher] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteConflict, setDeleteConflict] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  const teachers = users
    .filter((user) => user.role === 'teacher')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  function openNew() {
    setForm(emptyForm)
    setEditing(null)
    setError('')
    setOpen(true)
  }

  function editTeacher(teacher) {
    setEditing(teacher)
    setForm(teacherToForm(teacher))
    setError('')
    setOpen(true)
  }

  async function save(event) {
    event.preventDefault()
    const subject = form.area === 'Otro' ? form.otherArea.trim() : form.area
    if (!form.firstNames.trim() || !form.lastNames.trim()) return setError('Escribe los nombres y apellidos del docente.')
    if (!/^\d{8}$/.test(form.dni)) return setError('El DNI debe tener exactamente 8 dígitos.')
    if (!subject || subject.length < 3) return setError('Selecciona el área o especialidad.')
    if (!form.employmentCondition) return setError('Selecciona la condición laboral.')
    setSaving(true)
    setError('')
    const payload = {
      firstNames: form.firstNames.trim(),
      lastNames: form.lastNames.trim(),
      dni: form.dni,
      birthDate: form.birthDate,
      gender: form.gender,
      phone: form.phone,
      subject,
      employmentCondition: form.employmentCondition,
      email: form.email.trim(),
      notes: form.notes,
    }
    const result = editing ? await updateTeacher(editing.id, payload) : await addTeacher(payload)
    setSaving(false)
    if (!result.ok) return setError(result.error || 'No se pudo guardar al docente.')
    toast(editing ? `Datos de ${result.user.name} actualizados.` : `Docente ${(result.teacher || result.user).name} registrado. Ingresará con su correo y su DNI.`)
    setForm(emptyForm)
    setEditing(null)
    setOpen(false)
  }

  async function removeTeacher() {
    if (!deletingTeacher) return
    setDeleting(true)
    setDeleteError('')
    setDeleteConflict(false)
    const result = await deleteTeacher(deletingTeacher.id)
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error || 'No se pudo eliminar al docente.')
      setDeleteConflict(result.status === 409)
      return
    }
    toast(`Docente ${deletingTeacher.name} eliminado.`)
    setDeletingTeacher(null)
  }

  async function deactivateTeacher() {
    if (!deletingTeacher) return
    setDeactivating(true)
    const result = await setTeacherActive(deletingTeacher.id, false)
    setDeactivating(false)
    if (!result.ok) return setDeleteError(result.error || 'No se pudo desactivar al docente.')
    toast(`Acceso de ${deletingTeacher.name} desactivado. Se conservó su historial.`)
    setDeletingTeacher(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={GraduationCap}
        title="Docentes"
        description="Administra el cuerpo docente habilitado para la reserva de recursos y salas tecnológicas."
        actions={canEdit && <Button type="button" onClick={openNew}><UserPlus /> Nuevo docente</Button>}
      />

      <Panel title="Padrón de docentes registrados" icon={Users} contentClassName="p-0">
        <Table
          rows={teachers}
          empty="No hay docentes registrados en el sistema."
          columns={[
            { key: 'name', label: 'Apellidos y nombres', render: (teacher) => (
              <span>
                <span className="block font-medium">{teacher.lastNames ? `${teacher.lastNames}, ${teacher.firstNames}` : teacher.name}</span>
                <span className="text-xs text-muted-foreground">{teacher.email}</span>
              </span>
            ) },
            { key: 'dni', label: 'DNI', render: (teacher) => teacher.dni || '—' },
            { key: 'subject', label: 'Área / Especialidad' },
            { key: 'employmentCondition', label: 'Condición laboral', render: (teacher) => teacher.employmentCondition || '—' },
            { key: 'phone', label: 'Teléfono', render: (teacher) => teacher.phone || '—' },
            { key: 'requests', label: 'Solicitudes', render: (teacher) => <span className="text-xs font-semibold">{requests.filter((request) => request.teacherId === teacher.id).length}</span> },
            { key: 'status', label: 'Estado de acceso', render: (teacher) => <Pill value={teacher.active ? 'Habilitado' : 'Inactivo'} /> },
            {
              key: 'actions',
              label: 'Acciones',
              hidden: !canEdit,
              render: (teacher) => (
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${teacher.name}`} title="Editar docente" onClick={() => editTeacher(teacher)}><Pencil className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" aria-label={`Eliminar ${teacher.name}`} title="Eliminar docente"
                    onClick={() => { setDeletingTeacher(teacher); setDeleteError(''); setDeleteConflict(false) }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setEditing(null); setError('') } }}>
        <DialogContent showCloseButton={false} className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <div className="flex items-start gap-4 border-b border-border px-6 pb-4 pt-5">
            <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-slate-50 text-primary dark:bg-muted"><GraduationCap className="size-6" /></span>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-extrabold">{editing ? 'Editar docente' : 'Nuevo Docente'}</DialogTitle>
              <DialogDescription>{editing ? `Actualiza la información de ${editing.name}.` : 'Registra la información del docente en el sistema.'}</DialogDescription>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X className="size-5" /></button>
          </div>

          <form id="teacher-form" onSubmit={save} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#f7f8fa] p-5 dark:bg-background">
            <Section icon={UserRound} title="Datos personales">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Nombres" required><IconField icon={UserRound} autoFocus value={form.firstNames} onChange={(e) => set({ firstNames: e.target.value })} placeholder="Ingrese nombres" maxLength={120} /></F>
                <F label="Apellidos" required><IconField icon={UserRound} value={form.lastNames} onChange={(e) => set({ lastNames: e.target.value })} placeholder="Ingrese apellidos" maxLength={120} /></F>
                <F label="DNI" required><IconField icon={IdCard} inputMode="numeric" value={form.dni} onChange={(e) => set({ dni: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="Ingrese el número de DNI" maxLength={8} /></F>
                <F label="Fecha de nacimiento"><IconField icon={CalendarDays} type="date" value={form.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ birthDate: e.target.value })} /></F>
                <F label="Género"><IconField icon={Users} as="select" value={form.gender} onChange={(e) => set({ gender: e.target.value })} options={pick('Seleccione', GENDERS)} /></F>
                <F label="Teléfono"><IconField icon={Phone} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 15) })} placeholder="Ingrese número de teléfono" /></F>
              </div>
            </Section>

            <Section icon={GraduationCap} title="Información profesional">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Área / Especialidad" required>
                  <IconField icon={Layers} as="select" value={form.area} onChange={(e) => set({ area: e.target.value })} options={pick('Seleccione el área o especialidad', AREAS)} />
                  {form.area === 'Otro' && <IconField icon={Layers} value={form.otherArea} onChange={(e) => set({ otherArea: e.target.value })} placeholder="Especifique el área" maxLength={120} />}
                </F>
                <F label="Condición laboral" required><IconField icon={Briefcase} as="select" value={form.employmentCondition} onChange={(e) => set({ employmentCondition: e.target.value })} options={pick('Seleccione la condición', CONDITIONS)} /></F>
              </div>
            </Section>

            <Section icon={Mail} title="Acceso al sistema">
              <div className="grid items-end gap-3 sm:grid-cols-2">
                <F label="Correo electrónico" required><IconField icon={Mail} type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Ingrese el correo institucional o personal" required /></F>
                <p className="flex items-start gap-2 rounded-lg border border-border bg-slate-50 p-2.5 text-xs text-muted-foreground dark:bg-muted">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  El docente ingresará al sistema con este correo y su número de DNI.
                </p>
              </div>
            </Section>

            <Section icon={FileText} title="Observaciones">
              <Textarea value={form.notes} maxLength={500} onChange={(e) => set({ notes: e.target.value })} placeholder="Ingrese observaciones (opcional)" />
            </Section>

            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-xs font-semibold text-destructive">{error}</p>}
          </form>

          <div className="flex justify-end gap-2 border-t border-border bg-card px-6 py-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}><X /> Cancelar</Button>
            <Button type="submit" form="teacher-form" disabled={saving}><Save /> {saving ? 'Guardando…' : 'Guardar docente'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingTeacher)} onOpenChange={(next) => { if (!next && !deleting) { setDeletingTeacher(null); setDeleteError(''); setDeleteConflict(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar docente</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar a {deletingTeacher?.name}? No se podrá eliminar si tiene solicitudes u horarios fijos asociados, para conservar el historial.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div role="alert" className="space-y-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <p>{deleteError}</p>
              {deleteConflict && <p className="text-xs">Puedes desactivar su acceso en lugar de eliminarlo; así se conserva el historial y no podrá volver a ingresar.</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingTeacher(null)} disabled={deleting || deactivating}>Cancelar</Button>
            {deleteConflict && <Button type="button" variant="outline" onClick={deactivateTeacher} disabled={deactivating}>{deactivating ? 'Desactivando…' : 'Desactivar acceso'}</Button>}
            <Button type="button" variant="destructive" onClick={removeTeacher} disabled={deleting || deactivating}>{deleting ? 'Eliminando…' : 'Eliminar docente'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
