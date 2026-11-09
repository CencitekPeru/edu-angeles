import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Boxes, CheckCircle2, ChevronLeft, ChevronRight, Cpu, Eye, Hash, FileDown, FileSpreadsheet, FileText, FileUp, ListChecks, MapPin, Monitor, Package, Pencil, Plus, Search, Tag, Trash2, Wrench, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Choice } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Filters, PageHeader, Panel, Pill, StatCard, Table } from './kit'
import { ImportInventoryDialog, downloadInventoryTemplate } from './InventoryImport'
import { EquipmentForm, LEVELS } from './EquipmentForm'
import { usePatrimonialCodes } from './PatrimonialCodePicker'
import { exportTablePdf, exportTableXlsx } from '../../lib/exporters'

/** Tabs shared by the inventory views (tecnológicos, mobiliarios, ambientes). */
export function InventoryTabs() {
  const { pathname } = useLocation()
  const tabs = [
    { to: '/admin/inventario', label: 'Bienes tecnológicos', icon: Monitor },
    { to: '/admin/materiales', label: 'Bienes mobiliarios', icon: Package },
    { to: '/admin/catalogo', label: 'Ambientes y categorías', icon: MapPin },
  ]
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = pathname === tab.to
        return (
          <Link key={tab.to} to={tab.to} aria-current={active ? 'page' : undefined}
            className={cn('-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold transition-colors', active ? 'border-border border-b-card bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="size-4" /> {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

const CATALOG_PAGE_SIZE = 6

/** Compact catalog list: search + fixed-size pages so long catalogs don't stretch the page. */
function CatalogList({ items, label, canEdit, onEdit, onRemove, empty }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const term = query.trim().toLowerCase()
  const filtered = term ? items.filter((item) => item.name.toLowerCase().includes(term)) : items
  const pageCount = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * CATALOG_PAGE_SIZE
  const pageItems = filtered.slice(start, start + CATALOG_PAGE_SIZE)

  return (
    <div className="space-y-3">
      {items.length > CATALOG_PAGE_SIZE && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="h-9 pl-8" placeholder={`Buscar ${label.toLowerCase()}…`} aria-label={`Buscar ${label.toLowerCase()}`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
        </div>
      )}
      <ul className="space-y-2">
        {pageItems.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-muted/40">
            <span className="truncate" title={item.name}>{item.name}</span>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1.5">
                {onEdit && <Button type="button" variant="outline" size="icon-sm" aria-label={`Editar ${label.toLowerCase()} ${item.name}`} title={`Editar ${label.toLowerCase()} ${item.name}`} className="shadow-sm" onClick={() => onEdit(item)}><Pencil className="size-4" /></Button>}
                <Button type="button" variant="destructive" size="icon-sm" aria-label={`Quitar ${label.toLowerCase()} ${item.name}`} title={`Quitar ${label.toLowerCase()} ${item.name}`} className="shadow-sm" onClick={() => onRemove(item)}><Trash2 className="size-4" /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">{term ? 'Sin coincidencias.' : empty}</p>}
      {filtered.length > CATALOG_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          <span>{start + 1}–{Math.min(start + CATALOG_PAGE_SIZE, filtered.length)} de {filtered.length}</span>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="min-w-12 text-center font-medium text-foreground">{currentPage} / {pageCount}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 border-b border-border/60 py-1.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value || '—'}</dd>
    </div>
  )
}

function EquipmentDetail({ row, onClose, onEdit }) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => {
    let active = true
    api(`/api/equipment/${row.id}`).then((result) => { if (active && result.ok) setPhoto(result.equipment.photos?.[0]?.path || null) })
    return () => { active = false }
  }, [row.id])
  const accessories = (row.accessories || []).filter((item) => item.included)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">{row.name} <Pill value={row.operationalState} /></DialogTitle>
          <DialogDescription>{row.code} · COD MINEDU {row.patrimonial || '—'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-slate-50 dark:bg-muted">
            {photo ? <img src={photo} alt={row.name} className="size-full object-contain" /> : <Monitor className="size-12 text-muted-foreground/40" />}
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <dl>
              <Detail label="Nivel" value={row.level} />
              <Detail label="Categoría" value={row.category} />
              <Detail label="Tipo" value={row.type} />
              <Detail label="Marca / Modelo" value={[row.brand, row.model].filter(Boolean).join(' ')} />
              <Detail label="N.° de serie" value={row.serial} />
              <Detail label="Dirección MAC" value={row.mac} />
              <Detail label="Procesador" value={row.processor} />
              <Detail label="Memoria RAM" value={row.ram} />
              <Detail label="Almacenamiento" value={row.storage} />
              <Detail label="Sistema operativo" value={row.os} />
              <Detail label="Color" value={row.color} />
              <Detail label="Dimensiones" value={row.dimensions} />
            </dl>
            <dl>
              <Detail label="Ubicación" value={[row.place, row.placeDetail].filter(Boolean).join(' · ')} />
              <Detail label="Responsable" value={row.responsible} />
              <Detail label="Cargo / Rol" value={row.responsibleRole} />
              <Detail label="Tipo de asignación" value={row.assignmentType} />
              <Detail label="Condición de uso" value={row.useCondition} />
              <Detail label="Estado físico" value={row.physicalState} />
              <Detail label="Fecha de registro" value={row.registeredOn} />
              <Detail label="Adquisición" value={[row.acquisitionOrigin, row.acquisitionDate, row.documentNumber].filter(Boolean).join(' · ')} />
              <Detail label="Garantía" value={row.warrantyStart || row.warrantyEnd ? `${row.warrantyStart || '…'} al ${row.warrantyEnd || '…'}` : ''} />
              <Detail label="Vida útil" value={row.usefulLife ? `${row.usefulLife} años` : ''} />
              <Detail label="Estado en inventario" value={row.inventoryStatus} />
              <Detail label="Condición patrimonial" value={row.patrimonialCondition} />
            </dl>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-bold">Accesorios</p>
            {accessories.length ? (
              <ul className="space-y-1 text-sm">{accessories.map((item) => <li key={item.name}>• {item.name}{[item.brand, item.model].filter(Boolean).length ? ` — ${[item.brand, item.model].filter(Boolean).join(' ')}` : ''}{item.notes ? ` (${item.notes})` : ''}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">Sin accesorios registrados.</p>}
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">Observaciones</p>
            <p className="text-sm text-muted-foreground">{row.notes || 'Sin observaciones.'}</p>
          </div>
        </div>
        {onEdit && <DialogFooter><Button type="button" onClick={onEdit}><Pencil /> Editar</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export function EquipmentPage() {
  const { user, toast } = useApp()
  const admin = user.role === 'admin'
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [users, setUsers] = useState([])
  const [formRow, setFormRow] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [filters, setFilters] = useState({ q: '', category: '', place: '', state: '', level: '' })
  const [stateCount, setStateCount] = useState({ total: 0 })
  const [importing, setImporting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function downloadTemplate() {
    setDownloading(true)
    try {
      await downloadInventoryTemplate({ categories, places, users })
      toast('Formato descargado. Complétalo y usa «Importar Excel».')
    } catch (error) {
      console.error(error)
      toast('No se pudo generar el formato.', 'bad')
    } finally {
      setDownloading(false)
    }
  }

  async function load() {
    const [equipment, cats, site, people, summary] = await Promise.all([
      api(`/api/equipment?q=${encodeURIComponent(filters.q)}&category=${encodeURIComponent(filters.category)}&place=${encodeURIComponent(filters.place)}&state=${encodeURIComponent(filters.state)}`),
      api('/api/categories'),
      api('/api/places'),
      api('/api/bootstrap'),
      api('/api/summary'),
    ])
    if (summary.ok) {
      setStateCount({
        total: summary.equipment.reduce((sum, item) => sum + item.total, 0),
        ...Object.fromEntries(summary.equipment.map((item) => [item.state, item.total])),
      })
    }
    if (equipment.ok) setRows(equipment.equipment)
    if (cats.ok) setCategories(cats.categories)
    if (site.ok) setPlaces(site.places)
    if (people.ok) setUsers(people.users)
  }

  useEffect(() => { load() }, [filters.q, filters.category, filters.place, filters.state])

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    const result = await api(`/api/equipment/${deleting.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el equipo.', 'bad')
    toast(`Equipo "${deleting.name}" eliminado.`)
    setDeleting(null)
    await load()
  }

  const visible = filters.level ? rows.filter((row) => row.level === filters.level || row.level === 'Ambos') : rows

  /** Filters in use, described for the export headers. */
  const appliedFilters = () => [
    filters.q.trim() && `Búsqueda: «${filters.q.trim()}»`,
    filters.level && `Nivel: ${filters.level}`,
    filters.category && `Categoría: ${filters.category}`,
    filters.place && `Ambiente: ${filters.place}`,
    filters.state && `Estado: ${filters.state}`,
  ].filter(Boolean)

  function exportPdf() {
    if (!visible.length) return toast('No hay bienes para exportar.', 'bad')
    const applied = appliedFilters()
    const withSerial = visible.filter((row) => String(row.serial || '').trim()).length
    exportTablePdf({
      title: 'Inventario de bienes tecnológicos',
      subtitle: applied.length ? `Filtros: ${applied.join(' · ')}` : 'Todos los bienes registrados',
      summary: [['Registros', visible.length], ['Con serie', withSerial], ['Sin serie', visible.length - withSerial]],
      headers: ['Nivel', 'COD MINEDU', 'Denominación', 'Marca', 'Modelo', 'Tipo', 'Color', 'Serie', 'Dimensiones', 'Estado operativo', 'Estado físico', 'Observación', 'Verificación de serie'],
      rows: visible.map((row) => [
        row.level || '—', row.patrimonial || '—', row.name, row.brand || '—', row.model || '—', row.type || '—', row.color || '—',
        row.serial || '—', row.dimensions || '—', row.operationalState || '—', row.physicalState || '—', row.notes || '—',
        String(row.serial || '').trim() ? 'SI' : 'NO',
      ]),
      fontSize: 6.5,
      columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 22 }, 2: { cellWidth: 33 }, 3: { cellWidth: 16 }, 4: { cellWidth: 17 }, 5: { cellWidth: 15 },
        6: { cellWidth: 13 }, 7: { cellWidth: 21 }, 8: { cellWidth: 19 }, 9: { cellWidth: 17 }, 10: { cellWidth: 14 },
        12: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      },
    }).then(() => toast('Inventario exportado a PDF.')).catch(() => toast('No se pudo generar el PDF.', 'bad'))
  }

  function exportData() {
    if (!visible.length) return toast('No hay bienes para exportar.', 'bad')
    const applied = [
      filters.q.trim() && `Búsqueda: «${filters.q.trim()}»`,
      filters.level && `Nivel: ${filters.level}`,
      filters.category && `Categoría: ${filters.category}`,
      filters.place && `Ambiente: ${filters.place}`,
      filters.state && `Estado: ${filters.state}`,
    ].filter(Boolean)
    const count = (state) => visible.filter((row) => row.operationalState === state).length
    exportTableXlsx({
      title: 'Inventario de bienes tecnológicos',
      subtitle: applied.length ? `Filtros: ${applied.join(' · ')}` : 'Todos los bienes registrados',
      summary: [['Registros', visible.length], ['Operativos', count('Operativo')], ['Con fallas', count('Con fallas')], ['Inoperativos', count('Inoperativo')]],
      headers: ['Código patrimonial', 'Código interno', 'Denominación', 'Nivel', 'Categoría', 'Tipo', 'Marca', 'Modelo', 'N.° de serie', 'Dirección MAC', 'Procesador', 'Memoria RAM', 'Almacenamiento', 'Sistema operativo', 'Ubicación', 'Responsable', 'Estado físico', 'Estado operativo', 'Fecha de registro'],
      widths: [18, 14, 30, 12, 18, 14, 14, 16, 18, 18, 20, 12, 16, 18, 24, 24, 13, 15, 14],
      rows: visible.map((row) => [
        row.patrimonial || '—', row.code || '—', row.name, row.level || '—', row.category || '—', row.type || '—', row.brand || '—', row.model || '—',
        row.serial || '—', row.mac || '—', row.processor || '—', row.ram || '—', row.storage || '—', row.os || '—',
        [row.place, row.placeDetail].filter(Boolean).join(' · ') || 'Sin asignar', row.responsible || '—', row.physicalState || '—', row.operationalState || '—', row.registeredOn || '—',
      ]),
    }).then(() => toast('Inventario exportado a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Boxes}
        title="Inventario"
        description="Control de bienes tecnológicos y mobiliarios de la institución."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            <Button type="button" variant="outline" onClick={exportPdf}><FileText className="text-[#b4413c]" /> Exportar PDF</Button>
            {admin && (
              <>
                <Button type="button" variant="outline" disabled={downloading} onClick={downloadTemplate}><FileDown /> {downloading ? 'Preparando…' : 'Descargar formato'}</Button>
                <Button type="button" variant="outline" onClick={() => setImporting(true)}><FileUp /> Importar Excel</Button>
                <Button type="button" onClick={() => setFormRow(null)}><Plus /> Registrar bien</Button>
              </>
            )}
          </>
        )}
      />
      <InventoryTabs />
      {importing && <ImportInventoryDialog onClose={() => setImporting(false)} onDone={load} />}
      {formRow !== undefined && (
        <EquipmentForm
          row={formRow}
          categories={categories}
          places={places}
          users={users}
          onClose={() => setFormRow(undefined)}
          onSaved={() => { setFormRow(undefined); load() }}
        />
      )}
      {viewing && <EquipmentDetail row={viewing} onClose={() => setViewing(null)} onEdit={admin ? () => { setFormRow(viewing); setViewing(null) } : null} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Monitor} value={stateCount.total} label="Total" onClick={() => setFilters({ ...filters, state: '' })} />
        <StatCard tone="green" icon={CheckCircle2} value={stateCount.Operativo || 0} label="Operativos" onClick={() => setFilters({ ...filters, state: 'Operativo' })} />
        <StatCard tone="amber" icon={Wrench} value={stateCount['Con fallas'] || 0} label="Con fallas" onClick={() => setFilters({ ...filters, state: 'Con fallas' })} />
        <StatCard tone="red" icon={XCircle} value={stateCount.Inoperativo || 0} label="Inoperativos" onClick={() => setFilters({ ...filters, state: 'Inoperativo' })} />
      </div>

      <Panel title="Bienes tecnológicos registrados" icon={ListChecks}>
        <Filters className="lg:grid-cols-5">
          <Input placeholder="Buscar por código, denominación, serie o MAC" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Choice value={filters.level || 'todos'} onChange={(value) => setFilters({ ...filters, level: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los niveles' }, ...LEVELS.slice(0, 2).map((item) => ({ value: item, label: item }))]} />
          <Choice value={filters.category || 'todas'} onChange={(value) => setFilters({ ...filters, category: value === 'todas' ? '' : value })} options={[{ value: 'todas', label: 'Todas las categorías' }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} />
          <Choice value={filters.place || 'todos'} onChange={(value) => setFilters({ ...filters, place: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los ambientes' }, ...places.map((item) => ({ value: item.name, label: item.name }))]} />
          <Choice value={filters.state || 'todos'} onChange={(value) => setFilters({ ...filters, state: value === 'todos' ? '' : value })} options={[{ value: 'todos', label: 'Todos los estados' }, ...['Operativo', 'Con fallas', 'Inoperativo'].map((item) => ({ value: item, label: item }))]} />
        </Filters>
        <Table
          rows={visible}
          columns={[
            { key: 'patrimonial', label: 'Código patrimonial', render: (row) => <span className="font-semibold">{row.patrimonial || '—'}</span> },
            { key: 'name', label: 'Denominación', render: (row) => (
              <span>
                <span className="block font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.code}{row.type ? ` · ${row.type}` : ''}</span>
              </span>
            ) },
            { key: 'level', label: 'Nivel', render: (row) => row.level || '—' },
            { key: 'brand', label: 'Marca / Modelo', render: (row) => [row.brand, row.model].filter(Boolean).join(' ') || '—' },
            { key: 'place', label: 'Ubicación', render: (row) => (
              <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-muted-foreground" />{row.place || 'Sin asignar'}</span>
            ) },
            { key: 'responsible', label: 'Responsable', render: (row) => row.responsible || '—' },
            { key: 'state', label: 'Estado', render: (row) => <Pill value={row.operationalState} /> },
            { key: 'actions', label: 'Acciones', render: (row) => (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" onClick={() => setViewing(row)} aria-label={`Ver ficha de ${row.name}`} title="Ver ficha"><Eye aria-hidden="true" /></Button>
                {admin && <Button type="button" variant="ghost" size="icon" className="size-8 text-slate-600" onClick={() => setFormRow(row)} aria-label={`Editar ${row.name}`} title="Editar"><Pencil aria-hidden="true" /></Button>}
                {admin && <Button type="button" variant="ghost" size="icon" className="size-8 text-[#9a2f2a] hover:bg-muted hover:text-destructive" onClick={() => setDeleting(row)} aria-label={`Borrar ${row.name}`} title="Borrar"><Trash2 aria-hidden="true" /></Button>}
              </span>
            ) },
          ]}
        />
      </Panel>

      {admin && (
        <Dialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next && !deleteLoading) setDeleting(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar eliminación</DialogTitle>
              <DialogDescription>
                ¿Deseas eliminar el equipo <span className="font-semibold text-foreground">{deleting?.name}</span>?
                Esta acción no se puede deshacer. No se podrá eliminar si tiene mantenimientos, incidencias u otros registros vinculados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={deleteLoading} onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button type="button" variant="destructive" disabled={deleteLoading} onClick={confirmDelete}>{deleteLoading ? 'Eliminando…' : 'Sí, eliminar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/** Catalog of patrimonial codes (code + description) used by the inventory forms. */
function PatrimonialCodesPanel({ canEdit }) {
  const { toast } = useApp()
  const [codes, reload] = usePatrimonialCodes()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const items = codes.map((item) => ({ id: item.id, name: `${item.code} · ${item.description}`, code: item.code, description: item.description }))

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const body = { code: draft.code, description: draft.description }
    const result = draft.id
      ? await api(`/api/patrimonial-codes/${draft.id}`, { method: 'PUT', body })
      : await api('/api/patrimonial-codes', { method: 'POST', body })
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar el código.', 'bad')
    toast(draft.id ? `Código ${result.code.code} actualizado.` : `Código ${result.code.code} agregado al catálogo.`)
    setDraft(null)
    reload()
  }

  async function remove(item) {
    const result = await api(`/api/patrimonial-codes/${item.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo quitar el código.', 'bad')
    toast(`Código ${item.code} quitado del catálogo.`)
    reload()
  }

  return (
    <Panel title="Códigos patrimoniales" action={canEdit && <Button type="button" size="sm" onClick={() => setDraft({ code: '', description: '' })}>Nuevo código</Button>}>
      <p className="mb-3 text-xs text-muted-foreground">Se eligen al registrar bienes tecnológicos y mobiliarios. {codes.length} códigos en el catálogo.</p>
      <CatalogList items={items} label="Código" canEdit={canEdit} empty="No hay códigos registrados." onEdit={(item) => setDraft({ id: item.id, code: item.code, description: item.description })} onRemove={remove} />
      <Dialog open={Boolean(draft)} onOpenChange={(next) => { if (!next && !saving) setDraft(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Hash className="size-5" /></div>
              <div>
                <DialogTitle>{draft?.id ? 'Editar código patrimonial' : 'Nuevo código patrimonial'}</DialogTitle>
                <DialogDescription className="mt-1">{draft?.id ? 'Si cambias el código, se actualizará también en los bienes que lo usan.' : 'Aparecerá como opción al registrar bienes en el inventario.'}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {draft && (
            <form className="grid gap-4" onSubmit={save}>
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <Field label="Código">
                  <Input autoFocus inputMode="numeric" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="746481190001" maxLength={20} required />
                </Field>
                <Field label="Descripción">
                  <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value.toUpperCase() })} placeholder="SILLA FIJA DE MADERA" maxLength={255} required />
                </Field>
              </div>
              <DialogFooter className="border-t border-border/70 pt-4">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

export function CatalogPage() {
  const { toast, refreshRooms } = useApp()
  const canEdit = useCan()
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [category, setCategory] = useState('')
  const [place, setPlace] = useState('')
  const [room, setRoom] = useState('')
  const [kind, setKind] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [rooms, setRooms] = useState([])

  async function load() {
    const [cats, sites, roomData] = await Promise.all([api('/api/categories'), api('/api/places'), api('/api/rooms')])
    if (cats.ok) setCategories(cats.categories)
    if (sites.ok) setPlaces(sites.places)
    if (roomData.ok) setRooms(roomData.rooms)
  }
  useEffect(() => { load() }, [])

  function openDialog(nextKind, item = null) {
    const setter = nextKind === 'categoria' ? setCategory : nextKind === 'ambiente' ? setPlace : setRoom
    setter(item ? item.name : '')
    setEditingId(item ? item.id : null)
    setKind(nextKind)
  }

  async function save(path, name, clear) {
    const result = editingId
      ? await api(`${path}/${editingId}`, { method: 'PUT', body: { name } })
      : await api(path, { method: 'POST', body: { name } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    if (editingId) toast(`"${name.trim()}" actualizado.`)
    clear('')
    setKind('')
    setEditingId(null)
    if (path === '/api/rooms') await refreshRooms()
    load()
  }

  async function removeCatalogItem(path, item, label) {
    const result = await api(`${path}/${item.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || `No se pudo quitar ${label.toLowerCase()}.`, 'bad')
    toast(`${label} "${item.name}" quitado.`)
    if (path === '/api/rooms') await refreshRooms()
    load()
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={MapPin} title="Ambientes y categorías" description="Catálogos usados para clasificar, ubicar e identificar los bienes de la institución." />
      <InventoryTabs />
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <Panel title="Categorías" action={canEdit && <Button type="button" size="sm" onClick={() => openDialog('categoria')}>Nueva categoría</Button>}>
        <CatalogList items={categories} label="Categoría" canEdit={canEdit} empty="No hay categorías registradas." onEdit={(item) => openDialog('categoria', item)} onRemove={(item) => removeCatalogItem('/api/categories', item, 'Categoría')} />
      </Panel>
      <Panel title="Ambientes" action={canEdit && <Button type="button" size="sm" onClick={() => openDialog('ambiente')}>Nuevo ambiente</Button>}>
        <CatalogList items={places} label="Ambiente" canEdit={canEdit} empty="No hay ambientes registrados." onEdit={(item) => openDialog('ambiente', item)} onRemove={(item) => removeCatalogItem('/api/places', item, 'Ambiente')} />
      </Panel>
      <Panel title="Salas exclusivas de cómputo" action={canEdit && <Button type="button" size="sm" onClick={() => openDialog('sala')}>Nueva sala</Button>}>
        <p className="mb-3 text-xs text-muted-foreground">Estas salas aparecerán en los calendarios y en el formulario de reservas.</p>
        <CatalogList items={rooms} label="Sala" canEdit={canEdit} empty="No hay salas registradas." onEdit={(item) => openDialog('sala', item)} onRemove={(item) => removeCatalogItem('/api/rooms', item, 'Sala')} />
      </Panel>
      <PatrimonialCodesPanel canEdit={canEdit} />
      <Dialog open={Boolean(kind)} onOpenChange={(next) => { if (!next) setKind('') }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                {kind === 'categoria' ? <Tag className="size-5" /> : kind === 'ambiente' ? <MapPin className="size-5" /> : <Cpu className="size-5" />}
              </div>
              <div>
                <DialogTitle>{editingId
                  ? (kind === 'categoria' ? 'Editar categoría' : kind === 'ambiente' ? 'Editar ambiente' : 'Editar sala de cómputo')
                  : (kind === 'categoria' ? 'Nueva categoría' : kind === 'ambiente' ? 'Nuevo ambiente' : 'Nueva sala de cómputo')}</DialogTitle>
                <DialogDescription className="mt-1">
                  {kind === 'categoria'
                    ? 'Organiza los equipos con una categoría fácil de reconocer.'
                    : kind === 'ambiente'
                    ? 'Registra un espacio para ubicar los equipos del inventario.'
                    : 'Registra una sala que estará disponible para reservar en los calendarios.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              save(
                kind === 'categoria' ? '/api/categories' : kind === 'ambiente' ? '/api/places' : '/api/rooms',
                kind === 'categoria' ? category : kind === 'ambiente' ? place : room,
                kind === 'categoria' ? setCategory : kind === 'ambiente' ? setPlace : setRoom,
              )
            }}
          >
            <section className="overflow-hidden rounded-lg border border-border/70">
              <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
                {kind === 'categoria' ? <Tag className="mt-0.5 size-4 text-primary" /> : kind === 'ambiente' ? <MapPin className="mt-0.5 size-4 text-primary" /> : <Cpu className="mt-0.5 size-4 text-primary" />}
                <div>
                  <h3 className="text-sm font-semibold">Datos del catálogo</h3>
                  <p className="text-xs text-muted-foreground">{kind === 'sala' ? 'Este nombre aparecerá como opción en calendarios y reservas.' : 'Este nombre aparecerá como opción en el inventario.'}</p>
                </div>
              </div>
              <div className="p-3">
                <Field label={kind === 'categoria' ? 'Nombre de la categoría' : kind === 'ambiente' ? 'Nombre del ambiente' : 'Nombre de la sala'}>
                  <Input
                    autoFocus
                    value={kind === 'categoria' ? category : kind === 'ambiente' ? place : room}
                    onChange={(event) => (kind === 'categoria' ? setCategory : kind === 'ambiente' ? setPlace : setRoom)(event.target.value)}
                    placeholder={kind === 'categoria' ? 'Ej. Computadoras' : kind === 'ambiente' ? 'Ej. Aula 1' : 'Ej. Laboratorio de cómputo 3'}
                    maxLength={120}
                    required
                  />
                </Field>
              </div>
            </section>
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={() => setKind('')}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
