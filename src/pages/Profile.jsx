import { useState } from 'react'
import { Camera } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export default function ProfilePage() {
  const { user, updateProfile, updateProfilePhoto, toast } = useApp()
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email || '')
  const [dni, setDni] = useState(user.dni || '')
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)

  async function uploadPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('La foto debe estar en formato JPG, PNG o WebP.', 'bad')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      toast('La foto no debe superar los 6 MB.', 'bad')
      return
    }
    setPhotoLoading(true)
    const result = await updateProfilePhoto(file)
    setPhotoLoading(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo subir la foto.', 'bad')
      return
    }
    toast('Foto de perfil actualizada.')
  }

  async function save(event) {
    event.preventDefault()
    setLoading(true)
    const result = await updateProfile({ name, email, dni })
    setLoading(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo actualizar el perfil.', 'bad')
      return
    }
    setName(result.user.name)
    setEmail(result.user.email)
    setDni(result.user.dni || '')
    toast('Perfil actualizado.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Cuenta <span className="mx-1">›</span> Perfil</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Mi perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Actualiza tu nombre, correo institucional y DNI de acceso.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-4">
          <Avatar name={user.name} image={user.profilePhoto} size="lg" />
          <div className="space-y-1">
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
            <Badge variant="outline">{user.role === 'admin' ? 'Coordinación' : user.subject || 'Docente'}</Badge>
          </div>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
            <Camera className="size-4" aria-hidden="true" />
            {photoLoading ? 'Subiendo…' : 'Cambiar foto'}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={uploadPhoto}
              disabled={photoLoading}
              aria-label="Subir foto de perfil"
            />
          </label>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:max-w-xl" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Nombre completo *">
                <Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={5} />
              </Field>
              <Field className="sm:col-span-2" label="Correo electrónico *">
                <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </Field>
              <Field className="sm:col-span-2" label="DNI *" hint="Debe tener exactamente 8 dígitos. Se utiliza para iniciar sesión.">
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={dni}
                  onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  minLength={8}
                  maxLength={8}
                  pattern="[0-9]{8}"
                  placeholder="8 dígitos"
                  required
                />
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={loading || dni.length !== 8 || name.trim().length < 5 || !email.trim()}>
                {loading ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
