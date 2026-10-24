import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export default function ProfilePage() {
  const { user, updateProfile, toast } = useApp()
  const [dni, setDni] = useState(user.dni || '')
  const [loading, setLoading] = useState(false)

  async function save(event) {
    event.preventDefault()
    setLoading(true)
    const result = await updateProfile(dni)
    setLoading(false)
    if (!result.ok) {
      toast(result.error || 'No se pudo actualizar el DNI.', 'bad')
      return
    }
    toast('Perfil actualizado.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Cuenta <span className="mx-1">›</span> Perfil</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Mi perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta tus datos y registra el DNI que usarás para iniciar sesión.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar name={user.name} size="lg" />
          <div className="space-y-1">
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
            <Badge variant="outline">{user.role === 'admin' ? 'Coordinación' : user.subject || 'Docente'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:max-w-md" onSubmit={save}>
            <Field label="DNI *" hint="Debe tener exactamente 8 dígitos. Este será tu dato de acceso junto al correo.">
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
            <div>
              <Button type="submit" disabled={loading || dni.length !== 8}>
                {loading ? 'Guardando…' : 'Guardar DNI'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
