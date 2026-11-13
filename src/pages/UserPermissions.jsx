import { useMemo, useState } from 'react'
import { KeyRound, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { LEVEL_LABEL, LEVELS, MODULES, ROLE_DEFAULTS, accessOf } from '../lib/accessModel'
import { ROLE_LABEL } from '../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LEVEL_HINT = { none: 'No ve el módulo', view: 'Consulta y exporta', edit: 'Registra, modifica y elimina' }
const GROUPS = [...new Set(MODULES.map((module) => module.group))]

/**
 * Assigns per-module permissions to a staff account. Levels equal to the role's defaults are not stored,
 * so changing the role later keeps working as expected for the untouched modules.
 */
export default function UserPermissionsDialog({ user, onClose }) {
  const { toast, refresh } = useApp()
  const defaults = ROLE_DEFAULTS[user.role]
  const [levels, setLevels] = useState(() => accessOf(user))
  const [saving, setSaving] = useState(false)
  const changed = useMemo(() => MODULES.filter((module) => levels[module.key] !== defaults[module.key]).map((module) => module.key), [levels, defaults])

  async function save(next = levels) {
    const custom = Object.fromEntries(MODULES.filter((module) => next[module.key] !== defaults[module.key]).map((module) => [module.key, next[module.key]]))
    setSaving(true)
    const result = await api(`/api/users/${user.id}/permissions`, { method: 'PATCH', body: { permissions: Object.keys(custom).length ? custom : null } })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudieron guardar los permisos.', 'bad')
    toast(Object.keys(custom).length ? `Permisos de ${user.name} actualizados.` : `${user.name} vuelve a los permisos de su rol.`)
    await refresh()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /> Permisos de {user.name}</DialogTitle>
          <DialogDescription>
            Rol: <strong>{ROLE_LABEL[user.role]}</strong>. Cada módulo parte del permiso de su rol; los cambios se aplican desde su próximo ingreso o al recargar la página.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-3 dark:bg-muted/40">
          {LEVELS.map((level) => <span key={level}><strong className="text-foreground">{LEVEL_LABEL[level]}:</strong> {LEVEL_HINT[level]}</span>)}
        </div>

        <div className="space-y-3">
          {GROUPS.map((group) => (
            <section key={group} className="overflow-hidden rounded-lg border border-border">
              <h3 className="border-b border-border bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground dark:bg-muted/40">{group}</h3>
              <ul className="divide-y divide-border">
                {MODULES.filter((module) => module.group === group).map((module) => {
                  const value = levels[module.key]
                  const isChanged = value !== defaults[module.key]
                  return (
                    <li key={module.key} className={cn('flex flex-wrap items-center justify-between gap-3 px-3 py-2.5', isChanged && 'bg-primary/5')}>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{module.label}</span>
                        <span className="text-xs text-muted-foreground">
                          Según el rol: {LEVEL_LABEL[defaults[module.key]]}{isChanged && <strong className="ml-1 text-primary">· personalizado</strong>}
                        </span>
                      </span>
                      <span role="radiogroup" aria-label={`Permiso en ${module.label}`} className="inline-flex rounded-lg border border-border bg-card p-0.5">
                        {LEVELS.map((level) => (
                          <button
                            key={level}
                            type="button"
                            role="radio"
                            aria-checked={value === level}
                            onClick={() => setLevels({ ...levels, [module.key]: level })}
                            className={cn(
                              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                              value === level
                                ? level === 'none' ? 'bg-slate-600 text-white' : 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {LEVEL_LABEL[level]}
                          </button>
                        ))}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button type="button" variant="ghost" disabled={saving || (!changed.length && !user.permissions)} onClick={() => { setLevels({ ...defaults }); save({ ...defaults }) }}>
            <RotateCcw /> Restablecer permisos del rol
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{changed.length ? `${changed.length} módulo(s) personalizado(s)` : 'Igual que su rol'}</span>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="button" disabled={saving} onClick={() => save()}>{saving ? 'Guardando…' : 'Guardar permisos'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
