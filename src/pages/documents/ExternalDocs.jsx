import { useState } from 'react'
import { CalendarClock, CheckCircle2, Clock, Eraser, FileSpreadsheet, FileText, Hash, Inbox, Info, Landmark, Mail, Paperclip, Plus, Save, Search, Settings2, Workflow, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { ENTITIES, EXTERNAL_DOC_STATUS, EXTERNAL_DOC_TYPES } from '../../lib/documents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard, Table } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import {
  ConfirmDelete, CountedText, DateCell, Details, Field, FilterLabel, FORM_DIALOG, FormHeader, FormNote, PdfDrop, RowActions, Section, Select, StaffNames, Tag,
  currentYear, dmy, opts, pad, sendWithFile, useFileActions, useList, yearOf, yearOptions,
} from './shared'
import TrackingDialog from './Tracking'

const fileUrl = (item) => `/api/docs/records/${item.id}/file`
const DISPLAY_STATUS = ['Recibido', 'En seguimiento', 'Atendido', 'Vencido', 'Archivado']
const DEPENDENCIES = ['Dirección', 'Dirección de Gestión Pedagógica', 'Dirección de Gestión Institucional', 'Área de Gestión Administrativa', 'Área de Personal', 'Otra dependencia']
const RESPONSIBLES = ['Dirección', 'Subdirección', 'Coordinación CIST', 'Coordinación Académica', 'Secretaría']

