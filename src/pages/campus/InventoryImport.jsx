import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { SCHOOL } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { keyOf, markDuplicates, numberRows } from './importChecks'

/** Template columns: [header, field in the API payload, column width, example]. */
const COLUMNS = [
  ['Código interno', 'code', 14, ''],
  ['Nivel *', 'level', 14, 'Primaria'],
  ['COD MINEDU *', 'patrimonial', 18, '74644016-0001'],
  ['Denominación *', 'name', 32, 'COMPUTADORA PERSONAL PORTATIL'],
  ['Categoría *', 'category', 22, ''],
  ['Tipo *', 'type', 20, 'Portátil'],
  ['Marca *', 'brand', 16, 'Lenovo'],
  ['Modelo *', 'model', 16, 'B50-70'],
  ['N.° de serie', 'serial', 18, 'PF4J15GL'],
  ['Dirección MAC', 'mac', 20, '82YU00X6LM'],
  ['Procesador', 'processor', 18, 'AMD Ryzen 5'],
  ['Memoria RAM', 'ram', 14, '8 GB'],
  ['Almacenamiento', 'storage', 16, '250 GB'],
  ['Sistema operativo', 'os', 18, 'Windows 11'],
  ['Color', 'color', 14, 'Gris plata'],
  ['Dimensiones (largo × ancho × alto)', 'dimensions', 22, '26.5 × 38 × 3.5 cm'],
  ['Ambiente / Ubicación *', 'place', 26, ''],
  ['Ubicación específica', 'placeDetail', 22, 'Mesa del docente'],
  ['Responsable (correo o DNI) *', 'responsible', 28, ''],
  ['Cargo / Rol *', 'responsibleRole', 28, 'Coordinador de Innovación y Soporte (CIST)'],
  ['Tipo de asignación *', 'assignmentType', 20, 'Uso institucional'],
  ['Condición de uso', 'useCondition', 16, 'Permanente'],
  ['Estado físico *', 'physicalState', 14, 'Bueno'],
  ['Estado operativo *', 'operationalState', 16, 'Operativo'],
  ['Fecha de registro *', 'registeredOn', 16, ''],
  ['Fecha de adquisición', 'acquisitionDate', 16, ''],
  ['Origen de adquisición *', 'acquisitionOrigin', 18, 'Compra'],
  ['N.° de documento', 'documentNumber', 18, 'F001-000123'],
  ['Vida útil (años)', 'usefulLife', 12, '5'],
  ['Inicio de garantía', 'warrantyStart', 16, ''],
  ['Fin de garantía', 'warrantyEnd', 16, ''],
  ['Estado en inventario *', 'inventoryStatus', 18, 'Activo'],
  ['Condición patrimonial', 'patrimonialCondition', 18, 'Asignado'],
  ['Observaciones', 'notes', 34, 'Incluye cargador y mouse'],
]
const PHYSICAL = ['Bueno', 'Regular', 'Malo']
const OPERATIONAL = ['Operativo', 'Con fallas', 'Inoperativo']
const FIXED_LISTS = {
  level: ['Primaria', 'Secundaria', 'Ambos'],
  assignmentType: ['Uso institucional', 'Uso pedagógico', 'Uso administrativo', 'Préstamo'],
  useCondition: ['Permanente', 'Temporal'],
  acquisitionOrigin: ['Compra', 'Donación', 'MINEDU', 'Transferencia', 'Otro'],
  inventoryStatus: ['Activo', 'En mantenimiento', 'En préstamo', 'Dado de baja'],
  patrimonialCondition: ['Asignado', 'Disponible', 'En préstamo', 'En custodia'],
}
const DATE_FIELDS = ['registeredOn', 'acquisitionDate', 'warrantyStart', 'warrantyEnd']
const FIRST_DATA_ROW = 2

const columnLetter = (index) => {
  let n = index + 1
  let text = ''
  while (n > 0) {
    const rest = (n - 1) % 26
    text = String.fromCharCode(65 + rest) + text
    n = Math.floor((n - 1) / 26)
  }
  return text
}

