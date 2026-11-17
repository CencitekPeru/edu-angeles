import { useState } from 'react'
import { CalendarRange, ClipboardList, Eraser, FileSpreadsheet, Layers, Network, Paperclip, Pencil, Plus, Save, Search, Trash2, UserRound, Users, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { COMMITTEES, subcommissionsOf } from '../../lib/committees'
import { CONFORMATION_TYPES, MEMBER_CONDITIONS, MEMBER_LEVELS, MEMBER_POSITIONS, ORG_SCOPES, ORG_STATUS } from '../../lib/documents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, Panel, Pill, StatCard } from '../campus/kit'
import {
  ConfirmDelete, CountedText, Details, Field, FilterLabel, FORM_DIALOG, FormHeader, FormNote, PdfDrop, RowActions, Section, Select, StaffNames, Tag,
  currentYear, dmy, opts, pad, sendWithFile, useFileActions, useList, yearOptions,
} from './shared'

const fileUrl = (item) => `/api/docs/organizations/${item.id}/file`
const emptyMember = { name: '', position: '', condition: '', level: '' }

/** Committees in the official order first, then the rest alphabetically. */
const committeeOrder = (name) => {
  const index = COMMITTEES.findIndex((item) => item.toLowerCase() === name.toLowerCase())
  return index === -1 ? COMMITTEES.length : index
}

/**
 * Committee → commission → members table: the committee and each commission span their rows,
 * and every member has a row of their own so name, position, condition and level stay aligned.
 */
function OrgTable({ items, empty, actions }) {
  const groups = []
  for (const item of [...items].sort((a, b) => committeeOrder(a.committee) - committeeOrder(b.committee) || a.committee.localeCompare(b.committee, 'es') || a.commission.localeCompare(b.commission, 'es'))) {
    const group = groups.at(-1)?.committee === item.committee ? groups.at(-1) : (groups.push({ committee: item.committee, commissions: [] }), groups.at(-1))
    group.commissions.push(item)
  }
  const rowsOf = (item) => Math.max(1, item.members.length)
  const head = 'px-3 py-2.5 text-left text-xs font-bold whitespace-nowrap text-white'
  const cell = 'px-3 py-2 align-middle'
  let number = 0

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-[#0b1730]">
            <tr>
              <th className={`${head} w-14 text-center`}>N.°</th>
              <th className={`${head} w-56`}>Comité</th>
              <th className={`${head} w-60`}>Comisión</th>
              <th className={head}>Integrantes (Docente / Trabajador)</th>
              <th className={`${head} w-28`}>Cargo</th>
              <th className={`${head} w-24`}>Condición</th>
              <th className={`${head} w-32`}>Nivel</th>
              <th className={`${head} w-40 text-center`}>Acciones</th>
            </tr>
          </thead>
          {groups.length === 0 && (
            <tbody><tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</td></tr></tbody>
          )}
          {groups.map((group) => {
            const span = group.commissions.reduce((total, item) => total + rowsOf(item), 0)
            return (
              <tbody key={group.committee} className="border-t-2 border-slate-300 dark:border-slate-600">
                {group.commissions.flatMap((item, commissionIndex) => {
                  number += 1
                  const members = item.members.length ? item.members : [null]
                  return members.map((member, memberIndex) => (
                    <tr key={`${item.id}-${memberIndex}`} className={memberIndex === 0 && commissionIndex > 0 ? 'border-t border-border' : 'border-t border-border/50'}>
                      {memberIndex === 0 && <td rowSpan={rowsOf(item)} className={`${cell} text-center font-semibold tabular-nums`}>{pad(number)}</td>}
                      {commissionIndex === 0 && memberIndex === 0 && (
                        <td rowSpan={span} className={`${cell} border-x border-border bg-slate-50 dark:bg-muted/40`}>
                          <span className="flex items-start gap-2 font-semibold leading-snug">
                            <Network className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>
                              {group.committee}
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                {group.commissions.length} {group.commissions.length === 1 ? 'comisión' : 'comisiones'}
                              </span>
                            </span>
                          </span>
                        </td>
                      )}
                      {memberIndex === 0 && (
                        <td rowSpan={rowsOf(item)} className={`${cell} border-r border-border`}>
                          <span className="flex items-start gap-2 font-semibold leading-snug"><Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{item.commission}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
                            {item.status !== 'Activo' && <Pill value={item.status} />}
                            <span>{item.members.length} {item.members.length === 1 ? 'integrante' : 'integrantes'}</span>
                          </span>
                        </td>
                      )}
                      {member ? (
                        <>
                          <td className={cell}><span className="flex items-center gap-2"><UserRound className="size-3.5 shrink-0 text-muted-foreground" />{member.name}</span></td>
                          <td className={cell}>{member.position}</td>
                          <td className={`${cell} ${member.condition === 'Suplente' ? 'text-muted-foreground' : ''}`}>{member.condition}</td>
                          <td className={cell}><Tag>{member.level}</Tag></td>
                        </>
                      ) : (
                        <td colSpan={4} className={`${cell} text-xs text-muted-foreground`}>Sin integrantes registrados.</td>
                      )}
                      {memberIndex === 0 && <td rowSpan={rowsOf(item)} className={`${cell} border-l border-border`}><span className="flex justify-center">{actions(item)}</span></td>}
                    </tr>
                  ))
                })}
              </tbody>
            )
          })}
        </table>
      </div>
      {groups.length > 0 && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Mostrando {items.length} {items.length === 1 ? 'comisión' : 'comisiones'} en {groups.length} {groups.length === 1 ? 'comité' : 'comités'}
        </p>
      )}
    </div>
  )
}

