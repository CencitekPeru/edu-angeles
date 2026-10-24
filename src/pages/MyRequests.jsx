import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { conflictingRequests } from '../lib/reservations'
import { isPastEnd } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RequestCard } from '../components/RequestCard'
import { Empty, PageHeader } from '../components/ui'
import NewRequest from './NewRequest'

const tabs = [
  { id: 'upcoming', label: 'Próximas reservas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'history', label: 'Historial' },
]

export default function MyRequests() {
  const { user, requests, users, cancelRequest, toast } = useApp()
  const [tab, setTab] = useState('upcoming')
  const [view, setView] = useState('requests')
  const [target, setTarget] = useState(null)
  const mine = requests.filter((item) => item.teacherId === user.id)

  const visible = mine
    .filter((item) => {
      const future = !isPastEnd(item.date, item.endTime)
      if (tab === 'pending') return item.status === 'pending'
      if (tab === 'history') return item.status === 'rejected' || item.status === 'cancelled' || (item.status === 'approved' && !future)
      return (item.status === 'pending' || item.status === 'approved') && future
    })
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))

  async function confirmCancel() {
    const result = await cancelRequest(target.id)
    if (!result.ok) {
      toast(result.error, 'bad')
      return
    }
    toast('Solicitud cancelada. El horario quedó libre.')
    setTarget(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Seguimiento personal"
        title="Reservas de sala"
        text="Solicita turnos y consulta el estado de tus reservas desde un solo espacio."
        action={
          <Button type="button" className="gap-2 font-bold" onClick={() => setView('new')}>
              <Plus className="size-4" />
              Nueva reserva
          </Button>
        }
      />

      <Tabs value={view} onValueChange={setView} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="requests">Mis solicitudes</TabsTrigger>
          <TabsTrigger value="new">Reservar sala</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'new' ? (
        <NewRequest inline onComplete={() => { setView('requests'); setTab('upcoming') }} onCancel={() => setView('requests')} />
      ) : (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-3 sm:flex w-full">
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="text-xs font-semibold px-4">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {visible.length === 0 ? (
        <Empty
          title="No hay solicitudes en esta sección"
          text="Cuando reserves un turno de la sala, podrás ver aquí el estado y la respuesta de coordinación CIST."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setView('new')}>
              Crear una reserva
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const conflict =
              item.status === 'pending' &&
              conflictingRequests(requests, {
                date: item.date,
                start: item.startTime,
                end: item.endTime,
                ignoreId: item.id,
              }).length > 0
            const canCancel =
              (item.status === 'pending' || item.status === 'approved') &&
              !(item.status === 'approved' && isPastEnd(item.date, item.endTime))

            return (
              <RequestCard key={item.id} request={item} users={users} conflict={conflict}>
                {canCancel && (
                  <div className="w-full flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTarget(item)}
                      className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Cancelar reserva
                    </Button>
                  </div>
                )}
              </RequestCard>
            )
          })}
        </div>
      )}
        </>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(next) => { if (!next) setTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
            <DialogDescription>
              {target &&
                `${target.date} · ${target.startTime}–${target.endTime} (${target.grade} ${target.section}). El horario se liberará inmediatamente para otros docentes.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>
              Mantener reserva
            </Button>
            <Button type="button" variant="destructive" onClick={confirmCancel}>
              Confirmar cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
