import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function NotificationBell() {
  const { notifications, markNotifications } = useApp()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const unread = notifications.filter((item) => !item.read).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="relative rounded-full text-foreground hover:bg-muted"
          aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-xs">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Notificaciones</span>
            {unread > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {unread} nuevas
              </Badge>
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              onClick={() => markNotifications({ all: true })}
            >
              <CheckCheck className="size-3" />
              Marcar leídas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No tienes notificaciones pendientes.
            </p>
          ) : (
            notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  item.read ? 'opacity-75' : 'bg-primary/5'
                }`}
                onClick={() => {
                  markNotifications({ id: item.id })
                  setOpen(false)
                  if (item.href) navigate(item.href)
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-foreground leading-tight">{item.title}</span>
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{timeAgo(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {item.body}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ActivityFeed({ items }) {
  if (!items.length) {
    return (
      <Card className="border-dashed border-2 bg-card/40">
        <CardContent className="p-5 text-center text-xs text-muted-foreground">
          Cuando ocurran solicitudes o movimientos de la sala, se mostrarán aquí en tiempo real.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="border-border/80 overflow-hidden">
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {items.slice(0, 4).map((item) => (
            <li key={item.id} className="p-3.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-foreground">{item.title}</p>
                <span className="text-[10px] font-semibold text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  return `Hace ${Math.round(hours / 24)} d`
}
