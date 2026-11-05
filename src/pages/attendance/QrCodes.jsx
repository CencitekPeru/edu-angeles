import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, Download, Eye, Filter, GraduationCap, Printer, QrCode, RefreshCw, Search, Trash2, UserRound, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { useCan } from '../../lib/permissions'
import { SCHOOL } from '../../lib/school'
import schoolLogo from '../../assets/logo-colegio.jpg'
import { PageHeader, Panel, StatCard } from '../campus/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FilterLabel, LevelChip, Pager, Select, StudentPhoto, gradeOptions, levelOptions, sectionOptions, tableHead, td, th, usePaged, useStudents } from './shared'

const qrOptions = { margin: 1, width: 320, errorCorrectionLevel: 'M', color: { dark: '#0b1730', light: '#ffffff' } }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

/** Draws the printable QR card onto a canvas and returns it as a PNG data URL. */
async function renderCard(student) {
  const scale = 2
  const width = 360
  const height = 500
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, 18)
  ctx.fill()
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, '#0b1730')
  gradient.addColorStop(1, '#1d4ed8')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.roundRect(0, 0, width, 88, [18, 18, 0, 0])
  ctx.fill()
  const logo = await loadImage(schoolLogo).catch(() => null)
  if (logo) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(18, 16, 56, 56, 10)
    ctx.fill()
    ctx.drawImage(logo, 21, 19, 50, 50)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px Manrope, Arial, sans-serif'
  ctx.fillText(SCHOOL.name.toUpperCase(), 88, 46)
  ctx.font = '14px Manrope, Arial, sans-serif'
  ctx.fillText('Código de Asistencia', 88, 68)
  const qr = await loadImage(await QRCode.toDataURL(student.qrToken, qrOptions))
  ctx.drawImage(qr, 70, 108, 220, 220)
  ctx.fillStyle = '#e8effc'
  ctx.beginPath()
  ctx.roundRect(30, 346, 300, 40, 10)
  ctx.fill()
  ctx.fillStyle = '#0b1730'
  ctx.font = 'bold 17px Manrope, Arial, sans-serif'
  ctx.textAlign = 'center'
  const name = `${student.firstNames} ${student.lastNames}`
  ctx.fillText(name.length > 30 ? `${name.slice(0, 29)}…` : name, width / 2, 372)
  ctx.font = '600 15px Manrope, Arial, sans-serif'
  ctx.fillText(`Código: ${student.code}`, width / 2, 414)
  ctx.font = '14px Manrope, Arial, sans-serif'
  ctx.fillStyle = '#475569'
  ctx.fillText(`${student.level} – ${student.grade} Grado – Sección ${student.section}`, width / 2, 438)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.roundRect(0, height - 26, width, 26, [0, 0, 18, 18])
  ctx.fill()
  return canvas.toDataURL('image/png')
}

async function printCards(students, toast) {
  if (!students.length) return toast('No hay estudiantes con QR activo para imprimir.', 'bad')
  const win = window.open('', '_blank')
  if (!win) return toast('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.', 'bad')
  win.document.write('<p style="font-family:sans-serif">Preparando tarjetas…</p>')
  const images = []
  for (const student of students) images.push(await renderCard(student))
  win.document.open()
  win.document.write(`<!DOCTYPE html><html><head><title>Códigos QR · ${SCHOOL.name}</title>
    <style>@page{size:A4;margin:10mm}body{margin:0;font-family:sans-serif}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
    img{width:100%;border:1px solid #cbd5e1;border-radius:4mm;break-inside:avoid}</style></head>
    <body><div class="grid">${images.map((src) => `<img src="${src}" alt="">`).join('')}</div>
    <script>window.onload=()=>{window.print()}</script></body></html>`)
  win.document.close()
}

