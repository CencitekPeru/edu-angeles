import { useState } from 'react'
import { ArrowLeft, Lock, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '../lib/api'
import { MODULES, MODULE_KEYS, ROLE_DEFAULTS, levelOfActions, roleDefaults, rolesOf, sameActions } from '../lib/accessModel'
import { ROLE_LABEL } from '../lib/permissions'
import PermissionGrid from '../components/PermissionGrid'

/** Built-in staff roles, with what each one is for. */
export const BUILTIN_ROLES = [
  { value: 'admin', label: ROLE_LABEL.admin, text: 'Acceso completo: registra, edita, aprueba y elimina en todo el sistema.' },
  { value: 'director', label: ROLE_LABEL.director, text: 'Ve todo el panel y exporta reportes, en modo solo consulta.' },
  { value: 'auxiliar', label: ROLE_LABEL.auxiliar, text: 'Solo el módulo de asistencia: escanear QR, registro manual y estudiantes.' },
  { value: 'psicologo', label: ROLE_LABEL.psicologo, text: 'Solo el módulo de atención psicológica: casos, sesiones y citas (información confidencial).' },
]
const FIXED_TEXT = {
  admin: 'Siempre tiene todos los permisos, para que el sistema nunca quede sin administrador.',
  teacher: 'Panel docente de reservas. Sus permisos se asignan por cuenta.',
}
const none = () => Object.fromEntries(MODULE_KEYS.map((key) => [key, []]))

/** Short summary of what a role allows: the modules it opens. */
function summary(perms) {
  const modules = MODULES.filter((module) => (perms[module.key] || []).length)
  if (!modules.length) return 'Sin acceso a módulos'
  if (modules.length === MODULES.length) return 'Todos los módulos'
  return modules.map((module) => `${module.label}${levelOfActions(perms[module.key]) === 'view' ? ' (consulta)' : ''}`).join(' · ')
}

/**
 * «Roles»: lists built-in and created roles; Coordinación creates roles with their own module permissions,
 * renames or deletes them, and adjusts the permissions of the editable built-in roles.
 */
export default function RolesManager({ open, onOpenChange, startNew = false, onCreated }) {
  const { users, customRoles, refresh, toast } = useApp()
  // `startNew` opens straight on the «Nuevo rol» form (from the user form); remount the component to reset it.
  const [editing, setEditing] = useState(() => (startNew ? { key: null, label: '', description: '', builtin: false, perms: none() } : null))
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const countOf = (role) => users.filter((user) => rolesOf(user).includes(role)).length
  const rows = [
    ...BUILTIN_ROLES.map((role) => ({ key: role.value, label: role.label, description: role.text, builtin: true, fixed: role.value === 'admin' })),
    { key: 'teacher', label: ROLE_LABEL.teacher, description: FIXED_TEXT.teacher, builtin: true, fixed: true },
    ...customRoles.map((role) => ({ key: role.key, label: role.label, description: role.description, builtin: false })),
  ]

  const close = (next) => {
    if (!next) { setEditing(null); setError('') }
    onOpenChange(next)
  }
  const openNew = () => { setError(''); setEditing({ key: null, label: '', description: '', builtin: false, perms: none() }) }
  const startEdit = (row) => { setError(''); setEditing({ ...row, perms: { ...roleDefaults(row.key) } }) }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { key, label, description, perms, builtin } = editing
    const result = builtin
      ? await api(`/api/roles/${key}/permissions`, { method: 'PUT', body: { permissions: perms } })
      : await api(key ? `/api/roles/${key}` : '/api/roles', { method: key ? 'PUT' : 'POST', body: { label, description, permissions: perms } })
    setSaving(false)
    if (!result.ok) { setError(result.error || 'No se pudo guardar el rol.'); return }
    await refresh()
    toast(key ? `Rol «${label}» actualizado.` : `Rol «${label}» creado. Ya puedes asignarlo a los usuarios.`)
    if (!key && result.role) onCreated?.(result.role.key)
    if (startNew && !key) close(false)
    else setEditing(null)
  }

  async function remove() {
    const result = await api(`/api/roles/${deleting.key}`, { method: 'DELETE' })
    if (!result.ok) { toast(result.error || 'No se pudo eliminar el rol.', 'bad'); setDeleting(null); return }
    await refresh()
    toast(`Rol «${deleting.label}» eliminado.`)
    setDeleting(null)
  }

  const original = editing?.builtin ? ROLE_DEFAULTS[editing.key] : null
  const changedFromOriginal = original && MODULES.some((module) => !sameActions(editing.perms[module.key], original[module.key]))

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-5xl">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="size-5" /></div>
              <div>
                <DialogTitle>{editing ? (editing.key ? `Rol: ${editing.label || 'sin nombre'}` : 'Nuevo rol') : 'Roles y permisos'}</DialogTitle>
                <DialogDescription className="mt-1">
                  {editing
                    ? 'Marca lo que podrán ver y hacer en cada módulo las cuentas con este rol.'
                    : 'Crea roles con sus propios permisos y asígnalos a los usuarios desde «Editar usuario».'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!editing && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 font-bold" onClick={openNew}><Plus className="size-4" /> Nuevo rol</Button>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {rows.map((row) => {
                  const count = countOf(row.key)
                  return (
                    <div key={row.key} className="flex flex-wrap items-start gap-3 px-3 py-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {row.label}
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{row.builtin ? 'Predefinido' : 'Creado'}</span>
                          <span className="text-xs font-normal text-muted-foreground">{count} {count === 1 ? 'usuario' : 'usuarios'}</span>
                        </p>
                        {row.description && <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>}
                        {row.key !== 'teacher' && <p className="mt-1 text-xs text-muted-foreground/80">{summary(roleDefaults(row.key))}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {row.fixed ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground" title={FIXED_TEXT[row.key]}><Lock className="size-3.5" /> Fijo</span>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(row)} aria-label={`Editar rol ${row.label}`}>
                            <Pencil className="size-4" /> {row.builtin ? 'Permisos' : 'Editar'}
                          </Button>
                        )}
                        {!row.builtin && (
                          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleting({ ...row, count })}
                            title="Eliminar rol" aria-label={`Eliminar rol ${row.label}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {editing && (
            <form className="space-y-4" onSubmit={save}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre del rol *" hint={editing.builtin ? 'El nombre de los roles predefinidos no se puede cambiar.' : 'Ej. Secretaría, Tesorería, Soporte TI.'}>
                  <Input autoFocus={!editing.builtin} value={editing.label} disabled={editing.builtin} maxLength={60} required minLength={3}
                    onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
                </Field>
                <Field label="Descripción">
                  <Textarea rows={2} value={editing.description} disabled={editing.builtin} maxLength={255} placeholder="Para qué sirve este rol"
                    onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
                </Field>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {editing.builtin ? 'Los cambios se aplican a todas las cuentas con este rol (salvo las que tengan permisos personalizados en ese módulo).' : 'Las cuentas con este rol tendrán estos permisos; se suman a los de sus otros roles.'}
                  </p>
                  {changedFromOriginal && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing({ ...editing, perms: { ...original } })}><RotateCcw className="size-3.5" /> Restaurar originales</Button>
                  )}
                </div>
                <PermissionGrid value={editing.perms} base={original || undefined} onChange={(perms) => setEditing({ ...editing, perms })} />
              </div>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-xs font-semibold text-destructive">{error}</p>}
              <DialogFooter className="sticky bottom-0 -mx-6 border-t border-border/70 bg-background px-6 py-3">
                {startNew && !editing.key
                  ? <Button type="button" variant="outline" onClick={() => close(false)}>Cancelar</Button>
                  : <Button type="button" variant="outline" onClick={() => { setEditing(null); setError('') }}><ArrowLeft className="size-4" /> Volver</Button>}
                <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editing.key ? 'Guardar cambios' : 'Crear rol'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar rol</DialogTitle>
            <DialogDescription>
              {deleting?.count
                ? `«${deleting.label}» está asignado a ${deleting.count === 1 ? '1 usuario' : `${deleting.count} usuarios`}. Quítaselo antes de eliminarlo.`
                : `¿Seguro que deseas eliminar el rol «${deleting?.label}»? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={Boolean(deleting?.count)} onClick={remove}>Eliminar rol</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
