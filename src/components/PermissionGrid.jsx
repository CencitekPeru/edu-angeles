import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { ACTIONS, ACTION_LABEL, MODULES, moduleActions, normalizeActions, sameActions, viewsOf } from '../lib/accessModel'
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
 * Module × action checkbox grid, with the screens (views) of each module underneath.
 * `value` / `base`: { module or view: [actions] }; `base` is what the value is compared against (cells that differ get a mark).
 * Views only have «Ver»: checking one opens its module; unchecking the last one closes the module.
 */
export default function PermissionGrid({ value, base, onChange, readOnly, baseLabel = 'original' }) {
  const [open, setOpen] = useState({})

  /** New actions for a module, keeping its views in step: turning «Ver» on shows every view, off hides them. */
  function applyModule(map, key, list) {
    const next = { ...map, [key]: list }
    const had = (map[key] || []).includes('view')
    const has = list.includes('view')
    if (has !== had) for (const view of viewsOf(key)) next[view.key] = has ? ['view'] : []
    return next
  }
  const setModule = (key, list) => onChange(applyModule(value, key, list))
  function setView(view, on) {
    const next = { ...value, [view.key]: on ? ['view'] : [] }
    if (on && !(value[view.module] || []).includes('view')) next[view.module] = ['view']
    if (!on && viewsOf(view.module).every((item) => !(next[item.key] || []).includes('view'))) next[view.module] = []
    onChange(next)
  }
  const columnState = (action) => {
    const modules = MODULES.filter((module) => moduleActions(module.key).includes(action))
    const on = modules.filter((module) => (value[module.key] || []).includes(action)).length
    return { all: on === modules.length, some: on > 0 && on < modules.length }
  }
  const setColumn = (action, on) => onChange(MODULES.reduce((map, module) => {
    const list = map[module.key] || []
    return moduleActions(module.key).includes(action) ? applyModule(map, module.key, toggleAction(list, module.key, action, on)) : map
  }, value))

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-xs dark:bg-muted/40">
          <tr>
            <th className="px-3 py-2.5 text-left font-bold">Módulo / Vista</th>
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
              const views = viewsOf(module.key)
              const shown = views.filter((view) => (value[view.key] || []).includes('view')).length
              const viewsChanged = base && views.some((view) => !sameActions(value[view.key], base[view.key]))
              const expanded = open[module.key] ?? false
              return [
                <tr key={module.key} className={cn('hover:bg-muted/20', changed && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      {views.length > 0 ? (
                        <button type="button" onClick={() => setOpen({ ...open, [module.key]: !expanded })} aria-expanded={expanded}
                          className="-ml-1 flex items-center gap-1 rounded px-1 text-left font-medium hover:bg-muted" title={expanded ? 'Ocultar vistas' : 'Elegir las vistas de este módulo'}>
                          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                          {module.label}
                        </button>
                      ) : <span className="font-medium">{module.label}</span>}
                      {changed && <span className="inline-block size-2 shrink-0 rounded-full bg-amber-500" title={`Distinto del ${baseLabel}: ${original.map((action) => ACTION_LABEL[action]).join(', ') || 'sin acceso'}`} />}
                    </span>
                    {views.length > 0 && (
                      <span className={cn('ml-6 block text-[11px]', shown && shown < views.length ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                        {shown} de {views.length} vistas{viewsChanged && <span className="ml-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />}
                      </span>
                    )}
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
                </tr>,
                ...(expanded ? views.map((view) => {
                  const on = (value[view.key] || []).includes('view')
                  const viewChanged = base && !sameActions(value[view.key], base[view.key])
                  return (
                    <tr key={view.key} className={cn('bg-slate-50/50 hover:bg-muted/20 dark:bg-muted/10', viewChanged && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                      <td className="py-1.5 pr-3 pl-10">
                        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <span className="size-1.5 shrink-0 rounded-full bg-border" /> {view.label}
                          {viewChanged && <span className="inline-block size-2 shrink-0 rounded-full bg-amber-500" title={`Distinto del ${baseLabel}`} />}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Check checked={on} disabled={readOnly} onChange={(next) => setView(view, next)} label={`${module.label} – ${view.label}: ver`} />
                      </td>
                      <td colSpan={ACTIONS.length} />
                    </tr>
                  )
                }) : []),
              ]
            })}
          </tbody>
        ))}
      </table>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Haz clic en el nombre de un módulo para elegir qué vistas (pantallas) podrá abrir. Las acciones Crear, Editar, Eliminar y Exportar se aplican a todo el módulo.
      </p>
    </div>
  )
}
