import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  Eraser,
  Eye,
  FileSpreadsheet,
  FileText,
  Laptop,
  Layers,
  Monitor,
  Trash2,
  Wrench,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../../lib/api'
import { INCIDENT_STATUS, SCHOOL } from '../../lib/school'
import { STATUS, personName } from '../../lib/reservations'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, StatCard } from './kit'

const ALL = 'todos'

const KINDS = [
  { id: 'inventario', label: 'Inventario de bienes', description: 'Listado de bienes tecnológicos y mobiliarios.', icon: Laptop },
  { id: 'incidencias', label: 'Incidencias', description: 'Registro y estado de incidencias.', icon: AlertTriangle },
  { id: 'mantenimientos', label: 'Mantenimientos', description: 'Preventivos, correctivos y su estado.', icon: Wrench },
  { id: 'reservas', label: 'Reservas de ambientes', description: 'Uso de salas y ambientes tecnológicos.', icon: CalendarDays },
  { id: 'resumen', label: 'Resumen general', description: 'Consolidado de la gestión tecnológica.', icon: BarChart3 },
]
const KIND_BY_ID = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]))

const EMPTY_PARAMS = { assetType: ALL, state: ALL, mtype: ALL, place: ALL, category: ALL, room: ALL, from: '', to: '' }

const option = (value, label = value) => ({ value, label })
const withAll = (label, options) => [option(ALL, label), ...options]

function dmy(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : iso
}

function inRange(date, { from, to }) {
  const day = String(date || '').slice(0, 10)
  if (from && (!day || day < from)) return false
  if (to && (!day || day > to)) return false
  return true
}

const is = (value, filter) => filter === ALL || !filter || String(value) === String(filter)

/** Filter definitions per report type, built from the loaded catalog data. */
function filterFields(kind, catalog) {
  const places = withAll('Todos', catalog.places.map((item) => option(item.name)))
  const categories = withAll('Todas', catalog.categories.map((item) => option(item.name)))
  switch (kind) {
    case 'inventario':
      return [
        { key: 'assetType', label: 'Tipo de bien', options: withAll('Todos', [option('tecnologico', 'Tecnológicos'), option('mobiliario', 'Mobiliarios')]) },
        { key: 'state', label: 'Estado del bien', options: withAll('Todos', ['Operativo', 'Con fallas', 'Inoperativo', 'Bueno', 'Regular', 'Malo'].map((item) => option(item))) },
        { key: 'place', label: 'Ambiente', options: places },
        { key: 'category', label: 'Categoría', options: categories },
      ]
    case 'incidencias':
      return [
        { key: 'state', label: 'Estado', options: withAll('Todos', Object.entries(INCIDENT_STATUS).map(([value, label]) => option(value, label))) },
        { key: 'mtype', label: 'Prioridad', options: withAll('Todas', [option('alta', 'Alta'), option('media', 'Media'), option('baja', 'Baja')]) },
        { key: 'place', label: 'Ambiente', options: places },
      ]
    case 'mantenimientos':
      return [
        { key: 'mtype', label: 'Tipo', options: withAll('Todos', ['Preventivo', 'Correctivo'].map((item) => option(item))) },
        { key: 'state', label: 'Estado', options: withAll('Todos', ['Programado', 'En proceso', 'Realizado', 'Pendiente'].map((item) => option(item))) },
        { key: 'place', label: 'Ambiente', options: places },
        { key: 'category', label: 'Categoría', options: categories },
      ]
    case 'reservas':
      return [
        { key: 'room', label: 'Sala', options: withAll('Todas', catalog.rooms.map((item) => option(String(item.id), item.name))) },
        { key: 'state', label: 'Estado', options: withAll('Todos', Object.entries(STATUS).map(([value, label]) => option(value, label))) },
      ]
    default:
      return []
  }
}

function describeParams(kind, params, catalog) {
  const parts = filterFields(kind, catalog)
    .filter((field) => params[field.key] && params[field.key] !== ALL)
    .map((field) => field.options.find((item) => item.value === params[field.key])?.label || params[field.key])
  if (params.from || params.to) parts.push(`${params.from ? dmy(params.from) : '…'} – ${params.to ? dmy(params.to) : '…'}`)
  if (!parts.length) return kind === 'resumen' ? 'Todos los módulos' : 'Todos los registros'
  return parts.join(' | ')
}

