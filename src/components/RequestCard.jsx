import { AlertTriangle, MapPin, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { personName } from '../lib/reservations'
import { formatDuration, formatLongDate } from '../lib/time'
import { StatusBadge } from './ui'

export function RequestCard({ request, users, conflict, showTeacher = false, children }) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-xs transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={request.status} />
              {conflict && (
                <Badge variant="warning" className="gap-1 font-bold">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Horario cruzado
                </Badge>
              )}
              {request.roomName && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <MapPin className="size-3" />
                  {request.roomName}
                </Badge>
              )}
            </div>
            <h3 className="mt-2.5 text-base font-extrabold tracking-tight text-foreground">
              {formatLongDate(request.date)}
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              {request.startTime} – {request.endTime} ({formatDuration(request.startTime, request.endTime)})
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="inline-block rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
              {request.grade} {request.section}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">{request.students} estudiantes</p>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-foreground/90 bg-muted/20 p-3 rounded-lg border border-border/40">
          {request.purpose}
        </p>

        {showTeacher && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <User className="size-3.5 text-primary" />
            <span>
              {personName(users, request.teacherId)}
              {users.find((item) => item.id === request.teacherId)?.subject
                ? ` · ${users.find((item) => item.id === request.teacherId).subject}`
                : ''}
            </span>
          </div>
        )}

        {request.notes && (
          <p className="mt-2 text-xs text-muted-foreground italic">
            Nota docente: {request.notes}
          </p>
        )}

        {request.adminNote && (
          <div className="mt-3 rounded-lg bg-primary/5 border border-primary/15 p-3 text-xs text-foreground">
            <span className="font-bold text-primary block mb-0.5">Nota de Coordinación CIST:</span>
            {request.adminNote}
          </div>
        )}

        {children && <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-border/50">{children}</div>}
      </CardContent>
    </Card>
  )
}
