import { useState } from 'react'
import { BriefcaseBusiness, Pencil, UserPlus, UserRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '../components/ui'
import { Panel, Table } from './campus/kit'

const emptyForm = { name: '', email: '', dni: '', subject: '' }

export default function TeacherRegistration() {
  const { users, requests, addTeacher, updateTeacher, toast } = useApp()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const teachers = users
    .filter((user) => user.role === 'teacher')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  async function create(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await addTeacher(form)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo registrar al docente.')
      return
    }
    toast(`Docente ${result.teacher.name} registrado con éxito.`)
    setForm(emptyForm)
    setOpen(false)
  }

  function editTeacher(teacher) {
    setEditing(teacher)
    setForm({
      name: teacher.name || '',
      email: teacher.email || '',
      dni: teacher.dni || '',
      subject: teacher.subject || '',
    })
    setError('')
    setOpen(true)
  }

  async function save(event) {
    event.preventDefault()
    if (!editing) return create(event)

    setSaving(true)
    setError('')
    const result = await updateTeacher(editing.id, form)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo actualizar al docente.')
      return
    }
    toast(`Datos de ${result.user.name} actualizados.`)
    setForm(emptyForm)
    setEditing(null)
    setOpen(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directorio académico"
        title="Docentes y Profesores"
        text="Administra el cuerpo docente habilitado para la reserva de recursos y salas tecnológicas."
        action={
          <Button type="button" className="gap-2 font-bold" onClick={() => { setForm(emptyForm); setEditing(null); setError(''); setOpen(true) }}>
            <UserPlus className="size-4" />
            Registrar docente
          </Button>
        }
      />

      <Panel title="Padrón de docentes registrados">
        <Table
          rows={teachers}
          empty="No hay docentes registrados en el sistema."
          columns={[
            { key: 'name', label: 'Nombre completo' },
            { key: 'dni', label: 'DNI' },
            { key: 'email', label: 'Correo institucional' },
            { key: 'subject', label: 'Especialidad / Asignatura' },
            {
              key: 'requests',
              label: 'Solicitudes',
              render: (teacher) => (
                <span className="font-semibold text-xs">
                  {requests.filter((request) => request.teacherId === teacher.id).length}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Estado de acceso',
              render: (teacher) => (
                <Badge
                  variant={teacher.active ? 'success' : 'secondary'}
                  className={teacher.active
                    ? 'border-emerald-700 bg-emerald-600 text-[10px] font-bold text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                    : 'text-[10px] font-bold'}
                >
                  {teacher.active ? 'Habilitado' : 'Inactivo'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              label: 'Acciones',
              render: (teacher) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar ${teacher.name}`}
                  title="Editar docente"
                  onClick={() => editTeacher(teacher)}
                >
                  <Pencil className="size-4" />
                </Button>
              ),
            },
          ]}
        />
      </Panel>

      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setEditing(null)
          setError('')
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                {editing ? <Pencil className="size-5" /> : <UserPlus className="size-5" />}
              </div>
              <div>
                <DialogTitle>{editing ? 'Editar datos del docente' : 'Registrar nuevo docente'}</DialogTitle>
                <DialogDescription className="mt-1">
                  {editing
                    ? 'Actualiza los datos personales y el área o asignatura del docente.'
                    : 'Crea una cuenta institucional para que el docente pueda ingresar y gestionar sus reservas de sala.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={save}>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <UserRound className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">Datos personales</h3>
                    <p className="text-xs text-muted-foreground">Identificación del docente.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3">
                  <Field label="Nombre completo *">
                    <Input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                  </Field>
                  <Field label="DNI *" hint="Ingresa los 8 dígitos. Se usará para iniciar sesión.">
                    <Input type="text" inputMode="numeric" autoComplete="off" value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
                  </Field>
                </div>
              </section>
              <section className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                  <BriefcaseBusiness className="mt-0.5 size-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">Contacto y área académica</h3>
                    <p className="text-xs text-muted-foreground">Correo institucional y especialidad.</p>
                  </div>
                </div>
                <div className="grid gap-3 p-3">
                  <Field label="Correo electrónico institucional *">
                    <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                  </Field>
                  <Field label="Área o asignatura *">
                    <Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required placeholder="Ej. Ciencias Sociales / Matemática" />
                  </Field>
                </div>
              </section>
            </div>
            {error && <p role="alert" className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg">{error}</p>}
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar docente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