/** Builds the report table (headers + rows) from the current data and the chosen filters. */
function buildReport(kind, params, data) {
  const meta = KIND_BY_ID[kind]
  if (kind === 'inventario') {
    const tech = params.assetType === 'mobiliario' ? [] : data.equipment
      .filter((row) => is(row.operationalState, params.state) && is(row.place, params.place) && is(row.category, params.category) && inRange(row.registeredOn, params))
      .map((row) => ['Tecnológico', row.code || '—', row.patrimonial || '—', row.name || '—', [row.brand, row.model].filter(Boolean).join(' ') || '—', row.category || '—', row.place || 'Sin asignar', row.operationalState || '—'])
    const furniture = params.assetType === 'tecnologico' ? [] : data.materials
      .filter((row) => is(row.state, params.state) && is(row.place, params.place) && is(row.category, params.category) && inRange(row.updatedAt, params))
      .map((row) => ['Mobiliario', `${row.quantity} ${row.unit}`, row.codMinedu || '—', row.name || '—', '—', row.category || '—', row.place || 'Sin asignar', row.state || '—'])
    return {
      title: meta.label,
      headers: ['Tipo', 'Código / Cant.', 'Cód. patrimonial', 'Denominación', 'Marca / Modelo', 'Categoría', 'Ambiente', 'Estado'],
      widths: [14, 16, 20, 32, 24, 22, 22, 16],
      rows: [...tech, ...furniture],
    }
  }
  if (kind === 'incidencias') {
    return {
      title: meta.label,
      headers: ['N.°', 'Fecha', 'Equipo / Bien', 'Ambiente', 'Descripción', 'Prioridad', 'Estado', 'Responsable'],
      widths: [14, 13, 30, 20, 40, 12, 14, 24],
      rows: data.incidents
        .filter((row) => is(row.status, params.state) && is(row.priority, params.mtype) && is(row.place, params.place) && inRange(row.reportedOn, params))
        .map((row) => [row.code, dmy(row.reportedOn), `${row.equipmentCode} · ${row.equipmentName}`, row.place || '—', row.title || row.description || '—', row.priority, INCIDENT_STATUS[row.status] || row.status, row.assignee || '—']),
    }
  }
  if (kind === 'mantenimientos') {
    return {
      title: meta.label,
      headers: ['N.°', 'Fecha', 'Equipo / Bien', 'Ambiente', 'Tipo', 'Actividades', 'Responsable', 'Estado'],
      widths: [14, 13, 30, 20, 14, 40, 22, 14],
      rows: data.maintenance
        .filter((row) => is(row.type, params.mtype) && is(row.status, params.state) && is(row.place, params.place) && is(row.category, params.category) && inRange(row.date, params))
        .map((row) => [row.code, dmy(row.date), `${row.equipmentCode} · ${row.equipmentName}`, row.place || '—', row.type, row.activities || '—', row.responsible || '—', row.status]),
    }
  }
  if (kind === 'reservas') {
    return {
      title: meta.label,
      headers: ['N.°', 'Fecha', 'Horario', 'Sala', 'Docente', 'Grado y sección', 'Propósito', 'Estado'],
      widths: [12, 13, 16, 18, 30, 16, 40, 14],
      rows: data.requests
        .filter((row) => is(row.roomId, params.room) && is(row.status, params.state) && inRange(row.date, params))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        .map((row) => [`SR-${String(row.id).padStart(3, '0')}`, dmy(row.date), `${row.startTime} – ${row.endTime}`, row.roomName || '—', personName(data.users, row.teacherId), `${row.grade} ${row.section}`, row.purpose, STATUS[row.status] || row.status]),
    }
  }
  // resumen
  const count = (rows, field, value) => rows.filter((row) => row[field] === value).length
  const equipment = data.equipment.filter((row) => inRange(row.registeredOn, params))
  const incidents = data.incidents.filter((row) => inRange(row.reportedOn, params))
  const maintenance = data.maintenance.filter((row) => inRange(row.date, params))
  const requests = data.requests.filter((row) => inRange(row.date, params))
  return {
    title: meta.label,
    headers: ['Módulo', 'Indicador', 'Total'],
    widths: [26, 40, 14],
    rows: [
      ['Inventario', 'Bienes tecnológicos registrados', equipment.length],
      ['Inventario', 'Equipos operativos', count(equipment, 'operationalState', 'Operativo')],
      ['Inventario', 'Equipos con fallas', count(equipment, 'operationalState', 'Con fallas')],
      ['Inventario', 'Equipos inoperativos', count(equipment, 'operationalState', 'Inoperativo')],
      ['Inventario', 'Bienes mobiliarios (registros)', data.materials.length],
      ['Incidencias', 'Incidencias registradas', incidents.length],
      ['Incidencias', 'Pendientes', incidents.filter((row) => row.status === 'pendiente' || row.status === 'registrada').length],
      ['Incidencias', 'En atención', count(incidents, 'status', 'en_proceso')],
      ['Incidencias', 'Resueltas', count(incidents, 'status', 'resuelta')],
      ['Mantenimientos', 'Mantenimientos registrados', maintenance.length],
      ['Mantenimientos', 'Preventivos', count(maintenance, 'type', 'Preventivo')],
      ['Mantenimientos', 'Correctivos', count(maintenance, 'type', 'Correctivo')],
      ['Mantenimientos', 'Realizados', count(maintenance, 'status', 'Realizado')],
      ['Reservas', 'Solicitudes de reserva', requests.length],
      ['Reservas', 'Aprobadas', count(requests, 'status', 'approved')],
      ['Reservas', 'Pendientes', count(requests, 'status', 'pending')],
    ],
  }
}

