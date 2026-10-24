import { useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserPlus, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, PageHeader } from '../components/ui'

const emptyUser = { name: '', email: '', dni: '', role: 'admin' }

export default function Teachers() {
  const { user: currentUser, users, requests, addUser, updateTeacher, setTeacherActive, deleteTeacher, resetDemo, toast } = useApp()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState(emptyUser)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [resetOpen, setResetOpen] = useState(false)

  const list = users
    .filter((user) => `${user.name} ${user.email} ${user.subject}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name, 'es'))

  async function createUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await addUser(newUser)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo registrar el usuario.')
      return
    }
    toast(`${result.user.name} fue registrado con rol de coordinación.`)
    setNewUser(emptyUser)
    setCreateOpen(false)
  }

  async function saveEdit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await updateTeacher(editing.id, editing)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo actualizar el usuario.')
      return
    }
    toast('Datos del usuario actualizados.')
    setEditing(null)
  }

  async function toggle(user) {
    const result = await setTeacherActive(user.id, !user.active)
    if (!result.ok) {
      toast(result.error, 'bad')
      return
    }
    toast(user.active ? `${user.name} quedó desactivado.` : `${user.name} volvió a estar activo.`)
  }

  async function removeUser() {
    const result = await deleteTeacher(deleting.id)
    if (!result.ok) {
      toast(result.error || 'No se puede eliminar: tiene registros o solicitudes asociadas.', 'bad')
      return
    }
    toast(`${deleting.name} fue eliminado.`)
    setDeleting(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Gestión de Usuarios y Accesos"
        text="Administra las cuentas de Coordinación CIST y revisa los docentes habilitados para reservar salas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
              Restablecer demo
            </Button>
            <Button size="sm" className="gap-2 font-bold" onClick={() => { setNewUser(emptyUser); setError(''); setCreateOpen(true) }}>
              <UserPlus className="size-4" />
              Nuevo usuario CIST
            </Button>
          </div>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar usuario de coordinación</DialogTitle>
            <DialogDescription>Crea una cuenta con privilegios administrativos en el sistema CIST.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={createUser}>
            <Field label="Nombre completo *">
              <Input value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} required />
            </Field>
            <Field label="Correo electrónico institucional *">
              <Input type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} required />
            </Field>
            <Field label="DNI *" hint="Ingresa los 8 dígitos del documento. Se usará para iniciar sesión.">
              <Input type="text" inputMode="numeric" autoComplete="off" value={newUser.dni} onChange={(event) => setNewUser({ ...newUser, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
            </Field>
            <Field label="Rol en el sistema">
              <Input value="Coordinación CIST" readOnly className="bg-muted text-muted-foreground" />
            </Field>
            {error && <p role="alert" className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar usuario'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={query} placeholder="Buscar por nombre, correo o área..." onChange={(event) => setQuery(event.target.value)} />
      </div>

      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-0">
          <ul className="divide-y divide-border/60">
            {list.map((user) => {
              const count = requests.filter((item) => item.teacherId === user.id).length
              return (
                <li key={user.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={user.name} size="default" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-foreground truncate">{user.name}</p>
                        {user.role === 'admin' ? (
                          <Badge variant="default" className="text-[10px] font-bold">Coordinación</Badge>
                        ) : (
                          <Badge variant={user.active ? 'success' : 'secondary'} className="text-[10px] font-bold">
                            {user.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5">
                        {user.subject}
                        {user.role === 'teacher' ? ` · ${count} ${count === 1 ? 'solicitud' : 'solicitudes'}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditing({ ...user }); setError('') }}
                      title={`Editar ${user.role === 'admin' ? 'usuario' : 'docente'}`}
                      aria-label={`Editar ${user.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {user.role === 'teacher' && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => toggle(user)}
                          title={user.active ? 'Desactivar acceso' : 'Activar acceso'}
                        >
                          {user.active ? <UserRoundX className="size-4 text-amber-600" /> : <UserRoundCheck className="size-4 text-emerald-600" />}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(user)}
                      disabled={user.id === currentUser.id}
                      title={user.id === currentUser.id ? 'No puedes eliminar tu propia cuenta' : `Eliminar ${user.role === 'admin' ? 'usuario' : 'docente'}`}
                      aria-label={`Eliminar ${user.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(next) => { if (!next) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar datos del usuario</DialogTitle>
            <DialogDescription>Modifica la información de {editing?.name}.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form className="grid gap-4" onSubmit={saveEdit}>
              <Field label="Nombre completo *">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              </Field>
              <Field label="Correo electrónico *">
                <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required />
              </Field>
              <Field label="DNI *">
                <Input type="text" inputMode="numeric" autoComplete="off" value={editing.dni || ''} onChange={(e) => setEditing({ ...editing, dni: e.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
              </Field>
              {editing.role === 'teacher' && (
                <Field label="Especialidad / Área pedagógica *">
                  <Input value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} required />
                </Field>
              )}
              {error && <p className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar a {deleting?.name}? Esta acción no se puede deshacer. Los equipos, mantenimientos e incidencias asignados quedarán sin responsable. No se permitirá eliminar una cuenta vinculada a solicitudes u horarios fijos para conservar el historial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={removeUser}>Eliminar usuario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Demo Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer datos de demostración</DialogTitle>
            <DialogDescription>
              Esto volverá a cargar las cuentas y reservas de prueba predeterminadas en la base de datos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                const res = await resetDemo()
                setResetOpen(false)
                if (res.ok) toast('Datos de prueba restablecidos.')
                else toast(res.error || 'Error al restablecer.', 'bad')
              }}
            >
              Confirmar restablecimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
