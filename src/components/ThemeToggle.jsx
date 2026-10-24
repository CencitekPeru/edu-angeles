import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, themeIsDark } from '@/lib/theme'
import { Button } from '@/components/ui/button'

export function ThemeToggle({ className = '' }) {
  const [dark, setDark] = useState(() => themeIsDark())

  function toggle() {
    const next = !themeIsDark()
    applyTheme(next ? 'dark' : 'light')
    setDark(next)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={`rounded-full text-foreground hover:bg-muted ${className}`}
      onClick={toggle}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      {dark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-indigo-400" />}
    </Button>
  )
}
