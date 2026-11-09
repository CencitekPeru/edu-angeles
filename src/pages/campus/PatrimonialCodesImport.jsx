import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { SCHOOL } from '../../lib/school'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { markDuplicates } from './importChecks'
import { ImportStatus } from './InventoryImport'

const SHEET = 'Códigos patrimoniales'
const HEADERS = { code: 'CÓDIGO PATRIMONIAL', description: 'DESCRIPCIÓN' }
const CODE_PATTERN = /^[0-9-]{6,20}$/
const HEADER_SEARCH_ROWS = 15

const normalizeHeader = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const cleanCode = (value) => String(value ?? '').replace(/\s+/g, '').trim()
const cleanDescription = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

function cellText(cell) {
  const value = cell?.value
  if (value == null) return ''
  if (typeof value === 'object') return String(value.text ?? value.result ?? value.richText?.map((part) => part.text).join('') ?? '').trim()
  return String(value).trim()
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

/** Excel template with the two columns of the MINEDU catalog: CÓDIGO PATRIMONIAL | DESCRIPCIÓN. */
export async function downloadPatrimonialCodesTemplate() {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `${SCHOOL.name} · CIST`

  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [{ header: HEADERS.code, width: 22 }, { header: HEADERS.description, width: 90 }]
  const header = sheet.getRow(1)
  header.height = 22
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1730' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  for (let row = 2; row <= 3000; row += 1) {
    const code = sheet.getCell(`A${row}`)
    code.numFmt = '@'
    code.dataValidation = { type: 'textLength', operator: 'between', allowBlank: true, formulae: [6, 20], showErrorMessage: true, errorTitle: 'Código no válido', error: 'El código patrimonial debe tener entre 6 y 20 dígitos (solo números).' }
    const description = sheet.getCell(`B${row}`)
    description.numFmt = '@'
    description.dataValidation = { type: 'textLength', operator: 'between', allowBlank: true, formulae: [3, 255], showErrorMessage: true, errorTitle: 'Descripción no válida', error: 'La descripción debe tener entre 3 y 255 caracteres.' }
  }

  const help = workbook.addWorksheet('Instrucciones')
  help.columns = [{ width: 110 }]
  ;[
    `Formato de importación de códigos patrimoniales · ${SCHOOL.name}`,
    '',
    `1. Escribe un código por fila en la hoja «${SHEET}», a partir de la fila 2.`,
    '2. Columna A: código patrimonial (solo números, de 6 a 20 dígitos). Columna B: descripción del bien.',
    '3. Ambas columnas son obligatorias. Las descripciones se guardan en MAYÚSCULAS.',
    '4. Un código no puede repetirse en el archivo.',
    '5. Si el código ya existe en el catálogo, se ACTUALIZA su descripción; si no, se registra como nuevo.',
    '6. Guarda el archivo como .xlsx y usa «Importar Excel» en Inventario › Ambientes y categorías › Códigos patrimoniales.',
  ].forEach((text, index) => {
    const cell = help.getCell(`A${index + 1}`)
    cell.value = text
    if (index === 0) cell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } }
  })

  save(await workbook.xlsx.writeBuffer(), 'formato-codigos-patrimoniales.xlsx')
}

/**
 * Finds the header row (CÓDIGO PATRIMONIAL / DESCRIPCIÓN) in the first rows of the sheet.
 * If there is no header but column A already holds codes, reads A/B from row 1.
 */
function locateColumns(sheet) {
  for (let number = 1; number <= Math.min(HEADER_SEARCH_ROWS, sheet.rowCount); number += 1) {
    const position = {}
    sheet.getRow(number).eachCell((cell, column) => {
      const key = normalizeHeader(cellText(cell))
      if (!position.code && key.includes('codigo')) position.code = column
      else if (!position.description && (key.includes('descripcion') || key.includes('denominacion'))) position.description = column
    })
    if (position.code && position.description) return { ...position, firstRow: number + 1 }
  }
  if (CODE_PATTERN.test(cleanCode(cellText(sheet.getRow(1).getCell(1))))) return { code: 1, description: 2, firstRow: 1 }
  return null
}

