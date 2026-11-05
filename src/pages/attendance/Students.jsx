import { useEffect, useState } from 'react'
import {
  Download,
  Eye,
  Filter,
  GraduationCap,
  Info,
  LayoutGrid,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { api, upload } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { PageHeader, StatCard } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  DateChip,
  FilterLabel,
  GRADES,
  LEVELS,
  Pager,
  STATUS_META,
  Select,
  StatusChip,
  StudentPhoto,
  LevelChip,
  ampm,
  gradeOptions,
  levelOptions,
  sectionOptions,
  tableHead,
  td,
  th,
  usePaged,
  useStudents,
} from './shared'

const EMPTY = { dni: '', lastNames: '', firstNames: '', level: 'Primaria', grade: '1°', section: 'A', guardian: '', guardianDni: '', phone: '' }
const TEMPLATE_HEADERS = ['DNI', 'Apellidos', 'Nombres', 'Nivel', 'Grado', 'Sección', 'Apoderado', 'DNI apoderado', 'Teléfono']

function normalizeGrade(value) {
  const digit = String(value ?? '').match(/[1-6]/)?.[0]
  return digit ? `${digit}°` : ''
}

function normalizeLevel(value) {
  const text = String(value ?? '').toLowerCase()
  if (text.startsWith('p')) return 'Primaria'
  if (text.startsWith('s')) return 'Secundaria'
  return ''
}

function cellText(cell) {
  const value = cell?.value
  if (value == null) return ''
  if (typeof value === 'object') return String(value.text ?? value.result ?? value.richText?.map((part) => part.text).join('') ?? '')
  return String(value)
}

async function downloadTemplate() {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Estudiantes')
  sheet.columns = TEMPLATE_HEADERS.map((header) => ({ header, width: header === 'Apellidos' || header === 'Nombres' || header === 'Apoderado' ? 26 : 14 }))
  sheet.addRow(['71234567', 'Huamán Rojas', 'Daniel', 'Secundaria', '5', 'A', 'Rosa Rojas', '41234567', '987654321'])
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-estudiantes.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}