function fileName(report, code) {
  const slug = report.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
  return `${code ? `${code.toLowerCase()}-` : ''}${slug}-${new Date().toISOString().slice(0, 10)}`
}

function exportPdf(report, subtitle, code) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const date = new Intl.DateTimeFormat('es-PE').format(new Date())
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(82, 82, 82)
  doc.text(`${SCHOOL.name.toUpperCase()} · CIST`, margin, 14)
  doc.text(code ? `${code} · ${date}` : date, pageWidth - margin, 14, { align: 'right' })
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text(`Reporte: ${report.title}`, margin, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(82, 82, 82)
  doc.text(`Parámetros: ${subtitle}`, margin, 29)
  doc.text(`Total de registros: ${report.rows.length}`, margin, 34)
  autoTable(doc, {
    startY: 39,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [report.headers],
    body: report.rows.map((row) => row.map((cell) => String(cell ?? '—'))),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [31, 41, 55], overflow: 'linebreak' },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    rowPageBreak: 'avoid',
  })
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(`${SCHOOL.name} · CIST`, margin, pageHeight - 7)
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }
  doc.save(`${fileName(report, code)}.pdf`)
}

async function exportExcel(report, subtitle, code) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `${SCHOOL.name} · CIST`
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(report.title.slice(0, 31))
  const headerRow = 5
  const last = report.headers.length
  sheet.columns = report.widths.map((width) => ({ width }))
  ;[1, 2, 3].forEach((row) => sheet.mergeCells(row, 1, row, last))
  sheet.getCell(1, 1).value = `Reporte: ${report.title}${code ? ` (${code})` : ''}`
  sheet.getCell(2, 1).value = `Parámetros: ${subtitle}`
  sheet.getCell(3, 1).value = `${SCHOOL.name} · CIST | Generado el ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date())}`
  sheet.getRow(1).height = 30
  sheet.getCell(1, 1).font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
  sheet.getCell(2, 1).font = { size: 11, bold: true, color: { argb: 'FF0F172A' } }
  sheet.getCell(3, 1).font = { size: 9, italic: true, color: { argb: 'FF64748B' } }
  ;[1, 2, 3].forEach((row) => { sheet.getCell(row, 1).alignment = { vertical: 'middle', indent: 1 } })
  const header = sheet.getRow(headerRow)
  header.values = [undefined, ...report.headers]
  header.height = 22
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  report.rows.forEach((values, index) => {
    const row = sheet.addRow(values)
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF5F8FD' : 'FFFFFFFF' } }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    })
  })
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + Math.max(report.rows.length, 0), column: last } }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName(report, code)}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function splitDateTime(value) {
  const text = String(value || '')
  const [date, time = ''] = text.includes('T') ? text.split('T') : text.split(' ')
  return { date: dmy(date), time: time.slice(0, 5) }
}

