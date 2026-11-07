import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { SCHOOL } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { keyOf, markDuplicates, numberRows } from './importChecks'
import { ImportStatus } from './InventoryImport'

/** Template columns: [header, field in the API payload, column width, example]. */
const COLUMNS = [
  ['Nivel *', 'level', 14, 'Primaria'],
  ['Código patrimonial *', 'codMinedu', 20, '74648119-0473'],
  ['Denominación *', 'name', 32, 'SILLA DE MADERA'],
  ['Categoría *', 'category', 22, ''],
  ['Tipo *', 'type', 18, 'Silla'],
  ['Color', 'color', 14, 'Caoba'],
  ['Dimensiones (largo × ancho × alto)', 'dimensions', 24, '46 × 44 × 75 cm'],
  ['Cantidad *', 'quantity', 12, '1'],
  ['Unidad *', 'unit', 14, 'unidad'],
  ['Ambiente / Ubicación *', 'place', 26, ''],
  ['Estado físico *', 'state', 14, 'Bueno'],
  ['Estado operativo *', 'operationalState', 16, 'Operativo'],
  ['Fecha de registro *', 'registeredOn', 16, ''],
  ['Observaciones', 'notes', 34, 'Respaldar con barniz'],
]
const FIXED_LISTS = {
  level: ['Primaria', 'Secundaria', 'Ambos'],
  state: ['Bueno', 'Regular', 'Malo'],
  operationalState: ['Operativo', 'Con fallas', 'Inoperativo'],
}
const SAMPLE_CODE = '74648119-0473'
const SHEET = 'Mobiliario'
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

/** Builds the furniture Excel template with dropdowns fed by the current catalogs. */
export async function downloadMaterialsTemplate({ categories, places }) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `${SCHOOL.name} · CIST`

  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = COLUMNS.map(([header, , width]) => ({ header, width }))
  const header = sheet.getRow(1)
  header.height = 30
  header.eachCell((cell, column) => {
    const required = COLUMNS[column - 1][0].includes('*')
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FF0B1730' : 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  const exampleRow = sheet.addRow(COLUMNS.map(([, field, , sample]) => {
    if (field === 'category') return categories[0]?.name || ''
    if (field === 'place') return places[0]?.name || ''
    if (field === 'registeredOn') return new Date()
    return sample
  }))
  exampleRow.font = { italic: true, color: { argb: 'FF64748B' } }

  // Hidden sheet with the valid values for the dropdowns.
  const lists = workbook.addWorksheet('Listas', { state: 'veryHidden' })
  const listColumns = [
    ['category', categories.map((item) => item.name)],
    ['place', places.map((item) => item.name)],
    ...Object.entries(FIXED_LISTS),
  ]
  const ranges = {}
  listColumns.forEach(([field, values], index) => {
    const letter = columnLetter(index)
    lists.getCell(`${letter}1`).value = field
    values.forEach((value, row) => { lists.getCell(`${letter}${row + 2}`).value = value })
    ranges[field] = values.length ? `Listas!$${letter}$2:$${letter}$${values.length + 1}` : null
  })

  COLUMNS.forEach(([title, field], index) => {
    const letter = columnLetter(index)
    for (let row = FIRST_DATA_ROW; row <= 1000; row += 1) {
      const cell = sheet.getCell(`${letter}${row}`)
      if (ranges[field]) {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [ranges[field]], showErrorMessage: true, errorTitle: 'Valor no válido', error: `Elige un valor de la lista para «${title}».` }
      } else if (field === 'registeredOn') {
        cell.numFmt = 'dd/mm/yyyy'
        cell.dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2000, 0, 1)], showErrorMessage: true, error: 'Escribe una fecha válida (dd/mm/aaaa).' }
      } else if (field === 'quantity') {
        cell.dataValidation = { type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'La cantidad debe ser un número entero.' }
      } else {
        cell.numFmt = '@'
      }
    }
  })

  const help = workbook.addWorksheet('Instrucciones')
  help.columns = [{ width: 110 }]
  ;[
    `Formato de importación de bienes mobiliarios · ${SCHOOL.name}`,
    '',
    `1. Completa una fila por bien en la hoja «${SHEET}». La fila 2 es un ejemplo: reemplázala o bórrala.`,
    '2. Las columnas con * son obligatorias (la denominación, la categoría y la unidad son indispensables).',
    '3. Nivel, Categoría, Ambiente y Estados tienen una lista desplegable con los valores registrados en el sistema.',
    '   Si falta una categoría o ambiente, créalo antes en «Ambientes y categorías» y vuelve a descargar el formato.',
    '4. Si el código patrimonial ya existe en el inventario, ese bien se ACTUALIZA; si no, se crea uno nuevo.',
    '5. Fecha de registro en formato dd/mm/aaaa. Si se deja vacía, se usa la fecha de importación.',
    '6. Guarda el archivo como .xlsx y usa el botón «Importar Excel» en la vista Bienes mobiliarios.',
  ].forEach((text, index) => {
    const cell = help.getCell(`A${index + 1}`)
    cell.value = text
    if (index === 0) cell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } }
  })

  save(await workbook.xlsx.writeBuffer(), 'formato-importacion-mobiliario.xlsx')
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
  return text
}

