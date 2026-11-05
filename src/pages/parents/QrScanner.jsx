import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, ImageUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

function decodeFromCanvas(canvas, source, width, height) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  canvas.width = width
  canvas.height = height
  ctx.drawImage(source, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  return jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null
}

/** Camera QR reader (jsQR) with an image-upload fallback when no camera is available. */
export function QrScanner({ onCode, paused }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (state !== 'running') return undefined
    let stream
    let frame
    let cancelled = false
    const video = videoRef.current
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return }
        stream = media
        video.srcObject = media
        video.play()
        const tick = () => {
          if (cancelled) return
          if (!paused && video.readyState === video.HAVE_ENOUGH_DATA) {
            const scale = Math.min(1, 640 / video.videoWidth)
            const code = decodeFromCanvas(canvasRef.current, video, Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale))
            if (code) onCode(code)
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      })
      .catch(() => {
        setState('idle')
        setMessage('No se pudo usar la cámara. Revisa los permisos del navegador o sube una foto del carné.')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [state, paused, onCode])

  async function fromFile(file) {
    if (!file) return
    setMessage('')
    const url = URL.createObjectURL(file)
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = reject
        element.src = url
      })
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const code = decodeFromCanvas(canvasRef.current, image, Math.round(image.width * scale), Math.round(image.height * scale))
      if (code) onCode(code)
      else setMessage('No se encontró un código QR en la imagen. Intenta con una foto más nítida.')
    } catch {
      setMessage('No se pudo leer la imagen.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-slate-950">
        <video ref={videoRef} playsInline muted className={state === 'running' ? 'size-full object-cover' : 'hidden'} />
        {state === 'running' ? (
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            <Camera className="size-12" strokeWidth={1.4} />
            <p className="text-sm">Escanea el código QR del carné de tu hijo para ver su asistencia reciente.</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="grid grid-cols-2 gap-2">
        {state === 'running' ? (
          <Button type="button" variant="outline" onClick={() => setState('idle')}>Detener cámara</Button>
        ) : (
          <Button type="button" onClick={() => { setMessage(''); setState('running') }} disabled={!cameraAvailable}><Camera /> Usar cámara</Button>
        )}
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
          <ImageUp className="size-4" /> Subir foto
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { fromFile(event.target.files?.[0]); event.target.value = '' }} />
        </label>
      </div>
      {!cameraAvailable && <p className="text-xs text-muted-foreground">La cámara solo está disponible en conexiones seguras (https). Puedes subir una foto del carné.</p>}
      {message && <p className="text-xs font-medium text-destructive" role="alert">{message}</p>}
    </div>
  )
}