function save(buffer, name) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Builds the Excel template with dropdowns fed by the current catalogs. */
export async function downloadInventoryTemplate({ categories, places, users }) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `${SCHOOL.name} · CIST`

  const sheet = workbook.addWorksheet('Equipos', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = COLUMNS.map(([header, , width]) => ({ header, width }))
  const header = sheet.getRow(1)
  header.height = 30
  header.eachCell((cell, column) => {
    const required = COLUMNS[column - 1][0].includes('*')
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FF0B1730' : 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  const example = COLUMNS.map(([, field, , sample]) => {
    if (field === 'category') return categories[0]?.name || ''
    if (field === 'place') return places[0]?.name || ''
    if (field === 'registeredOn') return new Date()
    return sample
  })
  const exampleRow = sheet.addRow(example)
  exampleRow.font = { italic: true, color: { argb: 'FF64748B' } }

  // Hidden sheet with the valid values for the dropdowns.
  const lists = workbook.addWorksheet('Listas', { state: 'veryHidden' })
  const listColumns = [
    ['Categorías', categories.map((item) => item.name)],
    ['Ambientes', places.map((item) => item.name)],
    ['Responsables', users.filter((item) => item.active).map((item) => item.email)],
    ['Estado físico', PHYSICAL],
    ['Estado operativo', OPERATIONAL],
    ...Object.entries(FIXED_LISTS),
  ]
  const ranges = {}
  listColumns.forEach(([title, values], index) => {
    const letter = columnLetter(index)
    lists.getCell(`${letter}1`).value = title
    values.forEach((value, row) => { lists.getCell(`${letter}${row + 2}`).value = value })
    ranges[title] = values.length ? `Listas!$${letter}$2:$${letter}$${values.length + 1}` : null
  })

  const validations = {
    category: ranges['Categorías'],
    place: ranges['Ambientes'],
    responsible: ranges.Responsables,
    physicalState: ranges['Estado físico'],
    operationalState: ranges['Estado operativo'],
    ...Object.fromEntries(Object.keys(FIXED_LISTS).map((field) => [field, ranges[field]])),
  }
  COLUMNS.forEach(([title, field], index) => {
    const letter = columnLetter(index)
    for (let row = FIRST_DATA_ROW; row <= 1000; row += 1) {
      const cell = sheet.getCell(`${letter}${row}`)
      if (validations[field]) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [validations[field]],
          showErrorMessage: true,
          errorTitle: 'Valor no válido',
          error: `Elige un valor de la lista para «${title}».`,
        }
      } else if (DATE_FIELDS.includes(field)) {
        cell.numFmt = 'dd/mm/yyyy'
        cell.dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2000, 0, 1)], showErrorMessage: true, error: 'Escribe una fecha válida (dd/mm/aaaa).' }
      } else {
        cell.numFmt = '@'
      }
    }
  })

  const help = workbook.addWorksheet('Instrucciones')
  help.columns = [{ width: 110 }]
  ;[
    `Formato de importación de inventario · ${SCHOOL.name}`,
    '',
    '1. Completa una fila por equipo en la hoja «Equipos». La fila 2 es un ejemplo: reemplázala o bórrala.',
    '2. Las columnas con * son obligatorias. Para computadoras (portátil, escritorio, all-in-one, tablet) completa también procesador, RAM, almacenamiento y sistema operativo.',
    '3. Categoría, Ambiente, Responsable y Estados tienen una lista desplegable con los valores registrados en el sistema.',
    '   Si falta una categoría o ambiente, créalo antes en «Categorías y ambientes» y vuelve a descargar el formato.',
    '4. Si el COD MINEDU o el N.° de serie ya existe en el inventario, ese equipo se ACTUALIZA; si no, se crea uno nuevo.',
    '5. El código interno (EQ-001…) se asigna automáticamente.',
    '6. Fecha de registro en formato dd/mm/aaaa. Si se deja vacía, se usa la fecha de importación.',
    '7. Guarda el archivo como .xlsx y usa el botón «Importar Excel» en la vista Inventario.',
  ].forEach((text, index) => {
    const cell = help.getCell(`A${index + 1}`)
    cell.value = text
    if (index === 0) cell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } }
  })

  save(await workbook.xlsx.writeBuffer(), 'formato-importacion-inventario.xlsx')
}

