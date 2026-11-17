import { useMemo, useState } from 'react'
import { BookOpen, CalendarRange, ClipboardCheck, Eraser, FileSpreadsheet, FileText, Gavel, Layers, NotebookPen, Plus, Save, Search, Tag as TagIcon, Users, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { APPROVAL_TYPES, AREAS, INSTRUMENT_NAMES, INSTRUMENT_STATUS, INSTRUMENT_TYPES } from '../../lib/documents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, Table } from '../campus/kit'
import {
  ConfirmDelete, CountedText, DateCell, Details, Field, FilterLabel, FORM_DIALOG, FormHeader, FormNote, PdfDrop, RowActions, Section, Select, StaffNames, Tag,
  currentYear, dmy, opts, pad, sendWithFile, useFileActions, useList, yearOptions,
} from './shared'

const TYPE_ICON = { PEI: BookOpen, PCI: Layers, PAT: CalendarRange, RI: Gavel }
const RESPONSIBLES = ['Dirección', 'Subdirección', 'Coordinación CIST', 'Coordinación Académica', 'Comisión de instrumentos de gestión']
const fileUrl = (item) => `/api/docs/records/${item.id}/file`

function TypeTag({ type }) {
  return <Tag icon={TYPE_ICON[type] || FileText} className="text-sm">{type}</Tag>
}

/** «1. Instrumentos de gestión»: PEI, PCI, PAT and RI with their approval, validity, version and PDF. */
export default function InstrumentsPage() {
  const { toast } = useApp()
  const canEdit = useCan('documentos')
  const files = useFileActions()
  const [records, loading, reload] = useList('/api/docs/records?kind=instrumento', 'records')
  const emptyFilters = { year: String(currentYear()), type: '', status: '', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    const year = Number(filters.year)
    return records.filter((item) =>
      (!year || (item.startYear <= year && item.endYear >= year))
      && (!filters.type || item.docType === filters.type)
      && (!filters.status || item.displayStatus === filters.status)
      && (!term || `${item.title} ${item.number} ${item.docType} ${item.version}`.toLowerCase().includes(term)))
  }, [records, filters])

  function exportData() {
    if (!visible.length) return toast('No hay instrumentos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión documental · Instrumentos de gestión',
      subtitle: filters.year ? `Año escolar ${filters.year}` : 'Todos los años',
      headers: ['N.°', 'Tipo', 'Título', 'Aprobación', 'N.° de resolución', 'Fecha de aprobación', 'Vigencia', 'Versión', 'Estado', 'Responsable', 'Área relacionada', 'Fecha de registro', 'PDF'],
      widths: [6, 8, 40, 20, 22, 14, 12, 9, 13, 24, 22, 14, 8],
      rows: visible.map((item, index) => [pad(index + 1), item.docType, item.title, item.approvalType, item.number, dmy(item.issueDate), `${item.startYear} – ${item.endYear}`, item.version,
        item.displayStatus, item.responsible, item.area || '—', dmy(item.createdOn), item.file ? 'Sí' : 'No']),
    }).then(() => toast('Instrumentos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BookOpen}
        title="1. Instrumentos de gestión"
        description="PEI · PCI · PAT · RI | Documentos que orientan la planificación y funcionamiento de la institución."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Registrar instrumento</Button>}
          </>
        )}
      />

      <Panel title={`Instrumentos registrados (${visible.length})`} icon={BookOpen}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterLabel label="Año escolar"><Select value={filters.year} onChange={(year) => setFilters({ ...filters, year })} options={opts(yearOptions(), 'Todos los años')} /></FilterLabel>
          <FilterLabel label="Tipo de instrumento"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={[{ value: '', label: 'Todos' }, ...INSTRUMENT_TYPES.map((value) => ({ value, label: `${value} – ${INSTRUMENT_NAMES[value]}` }))]} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={opts(INSTRUMENT_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Buscar" className="sm:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por título, código o resolución…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay instrumentos de gestión con estos filtros.'}
          columns={[
            { key: 'n', label: 'N.°', render: (item) => <span className="font-semibold tabular-nums">{pad(visible.indexOf(item) + 1)}</span> },
            { key: 'type', label: 'Tipo', render: (item) => <TypeTag type={item.docType} /> },
            { key: 'title', label: 'Título del instrumento', render: (item) => <span className="block max-w-72 font-semibold">{item.title}</span> },
            { key: 'number', label: 'Resolución / Aprobación', render: (item) => (
              <span className="flex items-start gap-1.5"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block">{item.number}</span><span className="text-xs text-muted-foreground">({dmy(item.issueDate)})</span></span></span>
            ) },
            { key: 'validity', label: 'Vigencia', render: (item) => <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums"><CalendarRange className="size-4 text-muted-foreground" />{item.startYear} – {item.endYear}</span> },
            { key: 'version', label: 'Versión', render: (item) => <Tag>{item.version}</Tag> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.displayStatus} /> },
            { key: 'created', label: 'Fecha de registro', render: (item) => <DateCell iso={item.createdOn} /> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <RowActions label={item.title}
                onView={() => setViewing(item)}
                onDownload={item.file ? () => files.save(fileUrl(item), item.file.name) : undefined}
                onEdit={canEdit ? () => setForm(item) : undefined}
                onDelete={canEdit ? () => setDeleting(item) : undefined} />
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <InstrumentForm item={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload() }} />}

      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <FormHeader icon={TYPE_ICON[viewing.docType] || BookOpen} title={viewing.title} text={`${viewing.docType} – ${INSTRUMENT_NAMES[viewing.docType] || ''}`} />
            <Details rows={[
              ['Estado', <Pill key="s" value={viewing.displayStatus} />],
              ['Descripción / Alcance', viewing.description],
              ['Aprobación', `${viewing.approvalType} ${viewing.number}`],
              ['Fecha de aprobación', dmy(viewing.issueDate)],
              ['Vigencia', `${viewing.startYear} – ${viewing.endYear}`],
              ['Versión', viewing.version],
              ['Responsable principal', viewing.responsible],
              ['Área relacionada', viewing.area],
              ['Documento', viewing.file ? viewing.file.name : 'Sin documento adjunto'],
              ['Registrado', `${dmy(viewing.createdOn)}${viewing.createdBy ? ` por ${viewing.createdBy}` : ''}`],
            ]} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {viewing.file && <Button type="button" variant="outline" onClick={() => files.view(fileUrl(viewing))}><FileText /> Ver PDF</Button>}
              {canEdit && <Button type="button" onClick={() => { setForm(viewing); setViewing(null) }}>Editar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDelete item={deleting} title="Eliminar instrumento" text={`¿Seguro que deseas eliminar «${deleting?.title}»?`}
        path={`/api/docs/records/${deleting?.id}`} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload() }} />
    </div>
  )
}

