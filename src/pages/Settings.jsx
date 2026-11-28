import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, DatabaseBackup, Eraser, FileSpreadsheet, HardDriveDownload, HardDriveUpload, History, Settings, Upload } from 'lucide-react'
import { api, download, getToken } from '../lib/api'
import { useApp } from '../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel } from './campus/kit'

/** Groups a chosen set depends on (mirrors the server's `requires`). */
function withDependencies(chosen, groups) {
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]))
  const result = new Set()
  const visit = (key) => {
    if (!byKey[key] || result.has(key)) return
    result.add(key)
    byKey[key].requires.forEach(visit)
  }
  chosen.forEach(visit)
  return result
}

export default function SettingsPage() {
  const { toast, refresh, refreshRooms, logout } = useApp()
  const [info, setInfo] = useState(null)
  const [chosen, setChosen] = useState([])
  const [exporting, setExporting] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [cleaning, setCleaning] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importConfirmation, setImportConfirmation] = useState('')
  const [importing, setImporting] = useState(false)

  async function load() {
    const result = await api('/api/admin/database')
    if (result.ok) setInfo(result)
    else toast(result.error || 'No se pudo leer la base de datos.', 'bad')
  }
  useEffect(() => { load() }, [])

  const groups = info?.groups || []
  const selected = useMemo(() => withDependencies(chosen, groups), [chosen, groups])
  const selectedGroups = groups.filter((group) => selected.has(group.key))
  const selectedRows = selectedGroups.reduce((total, group) => total + group.total, 0)

  function toggle(key) {
    setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  async function exportAs(kind) {
    setExporting(kind)
    const result = await download(`/api/admin/export.${kind}`, `base-de-datos.${kind}`)
    setExporting('')
    if (!result.ok) return toast(result.error, 'bad')
    toast(`Descargado: ${result.name}`)
  }

  async function clean() {
    setCleaning(true)
    const result = await api('/api/admin/clean', { method: 'POST', body: { groups: chosen, confirmation } })
    setCleaning(false)
    if (!result.ok) return toast(result.error || 'No se pudo limpiar la base de datos.', 'bad')
    toast(`Se eliminaron ${result.deleted} registros. Copia previa guardada: ${result.backup}`)
    setConfirmOpen(false)
    setConfirmation('')
    setChosen([])
    await Promise.all([load(), refresh(), refreshRooms()])
  }

  async function importDatabase() {
    setImporting(true)
    const body = new FormData()
    body.append('file', importFile)
    body.append('confirmation', importConfirmation)
    let result
    try {
      const response = await fetch('/api/admin/import', { method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body })
      result = { ...(await response.json().catch(() => ({}))), ok: response.ok }
    } catch {
      result = { ok: false, error: 'No hay conexión con el servidor.' }
    }
    setImporting(false)
    if (!result.ok) return toast(result.error || 'No se pudo importar la base de datos.', 'bad')
    setImportOpen(false)
    setImportFile(null)
    setImportConfirmation('')
    if (result.signedOut) {
      toast('Base de datos importada. Tu cuenta no está en la copia importada: inicia sesión con una cuenta de esa copia.')
      return logout()
    }
    toast(`Base de datos importada. Copia previa guardada: ${result.backup}`)
    await Promise.all([load(), refresh(), refreshRooms()])
  }

  const requiredBy = (key) => groups.filter((group) => chosen.includes(group.key) && withDependencies([group.key], groups).has(key) && group.key !== key)

  return (
    <div className="space-y-5">
      <PageHeader icon={Settings} title="Configuración" description="Copias de seguridad, exportación, importación y limpieza de la base de datos del sistema." />

      <Panel title="Exportar base de datos" icon={HardDriveDownload}>
        <p className="mb-4 text-sm text-muted-foreground">
          {info ? <>La base de datos tiene <span className="font-semibold text-foreground">{info.tables} tablas</span> y <span className="font-semibold text-foreground">{info.totalRows.toLocaleString('es-PE')} registros</span> de todos los módulos.</> : 'Cargando…'}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <ExportCard
            icon={DatabaseBackup}
            title="Copia de seguridad (.sql)"
            text="Estructura y datos completos. Sirve para restaurar el sistema desde phpMyAdmin (pestaña Importar)."
            busy={exporting === 'sql'}
            onClick={() => exportAs('sql')}
          />
          <ExportCard
            icon={FileSpreadsheet}
            title="Exportar a Excel (.xlsx)"
            text="Una hoja por tabla para revisar la información. No incluye contraseñas."
            busy={exporting === 'xlsx'}
            onClick={() => exportAs('xlsx')}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Las fotos y archivos adjuntos no están en la base de datos: se guardan en la carpeta <code>server/uploads</code> del servidor.</p>
      </Panel>

      <Panel title="Importar base de datos" icon={HardDriveUpload}>
        <div className="mb-4 flex gap-3 rounded-lg border border-[#ead9b8] bg-[#fbf6ec] p-3 text-sm text-[#7a4f10] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Restaura una copia de seguridad <span className="font-semibold">.sql</span> (la que descargas arriba o una de phpMyAdmin). La base de datos actual se <span className="font-semibold">reemplaza por completo</span> con la del archivo: se borran todas las tablas y datos actuales. Antes de importar, el sistema guarda automáticamente una copia en el servidor y, si la importación falla, la restaura sola.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm transition-colors hover:bg-muted/50">
            <Upload className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{importFile ? <><span className="font-semibold">{importFile.name}</span> <span className="text-muted-foreground">({(importFile.size / 1024 / 1024).toFixed(2)} MB)</span></> : <span className="text-muted-foreground">Selecciona el archivo .sql…</span>}</span>
            <input type="file" accept=".sql" className="sr-only" onChange={(event) => { setImportFile(event.target.files?.[0] || null); event.target.value = '' }} />
          </label>
          <Button type="button" disabled={!importFile} onClick={() => { setImportConfirmation(''); setImportOpen(true) }}>
            <HardDriveUpload /> Importar base de datos
          </Button>
        </div>
      </Panel>

      <Panel title="Limpiar base de datos" icon={Eraser}>
        <div className="mb-4 flex gap-3 rounded-lg border border-[#e6c9c6] bg-[#fbf1f0] p-3 text-sm text-[#7d2621] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Elimina definitivamente los registros de los módulos que elijas. Antes de borrar, el sistema guarda automáticamente una copia de seguridad en el servidor. Tu cuenta, los roles y la configuración nunca se eliminan.</p>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {groups.map((group) => {
            const checked = selected.has(group.key)
            const forced = checked && !chosen.includes(group.key)
            return (
              <li key={group.key}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted/50', checked && 'border-destructive/40 bg-[#fbf1f0]/60 dark:bg-red-500/5', forced && 'cursor-not-allowed')}>
                  <input type="checkbox" className="mt-0.5 size-4 accent-[#9a2f2a]" checked={checked} disabled={forced} onChange={() => toggle(group.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{group.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {group.total.toLocaleString('es-PE')} registro(s)
                      {forced && <> · se incluye porque {requiredBy(group.key).map((item) => item.label.split(' (')[0].toLowerCase()).join(' y ')} depende de esto</>}
                      {group.key === 'catalogos' && <> · vuelven a sus valores iniciales</>}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {selectedGroups.length ? <>Se eliminarán <span className="font-semibold text-foreground">{selectedRows.toLocaleString('es-PE')} registros</span> de {selectedGroups.length} módulo(s).</> : 'Selecciona los módulos que quieres limpiar.'}
          </p>
          <Button type="button" variant="destructive" disabled={!chosen.length} onClick={() => { setConfirmation(''); setConfirmOpen(true) }}>
            <Eraser /> Limpiar datos seleccionados
          </Button>
        </div>
      </Panel>

      {info?.backups?.length > 0 && (
        <Panel title="Copias automáticas en el servidor" icon={History}>
          <p className="mb-3 text-xs text-muted-foreground">Guardadas en la carpeta <code>server/backups</code> antes de cada limpieza o importación (se muestran las 10 más recientes).</p>
          <ul className="space-y-1.5 text-sm">
            {info.backups.map((file) => <li key={file} className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" />{file}</li>)}
          </ul>
        </Panel>
      )}

      <Dialog open={importOpen} onOpenChange={(next) => { if (!importing) setImportOpen(next) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HardDriveUpload className="size-5 text-primary" /> Confirmar importación</DialogTitle>
            <DialogDescription>
              Se importará <span className="font-semibold text-foreground">{importFile?.name}</span>. Toda la base de datos actual se borrará y quedará igual que el archivo. Si tu cuenta no está en la copia, se cerrará tu sesión.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); importDatabase() }}>
            <label className="grid gap-1.5 text-sm">
              <span>Para confirmar, escribe <span className="font-bold">{info?.importConfirmation}</span></span>
              <Input autoFocus value={importConfirmation} onChange={(event) => setImportConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" disabled={importing} onClick={() => setImportOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={importing || !info?.importConfirmation || importConfirmation.trim().toUpperCase() !== info.importConfirmation}>
                {importing ? 'Importando…' : 'Sí, importar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(next) => { if (!cleaning) setConfirmOpen(next) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" /> Confirmar limpieza</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer desde el sistema. Se eliminarán {selectedRows.toLocaleString('es-PE')} registros de:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {selectedGroups.map((group) => <li key={group.key}>{group.label} <span className="text-muted-foreground">({group.total})</span></li>)}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(event) => { event.preventDefault(); clean() }}
          >
            <label className="grid gap-1.5 text-sm">
              <span>Para confirmar, escribe <span className="font-bold">{info?.confirmation}</span></span>
              <Input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" disabled={cleaning} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={cleaning || confirmation.trim().toUpperCase() !== info?.confirmation}>
                {cleaning ? 'Limpiando…' : 'Sí, limpiar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExportCard({ icon: Icon, title, text, busy, onClick }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4">
      <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{text}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClick}>{busy ? 'Generando…' : 'Descargar'}</Button>
      </div>
    </div>
  )
}
