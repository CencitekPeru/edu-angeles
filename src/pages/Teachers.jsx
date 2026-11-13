import { useState } from 'react'
import { KeyRound, Pencil, RotateCcw, Search, ShieldCheck, Trash2, UserPlus, UserRound, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, PageHeader } from '../components/ui'
import { Pill, Table } from './campus/kit'
import { ROLE_LABEL, useCan } from '../lib/permissions'
import { api } from '../lib/api'
import { MODULES, accessOf, primaryRole, roleSetDefaults, rolesOf, sameActions } from '../lib/accessModel'
import PermissionGrid from '../components/PermissionGrid'

const emptyUser = { name: '', email: '', dni: '', gender: '', phone: '', role: 'auxiliar', roles: ['auxiliar'] }
/** Form state for a new set of roles: main role and the permissions those roles give together. */
// A teacher stays «Docente» (keeps their reservations panel); the other roles checked are added on top.
const withRoles = (form, roles) => ({ ...form, roles, role: form.role === 'teacher' ? 'teacher' : primaryRole(roles), perms: roleSetDefaults(roles) })
const GENDERS = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir']
const cleanPhone = (value) => value.replace(/[^\d+\s-]/g, '').slice(0, 15)
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

function ContactFields({ value, onChange }) {
  return (
    <>
      <Field label="Género">
        <Choice value={value.gender || ''} onChange={(gender) => onChange({ ...value, gender })} placeholder="Seleccione" options={GENDERS.map((item) => ({ value: item, label: item }))} />
      </Field>
      <Field label="Teléfono">
        <Input type="tel" inputMode="tel" value={value.phone || ''} onChange={(event) => onChange({ ...value, phone: cleanPhone(event.target.value) })} placeholder="Ej. 987 654 321" />
      </Field>
    </>
  )
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Coordinación CIST', text: 'Acceso completo: registra, edita, aprueba y elimina en todo el sistema.' },
  { value: 'director', label: 'Directora', text: 'Ve todo el panel y exporta reportes, en modo solo consulta.' },
  { value: 'auxiliar', label: 'Auxiliar', text: 'Solo el módulo de asistencia: escanear QR, registro manual y estudiantes.' },
  { value: 'psicologo', label: 'Psicología', text: 'Solo el módulo de atención psicológica: casos, sesiones y citas (información confidencial).' },
]
const ROLE_ORDER = { admin: 0, director: 1, auxiliar: 2, psicologo: 3, teacher: 4 }