/** «3. Documentos de entidades externas»: reception, filing and follow-up of documents from UGEL, DRE, MINEDU and others. */
export default function ExternalDocsPage() {
  const { toast } = useApp()
  const canEdit = useCan('documentos')
  const files = useFileActions()
  const [records, loading, reload] = useList('/api/docs/records?kind=externo', 'records')
  const emptyFilters = { year: String(currentYear()), entity: '', type: '', status: '', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [tracking, setTracking] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const ofYear = records.filter((item) => !filters.year || yearOf(item.receivedDate) === Number(filters.year))
  const term = filters.q.trim().toLowerCase()
  const visible = ofYear.filter((item) =>
      (!filters.entity || item.entity === filters.entity)
      && (!filters.type || item.docType === filters.type)
      && (!filters.status || item.displayStatus === filters.status)
      && (!term || `${item.title} ${item.number} ${item.entity} ${item.sender}`.toLowerCase().includes(term)))
  const count = (status) => ofYear.filter((item) => item.displayStatus === status).length
  const pick = (status) => setFilters({ ...filters, status })

  function exportData() {
    if (!visible.length) return toast('No hay documentos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión documental · Documentos de entidades externas',
      subtitle: filters.year ? `Año ${filters.year}` : 'Todos los años',
      summary: [['Documentos', visible.length], ['Atendidos', visible.filter((item) => item.displayStatus === 'Atendido').length], ['Vencidos', visible.filter((item) => item.displayStatus === 'Vencido').length]],
      headers: ['N.°', 'N.° de documento', 'Tipo', 'Fecha de emisión', 'Fecha de recepción', 'Entidad', 'Área / Dependencia', 'Remitente', 'Asunto', 'Responsable', 'Plazo', 'Estado', 'Acciones / Seguimiento'],
      widths: [6, 24, 16, 13, 13, 14, 26, 26, 40, 22, 12, 14, 40],
      rows: visible.map((item, index) => [pad(index + 1), item.number, item.docType, dmy(item.issueDate), dmy(item.receivedDate), item.entity, item.area || '—',
        [item.sender, item.senderRole].filter(Boolean).join(' – ') || '—', item.title, item.responsible, dmy(item.deadline), item.displayStatus, item.actions]),
    }).then(() => toast('Documentos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Inbox}
        title="3. Documentos de entidades externas"
        description="UGEL · DRE · MINEDU · Otras entidades | Recepción, registro, archivo y seguimiento de documentos externos."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Registrar documento externo</Button>}
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} value={ofYear.length} label="Recibidos" onClick={() => pick('')} />
        <StatCard tone="green" icon={CheckCircle2} value={count('Atendido')} label="Atendidos" onClick={() => pick('Atendido')} />
        <StatCard tone="amber" icon={Clock} value={count('En seguimiento')} label="En seguimiento" onClick={() => pick('En seguimiento')} />
        <StatCard tone="red" icon={CalendarClock} value={count('Vencido')} label="Vencidos" hint="Plazo de atención cumplido" onClick={() => pick('Vencido')} />
      </div>

      <Panel title={`Documentos externos (${visible.length})`} icon={Inbox}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          <FilterLabel label="Año"><Select value={filters.year} onChange={(year) => setFilters({ ...filters, year })} options={opts(yearOptions(), 'Todos')} /></FilterLabel>
          <FilterLabel label="Entidad"><Select value={filters.entity} onChange={(entity) => setFilters({ ...filters, entity })} options={opts(ENTITIES, 'Todas')} /></FilterLabel>
          <FilterLabel label="Tipo de documento"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(EXTERNAL_DOC_TYPES, 'Todos')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={pick} options={opts(DISPLAY_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Buscar" className="sm:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por asunto, N.° de documento o entidad…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay documentos externos con estos filtros.'}
          columns={[
            { key: 'n', label: 'N.°', render: (item) => <span className="font-semibold tabular-nums">{pad(visible.indexOf(item) + 1)}</span> },
            { key: 'number', label: 'N.° de documento', render: (item) => <span className="whitespace-nowrap font-medium">{item.number}</span> },
            { key: 'received', label: 'Fecha de recepción', render: (item) => <DateCell iso={item.receivedDate} /> },
            { key: 'entity', label: 'Entidad remitente', render: (item) => <Tag icon={Landmark}>{item.entity}</Tag> },
            { key: 'title', label: 'Asunto', render: (item) => <span className="block max-w-64">{item.title}</span> },
            { key: 'type', label: 'Tipo', render: (item) => <span className="flex items-center gap-1.5 whitespace-nowrap"><Mail className="size-4 text-muted-foreground" />{item.docType}</span> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.displayStatus} /> },
            { key: 'tracking', label: 'Seguimiento', render: (item) => (
              <button type="button" className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => setTracking(item)}>
                <Workflow className="size-4" /> Ver seguimiento
              </button>
            ) },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <RowActions label={item.number}
                onView={() => setViewing(item)}
                onDownload={item.file ? () => files.save(fileUrl(item), item.file.name) : undefined}
                onEdit={canEdit ? () => setForm(item) : undefined}
                onDelete={canEdit ? () => setDeleting(item) : undefined} />
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <ExternalForm item={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload() }} />}
      {tracking && <TrackingDialog record={tracking} statuses={EXTERNAL_DOC_STATUS} canEdit={canEdit} onClose={() => setTracking(null)} onChanged={reload} />}

      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl [&>button:last-child]:top-5 [&>button:last-child]:text-white">
            <FormHeader icon={FileText} title={viewing.number} text={viewing.title} />
            <Details rows={[
              ['Estado', <Pill key="s" value={viewing.displayStatus} />],
              ['Tipo de documento', viewing.docType],
              ['Fecha de emisión', dmy(viewing.issueDate)],
              ['Entidad', viewing.entity],
              ['Área / Dependencia', viewing.area],
              ['Remitente / Firmante', [viewing.sender, viewing.senderRole].filter(Boolean).join(' – ')],
              ['Responsable de atención', viewing.responsible],
              ['Fecha de recepción', dmy(viewing.receivedDate)],
              ['Plazo de atención', dmy(viewing.deadline)],
              ['Acciones / Seguimiento', viewing.actions],
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

      <ConfirmDelete item={deleting} title="Eliminar documento externo" text={`¿Seguro que deseas eliminar el documento «${deleting?.number}» y su seguimiento?`}
        path={`/api/docs/records/${deleting?.id}`} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload() }} />
    </div>
  )
}

