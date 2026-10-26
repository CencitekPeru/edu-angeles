import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { STATUS, conflictingRequests, personName } from '../lib/reservations'
import { isPastEnd } from '../lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RequestCard } from '../components/RequestCard'
import { Empty, PageHeader } from '../components/ui'

const tabs = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'all', label: 'Todas' },
]

export default function AdminRequests() {
  const { requests, users, decideRequest, cancelRequest, toast } = useApp()
  const [tab, setTab] = useState('pending')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)
  const [note, setNote] = useState('')
  const [modalError, setModalError] = useState('')

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return requests
      .filter((item) => (tab === 'all' ? true : item.status === tab))
      .filter((item) => {
        if (!text) return true
        const teacher = users.find((user) => user.id === item.teacherId)
        return `${teacher?.name || ''} ${teacher?.subject || ''} ${item.purpose} ${item.grade} ${item.section}`.toLowerCase().includes(text)
      })
      .sort((a, b) => {
        const rank = { pending: 0, approved: 1, rejected: 2, cancelled: 3 }
        return rank[a.status] - rank[b.status] || (a.date + a.startTime).localeCompare(b.date + b.startTime)
      })
  }, [requests, users, tab, query])

  function open(type, request) {
    setNote('')
    setModalError('')
    setModal({ type, request })
  }

  async function approve() {
    const result = await decideRequest(modal.request.id, 'approved')
    if (!result.ok) {
      const who = (result.conflicts || []).map((item) => personName(users, item.teacherId)).join(', ')
      setModalError(who ? `${result.error} Cruce con ${who}.` : result.error)
      return
    }
    toast('Solicitud aprobada.')
    setModal(null)
  }

  async function reject() {
    const result = await decideRequest(modal.request.id, 'rejected', note)
    if (!result.ok) {
      setModalError(result.error)
      return
    }
    toast('Solicitud rechazada.')
    setModal(null)
  }

  async function release() {
    const result = await cancelRequest(modal.request.id)
    if (!result.ok) {
      setModalError(result.error)
      return
    }
    toast('Horario liberado.')
    setModal(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bandeja de gestión"
        title="Solicitudes de Salas de Cómputo"
        text="Revisa y decide las solicitudes de los docentes. Las solicitudes pendientes bloquean temporalmente el horario para evitar sobreposiciones."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-4 sm:flex w-full">
            {tabs.map((item) => {
              const count = item.id === 'all' ? requests.length : requests.filter((r) => r.status === item.id).length
              return (
                <TabsTrigger key={item.id} value={item.id} className="text-xs font-semibold gap-1.5 px-3">
                  <span>{item.label}</span>
                  <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                    {count}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            placeholder="Buscar docente o actividad..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty
          title="No hay solicitudes en esta sección"
          text="No encontramos registros que coincidan con el estado seleccionado o los filtros de búsqueda."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const conflicts = conflictingRequests(requests, {
              date: item.date,
              start: item.startTime,
              end: item.endTime,
              ignoreId: item.id,
              roomId: item.roomId,
            })
            const finished = isPastEnd(item.date, item.endTime)
            return (
              <RequestCard
                key={item.id}
                request={item}
                users={users}
                showTeacher
                conflict={item.status === 'pending' && conflicts.length > 0}
              >
                {item.status === 'pending' && finished && (
                  <p className="w-full text-xs text-muted-foreground">
                    ⚠️ Este horario ya transcurrió. Recházalo para archivar la solicitud.
                  </p>
                )}
                {item.status === 'pending' && conflicts.length > 0 && (
                  <p className="w-full text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Se cruza con {conflicts.map((conflict) => `${personName(users, conflict.teacherId)} (${STATUS[conflict.status]})`).join(', ')}.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1 w-full justify-end">
                  {item.status === 'pending' && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={conflicts.length > 0 || finished}
                        onClick={() => open('approve', item)}
                      >
                        Aprobar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => open('reject', item)}
                      >
                        Rechazar
                      </Button>
                    </>
                  )}
                  {item.status === 'approved' && !finished && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => open('release', item)}
                    >
                      Liberar horario
                    </Button>
                  )}
                </div>
              </RequestCard>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(modal)} onOpenChange={(next) => { if (!next) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.type === 'approve'
                ? 'Aprobar solicitud de sala'
                : modal?.type === 'reject'
                ? 'Rechazar solicitud'
                : 'Liberar horario reservado'}
            </DialogTitle>
            <DialogDescription>
              {modal &&
                `${personName(users, modal.request.teacherId)} · ${modal.request.date} · ${modal.request.startTime}–${modal.request.endTime} (${modal.request.grade} ${modal.request.section})`}
            </DialogDescription>
          </DialogHeader>

          {modal && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-foreground">
              <span className="font-semibold block text-xs text-muted-foreground mb-1">Propósito pedagógico:</span>
              {modal.request.purpose}
            </div>
          )}

          {modal?.type === 'reject' && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold">Motivo del rechazo (opcional)</span>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ej. El bloque coincide con mantenimiento programado de la sala."
              />
            </div>
          )}

          {modalError && (
            <p className="text-xs font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
              {modalError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            {modal?.type === 'approve' && (
              <Button type="button" onClick={approve}>
                Confirmar aprobación
              </Button>
            )}
            {modal?.type === 'reject' && (
              <Button type="button" variant="destructive" onClick={reject}>
                Confirmar rechazo
              </Button>
            )}
            {modal?.type === 'release' && (
              <Button type="button" variant="destructive" onClick={release}>
                Confirmar liberación
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