export function ReportsPage() {
  const { toast, users, requests, rooms } = useApp()
  const canDelete = useCan()
  const [kind, setKind] = useState('inventario')
  const [params, setParams] = useState(EMPTY_PARAMS)
  const [data, setData] = useState({ equipment: [], materials: [], incidents: [], maintenance: [] })
  const [catalog, setCatalog] = useState({ places: [], categories: [] })
  const [history, setHistory] = useState({ total: 0, reports: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  async function loadHistory() {
    const result = await api('/api/reports')
    if (result.ok) setHistory({ total: result.total, reports: result.reports })
  }

  useEffect(() => {
    let active = true
    Promise.all([
      api('/api/equipment'),
      api('/api/materials'),
      api('/api/incidents'),
      api('/api/maintenance'),
      api('/api/places'),
      api('/api/categories'),
      api('/api/reports'),
    ]).then(([equipment, materials, incidents, maintenance, places, categories, reports]) => {
      if (!active) return
      const failed = [equipment, materials, incidents, maintenance].find((result) => !result.ok)
      if (failed) toast(failed.error || 'No se pudieron cargar todos los datos de reportes.', 'bad')
      setData({
        equipment: equipment.ok ? equipment.equipment : [],
        materials: materials.ok ? materials.materials : [],
        incidents: incidents.ok ? incidents.incidents : [],
        maintenance: maintenance.ok ? maintenance.maintenance : [],
      })
      setCatalog({ places: places.ok ? places.places : [], categories: categories.ok ? categories.categories : [] })
      if (reports.ok) setHistory({ total: reports.total, reports: reports.reports })
      setLoading(false)
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fullCatalog = useMemo(() => ({ ...catalog, rooms }), [catalog, rooms])
  const fullData = useMemo(() => ({ ...data, requests, users }), [data, requests, users])
  const fields = filterFields(kind, fullCatalog)

  function chooseKind(next) {
    setKind(next)
    setParams(EMPTY_PARAMS)
  }

  async function generate() {
    if (params.from && params.to && params.from > params.to) {
      toast('La fecha inicial no puede ser posterior a la fecha final.', 'bad')
      return
    }
    setBusy(true)
    const summary = describeParams(kind, params, fullCatalog)
    const result = await api('/api/reports', { method: 'POST', body: { kind, params, summary } })
    setBusy(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo registrar el reporte.', 'bad')
      return
    }
    await loadHistory()
    setPreview({ code: result.code, kind, params, summary })
  }

  async function download(entry, format) {
    const report = buildReport(entry.kind, entry.params, fullData)
    try {
      if (format === 'pdf') exportPdf(report, entry.summary, entry.code)
      else await exportExcel(report, entry.summary, entry.code)
      toast(`Reporte ${entry.code || ''} descargado en ${format === 'pdf' ? 'PDF' : 'Excel'}.`.replace('  ', ' '))
    } catch (error) {
      console.error(error)
      toast('No se pudo generar el archivo. Inténtalo nuevamente.', 'bad')
    }
  }

  async function removeEntry(entry) {
    const result = await api(`/api/reports/${entry.id}`, { method: 'DELETE' })
    if (!result.ok) return toast(result.error || 'No se pudo eliminar el registro.', 'bad')
    toast(`Registro ${entry.code} eliminado del historial.`)
    loadHistory()
  }

  const previewReport = preview ? buildReport(preview.kind, preview.params, fullData) : null
  const totalAssets = data.equipment.length + data.materials.length

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="Reportes"
        description="Consulta, genera y descarga reportes de la gestión de bienes, incidencias y mantenimientos."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Monitor} value={totalAssets} label="Bienes registrados" hint={`${data.equipment.length} tecnológicos · ${data.materials.length} mobiliarios`} onClick={() => chooseKind('inventario')} />
        <StatCard tone="red" icon={AlertTriangle} value={data.incidents.length} label="Incidencias" onClick={() => chooseKind('incidencias')} />
        <StatCard tone="amber" icon={Wrench} value={data.maintenance.length} label="Mantenimientos" onClick={() => chooseKind('mantenimientos')} />
        <StatCard tone="green" icon={CalendarCheck} value={history.total} label="Total de reportes" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,4fr)_minmax(0,9fr)]">
        <Panel title="Tipo de reporte" icon={Layers} contentClassName="p-2">
          <ul className="space-y-1">
            {KINDS.map((item) => {
              const Icon = item.icon
              const active = item.id === kind
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => chooseKind(item.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-slate-100 ring-1 ring-border dark:bg-blue-500/15 dark:ring-blue-500/30' : 'hover:bg-muted',
                    )}
                    aria-pressed={active}
                  >
                    <Icon className={cn('mt-0.5 size-5 shrink-0', active ? 'text-primary' : 'text-foreground/70')} />
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-semibold', active ? 'text-primary' : 'text-foreground')}>{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="Generar reporte" icon={FileText}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Reporte" className="xl:col-span-1">
              <Choice value={kind} onChange={chooseKind} options={KINDS.map((item) => option(item.id, item.label))} />
            </Field>
            {fields.map((field) => (
              <Field key={field.key} label={field.label}>
                <Choice value={params[field.key]} onChange={(value) => setParams({ ...params, [field.key]: value })} options={field.options} />
              </Field>
            ))}
            <Field label="Rango de fechas (registro o actualización)" className="sm:col-span-2 xl:col-span-2">
              <div className="flex items-center gap-2">
                <Input type="date" value={params.from} max={params.to || undefined} onChange={(event) => setParams({ ...params, from: event.target.value })} aria-label="Desde" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" value={params.to} min={params.from || undefined} onChange={(event) => setParams({ ...params, to: event.target.value })} aria-label="Hasta" />
              </div>
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Vista previa: <span className="font-semibold text-foreground">{loading ? '…' : buildReport(kind, params, fullData).rows.length}</span> registro(s) con los filtros actuales.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setParams(EMPTY_PARAMS)}>
                <Eraser /> Limpiar
              </Button>
              <Button type="button" onClick={generate} disabled={loading || busy}>
                <BarChart3 /> {busy ? 'Generando…' : 'Generar reporte'}
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Reportes generados recientemente" icon={FileText} contentClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-foreground/75 dark:bg-muted/40">
              <tr>
                <th className="px-5 py-2.5 text-left font-bold">N.°</th>
                <th className="px-3 py-2.5 text-left font-bold">Reporte</th>
                <th className="px-3 py-2.5 text-left font-bold">Parámetros</th>
                <th className="px-3 py-2.5 text-left font-bold">Fecha de generación</th>
                <th className="px-3 py-2.5 text-left font-bold">Usuario</th>
                <th className="px-5 py-2.5 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {history.reports.slice(0, 10).map((entry) => {
                const meta = KIND_BY_ID[entry.kind] || KINDS[0]
                const Icon = meta.icon
                const when = splitDateTime(entry.createdAt)
                return (
                  <tr key={entry.id} className="border-t border-border/70 hover:bg-muted/30">
                    <td className="px-5 py-2.5 font-semibold tabular-nums text-foreground">{entry.code}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 text-foreground"><Icon className="size-4 text-foreground/70" />{meta.label}</span>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2.5 text-foreground" title={entry.summary}>{entry.summary}</td>
                    <td className="px-3 py-2.5 tabular-nums text-foreground">{when.date} <span className="ml-2 text-muted-foreground">{when.time}</span></td>
                    <td className="px-3 py-2.5 text-foreground">{entry.user}</td>
                    <td className="px-5 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <button type="button" onClick={() => setPreview(entry)} className="flex h-7 items-center rounded-md border border-border bg-slate-50 px-2 text-primary hover:bg-muted dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300" aria-label={`Ver ${entry.code}`}>
                          <Eye className="size-4" />
                        </button>
                        <button type="button" onClick={() => download(entry, 'pdf')} className="flex h-7 items-center gap-1 rounded-md border border-border bg-[#fbf1f0] px-2 text-xs font-semibold text-[#9a2f2a] hover:bg-muted dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                          <FileText className="size-3.5" /> PDF
                        </button>
                        <button type="button" onClick={() => download(entry, 'xlsx')} className="flex h-7 items-center gap-1 rounded-md border border-border bg-[#f1f7f3] px-2 text-xs font-semibold text-[#2f6447] hover:bg-muted dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                          <FileSpreadsheet className="size-3.5" /> XLSX
                        </button>
                        {canDelete && <button type="button" onClick={() => removeEntry(entry)} className="flex h-7 items-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Eliminar ${entry.code} del historial`}>
                          <Trash2 className="size-4" />
                        </button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {history.reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Aún no se generaron reportes. Elige un tipo, ajusta los filtros y pulsa «Generar reporte».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={Boolean(preview)} onOpenChange={(next) => { if (!next) setPreview(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {preview && previewReport && (
            <>
              <DialogHeader>
                <DialogTitle>{preview.code} · {previewReport.title}</DialogTitle>
                <DialogDescription>Parámetros: {preview.summary} · {previewReport.rows.length} registro(s)</DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-foreground/75 dark:bg-muted/40">
                    <tr>{previewReport.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-bold">{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewReport.rows.slice(0, 200).map((row, index) => (
                      <tr key={index} className="border-t border-border/70">
                        {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-foreground">{cell}</td>)}
                      </tr>
                    ))}
                    {previewReport.rows.length === 0 && (
                      <tr><td colSpan={previewReport.headers.length} className="px-3 py-8 text-center text-muted-foreground">No hay registros con estos filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {previewReport.rows.length > 200 && (
                <p className="text-xs text-muted-foreground">Se muestran los primeros 200 registros. Descarga el archivo para verlos todos.</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => download(preview, 'xlsx')}><FileSpreadsheet /> Descargar XLSX</Button>
                <Button type="button" onClick={() => download(preview, 'pdf')}><FileText /> Descargar PDF</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