/** «2. Organización institucional»: committees, their commissions and members, with the conformation document. */
export default function OrganizationPage() {
  const { toast } = useApp()
  const canEdit = useCan('documentos')
  const files = useFileActions()
  const [items, loading, reload] = useList('/api/docs/organizations', 'organizations')
  const emptyFilters = { year: String(currentYear()), committee: '', commission: '', q: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState(undefined)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const ofYear = items.filter((item) => !filters.year || String(item.year) === filters.year)
  const committees = [...new Set(ofYear.map((item) => item.committee))].sort((a, b) => a.localeCompare(b, 'es'))
  const commissions = [...new Set(ofYear.filter((item) => !filters.committee || item.committee === filters.committee).map((item) => item.commission))].sort((a, b) => a.localeCompare(b, 'es'))
  const term = filters.q.trim().toLowerCase()
  const visible = ofYear.filter((item) =>
    (!filters.committee || item.committee === filters.committee)
    && (!filters.commission || item.commission === filters.commission)
    && (!term || `${item.committee} ${item.commission} ${item.members.map((member) => member.name).join(' ')}`.toLowerCase().includes(term)))
  const memberCount = visible.reduce((total, item) => total + item.members.length, 0)

  function exportData() {
    if (!visible.length) return toast('No hay comisiones para exportar.', 'bad')
    exportTableXlsx({
      title: 'Gestión documental · Organización institucional',
      subtitle: filters.year ? `Año escolar ${filters.year}` : 'Todos los años',
      summary: [['Comités', new Set(visible.map((item) => item.committee)).size], ['Comisiones', visible.length], ['Integrantes', memberCount]],
      headers: ['N.°', 'Comité', 'Comisión', 'Integrante', 'Cargo', 'Condición', 'Nivel', 'Estado', 'Documento', 'Vigencia'],
      widths: [6, 34, 34, 30, 14, 12, 14, 10, 26, 24],
      rows: visible.flatMap((item, index) => item.members.map((member) => [pad(index + 1), item.committee, item.commission, member.name, member.position, member.condition, member.level,
        item.status, `${item.docType} ${item.docNumber}`, `${dmy(item.validFrom)} – ${dmy(item.validTo)}`])),
    }).then(() => toast('Organización exportada a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Network}
        title="2. Organización institucional"
        description="Comités · Comisiones · Integrantes | Gestión de la estructura organizativa de la institución educativa."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}><FileSpreadsheet className="text-[#3f7d5c]" /> Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setForm(null)}><Plus /> Registrar organización</Button>}
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Network} value={new Set(visible.map((item) => item.committee)).size} label="Comités" />
        <StatCard icon={Layers} value={visible.length} label="Comisiones" />
        <StatCard icon={Users} value={memberCount} label="Integrantes" />
      </div>

      <Panel title={`Comisiones registradas (${visible.length})`} icon={Network}>
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterLabel label="Año escolar"><Select value={filters.year} onChange={(year) => setFilters({ ...filters, year, committee: '', commission: '' })} options={opts(yearOptions(), 'Todos los años')} /></FilterLabel>
          <FilterLabel label="Comité"><Select value={filters.committee} onChange={(committee) => setFilters({ ...filters, committee, commission: '' })} options={opts(committees, 'Todos')} /></FilterLabel>
          <FilterLabel label="Comisión"><Select value={filters.commission} onChange={(commission) => setFilters({ ...filters, commission })} options={opts(commissions, 'Todas')} /></FilterLabel>
          <FilterLabel label="Buscar" className="sm:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por comité, comisión o integrante…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            </span>
          </FilterLabel>
          <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => setFilters(emptyFilters)}><Eraser /> Limpiar</Button></div>
        </div>
        <OrgTable
          items={visible}
          empty={loading ? 'Cargando…' : 'No hay comisiones registradas con estos filtros.'}
          actions={(item) => (
            <RowActions label={item.commission}
              onFile={item.file ? () => files.view(fileUrl(item)) : undefined}
              onView={() => setViewing(item)}
              onEdit={canEdit ? () => setForm(item) : undefined}
              onDelete={canEdit ? () => setDeleting(item) : undefined} />
          )}
        />
      </Panel>

      {form !== undefined && <OrganizationForm item={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload() }} />}

      {viewing && (
        <Dialog open onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <FormHeader icon={Network} title={viewing.commission} text={viewing.committee} />
            <Details rows={[
              ['Estado', <Pill key="s" value={viewing.status} />],
              ['Finalidad / Objetivo', viewing.objective],
              ['Año escolar', String(viewing.year)],
              ['Nivel de aplicación', viewing.scope],
              ['Documento de conformación', `${viewing.docType} ${viewing.docNumber} (${dmy(viewing.docDate)})`],
              ['Vigencia', `${dmy(viewing.validFrom)} – ${dmy(viewing.validTo)}`],
              ['PDF', viewing.file ? viewing.file.name : 'Sin documento adjunto'],
            ]} />
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs dark:bg-muted/40"><tr>{['N.°', 'Integrante', 'Cargo', 'Condición', 'Nivel'].map((head) => <th key={head} className="px-3 py-2 text-left font-bold">{head}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {viewing.members.map((member, index) => (
                    <tr key={index}><td className="px-3 py-1.5">{index + 1}</td><td className="px-3 py-1.5">{member.name}</td><td className="px-3 py-1.5">{member.position}</td><td className="px-3 py-1.5">{member.condition}</td><td className="px-3 py-1.5">{member.level}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {viewing.file && <Button type="button" variant="outline" onClick={() => files.view(fileUrl(viewing))}><Paperclip /> Ver PDF</Button>}
              {canEdit && <Button type="button" onClick={() => { setForm(viewing); setViewing(null) }}>Editar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDelete item={deleting} title="Eliminar comisión" text={`¿Seguro que deseas eliminar «${deleting?.commission}» y sus integrantes?`}
        path={`/api/docs/organizations/${deleting?.id}`} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload() }} />
    </div>
  )
}

