import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { STATUS } from '../lib/reservations'
import { cn } from '@/lib/utils'

export { Avatar }

export function StatusBadge({ status, className }) {
  const map = {
    pending: { variant: 'warning', dot: 'bg-amber-500' },
    approved: { variant: 'success', dot: 'bg-emerald-500' },
    rejected: { variant: 'destructive', dot: 'bg-rose-500' },
    cancelled: { variant: 'secondary', dot: 'bg-slate-400' },
    fixed: { variant: 'info', dot: 'bg-sky-500' },
  }
  const config = map[status] || { variant: 'outline', dot: 'bg-slate-400' }
  const label = STATUS[status] || (status === 'fixed' ? 'Horario fijo' : status)

  return (
    <Badge variant={config.variant} className={cn('gap-1.5 px-2.5 py-1 text-xs font-semibold shadow-2xs', className)}>
      <span className={cn('size-1.5 rounded-full shrink-0', config.dot)} />
      {label}
    </Badge>
  )
}

export function PageHeader({ eyebrow, title, text, action, className }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-1', className)}>
      <div className="max-w-2xl min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground truncate">
          {title}
        </h1>
        {text && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, icon: Icon, className }) {
  return (
    <Card className={cn('overflow-hidden transition-all duration-200 hover:shadow-md border-border/80', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{label}</p>
          {Icon && (
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
        </div>
        <p className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground truncate">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function Field({ label, hint, error, className, children }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      {label && <Label className="text-xs font-semibold">{label}</Label>}
      {children}
      {error ? (
        <span className="text-xs font-medium text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

export function Modal({ title, children, onClose }) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

export function Empty({ icon: Icon, title, text, action, className }) {
  return (
    <Card className={cn('border-dashed border-2 bg-card/50 text-center py-12 px-6 shadow-none', className)}>
      <CardContent className="p-0 flex flex-col items-center justify-center">
        {Icon && (
          <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <Icon className="size-6" aria-hidden="true" />
          </div>
        )}
        <h3 className="font-bold text-base text-foreground">{title}</h3>
        {text && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{text}</p>}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}
