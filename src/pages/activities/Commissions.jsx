import { useEffect, useState } from 'react'
import { CalendarRange, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { exportTableXlsx } from '../../lib/exporters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Panel, Pill } from '../campus/kit'
import { todayLima } from '../attendance/shared'
import { ActivityDetail, CommissionForm, dateLabel, useCommissions } from './shared'

/** Comisiones y responsables: the teams in charge of activities, their members and their activities. */
export default function CommissionsPage() {
  const { toast } = useApp()
  const canEdit = useCan('actividades')
  const [commissions, reload] = useCommissions()
  const [activities, setActivities] = useState([])
  const [editing, setEditing] = useState(undefined)
  const [deleting, setDeleting] = useState(null)
  const [opened, setOpened] = useState(null)
  const today = todayLima()

  async function loadActivities() {
    const result = await api(`/api/activities?from=${today.slice(0, 4)}-01-01&to=${today.slice(0, 4)}-12-31`)
    if (result.ok) setActivities(result.activities)
  }
  useEffect(() => { loadActivities() }, [])
  const refresh = () => { reload(); loadActivities() }

  async function remove() {
    const result = await api(`/api/commissions/${deleting.id}`, { method: 'DELETE' })
    if (!result.ok) { toast(result.error || 'No se pudo eliminar la comisión.', 'bad'); setDeleting(null); return }
    toast('Comisión eliminada.')
    setDeleting(null)
    refresh()
  }

  function exportData() {
    if (!commissions.length) return toast('No hay comisiones para exportar.', 'bad')
    const rows = commissions.flatMap((item) => [
      [item.name, item.coordinator, 'Coordinador(a)', item.active ? 'Activa' : 'Inactiva', item.activities],
      ...item.members.map((member) => [item.name, member.name, member.role || 'Integrante', item.active ? 'Activa' : 'Inactiva', '']),
    ])
    exportTableXlsx({ title: 'Gestión de actividades · Comisiones y responsables', headers: ['Comisión', 'Integrante', 'Función', 'Estado', 'Actividades a cargo'], widths: [34, 32, 20, 10, 12], rows })
      .then(() => toast('Comisiones exportadas a Excel.')).catch(() => toast('No se pudo exportar el archivo.', 'bad'))
  }

  // People in charge without a commission (direct responsibles).
  const direct = [...new Map(activities.filter((item) => item.responsible).map((item) => [item.responsible, activities.filter((entry) => entry.responsible === item.responsible)])).entries()]
    .sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="space-y-4">
      <PageHeader icon={Users} title="Comisiones y responsables" description="Equipos de trabajo que organizan las actividades y las personas a cargo."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={exportData}>Exportar Excel</Button>
            {canEdit && <Button type="button" onClick={() => setEditing(null)}><Plus /> Nueva comisión</Button>}
          </>
        )} />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {commissions.map((item) => {
          const own = activities.filter((activity) => activity.commissionId === item.id).sort((a, b) => a.startDate.localeCompare(b.startDate))
          const next = own.find((activity) => activity.endDate >= today && !['Realizada', 'Cancelada'].includes(activity.status))
          return (
            <Panel key={item.id} title={item.name} icon={Users} className={item.active ? '' : 'opacity-70'} action={(
              <span className="flex items-center gap-1">
                {!item.active && <Pill value="Inactivo" />}
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8" title="Editar comisión" aria-label={`Editar ${item.name}`} onClick={() => setEditing(item)}><Pencil /></Button>}
                {canEdit && <Button type="button" variant="ghost" size="icon" className="size-8 text-[#9a2f2a]" title="Eliminar comisión" aria-label={`Eliminar ${item.name}`} onClick={() => setDeleting(item)}><Trash2 /></Button>}
              </span>
            )}>
              {item.description && <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>}
              <p className="text-sm"><span className="font-semibold">Coordinador(a):</span> {item.coordinator}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {item.members.map((member, index) => (
                  <li key={index} className="flex items-center gap-2"><UserRound className="size-3.5 text-muted-foreground" />{member.name}{member.role && <span className="text-xs text-muted-foreground">· {member.role}</span>}</li>
                ))}
                {!item.members.length && <li className="text-xs text-muted-foreground">Sin integrantes registrados.</li>}
              </ul>
              <div className="mt-4 border-t border-border pt-3 text-sm">
                <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><CalendarRange className="size-4 text-primary" /> {own.length} actividad(es) este año · {item.upcoming} pendiente(s)</p>
                {next ? (
                  <button type="button" onClick={() => setOpened(next.id)} className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50">
                    <span className="block text-xs text-muted-foreground">Próxima</span>
                    <span className="block font-medium">{next.title}</span>
                    <span className="text-xs text-muted-foreground">{dateLabel(next)} · {next.status}</span>
                  </button>
                ) : <p className="text-xs text-muted-foreground">Sin actividades pendientes.</p>}
              </div>
            </Panel>
          )
        })}
        {!commissions.length && (
          <Panel title="Sin comisiones" icon={Users}><p className="text-sm text-muted-foreground">Registra las comisiones de la institución (por ejemplo: Calendario Cívico, Deporte, Convivencia, Medio Ambiente) para asignarles actividades.</p></Panel>
        )}
      </div>

      <Panel title="Responsables directos de actividades" icon={UserRound} contentClassName="p-0">
        <ul className="divide-y divide-border text-sm">
          {direct.map(([name, own]) => (
            <li key={name} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-48 font-medium">{name}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {own.slice(0, 6).map((activity) => (
                  <button key={activity.id} type="button" onClick={() => setOpened(activity.id)} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:border-primary/50 hover:text-primary">{activity.code} · {activity.title}</button>
                ))}
              </span>
              <span className="text-xs text-muted-foreground">{own.length} actividad(es)</span>
            </li>
          ))}
          {!direct.length && <li className="px-5 py-6 text-center text-muted-foreground">Aún no hay responsables registrados en las actividades del año.</li>}
        </ul>
      </Panel>

      {editing !== undefined && <CommissionForm commission={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh() }} />}
      {opened && <ActivityDetail id={opened} onClose={() => setOpened(null)} onChanged={refresh} />}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la comisión «{deleting?.name}»?</DialogTitle>
            <DialogDescription>Solo se puede eliminar si no tiene actividades a su cargo. Si ya trabajó en actividades, desactívala para conservar el historial.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={remove}>Sí, eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