/** «Registrar Comité, Comisión e Integrantes». */
function OrganizationForm({ item, onClose, onSaved }) {
  const { toast } = useApp()
  const files = useFileActions()
  const editing = Boolean(item)
  const year = currentYear()
  const [form, setForm] = useState(() => (item
    ? { committee: item.committee, commission: item.commission, objective: item.objective, status: item.status, year: String(item.year), scope: item.scope, members: item.members,
      docType: item.docType, docNumber: item.docNumber, docDate: item.docDate, validFrom: item.validFrom, validTo: item.validTo }
    : { committee: '', commission: '', objective: '', status: 'Activo', year: String(year), scope: ORG_SCOPES[0], members: [],
      docType: CONFORMATION_TYPES[0], docNumber: '', docDate: '', validFrom: `${year}-03-01`, validTo: `${year}-12-31` }))
  const [member, setMember] = useState(emptyMember)
  const [memberIndex, setMemberIndex] = useState(null)
  const [file, setFile] = useState(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const stored = editing && !removeFile ? item.file : null

  function addMember() {
    if (member.name.trim().length < 3) return toast('Escribe el nombre del integrante.', 'bad')
    if (!member.position || !member.condition || !member.level) return toast('Selecciona el cargo, la condición y el nivel del integrante.', 'bad')
    const entry = { ...member, name: member.name.trim() }
    if (form.members.some((other, index) => index !== memberIndex && other.name.toLowerCase() === entry.name.toLowerCase())) return toast('Esa persona ya es integrante de la comisión.', 'bad')
    set({ members: memberIndex === null ? [...form.members, entry] : form.members.map((other, index) => (index === memberIndex ? entry : other)) })
    setMember(emptyMember)
    setMemberIndex(null)
  }

  async function save(event) {
    event.preventDefault()
    if (!form.members.length) return toast('Agrega al menos un integrante a la comisión.', 'bad')
    setSaving(true)
    const result = await sendWithFile(editing ? `/api/docs/organizations/${item.id}` : '/api/docs/organizations', editing ? 'PATCH' : 'POST', { ...form, removeFile: removeFile && !file }, file)
    setSaving(false)
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Comisión actualizada.' : 'Comité, comisión e integrantes registrados.')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className={FORM_DIALOG}>
        <FormHeader icon={Users} title={editing ? 'Editar comité, comisión e integrantes' : 'Registrar Comité, Comisión e Integrantes'} text="Complete la información del comité, la comisión, sus integrantes y el documento de conformación." />
        <StaffNames id="org-staff" />
        <datalist id="org-committees">{COMMITTEES.map((value) => <option key={value} value={value} />)}</datalist>
        <datalist id="org-commissions">{subcommissionsOf(form.committee).map((value) => <option key={value} value={value} />)}</datalist>
        <form id="organization-form" className="grid gap-4" onSubmit={save}>
          <Section number={1} icon={ClipboardList} title="Información de la organización" className="sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Comité de gestión" required className="sm:col-span-2"><Input list="org-committees" value={form.committee} onChange={(event) => set({ committee: event.target.value })} maxLength={160} placeholder="Selecciona o escribe el comité" required /></Field>
            <Field label="Comisión de trabajo" required className="sm:col-span-2"><Input list="org-commissions" value={form.commission} onChange={(event) => set({ commission: event.target.value })} maxLength={200} placeholder="Selecciona o escribe la comisión" required /></Field>
            <Field label="Finalidad / Objetivo" required className="sm:col-span-2 lg:col-span-4"><CountedText rows={2} max={300} value={form.objective} onChange={(objective) => set({ objective })} placeholder="Finalidad de la comisión durante el año escolar…" required /></Field>
            <Field label="Estado" required><Select value={form.status} onChange={(status) => set({ status })} options={opts(ORG_STATUS)} /></Field>
            <Field label="Año escolar" required><Select value={form.year} onChange={(value) => set({ year: value })} options={opts(yearOptions())} /></Field>
            <Field label="Nivel de aplicación (alcance)" required className="sm:col-span-2"><Select value={form.scope} onChange={(scope) => set({ scope })} options={opts(ORG_SCOPES)} /></Field>
          </Section>

          <Section number={2} icon={Users} title="Integrantes de la comisión">
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto]">
              <Field label="Docente / Trabajador" required className="sm:col-span-2 lg:col-span-1"><Input list="org-staff" value={member.name} onChange={(event) => setMember({ ...member, name: event.target.value })} maxLength={160} placeholder="Buscar por nombre…"
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addMember() } }} /></Field>
              <Field label="Cargo" required><Select value={member.position} onChange={(position) => setMember({ ...member, position })} options={opts(MEMBER_POSITIONS, 'Seleccionar…')} /></Field>
              <Field label="Condición" required><Select value={member.condition} onChange={(condition) => setMember({ ...member, condition })} options={opts(MEMBER_CONDITIONS, 'Seleccionar…')} /></Field>
              <Field label="Nivel" required><Select value={member.level} onChange={(level) => setMember({ ...member, level })} options={opts(MEMBER_LEVELS, 'Seleccionar…')} /></Field>
              <div className="flex gap-1">
                <Button type="button" className="flex-1" onClick={addMember}>{memberIndex === null ? <><Plus /> Agregar</> : <><Save /> Actualizar</>}</Button>
                {memberIndex !== null && <Button type="button" variant="ghost" size="icon" onClick={() => { setMember(emptyMember); setMemberIndex(null) }} aria-label="Cancelar edición del integrante"><X /></Button>}
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-[#0b1730] text-xs text-white">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center font-semibold">N.°</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Integrante (Docente / Trabajador)</th>
                    <th className="w-32 px-3 py-2.5 text-left font-semibold">Cargo</th>
                    <th className="w-28 px-3 py-2.5 text-left font-semibold">Condición</th>
                    <th className="w-36 px-3 py-2.5 text-left font-semibold">Nivel</th>
                    <th className="w-24 px-3 py-2.5 text-center font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {form.members.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-xs text-muted-foreground">Aún no hay integrantes. Agrégalos con los campos de arriba.</td></tr>}
                  {form.members.map((entry, index) => (
                    <tr key={`${entry.name}-${index}`} className={memberIndex === index ? 'bg-primary/5' : undefined}>
                      <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{entry.name}</td>
                      <td className="px-3 py-2">{entry.position}</td>
                      <td className="px-3 py-2">{entry.condition}</td>
                      <td className="px-3 py-2"><Tag>{entry.level}</Tag></td>
                      <td className="px-3 py-2">
                        <span className="flex justify-center gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setMember(entry); setMemberIndex(index) }} aria-label={`Editar a ${entry.name}`}><Pencil /></Button>
                          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" aria-label={`Quitar a ${entry.name}`}
                            onClick={() => { set({ members: form.members.filter((_, other) => other !== index) }); if (memberIndex === index) { setMember(emptyMember); setMemberIndex(null) } }}><Trash2 /></Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section number={3} icon={Paperclip} title="Documento de conformación" className="md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <Field label="Tipo de documento" required>
              <span className="grid gap-2 pt-1 font-normal">
                {CONFORMATION_TYPES.map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="docType" className="accent-[var(--primary)]" checked={form.docType === value} onChange={() => set({ docType: value })} /> {value}</label>
                ))}
              </span>
            </Field>
            <div className="grid content-start gap-4">
              <Field label="N.° de documento" required><Input value={form.docNumber} onChange={(event) => set({ docNumber: event.target.value })} maxLength={80} placeholder="R.D. N.° 045-2026-IE.LA" required /></Field>
              <Field label="Fecha de emisión" required><Input type="date" value={form.docDate} onChange={(event) => set({ docDate: event.target.value })} required /></Field>
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <PdfDrop file={file} current={stored} onFile={setFile} onView={() => files.view(fileUrl(item))} onRemove={() => { if (file) setFile(null); else setRemoveFile(true) }} />
            </div>
          </Section>

          <Section number={4} icon={CalendarRange} title="Vigencia" className="sm:grid-cols-3">
            <Field label="Inicio de vigencia" required><Input type="date" value={form.validFrom} onChange={(event) => set({ validFrom: event.target.value })} required /></Field>
            <Field label="Fin de vigencia" required><Input type="date" value={form.validTo} min={form.validFrom} onChange={(event) => set({ validTo: event.target.value })} required /></Field>
            <Field label="Periodo"><Input value={form.validFrom && form.validTo ? `${dmy(form.validFrom)} – ${dmy(form.validTo)}` : '—'} readOnly disabled /></Field>
          </Section>
        </form>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <FormNote>Los campos con (<span className="text-destructive">*</span>) son obligatorios.</FormNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}><X /> Cancelar</Button>
            <Button type="submit" form="organization-form" disabled={saving}><Save /> {saving ? 'Guardando…' : 'Guardar registro'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
