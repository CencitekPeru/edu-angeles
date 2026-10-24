import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useApp } from '../context/AppContext'

export function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[80] flex w-[min(100%-2rem,22rem)] flex-col gap-2">
      {toasts.map((item) => {
        const bad = item.tone === 'bad'
        const Icon = bad ? AlertTriangle : CheckCircle2
        return (
          <div
            key={item.id}
            role="status"
            className="toast-card pointer-events-auto overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                  bad
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <Icon className="size-4" />
              </span>
              <p className="flex-1 pt-0.5 text-xs font-semibold leading-relaxed text-foreground">
                {item.message}
              </p>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => dismissToast(item.id)}
                aria-label="Cerrar aviso"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className={`toast-life h-0.5 origin-left ${bad ? 'bg-rose-500' : 'bg-primary'}`} />
          </div>
        )
      })}
    </div>
  )
}
