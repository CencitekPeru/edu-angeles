import { useState } from 'react'
import { CalendarClock, CheckCircle2, ClipboardCheck, Clock, Eraser, FileSpreadsheet, FileText, FolderOpen, Hash, Info, Landmark, Network, Paperclip, Plus, Save, Search, Workflow, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { roleLabel, useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { ADMIN_DOC_STATUS, ADMIN_DOC_TYPES, AREAS } from '../../lib/documents'
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
const DISPLAY_STATUS = ['En trámite', 'Atendido', 'Vencido', 'Archivado', 'Anulado']

/** «4. Documentos administrativos»: internal reports, letters, memos, plans and requests of the school. */
export default function AdminDocsPage() {
  const { toast } = useApp()
  const canEdit = useCan('documentos')
  const files = useFileActions()
  const [records, loading, reload] = useList('/api/docs/records?kind=administrativo', 'records')
  const emptyFilters = { year: String(currentYear()), type: '', area: '', status: '', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [tracking, setTracking] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const ofYear = records.filter((item) => !filters.year || yearOf(item.issueDate) === Number(filters.year))
  const term = filters.q.trim().toLowerCase()
  const visible = ofYear.filter((item) =>
      (!filters.type || item.docType === filters.type)
      && (!filters.area || item.area === filters.area)
      && (!filters.status || item.displayStatus === filters.status)
      && (!term || `${item.title} ${item.number} ${item.responsible}`.toLowerCase().includes(term)))
  const count = (status) => ofYear.filter((item) => item.displayStatus === status).length
  const pick = (status) => setFilters({ ...filters, status })

  function exportData() {
    if (!visible.length) return toast('No hay documentos para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión documental · Documentos administrativos',
      subtitle: filters.year ? `Año ${filters.year}` : 'Todos los años',
      summary: [['Documentos', visible.length], ['Atendidos', visible.filter((item) => item.displayStatus === 'Atendido').length], ['En trámite', visible.filter((item) => item.displayStatus === 'En trámite').length]],
      headers: ['N.°', 'N.° de documento', 'Fecha', 'Tipo', 'Asunto', 'Área / Dependencia', 'Responsable', 'Cargo', 'Fecha de registro', 'Plazo', 'Fecha de atención', 'Estado', 'Acciones / Descripción'],
      widths: [6, 24, 12, 14, 40, 22, 26, 20, 13, 12, 13, 12, 40],
      rows: visible.map((item, index) => [pad(index + 1), item.number, dmy(item.issueDate), item.docType, item.title, item.area, item.responsible, item.responsibleRole || '—',
        dmy(item.receivedDate), dmy(item.deadline), dmy(item.attendedDate), item.displayStatus, item.actions]),
    }).then(() => toast('Documentos exportados a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FolderOpen}
        title="4. Documentos administrativos"
        description="Informes · Oficios · Memorándums · Planes · Solicitudes · Otros | Registro, archivo y control de documentos internos de la institución."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Registrar documento administrativo</Button>}
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} value={ofYear.length} label="Total" onClick={() => pick('')} />
        <StatCard tone="green" icon={CheckCircle2} value={count('Atendido')} label="Atendidos" onClick={() => pick('Atendido')} />
        <StatCard tone="amber" icon={Clock} value={count('En trámite')} label="En trámite" onClick={() => pick('En trámite')} />
        <StatCard tone="red" icon={CalendarClock} value={count('Vencido')} label="Vencidos" hint="Plazo de atención cumplido" onClick={() => pick('Vencido')} />
      </div>

      <Panel title={`Documentos administrativos (${visible.length})`} icon={FolderOpen}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          <FilterLabel label="Año"><Select value={filters.year} onChange={(year) => setFilters({ ...filters, year })} options={opts(yearOptions(), 'Todos')} /></FilterLabel>
          <FilterLabel label="Tipo de documento"><Select value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={opts(ADMIN_DOC_TYPES, 'Todos')} /></FilterLabel>
          <FilterLabel label="Área / Dependencia"><Select value={filters.area} onChange={(area) => setFilters({ ...filters, area })} options={opts(AREAS, 'Todas')} /></FilterLabel>
          <FilterLabel label="Estado"><Select value={filters.status} onChange={pick} options={opts(DISPLAY_STATUS, 'Todos')} /></FilterLabel>
          <FilterLabel label="Buscar" className="sm:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por asunto, N.° de documento…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <Table
          rows={visible}
          empty={loading ? 'Cargando…' : 'No hay documentos administrativos con estos filtros.'}
          columns={[
            { key: 'n', label: 'N.°', render: (item) => <span className="font-semibold tabular-nums">{pad(visible.indexOf(item) + 1)}</span> },
            { key: 'number', label: 'N.° de documento', render: (item) => <span className="whitespace-nowrap font-medium">{item.number}</span> },
            { key: 'date', label: 'Fecha', render: (item) => <DateCell iso={item.issueDate} /> },
            { key: 'type', label: 'Tipo de documento', render: (item) => <Tag icon={FileText}>{item.docType}</Tag> },
            { key: 'title', label: 'Asunto', render: (item) => <span className="block max-w-64">{item.title}</span> },
            { key: 'area', label: 'Área / Dependencia', render: (item) => <span className="flex items-center gap-1.5 whitespace-nowrap"><Network className="size-4 text-muted-foreground" />{item.area}</span> },
            { key: 'status', label: 'Estado', render: (item) => <Pill value={item.displayStatus} /> },
            { key: 'actions', label: 'Acciones', render: (item) => (
              <span className="flex items-center gap-1">
                <RowActions label={item.number}
                  onView={() => setViewing(item)}
                  onEdit={canEdit ? () => setForm(item) : undefined}
                  onDownload={item.file ? () => files.save(fileUrl(item), item.file.name) : undefined}
                  onDelete={canEdit ? () => setDeleting(item) : undefined} />
                <Button type="button" variant="ghost" size="icon" className="size-8 rounded-md border border-border text-primary" title="Ver seguimiento" aria-label={`Seguimiento de ${item.number}`} onClick={() => setTracking(item)}><Workflow /></Button>
              </span>
            ) },
          ]}
        />
      </Panel>

      {form !== undefined && <AdminForm item={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload() }} />}
      {tracking && <TrackingDialog record={tracking} statuses={ADMIN_DOC_STATUS} canEdit={canEdit} onClose={() => setTracking(null)} onChanged={reload} />}

      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <FormHeader icon={FileText} title={viewing.number} text={viewing.title} />
            <Details rows={[
              ['Estado', <Pill key="s" value={viewing.displayStatus} />],
              ['Tipo de documento', viewing.docType],
              ['Fecha del documento', dmy(viewing.issueDate)],
              ['Área / Dependencia', viewing.area],
              ['Responsable de elaboración', [viewing.responsible, viewing.responsibleRole].filter(Boolean).join(' – ')],
              ['Fecha de registro', dmy(viewing.receivedDate)],
              ['Plazo de atención', dmy(viewing.deadline)],
              ['Fecha de atención', dmy(viewing.attendedDate)],
              ['Acciones / Descripción', viewing.actions],
              ['Documento', viewing.file ? viewing.file.name : 'Sin documento adjunto'],
              ['Registrado por', viewing.createdBy],
            ]} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {viewing.file && <Button type="button" variant="outline" onClick={() => files.view(fileUrl(viewing))}><FileText /> Ver PDF</Button>}
              {canEdit && <Button type="button" onClick={() => { setForm(viewing); setViewing(null) }}>Editar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDelete item={deleting} title="Eliminar documento administrativo" text={`¿Seguro que deseas eliminar el documento «${deleting?.number}» y su seguimiento?`}
        path={`/api/docs/records/${deleting?.id}`} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload() }} />
    </div>
  )
}