function cellValue(cell) {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (value.result instanceof Date) return value.result
    return String(value.text ?? value.result ?? value.richText?.map((part) => part.text).join('') ?? '').trim()
  }
  return String(value).trim()
}

function toISODate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    // Excel dates come as UTC midnight.
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
  }
  const text = String(value).trim()
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return text
}

const normalizeHeader = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export function ImportInventoryDialog({ onClose, onDone }) {
  const { toast } = useApp()
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [existing, setExisting] = useState([])

  // Current inventory, to tell which rows create a new item and which update one.
  useEffect(() => {
    api('/api/equipment').then((response) => { if (response.ok) setExisting(response.equipment) })
  }, [])

  async function read(file) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.getWorksheet('Equipos') || workbook.worksheets[0]
      const position = {}
      sheet.getRow(1).eachCell((cell, column) => {
        const key = normalizeHeader(cellValue(cell))
        const match = COLUMNS.find(([title]) => normalizeHeader(title) === key)
        if (match) position[match[1]] = column
      })
      if (!position.name || !position.brand) {
        toast('El archivo no tiene las columnas del formato (Denominación y Marca). Descarga el formato e inténtalo de nuevo.', 'bad')
        setRows([])
        return
      }
      const parsed = []
      sheet.eachRow((row, number) => {
        if (number === 1) return
        const item = { row: number }
        for (const [, field] of COLUMNS) item[field] = position[field] ? cellValue(row.getCell(position[field])) : ''
        for (const field of DATE_FIELDS) item[field] = toISODate(item[field])
        const isExample = item.patrimonial === '74644016-0001' && item.serial === 'PF4J15GL'
        if (isExample || !Object.entries(item).some(([key, value]) => key !== 'row' && !DATE_FIELDS.includes(key) && value)) return
        parsed.push(item)
      })
      setRows(markDuplicates(numberRows(parsed), [['patrimonial', 'COD MINEDU'], ['serial', 'N.° de serie']]))
      if (!parsed.length) toast('No se encontraron equipos en el archivo.', 'bad')
    } catch (error) {
      console.error(error)
      toast('No se pudo leer el archivo. Usa el formato .xlsx descargado desde el sistema.', 'bad')
    }
  }

  const checked = useMemo(() => {
    const byPatrimonial = new Map(existing.filter((item) => keyOf(item.patrimonial)).map((item) => [keyOf(item.patrimonial), item]))
    const bySerial = new Map(existing.filter((item) => keyOf(item.serial)).map((item) => [keyOf(item.serial), item]))
    return rows.map((row) => {
      const missingFields = [!row.patrimonial && 'COD MINEDU', !row.name && 'denominación', !row.brand && 'marca'].filter(Boolean)
      if (missingFields.length) return { ...row, status: 'incomplete', note: `Falta ${missingFields.join(', ')}` }
      if (row.duplicate) return { ...row, status: 'duplicate', note: row.duplicate }
      const byCode = byPatrimonial.get(keyOf(row.patrimonial))
      const bySerialMatch = keyOf(row.serial) ? bySerial.get(keyOf(row.serial)) : null
      if (byCode && bySerialMatch && byCode.id !== bySerialMatch.id) {
        return { ...row, status: 'duplicate', note: `La serie ya pertenece a ${bySerialMatch.code} y el COD MINEDU a ${byCode.code}` }
      }
      const match = byCode || bySerialMatch
      return match ? { ...row, status: 'update', note: `Actualiza ${match.code}` } : { ...row, status: 'new', note: 'Nuevo' }
    })
  }, [rows, existing])
  const valid = checked.filter((row) => row.status === 'new' || row.status === 'update')
  const rejected = checked.length - valid.length

  async function submit() {
    setBusy(true)
    const response = await api('/api/equipment/import', { method: 'POST', body: { items: valid.map(({ status, note, duplicate, ...row }) => row) } })
    setBusy(false)
    if (!response.ok) return toast(response.error || 'No se pudo importar el inventario.', 'bad')
    setResult(response)
    toast(`Importación lista: ${response.created} nuevos, ${response.updated} actualizados.`)
    onDone()
  }


  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Importar inventario desde Excel</DialogTitle>
          <DialogDescription>Usa el formato descargado. Si el COD MINEDU o el N.° de serie ya existe, el equipo se actualiza; si no, se registra como nuevo. No se permiten códigos ni series repetidos en el archivo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Upload className="size-4" /> Elegir archivo .xlsx
            <input type="file" accept=".xlsx" className="sr-only" onChange={(event) => { read(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-foreground/75 dark:bg-muted">
                  <tr>{['Fila', 'Resultado', 'COD MINEDU', 'Denominación', 'Marca / Modelo', 'Serie', 'Categoría', 'Ambiente', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 text-left font-bold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {checked.slice(0, 200).map((row) => (
                    <tr key={row.row} className={cn('border-t border-border/70', !valid.includes(row) && 'bg-[#fbf1f0] dark:bg-red-500/10')}>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.row}</td>
                      <td className="px-3 py-1.5"><ImportStatus row={row} /></td>
                      <td className={cn('px-3 py-1.5', !row.patrimonial && 'font-semibold text-destructive')}>{row.patrimonial || 'Falta'}</td>
                      <td className={cn('px-3 py-1.5', !row.name && 'font-semibold text-destructive')}>{row.name || 'Falta'}</td>
                      <td className={cn('px-3 py-1.5', !row.brand && 'font-semibold text-destructive')}>{row.brand || 'Falta'} {row.model}</td>
                      <td className="px-3 py-1.5">{row.serial || '—'}</td>
                      <td className="px-3 py-1.5">{row.category || '—'}</td>
                      <td className="px-3 py-1.5">{row.place || '—'}</td>
                      <td className="px-3 py-1.5">{row.operationalState || 'Operativo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              {rows.length} equipo(s) leídos{rows.length > 200 ? ' (se muestran los primeros 200)' : ''}: {valid.filter((row) => row.status === 'new').length} nuevos, {valid.filter((row) => row.status === 'update').length} actualizan uno existente.
              {rejected > 0 && <span className="ml-1 font-semibold text-destructive">{rejected} fila(s) repetidas o incompletas no se importarán.</span>}
            </p>
          </>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-slate-50 p-3 text-sm dark:bg-muted">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-[#3f7d5c]" /> {result.created} creados · {result.updated} actualizados · {result.skipped} con errores</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-destructive">
                {result.errors.map((error) => <li key={error} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{error}</li>)}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          <Button type="button" disabled={!valid.length || busy || Boolean(result)} onClick={submit}><Upload /> {busy ? 'Importando…' : `Importar ${valid.length || ''} equipo(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STATUS_STYLE = {
  new: 'text-[#3f7d5c]',
  update: 'text-primary',
  duplicate: 'text-destructive',
  incomplete: 'text-destructive',
  same: 'text-muted-foreground',
}
const STATUS_LABEL = { new: 'Nuevo', update: 'Actualiza', duplicate: 'Repetido', incomplete: 'Incompleto', same: 'Sin cambios' }

/** Import preview cell: what will happen with the row. */
export function ImportStatus({ row }) {
  return (
    <span className={cn('whitespace-nowrap font-semibold', STATUS_STYLE[row.status])} title={row.note}>
      {STATUS_LABEL[row.status]}
      {row.status !== 'new' && <span className="block max-w-56 truncate text-[11px] font-normal">{row.note}</span>}
    </span>
  )
}
