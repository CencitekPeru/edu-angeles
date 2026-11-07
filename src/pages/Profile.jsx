import { useState } from 'react'
import { BadgeCheck, Camera, CheckCircle2, Clock, IdCard, Info, Mail, Save, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SCHOOL } from '../lib/school'
import { ROLE_LABEL, isStaff } from '../lib/permissions'
import { Avatar } from '../components/ui'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, Pill } from './campus/kit'

const maskDni = (dni) => (dni ? `${'•'.repeat(Math.max(0, dni.length - 3))}${dni.slice(-3)}` : '—')

export default function ProfilePage() {
  const { user, requests, updateProfile, updateProfilePhoto, toast } = useApp()
  const admin = isStaff(user)
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', dni: user.dni || '' })
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)

  const dirty = form.name !== (user.name || '') || form.email !== (user.email || '') || form.dni !== (user.dni || '')
  const valid = form.dni.length === 8 && form.name.trim().length >= 5 && form.email.trim()

  // Admins see the institution's reservation workload; teachers see their own requests.
  const scope = admin ? requests : requests.filter((item) => item.teacherId === user.id)
  const count = (status) => scope.filter((item) => item.status === status).length

  async function uploadPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('La foto debe estar en formato JPG, PNG o WebP.', 'bad')
    if (file.size > 6 * 1024 * 1024) return toast('La foto no debe superar los 6 MB.', 'bad')
    setPhotoLoading(true)
    const result = await updateProfilePhoto(file)
    setPhotoLoading(false)
    if (!result.ok) return toast(result.error || 'No se pudo subir la foto.', 'bad')
    toast('Foto de perfil actualizada.')
  }

  async function save(event) {
    event.preventDefault()
    setLoading(true)
    const result = await updateProfile(form)
    setLoading(false)
    if (!result.ok) return toast(result.error || 'No se pudo actualizar el perfil.', 'bad')
    setForm({ name: result.user.name, email: result.user.email, dni: result.user.dni || '' })
    toast('Perfil actualizado.')
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={UserRound} title="Mi perfil" description="Consulta y actualiza los datos de tu cuenta institucional." />

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,4fr)_minmax(0,8fr)]">
        {/* Identity card */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="h-24 bg-gradient-to-r from-[#0b1730] to-[#1e3a8a]" />
          <div className="-mt-12 flex flex-col items-center px-6 pb-6 text-center">
            <div className="relative">
              <div className="rounded-full border-4 border-card bg-card shadow-md">
                <Avatar name={user.name} image={user.profilePhoto} size="xl" className="size-24 [&>span]:text-2xl" />
              </div>
              <label className="absolute bottom-1 right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow hover:bg-primary/90" title="Cambiar foto">
                <Camera className="size-4" aria-hidden="true" />
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={photoLoading} aria-label="Subir foto de perfil" />
              </label>
            </div>
            <h2 className="mt-3 text-lg font-extrabold text-foreground">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Pill value={ROLE_LABEL[user.role] || 'Docente'} />
              {!admin && user.subject && <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-foreground">{user.subject}</span>}
            </div>
            {photoLoading && <p className="mt-2 text-xs text-muted-foreground">Subiendo foto…</p>}
          </div>

          <dl className="divide-y divide-border border-t border-border text-sm">
            {[
              [ShieldCheck, 'Rol', { admin: 'Coordinador de Innovación y Soporte Tecnológico', director: 'Dirección (solo consulta)', auxiliar: 'Auxiliar de educación (asistencia)', psicologo: 'Psicología (atención psicológica)' }[user.role] || 'Docente'],
              [Mail, 'Correo', user.email],
              [IdCard, 'DNI', maskDni(user.dni)],
              [BadgeCheck, 'Institución', `${SCHOOL.name} · ${SCHOOL.place}`],
            ].map(([Icon, label, value]) => (
              <div key={label} className="flex items-start gap-3 px-5 py-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <dt className="w-24 shrink-0 font-semibold text-foreground">{label}</dt>
                <dd className="min-w-0 break-words text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-5">
          {/* Activity summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [Clock, count('pending'), admin ? 'Solicitudes por revisar' : 'Solicitudes pendientes', 'bg-[#b7832f]'],
              [CheckCircle2, count('approved'), admin ? 'Reservas aprobadas' : 'Reservas aprobadas', 'bg-[#3f7d5c]'],
              [XCircle, count('rejected'), 'Solicitudes rechazadas', 'bg-[#b4413c]'],
            ].map(([Icon, value, label, dot]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
                <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-primary dark:bg-muted"><Icon className="size-5" /></span>
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{value}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-1.5 rounded-full', dot)} />{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Edit form */}
          <Panel title="Datos personales" icon={UserRound}>
            <form className="space-y-5" onSubmit={save}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2" label="Nombre completo *">
                  <Input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={5} />
                </Field>
                <Field label="Correo electrónico *" hint="Lo usas para iniciar sesión.">
                  <Input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                </Field>
                <Field label="DNI *" hint="8 dígitos. Es tu clave de acceso.">
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.dni}
                    onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, '').slice(0, 8) })}
                    minLength={8}
                    maxLength={8}
                    pattern="[0-9]{8}"
                    placeholder="8 dígitos"
                    required
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">{dirty ? 'Tienes cambios sin guardar.' : 'Tus datos están actualizados.'}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={!dirty || loading} onClick={() => setForm({ name: user.name || '', email: user.email || '', dni: user.dni || '' })}>Descartar</Button>
                  <Button type="submit" disabled={loading || !dirty || !valid}><Save /> {loading ? 'Guardando…' : 'Guardar cambios'}</Button>
                </div>
              </div>
            </form>
          </Panel>

          <Panel title="Acceso y seguridad" icon={ShieldCheck}>
            <ul className="space-y-3 text-sm text-foreground/85">
              <li className="flex gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /> Inicias sesión con tu <b>correo institucional</b> y tu <b>DNI</b>. Si cambias alguno, úsalo en tu próximo ingreso.</li>
              <li className="flex gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /> No compartas tus datos de acceso. Cierra sesión al usar una computadora compartida.</li>
              <li className="flex gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /> La foto de perfil admite JPG, PNG o WebP de hasta 6 MB.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