const normalizeHeader = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export function ImportMaterialsDialog({ onClose, onDone }) {
  const { toast } = useApp()
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [existing, setExisting] = useState([])

  // Current furniture, to tell which rows create a new item and which update one.
  useEffect(() => {
    api('/api/materials').then((response) => { if (response.ok) setExisting(response.materials) })
  }, [])

  async function read(file) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.getWorksheet(SHEET) || workbook.worksheets[0]
      const position = {}
      sheet.getRow(1).eachCell((cell, column) => {
        const key = normalizeHeader(cellValue(cell))
        const match = COLUMNS.find(([title]) => normalizeHeader(title) === key)
        if (match) position[match[1]] = column
      })
      if (!position.name || !position.category) {
        toast('El archivo no tiene las columnas del formato (Denominación y Categoría). Descarga el formato e inténtalo de nuevo.', 'bad')
        setRows([])
        return
      }
      const parsed = []
      sheet.eachRow((row, number) => {
        if (number === 1) return
        const item = { row: number }
        for (const [, field] of COLUMNS) item[field] = position[field] ? cellValue(row.getCell(position[field])) : ''
        item.registeredOn = toISODate(item.registeredOn)
        const isExample = item.codMinedu === SAMPLE_CODE
        if (isExample || !Object.entries(item).some(([key, value]) => !['row', 'registeredOn'].includes(key) && value)) return
        parsed.push(item)
      })
      setRows(markDuplicates(numberRows(parsed), [['codMinedu', 'Código patrimonial']]))
      if (!parsed.length) toast('No se encontraron bienes en el archivo.', 'bad')
    } catch (error) {
      console.error(error)
      toast('No se pudo leer el archivo. Usa el formato .xlsx descargado desde el sistema.', 'bad')
    }
  }

  const checked = useMemo(() => {
    const byCode = new Map(existing.filter((item) => keyOf(item.codMinedu)).map((item) => [keyOf(item.codMinedu), item]))
    return rows.map((row) => {
      const missingFields = [!row.codMinedu && 'código patrimonial', !row.name && 'denominación', !row.category && 'categoría'].filter(Boolean)
      if (missingFields.length) return { ...row, status: 'incomplete', note: `Falta ${missingFields.join(', ')}` }
      if (row.duplicate) return { ...row, status: 'duplicate', note: row.duplicate }
      const match = byCode.get(keyOf(row.codMinedu))
      return match ? { ...row, status: 'update', note: `Actualiza «${match.name}»` } : { ...row, status: 'new', note: 'Nuevo' }
    })
  }, [rows, existing])
  const valid = checked.filter((row) => row.status === 'new' || row.status === 'update')
  const rejected = checked.length - valid.length

  async function submit() {
    setBusy(true)
    const response = await api('/api/materials/import', { method: 'POST', body: { items: valid.map(({ status, note, duplicate, ...row }) => row) } })
    setBusy(false)
    if (!response.ok) return toast(response.error || 'No se pudo importar el mobiliario.', 'bad')
    setResult(response)
    toast(`Importación lista: ${response.created} nuevos, ${response.updated} actualizados.`)
    onDone()
  }


  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Importar bienes mobiliarios desde Excel</DialogTitle>
          <DialogDescription>Usa el formato descargado. Si el código patrimonial ya existe, el bien se actualiza; si no, se registra como nuevo. No se permiten códigos repetidos en el archivo.</DialogDescription>
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
                  <tr>{['Fila', 'Resultado', 'Código patrimonial', 'Denominación', 'Categoría', 'Cantidad', 'Ambiente', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 text-left font-bold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {checked.slice(0, 200).map((row) => (
                    <tr key={row.row} className={cn('border-t border-border/70', !valid.includes(row) && 'bg-[#fbf1f0] dark:bg-red-500/10')}>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.row}</td>
                      <td className="px-3 py-1.5"><ImportStatus row={row} /></td>
                      <td className={cn('px-3 py-1.5', !row.codMinedu && 'font-semibold text-destructive')}>{row.codMinedu || 'Falta'}</td>
                      <td className={cn('px-3 py-1.5', !row.name && 'font-semibold text-destructive')}>{row.name || 'Falta'}</td>
                      <td className={cn('px-3 py-1.5', !row.category && 'font-semibold text-destructive')}>{row.category || 'Falta'}</td>
                      <td className="px-3 py-1.5">{row.quantity || '1'} {row.unit || 'unidad'}</td>
                      <td className="px-3 py-1.5">{row.place || '—'}</td>
                      <td className="px-3 py-1.5">{row.state || 'Bueno'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              {rows.length} bien(es) leídos{rows.length > 200 ? ' (se muestran los primeros 200)' : ''}: {valid.filter((row) => row.status === 'new').length} nuevos, {valid.filter((row) => row.status === 'update').length} actualizan uno existente.
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
          <Button type="button" disabled={!valid.length || busy || Boolean(result)} onClick={submit}><Upload /> {busy ? 'Importando…' : `Importar ${valid.length || ''} bien(es)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