export default function QrCodesPage() {
  const { toast } = useApp()
  const canEdit = useCan('asistencia')
  const [draft, setDraft] = useState({ q: '', level: '', grade: '', section: '' })
  const [filters, setFilters] = useState(draft)
  const { students, stats, loading, reload } = useStudents(filters)
  const { rows, pager } = usePaged(students, 10)
  const [selected, setSelected] = useState([])
  const [current, setCurrent] = useState(null)
  const [busy, setBusy] = useState('')
  const [confirmMass, setConfirmMass] = useState(false)

  const active = current ? students.find((item) => item.id === current.id) || current : students[0]

  async function act(action) {
    if (!active) return
    setBusy(action)
    const result = await api(`/api/students/${active.id}/qr`, { method: 'POST', body: { action } })
    setBusy('')
    if (!result.ok) return toast(result.error || 'No se pudo actualizar el QR.', 'bad')
    toast(action === 'regenerate' ? 'QR regenerado. El carné anterior ya no es válido.' : action === 'deactivate' ? 'QR desactivado.' : 'QR activado.')
    setCurrent(result.student)
    reload()
  }

  async function download() {
    const url = await renderCard(active)
    const link = document.createElement('a')
    link.href = url
    link.download = `qr-${active.code}.png`
    link.click()
  }

  async function generateAll() {
    setBusy('mass')
    const result = await api('/api/students/qr/generate-all', { method: 'POST', body: {} })
    setBusy('')
    setConfirmMass(false)
    if (!result.ok) return toast(result.error || 'No se pudieron generar los QR.', 'bad')
    toast('Todos los estudiantes tienen su QR activo.')
    reload()
  }

  const printable = (selected.length ? students.filter((item) => selected.includes(item.id)) : students).filter((item) => item.qrActive)
  const allOnPage = rows.length > 0 && rows.every((row) => selected.includes(row.id))

  return (
    <div className="space-y-5">
      <PageHeader
        icon={QrCode}
        title="Códigos QR"
        description="Generación y gestión de los códigos QR de los estudiantes."
        actions={
          <>
            <Button type="button" variant="outline" disabled={busy === 'print'} onClick={async () => { setBusy('print'); await printCards(printable, toast); setBusy('') }}>
              <Printer /> {busy === 'print' ? 'Preparando…' : `Imprimir masivo${selected.length ? ` (${printable.length})` : ''}`}
            </Button>
            {canEdit && <Button type="button" onClick={() => setConfirmMass(true)}><QrCode /> Generar QR masivo</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" icon={Users} value={stats.total} label="Total de QR generados" />
        <StatCard tone="green" icon={GraduationCap} value={stats.Primaria} label="Primaria" />
        <StatCard tone="violet" icon={GraduationCap} value={stats.Secundaria} label="Secundaria" />
        <StatCard tone="amber" icon={CheckCircle2} value={`${stats.qrActive}`} label="QR activos" hint={stats.total - stats.qrActive ? `${stats.total - stats.qrActive} desactivados` : 'Todos activos'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,8fr)_minmax(300px,4fr)]">
        <Panel title="Buscar estudiantes" icon={Search} contentClassName="p-0">
          <form className="grid items-end gap-3 p-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]" onSubmit={(event) => { event.preventDefault(); setFilters(draft) }}>
            <div className="relative md:col-span-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Buscar por DNI, código, nombre o apellidos…" className="pl-9" />
            </div>
            <FilterLabel label="Nivel"><Select value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={levelOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Grado"><Select value={draft.grade} onChange={(grade) => setDraft({ ...draft, grade })} options={gradeOptions('Todos')} /></FilterLabel>
            <FilterLabel label="Sección"><Select value={draft.section} onChange={(section) => setDraft({ ...draft, section })} options={sectionOptions('Todas')} /></FilterLabel>
            <Button type="submit"><Filter /> Filtrar</Button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="w-10 px-4"><input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? selected.filter((id) => !rows.some((row) => row.id === id)) : [...new Set([...selected, ...rows.map((row) => row.id)])])} aria-label="Seleccionar página" /></th>
                  <th className={th}>Foto</th><th className={th}>Código</th><th className={th}>Apellidos y nombres</th><th className={th}>Nivel</th><th className={th}>Grado</th><th className={th}>Sección</th><th className={th}>QR</th><th className={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id} className={cn('border-t border-border/70 hover:bg-muted/30', active?.id === student.id && 'bg-slate-50 dark:bg-blue-500/10')}>
                    <td className="px-4"><input type="checkbox" checked={selected.includes(student.id)} onChange={() => setSelected(selected.includes(student.id) ? selected.filter((id) => id !== student.id) : [...selected, student.id])} aria-label={`Seleccionar ${student.fullName}`} /></td>
                    <td className={td}><StudentPhoto student={student} size="size-10" /></td>
                    <td className={cn(td, 'font-semibold text-primary')}>{student.code}</td>
                    <td className={cn(td, 'font-medium')}>{student.fullName}</td>
                    <td className={td}><LevelChip level={student.level} /></td>
                    <td className={td}>{student.grade}</td>
                    <td className={td}>{student.section}</td>
                    <td className={td}>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', student.qrActive ? 'border-border bg-[#f1f7f3] text-[#2f6447] dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300' : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
                        <CheckCircle2 className="size-3.5" /> {student.qrActive ? 'Generado' : 'Desactivado'}
                      </span>
                    </td>
                    <td className={td}>
                      <button type="button" onClick={() => setCurrent(student)} className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary hover:bg-muted" aria-label={`Ver QR de ${student.fullName}`}><Eye className="size-4" /></button>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">{loading ? 'Cargando…' : 'No hay estudiantes registrados con estos filtros.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager {...pager} label="estudiantes" />
        </Panel>

        <Panel title="Código QR del estudiante" icon={QrCode}>
          {active ? <QrCard student={active} canEdit={canEdit} busy={busy} onDownload={download} onPrint={() => printCards([active], toast)} onAction={act} /> : (
            <div className="flex min-h-80 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <UserRound className="size-10 opacity-40" /> Registra estudiantes para generar sus códigos QR.
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={confirmMass} onOpenChange={setConfirmMass}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar QR masivo</DialogTitle>
            <DialogDescription>Se generará el QR de los estudiantes que no tengan uno y se activarán todos los QR desactivados. Los QR existentes no cambian.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmMass(false)}>Cancelar</Button>
            <Button type="button" disabled={busy === 'mass'} onClick={generateAll}>{busy === 'mass' ? 'Generando…' : 'Generar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QrCard({ student, canEdit, busy, onDownload, onPrint, onAction }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let active = true
    QRCode.toDataURL(student.qrToken, qrOptions).then((url) => { if (active) setSrc(url) })
    return () => { active = false }
  }, [student.qrToken])

  return (
    <div className="space-y-4">
      <div className={cn('mx-auto max-w-[280px] overflow-hidden rounded-2xl border border-border bg-white text-slate-900 shadow-lg', !student.qrActive && 'opacity-50 grayscale')}>
        <div className="flex items-center gap-3 bg-gradient-to-r from-[#0b1730] to-[#1e3a8a] px-4 py-3 text-white">
          <img src={schoolLogo} alt="" className="size-10 rounded-md bg-white object-contain p-0.5" />
          <div className="leading-tight">
            <p className="font-extrabold uppercase">{SCHOOL.name}</p>
            <p className="text-xs text-white/80">Código de Asistencia</p>
          </div>
        </div>
        <div className="flex justify-center p-4">{src ? <img src={src} alt={`QR de ${student.fullName}`} className="size-44" /> : <div className="size-44 animate-pulse rounded bg-slate-100" />}</div>
        <div className="mx-4 flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-sm font-bold"><UserRound className="size-4" />{student.firstNames} {student.lastNames}</div>
        <p className="mt-2 text-center text-sm font-semibold">Código: {student.code}</p>
        <p className="pb-3 text-center text-xs text-slate-500">{student.level} – {student.grade} Grado – Sección {student.section}</p>
        <div className="h-3 bg-gradient-to-r from-[#0b1730] to-[#1e3a8a]" />
      </div>
      {!student.qrActive && <p className="text-center text-xs font-semibold text-destructive">Este QR está desactivado: el lector lo rechazará.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" onClick={onDownload} disabled={!student.qrActive}><Download /> Descargar QR (PNG)</Button>
        <Button type="button" variant="outline" onClick={onPrint} disabled={!student.qrActive}><Printer /> Imprimir</Button>
        {canEdit && <Button type="button" variant="outline" disabled={busy === 'regenerate'} onClick={() => onAction('regenerate')}><RefreshCw /> Regenerar QR</Button>}
        {!canEdit ? null : student.qrActive ? (
          <Button type="button" variant="outline" className="border-border text-[#b4413c] hover:bg-muted" disabled={busy === 'deactivate'} onClick={() => onAction('deactivate')}><Trash2 /> Desactivar QR</Button>
        ) : (
          <Button type="button" variant="outline" className="border-border text-[#2f6447] hover:bg-muted" disabled={busy === 'activate'} onClick={() => onAction('activate')}><CheckCircle2 /> Activar QR</Button>
        )}
      </div>
    </div>
  )
}
