import { useEffect, useState } from 'react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { WEEKDAYS } from '../../lib/school'
import { GRADES, SECTIONS } from '../../lib/reservations'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Panel, Table } from './kit'

export function FixedHoursPage() {
  const { user, users, rooms, toast } = useApp()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ teacherId: '', roomId: '', weekday: '1', startTime: '08:00', endTime: '09:30', grade: GRADES[0], section: SECTIONS[0], purpose: 'Horario fijo' })
  const [openHour, setOpenHour] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const scheduleRooms = rooms

  function resetForm() {
    setForm({ teacherId: '', roomId: '', weekday: '1', startTime: '08:00', endTime: '09:30', grade: GRADES[0], section: SECTIONS[0], purpose: 'Horario fijo' })
    setEditing(null)
  }

  function editSchedule(row) {
    setEditing(row.id)
    setForm({
      teacherId: String(row.teacherId),
      roomId: String(row.roomId),
      weekday: String(row.weekday),
      startTime: row.startTime,
      endTime: row.endTime,
      grade: row.grade,
      section: row.section,
      purpose: row.purpose || '',
    })
    setOpenHour(true)
  }

  async function load() {
    const result = await api('/api/fixed-schedules')
    if (result.ok) setRows(result.schedules)
  }
  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    if (!scheduleRooms.some((room) => Number(room.id) === Number(form.roomId))) {
      return toast('Selecciona una sala exclusiva de cómputo.', 'bad')
    }
    const result = editing
      ? await api(`/api/fixed-schedules/${editing}`, { method: 'PATCH', body: { ...form, weekday: Number(form.weekday) } })
      : await api('/api/fixed-schedules', { method: 'POST', body: { ...form, weekday: Number(form.weekday) } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast(editing ? 'Horario fijo actualizado.' : 'Horario fijo agregado. Ya bloquea el calendario.')
    setOpenHour(false)
    resetForm()
    load()
  }

  return (
    <div className="space-y-4">
      <Panel title="Horarios fijos semanales">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Estos bloques aparecen solos cada semana y no permiten otra reserva en la misma sala.</p>
          {user.role === 'admin' && <Button type="button" onClick={() => { resetForm(); setOpenHour(true) }}>Agregar horario</Button>}
        </div>
        <Dialog open={openHour} onOpenChange={(open) => { setOpenHour(open); if (!open) resetForm() }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle>{editing ? 'Editar horario fijo' : 'Horario fijo semanal'}</DialogTitle>
              <DialogDescription>Organiza el horario del docente. Este bloque se repetirá cada semana y bloqueará la sala.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Docente">
                  <Choice value={form.teacherId} onChange={(value) => setForm({ ...form, teacherId: value })} options={users.filter((item) => item.role === 'teacher').map((item) => ({ value: item.id, label: item.name }))} />
                </Field>
                <Field label="Sala">
                  <Choice value={form.roomId} onChange={(value) => setForm({ ...form, roomId: value })} options={scheduleRooms.map((item) => ({ value: item.id, label: item.name }))} placeholder={scheduleRooms.length ? 'Seleccionar sala' : 'No hay salas disponibles'} />
                  {scheduleRooms.length === 0 && <p className="text-xs text-muted-foreground">Crea una sala en “Categorías y ambientes” para asignarle un horario fijo.</p>}
                </Field>
                <Field label="Día de la semana">
                  <Choice value={form.weekday} onChange={(value) => setForm({ ...form, weekday: value })} options={WEEKDAYS.map((day) => ({ value: day.id, label: day.label }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hora de inicio">
                    <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  </Field>
                  <Field label="Hora de fin">
                    <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                  </Field>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Grado">
                  <Choice value={form.grade} onChange={(value) => setForm({ ...form, grade: value })} options={GRADES.map((grade) => ({ value: grade, label: grade }))} />
                </Field>
                <Field label="Sección">
                  <Choice value={form.section} onChange={(value) => setForm({ ...form, section: value })} options={SECTIONS.map((section) => ({ value: section, label: section }))} />
                </Field>
              </div>
              <Field label="Finalidad del horario">
                <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              </Field>
              <DialogFooter className="border-t border-border/70 pt-4">
                <Button type="button" variant="outline" onClick={() => { setOpenHour(false); resetForm() }}>Cancelar</Button>
                <Button type="submit" disabled={scheduleRooms.length === 0}>{editing ? 'Guardar cambios' : 'Guardar horario'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalle del horario fijo</DialogTitle>
              <DialogDescription>Este bloque se repite semanalmente y reserva la sala indicada.</DialogDescription>
            </DialogHeader>
            {viewing && (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold text-muted-foreground">Docente</dt><dd>{viewing.teacherName}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Sala</dt><dd>{viewing.roomName}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Día</dt><dd>{WEEKDAYS.find((day) => day.id === Number(viewing.weekday))?.label}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Horario</dt><dd>{viewing.startTime}–{viewing.endTime}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Grado / sección</dt><dd>{viewing.grade} {viewing.section}</dd></div>
                <div className="sm:col-span-2"><dt className="font-semibold text-muted-foreground">Finalidad</dt><dd>{viewing.purpose || 'Sin finalidad indicada'}</dd></div>
              </dl>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
              {user.role === 'admin' && viewing && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar horario" title="Editar horario" onClick={() => { const selected = viewing; setViewing(null); editSchedule(selected) }}>
                  <Pencil className="size-4" />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Table rows={rows} columns={[
          { key: 'teacherName', label: 'Docente' },
          { key: 'day', label: 'Día', render: (row) => WEEKDAYS.find((day) => day.id === Number(row.weekday))?.label },
          { key: 'hours', label: 'Horario', render: (row) => `${row.startTime}–${row.endTime}` },
          { key: 'roomName', label: 'Sala' },
          { key: 'grade', label: 'Grado', render: (row) => `${row.grade} ${row.section}` },
          { key: 'purpose', label: 'Finalidad' },
          {
            key: 'actions',
            label: 'Acciones',
            render: (row) => (
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Ver horario" title="Ver horario" onClick={() => setViewing(row)}>
                  <Eye className="size-4" />
                </Button>
                {user.role === 'admin' && (
                  <>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar horario" title="Editar horario" onClick={() => editSchedule(row)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-[#9a2f2a] hover:bg-muted hover:text-destructive dark:hover:bg-rose-950/30"
                      aria-label="Quitar horario"
                      title="Quitar horario"
                      onClick={async () => {
                        const result = await api(`/api/fixed-schedules/${row.id}`, { method: 'DELETE' })
                        if (!result.ok) {
                          toast(result.error || 'No se pudo quitar el horario.', 'bad')
                          return
                        }
                        toast('Horario fijo eliminado.')
                        load()
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            ),
          },
        ]} />
      </Panel>
    </div>
  )
}
