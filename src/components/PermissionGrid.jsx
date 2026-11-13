import { useEffect, useRef } from 'react'
import { Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { ACTIONS, ACTION_LABEL, MODULES, moduleActions, normalizeActions, sameActions } from '../lib/accessModel'
import { cn } from '@/lib/utils'

export const ACTION_ICON = { view: Eye, create: Plus, edit: Pencil, delete: Trash2, export: Download }
export const ACTION_HINT = {
  view: 'Abrir el módulo y consultar sus datos',
  create: 'Registrar nuevos registros',
  edit: 'Modificar registros (aprobar, activar, reprogramar…)',
  delete: 'Eliminar registros',
  export: 'Exportar a Excel o PDF',
}
const GROUPS = [...new Set(MODULES.map((module) => module.group))]

function Check({ checked, indeterminate, disabled, onChange, label, className }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = Boolean(indeterminate) }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-label={label}
      className={cn('size-4 cursor-pointer rounded accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50', className)} />
  )
}

/** Toggles one action in a module, keeping 'view' consistent: other actions need it, removing it removes all. */
export function toggleAction(list = [], key, action, on) {
  if (action === 'view' && !on) return []
  return normalizeActions(on ? [...list, action] : list.filter((item) => item !== action), key)
}

/**
 * Module × action checkbox grid.
 * `value` / `base`: { module: [actions] }; `base` is what the value is compared against (cells that differ get a mark).
 */
export default function PermissionGrid({ value, base, onChange, readOnly, baseLabel = 'original' }) {
  const setModule = (key, list) => onChange({ ...value, [key]: list })
  const columnState = (action) => {
    const modules = MODULES.filter((module) => moduleActions(module.key).includes(action))
    const on = modules.filter((module) => (value[module.key] || []).includes(action)).length
    return { all: on === modules.length, some: on > 0 && on < modules.length }
  }
  const setColumn = (action, on) => onChange(Object.fromEntries(MODULES.map((module) => {
    const list = value[module.key] || []
    return [module.key, moduleActions(module.key).includes(action) ? toggleAction(list, module.key, action, on) : list]
  })))

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-xs dark:bg-muted/40">
          <tr>
            <th className="px-3 py-2.5 text-left font-bold">Módulo</th>
            {ACTIONS.map((action) => {
              const Icon = ACTION_ICON[action]
              const state = columnState(action)
              return (
                <th key={action} className="w-24 px-2 py-2 text-center font-bold" title={ACTION_HINT[action]}>
                  <span className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1"><Icon className="size-3.5 text-muted-foreground" /> {ACTION_LABEL[action]}</span>
                    {!readOnly && <Check checked={state.all} indeterminate={state.some} onChange={(on) => setColumn(action, on)} label={`${ACTION_LABEL[action]} en todos los módulos`} />}
                  </span>
                </th>
              )
            })}
            <th className="w-20 px-2 py-2.5 text-center font-bold">Todo</th>
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group} className="divide-y divide-border border-t border-border">
            <tr><td colSpan={ACTIONS.length + 2} className="bg-muted/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{group}</td></tr>
            {MODULES.filter((module) => module.group === group).map((module) => {
              const list = value[module.key] || []
              const original = base?.[module.key] || []
              const allowed = moduleActions(module.key)
              const changed = base && !sameActions(list, original)
              return (
                <tr key={module.key} className={cn('hover:bg-muted/20', changed && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{module.label}</span>
                    {changed && <span className="ml-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle" title={`Distinto del ${baseLabel}: ${original.map((action) => ACTION_LABEL[action]).join(', ') || 'sin acceso'}`} />}
                  </td>
                  {ACTIONS.map((action) => (
                    <td key={action} className="px-2 py-2 text-center">
                      {allowed.includes(action)
                        ? <Check checked={list.includes(action)} disabled={readOnly} onChange={(on) => setModule(module.key, toggleAction(list, module.key, action, on))} label={`${module.label}: ${ACTION_LABEL[action]}`} />
                        : <span className="text-muted-foreground/50" title="No aplica en este módulo">—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <Check checked={sameActions(list, allowed)} indeterminate={list.length > 0 && !sameActions(list, allowed)} disabled={readOnly}
                      onChange={(on) => setModule(module.key, on ? [...allowed] : [])} label={`${module.label}: todos los permisos`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}
