import { Children } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export function Filters({ children }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  )
}

export function Table({ columns, rows, empty = 'No hay registros.' }) {
  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
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
            rows.map((row) => (
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
  )
}