/** «Registrar Documento Administrativo». */
function AdminForm({ item, onClose, onSaved }) {
  const { toast, user } = useApp()
  const files = useFileActions()
  const editing = Boolean(item)
  const today = todayLima()
  const [form, setForm] = useState(() => (item
    ? { docType: item.docType, number: item.number, issueDate: item.issueDate, title: item.title, area: item.area, responsible: item.responsible, responsibleRole: item.responsibleRole,
      status: item.status, receivedDate: item.receivedDate, deadline: item.deadline, attendedDate: item.attendedDate, actions: item.actions }
    : { docType: 'Informe', number: '', issueDate: today, title: '', area: '', responsible: user?.name || '', responsibleRole: roleLabel(user?.role),
      status: 'En trámite', receivedDate: today, deadline: '', attendedDate: '', actions: '' }))
  const [file, setFile] = useState(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const stored = editing && !removeFile ? item.file : null

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    const data = { ...form, kind: 'administrativo', attendedDate: form.attendedDate || (form.status === 'Atendido' ? today : ''), removeFile: removeFile && !file }
    const result = await sendWithFile(editing ? `/api/docs/records/${item.id}` : '/api/docs/records', editing ? 'PATCH' : 'POST', data, file)
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Documento actualizado.' : 'Documento administrativo registrado.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={FORM_DIALOG}>
        <FormHeader icon={FileText} title={editing ? 'Editar documento administrativo' : 'Registrar Documento Administrativo'} text="Registre la información del documento interno de la institución." />
        <StaffNames id="adm-staff" />
        <form id="admin-doc-form" className="grid gap-3 lg:grid-cols-[3fr_2fr]" onSubmit={save}>
          <Section icon={Info} title="Datos del documento" className="sm:grid-cols-3">
            <Field label="Tipo de documento" required><Select value={form.docType} onChange={(docType) => set({ docType })} options={opts(ADMIN_DOC_TYPES)} /></Field>
            <Field label="N.° de documento" required>
              <span className="relative"><Hash className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={form.number} onChange={(event) => set({ number: event.target.value })} maxLength={80} placeholder="INF. N.° 010-2026-CIST" required /></span>
            </Field>
            <Field label="Fecha del documento" required><Input type="date" value={form.issueDate} onChange={(event) => set({ issueDate: event.target.value })} required /></Field>
            <Field label="Asunto" required className="sm:col-span-3"><CountedText rows={2} max={300} value={form.title} onChange={(title) => set({ title })} placeholder="Asunto del documento…" required /></Field>
          </Section>
          <Section icon={Landmark} title="Área / Dependencia" className="sm:grid-cols-2">
            <Field label="Área / Dependencia" required className="sm:col-span-2"><Select value={form.area} onChange={(area) => set({ area })} options={opts(AREAS, 'Seleccione…')} required /></Field>
            <Field label="Responsable de elaboración" required><Input list="adm-staff" value={form.responsible} onChange={(event) => set({ responsible: event.target.value })} maxLength={160} required /></Field>
            <Field label="Cargo"><Input value={form.responsibleRole} onChange={(event) => set({ responsibleRole: event.target.value })} maxLength={120} placeholder="Ej. Coordinador CIST" /></Field>
          </Section>
          <Section icon={ClipboardCheck} title="Gestión y control" className="sm:grid-cols-4">
            <Field label="Estado del documento" required><Select value={form.status} onChange={(status) => set({ status })} options={opts(ADMIN_DOC_STATUS)} /></Field>
            <Field label="Fecha de registro" required><Input type="date" value={form.receivedDate} onChange={(event) => set({ receivedDate: event.target.value })} required /></Field>
            <Field label="Plazo de atención"><Input type="date" value={form.deadline} min={form.receivedDate} onChange={(event) => set({ deadline: event.target.value })} /></Field>
            <Field label="Fecha de atención"><Input type="date" value={form.attendedDate} min={form.receivedDate} onChange={(event) => set({ attendedDate: event.target.value })} /></Field>
            <Field label="Acciones / Descripción" required className="sm:col-span-4"><CountedText rows={3} max={500} value={form.actions} onChange={(actions) => set({ actions })} placeholder="Describe el contenido del documento o las acciones realizadas…" required /></Field>
          </Section>
          <Section icon={Paperclip} title="Documento adjunto">
            <PdfDrop file={file} current={stored} onFile={setFile} onView={() => files.view(fileUrl(item))} onRemove={() => { if (file) setFile(null); else setRemoveFile(true) }} />
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote><strong>Importante:</strong> registre correctamente la información y adjunte el documento en formato PDF para su archivo y consulta posterior.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="admin-doc-form" disabled={saving}><Save /> {saving ? 'Guardando…' : 'Guardar registro'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
