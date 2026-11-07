import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const MAX_RESULTS = 60
const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digits = (text) => String(text || '').replace(/\D/g, '')

/** Loads the patrimonial code catalog (code + description). */
export function usePatrimonialCodes() {
  const [codes, setCodes] = useState([])
  async function reload() {
    const result = await api('/api/patrimonial-codes')
    if (result.ok) setCodes(result.codes)
  }
  useEffect(() => { reload() }, [])
  return [codes, reload, setCodes]
}

/**
 * Searchable selector for the patrimonial code. Picks from the catalog and lets admins
 * register a new code without leaving the form. `onChange(code, entry)` receives the catalog
 * entry so the form can fill the denomination.
 */
export function PatrimonialCodePicker({ value, onChange, invalid = false, placeholder = 'Buscar o seleccionar código' }) {
  const { toast } = useApp()
  const canAdd = useCan()
  const [codes, , setCodes] = usePatrimonialCodes()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(null)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef(null)

  const selected = codes.find((item) => item.code === value)
  const results = useMemo(() => {
    const term = normalize(query.trim())
    const termDigits = digits(query)
    if (!term) return codes
    return codes.filter((item) => normalize(item.description).includes(term) || (termDigits && digits(item.code).includes(termDigits)))
  }, [codes, query])
  const exact = codes.some((item) => digits(item.code) && digits(item.code) === digits(query))

  function choose(item) {
    onChange(item.code, item)
    setOpen(false)
  }

  function startAdding() {
    const typed = query.trim()
    const looksLikeCode = /^[0-9\s-]+$/.test(typed)
    setAdding({ code: looksLikeCode ? typed.replace(/\s+/g, '') : '', description: looksLikeCode ? '' : typed.toUpperCase() })
  }

  async function saveNew(event) {
    event.preventDefault()
    event.stopPropagation()
    setSaving(true)
    const result = await api('/api/patrimonial-codes', { method: 'POST', body: adding })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo registrar el código.', 'bad')
    setCodes((current) => [...current, result.code])
    toast(`Código ${result.code.code} agregado al catálogo.`)
    setAdding(null)
    choose(result.code)
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(''); setAdding(null) } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
            invalid && 'border-destructive ring-destructive/20',
          )}
          title={selected ? `${selected.code} · ${selected.description}` : value || undefined}
        >
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>
            {value ? <><span className="font-semibold">{value}</span>{selected && <span className="text-muted-foreground"> · {selected.description}</span>}</> : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(30rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus() }}
      >
        {adding ? (
          <form className="space-y-3 p-3" onSubmit={saveNew}>
            <p className="text-sm font-semibold">Nuevo código patrimonial</p>
            <label className="grid gap-1 text-xs font-semibold">
              Código
              <Input autoFocus inputMode="numeric" value={adding.code} onChange={(e) => setAdding({ ...adding, code: e.target.value })} placeholder="746481190001" maxLength={20} />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Descripción
              <Input value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value.toUpperCase() })} placeholder="SILLA FIJA DE MADERA" maxLength={255} />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setAdding(null)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Guardando…' : 'Agregar y seleccionar'}</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={searchRef}
                className="h-9 pl-8"
                placeholder="Buscar por código o descripción…"
                aria-label="Buscar código patrimonial"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (results[0]) choose(results[0])
                  }
                }}
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Códigos patrimoniales">
              {results.slice(0, MAX_RESULTS).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.code === value}
                    onClick={() => choose(item)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', item.code !== value && 'invisible')} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold tabular-nums">{item.code}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!results.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">{codes.length ? 'Sin coincidencias.' : 'No hay códigos registrados.'}</li>}
              {results.length > MAX_RESULTS && <li className="px-3 py-2 text-center text-xs text-muted-foreground">Mostrando {MAX_RESULTS} de {results.length}. Escribe para afinar la búsqueda.</li>}
            </ul>
            {canAdd && !exact && (
              <div className="border-t border-border p-1">
                <button type="button" onClick={startAdding} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-muted">
                  <Plus className="size-4" aria-hidden="true" />
                  {query.trim() ? <>Agregar «{query.trim()}» al catálogo</> : 'Agregar nuevo código'}
                </button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
