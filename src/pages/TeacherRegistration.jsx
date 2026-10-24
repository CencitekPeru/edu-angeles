import { useState } from 'react'
import { UserPlus } from 'lucide-react'
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
  const { users, requests, addTeacher, toast } = useApp()
  const [form, setForm] = useState(emptyForm)
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directorio académico"
        title="Docentes y Profesores"
        text="Administra el cuerpo docente habilitado para la reserva de recursos y salas tecnológicas."
        action={
          <Button type="button" className="gap-2 font-bold" onClick={() => { setError(''); setOpen(true) }}>
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
          ]}
        />
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar nuevo docente</DialogTitle>
            <DialogDescription>Crea una cuenta institucional para que el docente pueda ingresar y gestionar sus reservas de sala.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={create}>
            <Field label="Nombre completo *">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label="DNI *" hint="Ingresa los 8 dígitos del documento. Se usará para iniciar sesión.">
              <Input type="text" inputMode="numeric" autoComplete="off" value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
            </Field>
            <Field label="Correo electrónico institucional *">
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </Field>
            <Field label="Área o asignatura *">
              <Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required placeholder="Ej. Ciencias Sociales / Matemática" />
            </Field>
            {error && <p role="alert" className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar docente'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
