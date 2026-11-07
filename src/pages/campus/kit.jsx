import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
import { CHIP_BASE, TONE } from '../../lib/tones'

export function Panel({ title, icon: Icon, action, children, className = '', contentClassName = '', plain = false }) {
  return (
    <Card className={cn('gap-0 overflow-hidden border-border py-0 shadow-xs', className)}>
      <CardHeader className={cn('flex flex-row items-center justify-between gap-3 space-y-0 px-5 py-3', plain ? 'bg-card pb-1 pt-4' : 'border-b border-border bg-slate-50 dark:bg-muted/60')}>
        <CardTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-foreground">
          {Icon && <Icon className="size-[18px] text-primary" />}
          {title}
        </CardTitle>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className={cn(plain ? 'px-5 pb-5 pt-3' : 'p-5', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function PageHeader({ icon: Icon, title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {Icon && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-xs">
            <Icon className="size-6" strokeWidth={1.8} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* Formal palette: every card is white with a navy icon; the tone only marks a small status dot. */
const TONE_DOT = {
  blue: 'bg-primary',
  violet: 'bg-primary',
  green: 'bg-[#3f7d5c]',
  amber: 'bg-[#b7832f]',
  red: 'bg-[#b4413c]',
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'blue', to, onClick }) {
  const body = (
    <div className={cn('flex h-full items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition', (to || onClick) && 'hover:border-primary/40 hover:shadow-sm')}>
      {Icon && (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-primary dark:bg-muted">
          <Icon className="size-6" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[26px] font-extrabold leading-none tracking-tight text-foreground">{value}</p>
        <p className="mt-1 truncate text-sm font-medium text-muted-foreground">{label}</p>
        {hint && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', TONE_DOT[tone] || TONE_DOT.blue)} />
            {hint}
          </p>
        )}
      </div>
    </div>
  )
  if (to) return <Link to={to} className="block">{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{body}</button>
  return body
}

/** Status pill used in every table: same shape, icon and muted tone across the panel. */
export function Pill({ value, className }) {
  const tones = {
    Operativo: 'ok',
    Bueno: 'ok',
    Realizado: 'ok',
    resuelta: 'ok',
    Activo: 'ok',
    Programado: 'brand',
    baja: 'brand',
    registrada: 'neutral',
    'En proceso': 'warn',
    en_proceso: 'warn',
    Regular: 'warn',
    'Con fallas': 'warn',
    media: 'warn',
    Pendiente: 'bad',
    pendiente: 'bad',
    alta: 'bad',
    Malo: 'bad',
    Inoperativo: 'bad',
    Inactivo: 'neutral',
    Habilitado: 'ok',
    'Coordinación': 'brand',
    'Coordinación CIST': 'brand',
    Directora: 'brand',
    Auxiliar: 'plain',
    Docente: 'plain',
    'Psicología': 'plain',
    // Atención psicológica
    Abierto: 'brand',
    'En seguimiento': 'warn',
    Derivado: 'neutral',
    Cerrado: 'ok',
    Programada: 'brand',
    Realizada: 'ok',
    'No asistió': 'bad',
    Cancelada: 'neutral',
    Alto: 'bad',
    Medio: 'warn',
    Bajo: 'ok',
  }
  const labels = {
    registrada: 'Registrada',
    pendiente: 'Pendiente',
    en_proceso: 'En atención',
    resuelta: 'Resuelta',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
  }
  const tone = TONE[tones[value]] || TONE.neutral
  const Icon = tone.icon
  return (
    <span className={cn(CHIP_BASE, tone.chip, className)}>
      <Icon aria-hidden="true" />
      {labels[value] || value}
    </span>
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
  // Columns marked `hidden` (e.g. actions for read-only roles) are not rendered at all.
  return <PaginatedTable key={rows.length} columns={columns.filter((column) => !column.hidden)} rows={rows} empty={empty} />
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
          <TableHeader className="bg-slate-50 dark:bg-muted/40">
            <TableRow className="hover:bg-transparent border-b border-border/70">
              {columns.map((column) => (
                <TableHead key={column.key} className="px-4 py-3 text-xs font-bold text-foreground/75 whitespace-nowrap">
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
