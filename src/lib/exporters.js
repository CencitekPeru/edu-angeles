import { SCHOOL } from './school'

function slug(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const stamp = () => new Date().toISOString().slice(0, 10)

// Set by the layout: returns why the current user may not export on the current page, or null.
let exportGuard = () => null
export function setExportGuard(fn) { exportGuard = typeof fn === 'function' ? fn : () => null }
function checkExport() {
  const denied = exportGuard()
  if (denied) throw new Error(denied)
}

/**
 * Exports a simple table to a landscape A4 PDF with the school header.
 * Wide tables can pass a smaller `fontSize` and per-column `columnStyles` (jspdf-autotable format).
 */
export async function exportTablePdf({ title, subtitle = '', headers, rows, summary = [], fontSize = 8, columnStyles = {} }) {
  checkExport()
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const margin = 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(82, 82, 82)
  doc.text(`${SCHOOL.name.toUpperCase()} · CIST`, margin, 14)
  doc.text(new Intl.DateTimeFormat('es-PE').format(new Date()), width - margin, 14, { align: 'right' })
  doc.setFontSize(17)
  doc.setTextColor(15, 23, 42)
  doc.text(title, margin, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(82, 82, 82)
  if (subtitle) doc.text(subtitle, margin, 29)
  let y = subtitle ? 34 : 29
  if (summary.length) {
    doc.text(summary.map(([label, value]) => `${label}: ${value}`).join('   ·   '), margin, y)
    y += 5
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell ?? '—'))),
    styles: { font: 'helvetica', fontSize, cellPadding: fontSize < 8 ? 1.5 : 2, textColor: [31, 41, 55], overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles,
    alternateRowStyles: { fillColor: [245, 248, 253] },
  })
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(`${SCHOOL.name} · CIST`, margin, height - 7)
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 7, { align: 'right' })
  }
  doc.save(`${slug(title)}-${stamp()}.pdf`)
}

/** Exports a simple table to a styled .xlsx file. */
export async function exportTableXlsx({ title, subtitle = '', headers, rows, widths, summary = [] }) {
  checkExport()
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `${SCHOOL.name} · CIST`
  const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'))
  const last = headers.length
  sheet.columns = headers.map((_, index) => ({ width: widths?.[index] || 18 }))
  const lines = [title, subtitle, summary.map(([label, value]) => `${label}: ${value}`).join('   ·   '), `${SCHOOL.name} · CIST | Generado el ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date())}`].filter(Boolean)
  lines.forEach((text, index) => {
    sheet.mergeCells(index + 1, 1, index + 1, last)
    const cell = sheet.getCell(index + 1, 1)
    cell.value = text
    cell.alignment = { vertical: 'middle', indent: 1 }
    cell.font = index === 0 ? { size: 16, bold: true, color: { argb: 'FFFFFFFF' } } : { size: 10, color: { argb: 'FF334155' } }
    if (index === 0) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
      sheet.getRow(1).height = 28
    }
  })
  const headerRow = lines.length + 2
  const header = sheet.getRow(headerRow)
  // A plain array starts at column A, the same as the data rows below (a leading `undefined` would shift every title one column right).
  header.values = headers
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  rows.forEach((values, index) => {
    const row = sheet.addRow(values)
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FD' } }
    })
  })
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: last } }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug(title)}-${stamp()}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
