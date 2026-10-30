import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table as ShadcnTable,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export function Panel({ title, action, children, className = '' }) {
  return (
    <Card className={cn('overflow-hidden border-border/80 shadow-xs', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-5 py-3.5 space-y-0">
        <CardTitle className="text-sm font-bold text-foreground tracking-tight">{title}</CardTitle>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

export function Pill({ value, className, solid = false }) {
  const tones = {
    Operativo: 'success',
    Bueno: 'success',
    Realizado: 'success',
    resuelta: 'success',
    Programado: 'info',
    registrada: 'secondary',
    'En proceso': 'warning',
    en_proceso: 'warning',
    Regular: 'warning',
    'Con fallas': 'warning',
    media: 'warning',
    Pendiente: 'destructive',
    pendiente: 'destructive',
    alta: 'destructive',
    Malo: 'destructive',
    Inoperativo: 'destructive',
    baja: 'info',
  }
  const labels = {
    registrada: 'Registrada',
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelta: 'Resuelta',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
  }
  const variant = tones[value] || 'secondary'
  const display = labels[value] || value
  const solidTones = {
    success: 'border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white',
    warning: 'border-amber-700 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600 dark:text-white',
    destructive: 'border-rose-700 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600 dark:text-white',
    info: 'border-sky-700 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-600 dark:text-white',
    secondary: 'border-slate-700 bg-slate-600 text-white dark:border-slate-500 dark:bg-slate-600 dark:text-white',
  }

  return (
    <Badge variant={variant} className={`text-xs font-semibold px-2.5 py-0.5 ${solid ? solidTones[variant] : ''} ${className || ''}`}>
      {display}
    </Badge>
  )
}

export function Filters({ children, className = '' }) {
  return (
    <div className={`mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {children}
    </div>
  )
}

export function Table({ columns, rows, empty = 'No hay registros.' }) {
  return <PaginatedTable key={rows.length} columns={columns} rows={rows} empty={empty} />
}

function PaginatedTable({ columns, rows, empty }) {
  const pageSizeId = useId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const startIndex = (currentPage - 1) * pageSize
  const pageRows = rows.slice(startIndex, startIndex + pageSize)

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="overflow-x-auto">
        <ShadcnTable>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent border-b border-border/70">
              {columns.map((column) => (
                <TableHead key={column.key} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={columns.length}>
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id || JSON.stringify(row)} className="hover:bg-muted/30 transition-colors">
                  {columns.map((column) => (
                    <TableCell key={column.key} className="px-4 py-3 text-sm text-foreground align-middle">
                      {column.render ? column.render(row) : row[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </ShadcnTable>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={pageSizeId} className="font-medium">Filas por página</label>
          <select
            id={pageSizeId}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}
          >
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>
            {rows.length === 0
              ? '0 registros'
              : `Mostrando ${startIndex + 1}–${Math.min(startIndex + pageSize, rows.length)} de ${rows.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2"
            aria-label="Página anterior"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
          <span className="min-w-16 text-center font-medium text-foreground">
            Página {currentPage} de {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2"
            aria-label="Página siguiente"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Siguiente
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
