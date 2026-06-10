import lottie from 'lottie-web'
import type { LottieDoc } from '../types/lottie'

export interface ExportVideoOptions {
  scale?: number
  bg?: string
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Records the animation to a WebM video with MediaRecorder, fully
 * client-side. Recording runs in real time (MediaRecorder timestamps follow
 * the wall clock), so a 3s animation takes ~3s to export.
 */
export async function exportWebM(doc: LottieDoc, opts: ExportVideoOptions = {}): Promise<Blob> {
  const scale = opts.scale ?? 1
  const width = Math.round(doc.w * scale)
  const height = Math.round(doc.h * scale)
  const fps = Number.isFinite(doc.fr) && doc.fr > 0 ? doc.fr : 30

  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
  )
  if (!mime) throw new Error('This browser cannot record WebM video')

  const clone: LottieDoc = JSON.parse(JSON.stringify(doc))
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  document.body.appendChild(container)

  const anim = lottie.loadAnimation({
    container,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: clone,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  })

  let recorder: MediaRecorder | null = null
  try {
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      anim.addEventListener('DOMLoaded', done)
      anim.addEventListener('config_ready', done)
      setTimeout(done, 50)
    })
    anim.resize()

    const lottieCanvas = container.querySelector('canvas')
    if (!lottieCanvas) throw new Error('renderer failed')

    const composite = document.createElement('canvas')
    composite.width = width
    composite.height = height
    const ctx = composite.getContext('2d')
    if (!ctx) throw new Error('renderer failed')

    // captureStream(0) + manual requestFrame: only frames we draw are encoded.
    const stream = composite.captureStream(0)
    const track = stream.getVideoTracks()[0] as any
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve()
      recorder!.onerror = () => reject(new Error('Video recorder error'))
    })
    recorder.start()

    const total = Math.max(1, Math.round(doc.op - doc.ip))
    const frameMs = 1000 / fps
    for (let f = 0; f < total; f++) {
      if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      anim.goToAndStop(f, true) // relative to the animation's in-point
      ctx.fillStyle = opts.bg ?? '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(lottieCanvas, 0, 0, width, height)
      track.requestFrame?.()
      opts.onProgress?.(f + 1, total)
      await new Promise((r) => setTimeout(r, frameMs))
    }

    recorder.stop()
    await stopped
    return new Blob(chunks, { type: 'video/webm' })
  } finally {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // already stopping
      }
    }
    anim.destroy()
    container.remove()
  }
}
