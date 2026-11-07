/** Shared checks for the Excel imports: row numbering and duplicate detection. */

/** Comparable form of an identifier: no spaces, case-insensitive. */
export const keyOf = (value) => String(value ?? '').replace(/\s+/g, '').toLowerCase()

/** Numbers the records read from the sheet 1, 2, 3… (the header row is not counted). */
export function numberRows(rows) {
  return rows.map((row, index) => ({ ...row, row: index + 1 }))
}

/**
 * Marks rows whose identifiers repeat inside the file. `fields` is a list of
 * [field, label]; the first occurrence is kept and later ones get `duplicate`.
 */
export function markDuplicates(rows, fields) {
  const seen = Object.fromEntries(fields.map(([field]) => [field, new Map()]))
  return rows.map((row) => {
    const problems = []
    for (const [field, label] of fields) {
      const key = keyOf(row[field])
      if (!key) continue
      const first = seen[field].get(key)
      if (first) problems.push(`${label} repetido (fila ${first})`)
      else seen[field].set(key, row.row)
    }
    return problems.length ? { ...row, duplicate: problems.join(' · ') } : row
  })
}