export default function StudentsPage() {
  const { toast } = useApp()
  const canEdit = useCan('asistencia')
  const [draft, setDraft] = useState({ q: '', level: '', grade: '', section: '' })
  const [filters, setFilters] = useState(draft)
  const { students, stats, loading, reload } = useStudents(filters)
  const { rows, pager } = usePaged(students, 10)
  const [selected, setSelected] = useState([])
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === draft.q ? current : { ...current, q: draft.q })), 350)
    return () => clearTimeout(timer)
  }, [draft.q])

  async function confirmDelete() {
    const targets = deleting === 'bulk' ? selected : [deleting.id]
    for (const id of targets) await api(`/api/students/${id}`, { method: 'DELETE' })
    toast(targets.length > 1 ? `${targets.length} estudiantes dados de baja.` : 'Estudiante dado de baja. Su historial se conserva.')
    setDeleting(null)
    setSelected([])
    reload()
  }

  const allOnPage = rows.length > 0 && rows.every((row) => selected.includes(row.id))

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Estudiantes"
        description="Registro y gestión de los estudiantes de la institución."
        actions={
          <>
            <DateChip prefix="Hoy: " />
            {canEdit && <Button type="button" variant="outline" onClick={() => setImportOpen(true)}><Upload /> Importar (Excel)</Button>}
            {canEdit && <Button type="button" onClick={() => setEditing(EMPTY)}><UserPlus /> Registrar estudiante</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Users} value={stats.total} label="Total de estudiantes" />
        <StatCard tone="green" icon={GraduationCap} value={stats.Primaria} label="Primaria" onClick={() => { setDraft({ ...draft, level: 'Primaria' }); setFilters({ ...filters, level: 'Primaria' }) }} />
        <StatCard tone="violet" icon={GraduationCap} value={stats.Secundaria} label="Secundaria" onClick={() => { setDraft({ ...draft, level: 'Secundaria' }); setFilters({ ...filters, level: 'Secundaria' }) }} />
        <StatCard tone="amber" icon={LayoutGrid} value={stats.sections} label="Secciones" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-[15px] font-bold text-foreground"><Search className="size-[18px] text-primary" /> Buscar y filtrar estudiantes</p>
        <form
          className="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
          onSubmit={(event) => { event.preventDefault(); setFilters(draft) }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Buscar por DNI, código, nombre o apellidos…" className="pl-9" />
          </div>
          <FilterLabel label="Nivel"><Select value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={levelOptions('Todos')} /></FilterLabel>
          <FilterLabel label="Grado"><Select value={draft.grade} onChange={(grade) => setDraft({ ...draft, grade })} options={gradeOptions('Todos')} /></FilterLabel>
          <FilterLabel label="Sección"><Select value={draft.section} onChange={(section) => setDraft({ ...draft, section })} options={sectionOptions('Todas')} /></FilterLabel>
          <Button type="submit"><Filter /> Filtrar</Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {canEdit && selected.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-slate-50 px-4 py-2 text-sm dark:bg-blue-500/10">
            <span className="font-semibold text-foreground">{selected.length} seleccionado(s)</span>
            <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setDeleting('bulk')}><Trash2 /> Dar de baja</Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="w-10 px-4"><input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? selected.filter((id) => !rows.some((row) => row.id === id)) : [...new Set([...selected, ...rows.map((row) => row.id)])])} aria-label="Seleccionar página" /></th>
                <th className={th}>Foto</th>
                <th className={th}>Código</th>
                <th className={th}>Apellidos y nombres</th>
                <th className={th}>Nivel</th>
                <th className={th}>Grado</th>
                <th className={th}>Sección</th>
                <th className={cn(th, 'bg-[#1e3a8a] text-center text-white')}>Asistencia de hoy</th>
                <th className={th}>Hora</th>
                <th className={cn(th, 'text-center')}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => (
                <tr key={student.id} className="border-t border-border/70 hover:bg-muted/30">
                  <td className="px-4"><input type="checkbox" checked={selected.includes(student.id)} onChange={() => setSelected(selected.includes(student.id) ? selected.filter((id) => id !== student.id) : [...selected, student.id])} aria-label={`Seleccionar ${student.fullName}`} /></td>
                  <td className={td}><StudentPhoto student={student} size="size-10" /></td>
                  <td className={cn(td, 'font-semibold text-primary')}>{student.code}</td>
                  <td className={cn(td, 'font-medium')}>{student.fullName}</td>
                  <td className={td}><LevelChip level={student.level} /></td>
                  <td className={td}>{student.grade}</td>
                  <td className={td}>{student.section}</td>
                  <td className={cn(td, 'text-center')}>{student.today ? <StatusChip status={student.today.status} justified={student.today.justified} /> : <span className="text-xs text-muted-foreground">Sin registro</span>}</td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{student.today?.time ? ampm(student.today.time) : '—'}</td>
                  <td className={td}>
                    <div className="flex justify-center gap-1.5">
                      <IconButton label="Ver" onClick={() => setViewing(student)} className="text-primary border-border hover:bg-muted"><Eye /></IconButton>
                      {canEdit && <IconButton label="Editar" onClick={() => setEditing(student)} className="text-primary border-border hover:bg-muted"><Pencil /></IconButton>}
                      {canEdit && <IconButton label="Dar de baja" onClick={() => setDeleting(student)} className="text-[#b4413c] border-border hover:bg-muted"><Trash2 /></IconButton>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">{loading ? 'Cargando…' : 'No hay estudiantes con estos filtros. Registra uno o importa la lista desde Excel.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 pt-3 text-xs">
          <span className="font-semibold text-foreground">Leyenda de asistencia:</span>
          {Object.keys(STATUS_META).map((status) => <StatusChip key={status} status={status} />)}
        </div>
        <Pager {...pager} label="estudiantes" />
      </div>

      {editing && <StudentDialog student={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {viewing && <StudentView student={viewing} onClose={() => setViewing(null)} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onDone={reload} />}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dar de baja</DialogTitle>
            <DialogDescription>
              {deleting === 'bulk' ? `Se darán de baja ${selected.length} estudiante(s).` : `Se dará de baja a ${deleting?.fullName}.`} Su QR se desactiva y el historial de asistencia se conserva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>Dar de baja</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function IconButton({ label, onClick, className, children }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cn('flex size-8 items-center justify-center rounded-full border bg-card transition-colors [&_svg]:size-4 dark:hover:bg-muted', className)}>
      {children}
    </button>
  )
}

function StudentDialog({ student, onClose, onSaved }) {
  const { toast } = useApp()
  const [form, setForm] = useState({ ...EMPTY, ...student })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(student.photo || null)
  const [busy, setBusy] = useState(false)
  const isNew = !student.id
  const grades = form.level === 'Secundaria' ? GRADES.slice(0, 5) : GRADES

  useEffect(() => {
    if (!photo) return undefined
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    const result = isNew
      ? await api('/api/students', { method: 'POST', body: form })
      : await api(`/api/students/${student.id}`, { method: 'PATCH', body: form })
    if (!result.ok) {
      setBusy(false)
      return toast(result.error || 'No se pudo guardar el estudiante.', 'bad')
    }
    const id = result.id || student.id
    if (photo) {
      const sent = await upload(`/api/students/${id}/photo`, [photo])
      if (!sent.ok) toast(sent.error || 'Se guardó el estudiante, pero no la foto.', 'bad')
    }
    setBusy(false)
    toast(isNew ? `Estudiante ${result.code} registrado con su código QR.` : 'Datos del estudiante actualizados.')
    onSaved()
  }

  const field = (key) => ({ value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Registrar estudiante' : `Editar ${student.code}`}</DialogTitle>
          <DialogDescription>{isNew ? 'Se generará automáticamente su código y su QR de asistencia.' : 'Actualiza los datos de matrícula del estudiante.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div className="flex flex-col items-center gap-2">
            {preview ? <img src={preview} alt="" className="size-32 rounded-xl object-cover" /> : <StudentPhoto student={null} size="size-32" />}
            <label className="cursor-pointer text-xs font-semibold text-primary hover:underline">
              {preview ? 'Cambiar foto' : 'Agregar foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterLabel label="Apellidos *"><Input {...field('lastNames')} required /></FilterLabel>
            <FilterLabel label="Nombres *"><Input {...field('firstNames')} required /></FilterLabel>
            <FilterLabel label="DNI"><Input value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" maxLength={8} pattern="\d{8}" title="8 dígitos" /></FilterLabel>
            <FilterLabel label="Nivel *">
              <Select value={form.level} onChange={(level) => setForm({ ...form, level, grade: level === 'Secundaria' && form.grade === '6°' ? '5°' : form.grade })} options={LEVELS.map((value) => ({ value, label: value }))} />
            </FilterLabel>
            <FilterLabel label="Grado *"><Select value={form.grade} onChange={(grade) => setForm({ ...form, grade })} options={grades.map((value) => ({ value, label: `${value} Grado` }))} /></FilterLabel>
            <FilterLabel label="Sección *"><Input {...field('section')} maxLength={6} required className="uppercase" /></FilterLabel>
            <FilterLabel label="Apoderado (nombre)"><Input {...field('guardian')} /></FilterLabel>
            <FilterLabel label="DNI del apoderado"><Input value={form.guardianDni} onChange={(event) => setForm({ ...form, guardianDni: event.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" maxLength={8} pattern="\d{8}" title="8 dígitos" placeholder="Para el Portal de Padres" /></FilterLabel>
            <FilterLabel label="Teléfono del apoderado" className="sm:col-span-2"><Input {...field('phone')} inputMode="tel" /></FilterLabel>
            <p className="text-xs text-muted-foreground sm:col-span-2">Con el DNI del apoderado se habilita su acceso al Portal de Padres: ingresará solo con ese DNI para consultar la asistencia.</p>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StudentView({ student, onClose }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    let active = true
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    api(`/api/attendance/history?from=${from}&to=${to}&q=${encodeURIComponent(student.code)}`).then((result) => {
      if (active && result.ok) setHistory(result)
    })
    return () => { active = false }
  }, [student.code])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{student.fullName}</DialogTitle>
          <DialogDescription>{student.code} · {student.level} · {student.grade} Grado – Sección {student.section}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4">
          <StudentPhoto student={student} size="size-24" />
          <dl className="grid flex-1 grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">DNI</dt><dd>{student.dni || '—'}</dd>
            <dt className="text-muted-foreground">Apoderado</dt><dd>{student.guardian || '—'}</dd>
            <dt className="text-muted-foreground">DNI apoderado</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {student.guardianDni ? `${student.guardianDni} (acceso al Portal de Padres)` : 'Sin acceso al portal'}
            </dd>
            <dt className="text-muted-foreground">Teléfono</dt><dd>{student.phone || '—'}</dd>
            <dt className="text-muted-foreground">QR</dt><dd>{student.qrActive ? 'Activo' : 'Desactivado'}</dd>
            <dt className="text-muted-foreground">Hoy</dt><dd>{student.today ? <StatusChip status={student.today.status} /> : 'Sin registro'}</dd>
          </dl>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-foreground">Últimos 30 días</p>
          {history ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.entries(STATUS_META).map(([status, meta]) => (
                <div key={status} className={cn('rounded-lg border py-2', meta.chip)}>
                  <p className="text-xl font-black">{history.totals[status]}</p>
                  <p className="text-xs">{meta.label}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Cargando…</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onClose, onDone }) {
  const { toast } = useApp()
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function read(file) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]
      const header = []
      sheet.getRow(1).eachCell((cell, column) => { header[column] = cellText(cell).trim().toLowerCase() })
      const col = (name) => header.findIndex((value) => value && value.normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(name))
      const map = { dni: col('dni'), lastNames: col('apellido'), firstNames: col('nombre'), level: col('nivel'), grade: col('grado'), section: col('secc'), guardian: col('apoderado'), guardianDni: col('dni apod'), phone: col('telef') }
      // "DNI apoderado" also starts with "dni": make sure the student DNI column is the plain one.
      map.dni = header.findIndex((value) => value === 'dni')
      if (map.lastNames < 0 || map.firstNames < 0 || map.level < 0 || map.grade < 0 || map.section < 0) {
        toast('El archivo debe tener las columnas Apellidos, Nombres, Nivel, Grado y Sección. Descarga la plantilla.', 'bad')
        setRows([])
        return
      }
      const parsed = []
      sheet.eachRow((row, number) => {
        if (number === 1) return
        const get = (key) => (map[key] > 0 ? cellText(row.getCell(map[key])).trim() : '')
        if (!get('lastNames') && !get('firstNames')) return
        parsed.push({
          dni: get('dni').replace(/\D/g, ''),
          lastNames: get('lastNames'),
          firstNames: get('firstNames'),
          level: normalizeLevel(get('level')),
          grade: normalizeGrade(get('grade')),
          section: get('section').toUpperCase(),
          guardian: get('guardian'),
          guardianDni: get('guardianDni').replace(/\D/g, ''),
          phone: get('phone'),
        })
      })
      setRows(parsed)
    } catch (error) {
      console.error(error)
      toast('No se pudo leer el archivo. Usa un .xlsx con la plantilla.', 'bad')
    }
  }

  async function submit() {
    setBusy(true)
    const response = await api('/api/students/import', { method: 'POST', body: { students: rows } })
    setBusy(false)
    if (!response.ok) return toast(response.error || 'No se pudo importar.', 'bad')
    setResult(response)
    toast(`Importación lista: ${response.created} nuevos, ${response.updated} actualizados.`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar estudiantes desde Excel</DialogTitle>
          <DialogDescription>Columnas: DNI, Apellidos, Nombres, Nivel, Grado, Sección, Apoderado, Teléfono. Si el DNI ya existe, se actualizan sus datos.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={downloadTemplate}><Download /> Descargar plantilla</Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Upload className="size-4" /> Elegir archivo .xlsx
            <input type="file" accept=".xlsx" className="sr-only" onChange={(event) => read(event.target.files?.[0])} />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>
        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className={tableHead}><tr>{['DNI', 'Apellidos', 'Nombres', 'Nivel', 'Grado', 'Sección'].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 100).map((row, index) => (
                  <tr key={index} className="border-t border-border/70">
                    <td className="px-3 py-1.5">{row.dni || '—'}</td><td className="px-3 py-1.5">{row.lastNames}</td><td className="px-3 py-1.5">{row.firstNames}</td>
                    <td className={cn('px-3 py-1.5', !row.level && 'text-destructive')}>{row.level || 'inválido'}</td>
                    <td className={cn('px-3 py-1.5', !row.grade && 'text-destructive')}>{row.grade || 'inválido'}</td>
                    <td className="px-3 py-1.5">{row.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <p className="text-sm text-muted-foreground">{rows.length} fila(s) leídas{rows.length > 100 ? ' (se muestran las primeras 100)' : ''}.</p>}
        {result && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Info className="size-4 text-primary" /> {result.created} creados · {result.updated} actualizados · {result.skipped} con errores</p>
            {result.errors.length > 0 && <ul className="mt-2 max-h-32 list-disc overflow-auto pl-5 text-xs text-destructive">{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          <Button type="button" disabled={!rows.length || busy || Boolean(result)} onClick={submit}><Upload /> {busy ? 'Importando…' : `Importar ${rows.length || ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
