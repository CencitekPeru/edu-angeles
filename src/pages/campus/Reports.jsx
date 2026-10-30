import { useEffect, useRef, useState } from 'react'
import { Download, Eye, Pencil, Trash2 } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../../lib/api'
import { WEEKDAYS } from '../../lib/school'
import { GRADES, SECTIONS } from '../../lib/reservations'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Choice, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Panel, Pill, Table } from './kit'

export function ReportsPage() {
  const { toast } = useApp()
  const toastRef = useRef(toast)
  const [generatedOn] = useState(() => new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date()))
  const [summary, setSummary] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [incidents, setIncidents] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    let active = true
    Promise.all([
      api('/api/summary'),
      api('/api/maintenance'),
      api('/api/incidents'),
      api('/api/equipment'),
    ]).then(([summaryResult, maintenanceResult, incidentsResult, equipmentResult]) => {
      if (!active) return
      const failed = [summaryResult, maintenanceResult, incidentsResult, equipmentResult].find((result) => !result.ok)
      if (failed) {
        setLoadError(true)
        toastRef.current(failed.error || 'No se pudieron cargar todos los datos del reporte.', 'bad')
      }
      if (summaryResult.ok) setSummary(summaryResult)
      if (maintenanceResult.ok) setMaintenance(maintenanceResult.maintenance)
      if (incidentsResult.ok) setIncidents(incidentsResult.incidents)
      if (equipmentResult.ok) setEquipment(equipmentResult.equipment)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function downloadPdf() {
    setDownloading(true)
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 14
      const date = new Intl.DateTimeFormat('es-PE').format(new Date())

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(82, 82, 82)
      doc.text('I.E. LOS ÁNGELES · CIST', margin, 14)
      doc.setFontSize(19)
      doc.setTextColor(15, 23, 42)
      doc.text('Reporte de gestión tecnológica', margin, 23)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(82, 82, 82)
      doc.text('Resumen de equipos, mantenimientos e incidencias', margin, 29)
      doc.text(`Generado el ${date}`, pageWidth - margin, 14, { align: 'right' })

      const stats = [
        ['Programados', summary?.maintenance.programados || 0],
        ['Realizados', summary?.maintenance.realizados || 0],
        ['En proceso', summary?.maintenance.proceso || 0],
        ['Pendientes', summary?.maintenance.pendientes || 0],
      ]
      const gap = 5
      const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4
      const cardY = 35
      stats.forEach(([label, value], index) => {
        const x = margin + index * (cardWidth + gap)
        doc.setDrawColor(203, 213, 225)
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(x, cardY, cardWidth, 16, 2, 2, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(71, 85, 105)
        doc.text(String(label), x + 4, cardY + 6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(15, 23, 42)
        doc.text(String(value), x + 4, cardY + 12.5)
      })

      const tableOptions = {
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [31, 41, 55], overflow: 'linebreak' },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        rowPageBreak: 'avoid',
      }
      let startY = 57
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text('Equipos por estado operativo', margin, startY)
      autoTable(doc, {
        ...tableOptions,
        startY: startY + 3,
        head: [['Código', 'COD MINEDU', 'Equipo', 'Marca', 'Serie', 'Ambiente', 'Estado']],
        body: equipment.map((row) => [
          row.code || '—',
          row.patrimonial || '—',
          row.name || '—',
          row.brand || '—',
          row.serial || '—',
          row.place || 'Sin asignar',
          row.operationalState || '—',
        ]),
      })

      startY = doc.lastAutoTable.finalY + 10
      if (startY > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage()
        startY = 15
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Mantenimientos', margin, startY)
      autoTable(doc, {
        ...tableOptions,
        startY: startY + 3,
        head: [['Código', 'Fecha', 'Equipo', 'Tipo', 'Estado']],
        body: maintenance.map((row) => [row.code, row.date, `${row.equipmentCode} · ${row.equipmentName}`, row.type, row.status]),
      })

      startY = doc.lastAutoTable.finalY + 10
      if (startY > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage()
        startY = 15
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Incidencias vinculadas al inventario', margin, startY)
      autoTable(doc, {
        ...tableOptions,
        startY: startY + 3,
        head: [['Código', 'Equipo', 'Falla', 'Prioridad', 'Estado']],
        body: incidents.map((row) => [row.code, row.equipmentCode, row.title, row.priority, row.status]),
      })

      const pageCount = doc.getNumberOfPages()
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(100, 116, 139)
        doc.text(`Reporte CIST · ${date}`, margin, doc.internal.pageSize.getHeight() - 7)
        doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 7, { align: 'right' })
      }

      doc.save(`reporte-gestion-tecnologica-${new Date().toISOString().slice(0, 10)}.pdf`)
      toastRef.current('El reporte PDF se descargó.')
    } catch (error) {
      console.error('No se pudo generar el reporte PDF:', error)
      toastRef.current('No se pudo generar el PDF. Inténtalo nuevamente.', 'bad')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" className="gap-2" onClick={downloadPdf} disabled={loading || loadError || downloading}>
          <Download className="size-4" aria-hidden="true" />
          {downloading ? 'Generando PDF…' : 'Descargar en PDF'}
        </Button>
      </div>
      <div className="space-y-4">
        <div className="border-b border-border/70 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">I.E. Los Ángeles · CIST</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Reporte de gestión tecnológica</h1>
          <p className="mt-1 text-sm text-muted-foreground">Resumen de equipos, mantenimientos e incidencias</p>
          <p className="mt-2 text-xs text-muted-foreground">Generado el {generatedOn}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="bg-black" label="Programados" value={summary?.maintenance.programados || 0} />
        <Stat tone="bg-emerald-600" label="Realizados" value={summary?.maintenance.realizados || 0} />
        <Stat tone="bg-amber-500" label="En proceso" value={summary?.maintenance.proceso || 0} />
        <Stat tone="bg-rose-600" label="Pendientes" value={summary?.maintenance.pendientes || 0} />
      </div>
        <Panel title="Equipos por estado operativo">
          <Table rows={equipment} columns={[
            { key: 'code', label: 'Código' },
            { key: 'patrimonial', label: 'COD MINEDU', render: (row) => row.patrimonial || '—' },
            { key: 'name', label: 'Equipo' },
            { key: 'brand', label: 'Marca', render: (row) => row.brand || '—' },
            { key: 'serial', label: 'Serie', render: (row) => row.serial || '—' },
            { key: 'place', label: 'Ambiente', render: (row) => row.place || 'Sin asignar' },
            { key: 'state', label: 'Estado', render: (row) => <Pill value={row.operationalState} /> },
          ]} />
        </Panel>
        <Panel title="Mantenimientos">
          <Table rows={maintenance} columns={[
            { key: 'code', label: 'Código' }, { key: 'date', label: 'Fecha' }, { key: 'equipmentName', label: 'Equipo' },
            { key: 'type', label: 'Tipo' }, { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
          ]} />
        </Panel>
        <Panel title="Incidencias vinculadas al inventario">
          <Table rows={incidents} columns={[
            { key: 'code', label: 'Código' }, { key: 'equipmentCode', label: 'Equipo' }, { key: 'title', label: 'Falla' },
            { key: 'priority', label: 'Prioridad', render: (row) => <Pill value={row.priority} /> },
            { key: 'status', label: 'Estado', render: (row) => <Pill value={row.status} /> },
          ]} />
        </Panel>
      </div>
    </div>
  )
}

export function DocumentsPage() {
  const { user, toast } = useApp()
  const [rows, setRows] = useState([])
  const [equipment, setEquipment] = useState([])
  const [form, setForm] = useState({ title: '', kind: 'Ficha técnica', equipmentId: '', notes: '' })
  const [openDoc, setOpenDoc] = useState(false)

  async function load() {
    const [docs, gear] = await Promise.all([api('/api/documents'), api('/api/equipment')])
    if (docs.ok) setRows(docs.documents)
    if (gear.ok) setEquipment(gear.equipment)
  }
  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    const result = await api('/api/documents', { method: 'POST', body: { ...form, equipmentId: form.equipmentId || null } })
    if (!result.ok) return toast(result.error || 'No se pudo guardar.', 'bad')
    toast('Documento registrado.')
    setForm({ title: '', kind: 'Ficha técnica', equipmentId: '', notes: '' })
    setOpenDoc(false)
    load()
  }

  return (
    <div className="space-y-4">
      {user.role === 'admin' && <div className="flex justify-end"><Button type="button" onClick={() => setOpenDoc(true)}>Nuevo documento</Button></div>}
      <Dialog open={openDoc} onOpenChange={setOpenDoc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva documentación técnica</DialogTitle>
            <DialogDescription>Ficha, protocolo, reporte o manual vinculado a un equipo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3">
            <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Tipo"><Choice value={form.kind} onChange={(value) => setForm({ ...form, kind: value })} options={['Ficha técnica', 'Protocolo', 'Reporte', 'Manual'].map((item) => ({ value: item, label: item }))} /></Field>
            <Field label="Equipo"><Choice value={form.equipmentId || 'general'} onChange={(value) => setForm({ ...form, equipmentId: value === 'general' ? '' : value })} options={[{ value: 'general', label: 'General' }, ...equipment.map((item) => ({ value: item.id, label: item.code }))]} /></Field>
            <Field label="Nota"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDoc(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Panel title="Documentos">
        <Table rows={rows} columns={[
          { key: 'title', label: 'Título' }, { key: 'kind', label: 'Tipo' },
          { key: 'equipment_code', label: 'Equipo', render: (row) => row.equipment_code || 'General' },
          { key: 'notes', label: 'Nota' },
        ]} />
      </Panel>
    </div>
  )
}

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
                <Button type="button" size="icon-sm" aria-label="Editar horario" title="Editar horario" onClick={() => { const selected = viewing; setViewing(null); editSchedule(selected) }}>
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
                <Button type="button" variant="outline" size="icon-sm" aria-label="Ver horario" title="Ver horario" onClick={() => setViewing(row)}>
                  <Eye className="size-4" />
                </Button>
                {user.role === 'admin' && (
                  <>
                    <Button type="button" variant="outline" size="icon-sm" aria-label="Editar horario" title="Editar horario" onClick={() => editSchedule(row)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="text-rose-700"
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

function Stat({ label, value, tone }) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-extrabold text-white ${tone}`}>{value}</span>
      <p className="text-sm font-bold text-slate-600">{label}</p>
    </article>
  )
}