/** «Registrar Documento de Entidad Externa». */
function ExternalForm({ item, onClose, onSaved }) {
  const { toast } = useApp()
  const files = useFileActions()
  const editing = Boolean(item)
  const today = todayLima()
  const [form, setForm] = useState(() => (item
    ? { docType: item.docType, number: item.number, issueDate: item.issueDate, title: item.title, entity: item.entity, area: item.area, sender: item.sender, senderRole: item.senderRole,
      responsible: item.responsible, receivedDate: item.receivedDate, deadline: item.deadline, status: item.status, actions: item.actions }
    : { docType: 'Oficio', number: '', issueDate: '', title: '', entity: 'UGEL', area: '', sender: '', senderRole: '', responsible: 'Coordinación CIST', receivedDate: today, deadline: '', status: 'Recibido', actions: '' }))
  const [file, setFile] = useState(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const stored = editing && !removeFile ? item.file : null

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const result = await sendWithFile(editing ? `/api/docs/records/${item.id}` : '/api/docs/records', editing ? 'PATCH' : 'POST', { ...form, kind: 'externo', removeFile: removeFile && !file }, file)
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Documento actualizado.' : 'Documento externo registrado.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={FORM_DIALOG}>
        <FormHeader icon={FileText} title={editing ? 'Editar documento de entidad externa' : 'Registrar Documento de Entidad Externa'} text="Registre la información del documento recibido de UGEL, DRE, MINEDU u otra entidad." />
        <StaffNames id="ext-staff" />
        <datalist id="ext-dependencies">{DEPENDENCIES.map((value) => <option key={value} value={value} />)}</datalist>
        <datalist id="ext-responsibles">{RESPONSIBLES.map((value) => <option key={value} value={value} />)}</datalist>
        <form id="external-form" className="grid gap-3 lg:grid-cols-[3fr_2fr]" onSubmit={save}>
          <Section number={1} icon={Info} title="Datos del documento" className="sm:grid-cols-3">
            <Field label="Tipo de documento" required><Select value={form.docType} onChange={(docType) => set({ docType })} options={opts(EXTERNAL_DOC_TYPES)} /></Field>
            <Field label="N.° de documento" required>
              <span className="relative"><Hash className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={form.number} onChange={(event) => set({ number: event.target.value })} maxLength={80} placeholder="OF. N.° 0123-2026-UGEL" required /></span>
            </Field>
            <Field label="Fecha de emisión" required><Input type="date" value={form.issueDate} max={today} onChange={(event) => set({ issueDate: event.target.value })} required /></Field>
            <Field label="Asunto" required className="sm:col-span-3"><CountedText rows={2} max={300} value={form.title} onChange={(title) => set({ title })} placeholder="Asunto del documento…" required /></Field>
          </Section>
          <Section number={2} icon={Landmark} title="Entidad remitente" className="sm:grid-cols-2">
            <Field label="Entidad" required><Select value={form.entity} onChange={(entity) => set({ entity })} options={opts(ENTITIES)} /></Field>
            <Field label="Área / Dependencia"><Input list="ext-dependencies" value={form.area} onChange={(event) => set({ area: event.target.value })} maxLength={120} placeholder="Ej. Dirección de Gestión Pedagógica" /></Field>
            <Field label="Remitente / Firmante"><Input value={form.sender} onChange={(event) => set({ sender: event.target.value })} maxLength={160} placeholder="Ej. Lic. Carlos Mendoza Torres" /></Field>
            <Field label="Cargo"><Input value={form.senderRole} onChange={(event) => set({ senderRole: event.target.value })} maxLength={120} placeholder="Ej. Director UGEL" /></Field>
          </Section>
          <Section number={3} icon={Settings2} title="Gestión y seguimiento" className="sm:grid-cols-4">
            <Field label="Responsable de atención" required><Input list="ext-responsibles" value={form.responsible} onChange={(event) => set({ responsible: event.target.value })} maxLength={160} required /></Field>
            <Field label="Fecha de recepción" required><Input type="date" value={form.receivedDate} max={today} onChange={(event) => set({ receivedDate: event.target.value })} required /></Field>
            <Field label="Plazo de atención"><Input type="date" value={form.deadline} min={form.receivedDate} onChange={(event) => set({ deadline: event.target.value })} /></Field>
            <Field label="Estado" required><Select value={form.status} onChange={(status) => set({ status })} options={opts(EXTERNAL_DOC_STATUS)} /></Field>
            <Field label="Acciones / Seguimiento" className="sm:col-span-4"><CountedText rows={3} max={500} value={form.actions} onChange={(actions) => set({ actions })} placeholder="Acciones realizadas para atender el documento…" /></Field>
          </Section>
          <Section number={4} icon={Paperclip} title="Documento adjunto">
            <PdfDrop file={file} current={stored} onFile={setFile} onView={() => files.view(fileUrl(item))} onRemove={() => { if (file) setFile(null); else setRemoveFile(true) }} />
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote><strong>Importante:</strong> registre correctamente la información del documento y adjunte el archivo original para su archivo y seguimiento.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="external-form" disabled={saving}><Save /> {saving ? 'Guardando…' : 'Guardar registro'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