/** «Registrar instrumento de gestión». */
function InstrumentForm({ item, onClose, onSaved }) {
  const { toast } = useApp()
  const files = useFileActions()
  const editing = Boolean(item)
  const year = currentYear()
  const [form, setForm] = useState(() => (item
    ? { docType: item.docType, title: item.title, description: item.description, approvalType: item.approvalType || APPROVAL_TYPES[0], number: item.number, issueDate: item.issueDate,
      startYear: String(item.startYear), endYear: String(item.endYear), responsible: item.responsible, area: item.area, version: item.version, status: item.status }
    : { docType: '', title: '', description: '', approvalType: APPROVAL_TYPES[0], number: '', issueDate: '', startYear: String(year), endYear: String(year),
      responsible: 'Dirección', area: '', version: 'v1.0', status: 'Vigente' }))
  const [file, setFile] = useState(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const stored = editing && !removeFile ? item.file : null
  const suggested = form.docType ? `${form.docType}_${form.startYear}${form.endYear !== form.startYear ? `-${form.endYear}` : ''}.pdf` : 'PEI_2024-2028.pdf'

  function chooseType(docType) {
    // A new record suggests the usual title and validity of each instrument (the PEI usually lasts several years).
    if (editing || form.title) return set({ docType })
    const end = docType === 'PEI' ? String(Number(form.startYear) + 4) : form.startYear
    set({ docType, endYear: end, title: `${INSTRUMENT_NAMES[docType]} (${docType}) ${form.startYear}${end !== form.startYear ? ` – ${end}` : ''}` })
  }

  async function save(event) {
    event.preventDefault()
    if (Number(form.endYear) < Number(form.startYear)) return toast('El año de fin no puede ser anterior al de inicio.', 'bad')
    setSaving(true)
    const data = { ...form, kind: 'instrumento', removeFile: removeFile && !file }
    const result = await sendWithFile(editing ? `/api/docs/records/${item.id}` : '/api/docs/records', editing ? 'PATCH' : 'POST', data, file)
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Instrumento actualizado.' : 'Instrumento de gestión registrado.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={FORM_DIALOG}>
        <FormHeader icon={NotebookPen} title={editing ? 'Editar instrumento de gestión' : 'Registrar instrumento de gestión'} text="Complete la información y adjunte el documento en formato PDF." />
        <StaffNames id="doc-staff" />
        <form id="instrument-form" className="grid gap-3 lg:grid-cols-2" onSubmit={save}>
          <Section number={1} icon={FileText} title="Información del instrumento" className="sm:grid-cols-2 lg:col-span-2">
            <Field label="Tipo de instrumento" required>
              <Select value={form.docType} onChange={chooseType} required options={[{ value: '', label: 'Seleccione…' }, ...INSTRUMENT_TYPES.map((value) => ({ value, label: `${value} – ${INSTRUMENT_NAMES[value]}` }))]} />
            </Field>
            <Field label="Título del instrumento" required><Input value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={300} placeholder="Ej. Proyecto Educativo Institucional 2024 - 2028" required /></Field>
            <Field label="Descripción / Alcance" className="sm:col-span-2">
              <CountedText rows={2} max={300} value={form.description} onChange={(description) => set({ description })} placeholder="Breve descripción del contenido y alcance del documento…" />
            </Field>
          </Section>
          <Section number={2} icon={Gavel} title="Datos de aprobación" className="sm:grid-cols-2">
            <Field label="Tipo de documento" required><Select value={form.approvalType} onChange={(approvalType) => set({ approvalType })} options={opts(APPROVAL_TYPES)} /></Field>
            <Field label="Número de resolución" required><Input value={form.number} onChange={(event) => set({ number: event.target.value })} maxLength={80} placeholder="R.D. N.° 000-2026-IE" required /></Field>
            <Field label="Fecha de aprobación" required><Input type="date" value={form.issueDate} onChange={(event) => set({ issueDate: event.target.value })} required /></Field>
          </Section>
          <Section number={3} icon={CalendarRange} title="Vigencia" className="sm:grid-cols-2">
            <Field label="Año de inicio" required><Select value={form.startYear} onChange={(startYear) => set({ startYear, endYear: Number(form.endYear) < Number(startYear) ? startYear : form.endYear })} options={opts(yearOptions())} /></Field>
            <Field label="Año de fin" required><Select value={form.endYear} onChange={(endYear) => set({ endYear })} options={opts(yearOptions().filter((value) => value >= Number(form.startYear)))} /></Field>
            <Field label="Periodo de vigencia" className="sm:col-span-2"><Input value={`${form.startYear} – ${form.endYear}`} readOnly disabled /></Field>
          </Section>
          <Section number={4} icon={Users} title="Responsables" className="sm:grid-cols-2">
            <Field label="Responsable principal" required><Input list="doc-responsibles" value={form.responsible} onChange={(event) => set({ responsible: event.target.value })} maxLength={160} required /></Field>
            <datalist id="doc-responsibles">{RESPONSIBLES.map((value) => <option key={value} value={value} />)}</datalist>
            <Field label="Área relacionada"><Select value={form.area} onChange={(area) => set({ area })} options={opts(AREAS, 'Seleccione…')} /></Field>
          </Section>
          <Section number={5} icon={TagIcon} title="Otros datos" className="sm:grid-cols-2">
            <Field label="Versión" required><Input value={form.version} onChange={(event) => set({ version: event.target.value })} maxLength={20} placeholder="v1.0" required /></Field>
            <Field label="Estado" required><Select value={form.status} onChange={(status) => set({ status })} options={opts(INSTRUMENT_STATUS)} /></Field>
          </Section>
          <Section number={6} icon={ClipboardCheck} title="Archivo del documento" className="sm:grid-cols-[3fr_2fr] lg:col-span-2">
            <PdfDrop file={file} current={stored} onFile={setFile} onView={() => files.view(`/api/docs/records/${item.id}/file`)}
              onRemove={() => { if (file) setFile(null); else setRemoveFile(true) }} />
            <div className="rounded-lg border border-[#cfd8ea] bg-[#f2f5fb] p-3 text-xs text-foreground dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="mb-2 font-semibold text-primary">Requisitos del archivo</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>✓ Documento en formato PDF.</li>
                <li>✓ Nombre sugerido: {suggested}</li>
                <li>✓ Tamaño máximo: 50 MB.</li>
              </ul>
            </div>
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote>Los campos con (<span className="text-destructive">*</span>) son obligatorios.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="instrument-form" disabled={saving}><Save /> {saving ? 'Guardando…' : 'Guardar registro'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