/** Role checkboxes: one account can have several roles (e.g. Auxiliar and Psicología); at least one is required. */
function RolePicker({ value = [], onChange, disabled, teacher }) {
  // Teachers always keep «Docente» and may get extra staff roles (not Coordinación).
  const options = teacher
    ? [{ value: 'teacher', label: 'Docente', text: 'Panel docente: solicitudes y calendario de reservas. Siempre activo para esta cuenta.', locked: true }, ...ROLE_OPTIONS.filter((option) => option.value !== 'admin')]
    : ROLE_OPTIONS
  const toggle = (role, on) => {
    const next = on ? [...value, role] : value.filter((item) => item !== role)
    if (next.length) onChange(options.map((option) => option.value).filter((item) => next.includes(item)))
  }
  return (
    <div className="grid gap-2 sm:col-span-2">
      <p className="text-xs text-muted-foreground">Marca uno o varios roles. Los permisos de abajo se suman según los roles marcados.</p>
      {options.map((option) => {
        const checked = value.includes(option.value)
        const locked = option.locked || (checked && value.length === 1)
        return (
          <label key={option.value} className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${checked ? 'border-primary bg-slate-50 ring-1 ring-primary dark:bg-muted' : 'border-border hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <input type="checkbox" name="roles" value={option.value} checked={checked} disabled={disabled || locked} onChange={(event) => toggle(option.value, event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]" title={option.locked ? 'Los docentes conservan siempre su panel de reservas' : checked && value.length === 1 ? 'El usuario debe tener al menos un rol' : undefined} />
            <span>
              <span className="block font-semibold text-foreground">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.text}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Checkbox permissions inside the user modal. Coordinación always has everything. */
function PermissionsField({ roles, value, onChange, readOnly, note }) {
  const base = roleSetDefaults(roles)
  const changed = MODULES.some((module) => !sameActions(value[module.key], base[module.key]))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {note || (readOnly ? 'Solo el administrador (Coordinación CIST) puede cambiar los permisos.' : 'Se marcan solos según los roles elegidos. Marca o desmarca lo que esta persona podrá hacer en cada módulo.')}
        </p>
        {!readOnly && changed && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...base })}><RotateCcw className="size-3.5" /> Volver a los de sus roles</Button>
        )}
      </div>
      <PermissionGrid value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  )
}

function UserFormSection({ icon, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export default function Teachers() {
  const { user: currentUser, users, requests, addUser, updateTeacher, setTeacherActive, deleteTeacher, toast } = useApp()
  const canEdit = useCan()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState(emptyUser)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const { refresh } = useApp()
  // Only Coordinación assigns permissions.
  const canAssign = currentUser.role === 'admin' && canEdit

  /** Saves the checkbox permissions: only modules that differ from the role are stored. */
  async function savePermissions(userId, roles, perms, mainRole) {
    const role = mainRole || primaryRole(roles)
    if (!canAssign || userId === currentUser.id) return true
    const base = roleSetDefaults(roles)
    const custom = Object.fromEntries(MODULES.filter((module) => !sameActions(perms[module.key], base[module.key])).map((module) => [module.key, perms[module.key]]))
    const result = await api(`/api/users/${userId}/permissions`, { method: 'PATCH', body: { permissions: Object.keys(custom).length ? custom : null, roles: roles.filter((item) => item !== role) } })
    if (!result.ok) { setError(result.error || 'Se guardaron los datos, pero no los permisos.'); return false }
    await refresh()
    return true
  }

  const list = users
    .filter((user) => !roleFilter || rolesOf(user).includes(roleFilter))
    .filter((user) => `${user.name} ${user.email} ${user.subject}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name, 'es'))

  async function createUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await addUser({ ...newUser, role: primaryRole(newUser.roles) })
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo registrar el usuario.')
      return
    }
    if (!(await savePermissions(result.user.id, newUser.roles, newUser.perms))) return
    toast(`${result.user.name} fue registrado como ${newUser.roles.map((item) => ROLE_LABEL[item]).join(' + ')}.`)
    setNewUser(emptyUser)
    setCreateOpen(false)
  }

  async function saveEdit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { name, email, dni, role, subject, gender, phone } = editing
    const result = await updateTeacher(editing.id, { name, email, dni, role, subject, gender, phone })
    if (!result.ok) {
      setSaving(false)
      setError(result.error || 'No se pudo actualizar el usuario.')
      return
    }
    const ok = await savePermissions(editing.id, editing.roles, editing.perms, editing.role)
    setSaving(false)
    if (!ok) return
    toast('Usuario y permisos actualizados.')
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
        text="Administra las cuentas de Coordinación, Dirección y Auxiliares, y revisa los docentes habilitados para reservar salas."
        action={canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-2 font-bold" onClick={() => { setNewUser(withRoles(emptyUser, emptyUser.roles)); setError(''); setCreateOpen(true) }}>
              <UserPlus className="size-4" />
              Nuevo usuario
            </Button>
          </div>
        )}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-5xl">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><UserPlus className="size-5" /></div>
              <div>
                <DialogTitle>Registrar usuario</DialogTitle>
                <DialogDescription className="mt-1">Crea una cuenta de Coordinación, Dirección o Auxiliar. Los docentes se registran en «Docentes».</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form className="grid items-start gap-4 lg:grid-cols-2" onSubmit={createUser}>
            <UserFormSection icon={<UserRound className="size-4" />} title="Datos de la cuenta" description="Información de identificación y contacto del usuario.">
              <Field label="Nombre completo *">
                <Input autoFocus value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} required />
              </Field>
              <Field label="Correo electrónico institucional *">
                <Input type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} required />
              </Field>
              <Field className="sm:col-span-2" label="DNI *" hint="Ingresa los 8 dígitos del documento. Se usará para iniciar sesión.">
                <Input type="text" inputMode="numeric" autoComplete="off" value={newUser.dni} onChange={(event) => setNewUser({ ...newUser, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
              </Field>
              <ContactFields value={newUser} onChange={setNewUser} />
            </UserFormSection>
            <UserFormSection icon={<ShieldCheck className="size-4" />} title="Rol y permisos" description="Define qué podrá ver y hacer este usuario.">
              <RolePicker value={newUser.roles} onChange={(roles) => setNewUser(withRoles(newUser, roles))} />
            </UserFormSection>
            <section className="overflow-hidden rounded-lg border border-border/70 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                <KeyRound className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Permisos por módulo</h3>
              </div>
              <div className="p-3"><PermissionsField roles={newUser.roles} value={newUser.perms || roleSetDefaults(newUser.roles)} readOnly={!canAssign} onChange={(perms) => setNewUser({ ...newUser, perms })} /></div>
            </section>
            {error && <p role="alert" className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg lg:col-span-2">{error}</p>}
            <DialogFooter className="sticky bottom-0 -mx-6 border-t border-border/70 bg-background px-6 py-3 lg:col-span-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar usuario'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={query} placeholder="Buscar por nombre, correo o área..." onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[['', 'Todos'], ['admin', 'Coordinación'], ['director', 'Dirección'], ['auxiliar', 'Auxiliares'], ['psicologo', 'Psicología'], ['teacher', 'Docentes']].map(([value, label]) => {
            const total = value ? users.filter((item) => rolesOf(item).includes(value)).length : users.length
            return (
              <button key={label} type="button" onClick={() => setRoleFilter(value)} aria-pressed={roleFilter === value}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${roleFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
                {label} ({total})
              </button>
            )
          })}
        </div>
      </div>

      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-0">
          <Table
            rows={list}
            empty="No hay usuarios que coincidan con la búsqueda."
            columns={[
              { key: 'name', label: 'Usuario', render: (user) => {
                const count = requests.filter((item) => item.teacherId === user.id).length
                return (
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={user.name} image={user.profilePhoto} size="default" />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                      <span className="block text-xs text-muted-foreground/80">
                        {user.subject}{user.role === 'teacher' ? ` · ${count} ${count === 1 ? 'solicitud' : 'solicitudes'}` : ''}
                      </span>
                    </span>
                  </span>
                )
              } },
              { key: 'dni', label: 'DNI', render: (user) => user.dni || '—' },
              { key: 'gender', label: 'Género', render: (user) => user.gender || '—' },
              { key: 'phone', label: 'Teléfono', render: (user) => <span className="whitespace-nowrap">{user.phone || '—'}</span> },
              { key: 'role', label: 'Rol', render: (user) => (
                <span className="flex flex-wrap gap-1.5">
                  {rolesOf(user).map((role) => <Pill key={role} value={ROLE_LABEL[role] || 'Docente'} />)}
                  {user.permissions && <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary"><KeyRound className="size-3" /> Permisos personalizados</span>}
                  {!user.active && <Pill value="Inactivo" />}
                </span>
              ) },
              { key: 'createdOn', label: 'Fecha de registro', render: (user) => <span className="whitespace-nowrap tabular-nums">{dmy(user.createdOn)}</span> },
              { key: 'actions', label: 'Acciones', hidden: !canEdit, render: (user) => (
                <span className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditing({ ...user, roles: rolesOf(user), perms: accessOf(user) }); setError('') }} title="Editar usuario" aria-label={`Editar ${user.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                  {user.id !== currentUser.id && (
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggle(user)} title={user.active ? 'Desactivar acceso' : 'Activar acceso'} aria-label={user.active ? `Desactivar ${user.name}` : `Activar ${user.name}`}>
                      {user.active ? <UserRoundX className="size-4 text-amber-600" /> : <UserRoundCheck className="size-4 text-emerald-600" />}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(user)} disabled={user.id === currentUser.id}
                    title={user.id === currentUser.id ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'} aria-label={`Eliminar ${user.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              ) },
            ]}
          />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(next) => { if (!next) setEditing(null) }}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-5xl`}>
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Pencil className="size-5" /></div>
              <div>
                <DialogTitle>Editar datos del usuario</DialogTitle>
                <DialogDescription className="mt-1">Modifica la información de {editing?.name}.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {editing && (
            <form className="grid items-start gap-4 lg:grid-cols-2" onSubmit={saveEdit}>
              <UserFormSection icon={<UserRound className="size-4" />} title="Datos del usuario" description="Actualiza la información de identificación y contacto.">
                <Field label="Nombre completo *">
                  <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
                </Field>
                <Field label="Correo electrónico *">
                  <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required />
                </Field>
                <Field className="sm:col-span-2" label="DNI *">
                  <Input type="text" inputMode="numeric" autoComplete="off" value={editing.dni || ''} onChange={(e) => setEditing({ ...editing, dni: e.target.value.replace(/\D/g, '').slice(0, 8) })} minLength={8} maxLength={8} pattern="[0-9]{8}" required />
                </Field>
                <ContactFields value={editing} onChange={setEditing} />
                {editing.role === 'teacher' && (
                  <Field className="sm:col-span-2" label="Especialidad / Área pedagógica *">
                    <Input value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} required />
                  </Field>
                )}
              </UserFormSection>
              {(
                <UserFormSection icon={<ShieldCheck className="size-4" />} title="Rol y permisos" description="Define qué podrá ver y hacer este usuario.">
                  <RolePicker teacher={editing.role === 'teacher'} value={editing.roles} disabled={editing.id === currentUser.id || !canAssign} onChange={(roles) => setEditing(withRoles(editing, roles))} />
                  {editing.id === currentUser.id && <span className="text-xs text-muted-foreground sm:col-span-2">No puedes cambiar tus propios roles.</span>}
                </UserFormSection>
              )}
              {(
                <section className="overflow-hidden rounded-lg border border-border/70 lg:col-span-2">
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                    <KeyRound className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Permisos por módulo</h3>
                  </div>
                  <div className="p-3"><PermissionsField roles={editing.roles} value={editing.perms} readOnly={!canAssign || editing.id === currentUser.id} note={editing.id === currentUser.id ? 'No puedes cambiar tus propios permisos; otro administrador puede hacerlo.' : undefined} onChange={(perms) => setEditing({ ...editing, perms })} /></div>
                </section>
              )}
              {error && <p className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg lg:col-span-2">{error}</p>}
              <DialogFooter className="sticky bottom-0 -mx-6 border-t border-border/70 bg-background px-6 py-3 lg:col-span-2">
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

    </div>
  )
}