export function ImportPatrimonialCodesDialog({ existing, onClose, onDone }) {
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
      const sheet = workbook.getWorksheet(SHEET) || workbook.worksheets.find((item) => item.state === 'visible') || workbook.worksheets[0]
      const columns = sheet && locateColumns(sheet)
      if (!columns) {
        setRows([])
        return toast('No se encontraron las columnas «CÓDIGO PATRIMONIAL» y «DESCRIPCIÓN». Descarga el formato e inténtalo de nuevo.', 'bad')
      }
      const parsed = []
      sheet.eachRow((row, number) => {
        if (number < columns.firstRow) return
        const code = cleanCode(cellText(row.getCell(columns.code)))
        const description = cleanDescription(cellText(row.getCell(columns.description)))
        if (!code && !description) return
        parsed.push({ row: number, code, description })
      })
      setRows(markDuplicates(parsed, [['code', 'Código']]))
      if (!parsed.length) toast('No se encontraron códigos en el archivo.', 'bad')
    } catch (error) {
      console.error(error)
      toast('No se pudo leer el archivo. Usa un archivo .xlsx.', 'bad')
    }
  }

  const checked = useMemo(() => {
    const byCode = new Map(existing.map((item) => [item.code, item]))
    return rows.map((row) => {
      const problems = []
      if (!row.code) problems.push('falta el código')
      else if (!CODE_PATTERN.test(row.code)) problems.push('código no válido (solo números, 6 a 20 dígitos)')
      if (!row.description) problems.push('falta la descripción')
      else if (row.description.length < 3) problems.push('descripción muy corta')
      else if (row.description.length > 255) problems.push('descripción de más de 255 caracteres')
      if (problems.length) return { ...row, status: 'incomplete', note: problems.join(', ') }
      if (row.duplicate) return { ...row, status: 'duplicate', note: row.duplicate }
      const match = byCode.get(row.code)
      if (!match) return { ...row, status: 'new', note: 'Nuevo' }
      if (match.description === row.description) return { ...row, status: 'same', note: 'Ya registrado igual' }
      return { ...row, status: 'update', note: `Antes: ${match.description}` }
    })
  }, [rows, existing])
  const toSend = checked.filter((row) => row.status === 'new' || row.status === 'update')
  const count = (status) => checked.filter((row) => row.status === status).length
  const rejected = count('incomplete') + count('duplicate')

  async function submit() {
    setBusy(true)
    const response = await api('/api/patrimonial-codes/import', { method: 'POST', body: { items: toSend.map(({ row, code, description }) => ({ row, code, description })) } })
    setBusy(false)
    if (!response.ok) return toast(response.error || 'No se pudieron importar los códigos.', 'bad')
    setResult(response)
    toast(`Importación lista: ${response.created} nuevos, ${response.updated} actualizados.`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Importar códigos patrimoniales desde Excel</DialogTitle>
          <DialogDescription>
            El archivo debe tener las columnas <strong>CÓDIGO PATRIMONIAL</strong> y <strong>DESCRIPCIÓN</strong>. Si un código ya existe, se actualiza su descripción; si no, se registra como nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Upload className="size-4" /> Elegir archivo .xlsx
            <input type="file" accept=".xlsx" className="sr-only" onChange={(event) => { read(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={downloadPatrimonialCodesTemplate}><FileSpreadsheet /> Descargar formato</Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-foreground/75 dark:bg-muted">
                  <tr>{['Fila', 'Resultado', 'Código patrimonial', 'Descripción'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 text-left font-bold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {checked.slice(0, 300).map((row) => (
                    <tr key={row.row} className={cn('border-t border-border/70', (row.status === 'incomplete' || row.status === 'duplicate') && 'bg-[#fbf1f0] dark:bg-red-500/10')}>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.row}</td>
                      <td className="px-3 py-1.5"><ImportStatus row={row} /></td>
                      <td className={cn('whitespace-nowrap px-3 py-1.5 tabular-nums', (!row.code || !CODE_PATTERN.test(row.code)) && 'font-semibold text-destructive')}>{row.code || 'Falta'}</td>
                      <td className={cn('px-3 py-1.5', !row.description && 'font-semibold text-destructive')}>{row.description || 'Falta'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              {rows.length} código(s) leídos{rows.length > 300 ? ' (se muestran los primeros 300)' : ''}: {count('new')} nuevos, {count('update')} actualizan la descripción, {count('same')} sin cambios.
              {rejected > 0 && <span className="ml-1 font-semibold text-destructive">{rejected} fila(s) repetidas o con errores no se importarán.</span>}
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
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cerrar</Button>
          <Button type="button" disabled={!toSend.length || busy || Boolean(result)} onClick={submit}><Upload /> {busy ? 'Importando…' : `Importar ${toSend.length || ''} código(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
