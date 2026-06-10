import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { downloadBlob, exportJson } from '../io/download'
import { exportDotLottie } from '../io/dotlottie'
import { exportGif } from '../io/exportGif'
import { exportWebM } from '../io/exportVideo'

type Format = 'json' | 'dotlottie' | 'gif' | 'webm'

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc)
  const fileName = useStore((s) => s.fileName)
  const [format, setFormat] = useState<Format>('json')
  const [gifScale, setGifScale] = useState(1)
  const [gifBg, setGifBg] = useState('#ffffff')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const doExport = async () => {
    setError(null)
    try {
      if (format === 'json') {
        exportJson(doc, fileName)
        onClose()
      } else if (format === 'dotlottie') {
        downloadBlob(exportDotLottie(doc), `${fileName}.lottie`)
        onClose()
      } else {
        const total = Math.max(1, Math.round(doc.op - doc.ip))
        if (total > 1800) {
          const ok = window.confirm(
            `This animation has ${total} frames — rendering may take several minutes. Continue?`,
          )
          if (!ok) return
        }
        const controller = new AbortController()
        abortRef.current = controller
        setBusy(true)
        const opts = {
          scale: gifScale,
          bg: gifBg,
          signal: controller.signal,
          onProgress: (done: number, t: number) => setProgress(done / t),
        }
        const blob =
          format === 'gif' ? await exportGif(doc, opts) : await exportWebM(doc, opts)
        downloadBlob(blob, `${fileName}.${format === 'gif' ? 'gif' : 'webm'}`)
        setBusy(false)
        onClose()
      }
    } catch (e) {
      setBusy(false)
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Export failed.')
    }
  }

  const cancel = () => {
    if (busy) {
      abortRef.current?.abort()
      setBusy(false)
    } else {
      onClose()
    }
  }

  const options: { id: Format; title: string; desc: string }[] = [
    {
      id: 'json',
      title: 'Lottie JSON (.json)',
      desc: 'The standard format. Works with lottie-web, iOS, Android, React Native…',
    },
    {
      id: 'dotlottie',
      title: 'dotLottie (.lottie)',
      desc: 'Zipped Lottie — smaller file, same animation.',
    },
    {
      id: 'gif',
      title: 'GIF',
      desc: 'Rendered frame-by-frame in your browser. Great for previews and chats.',
    },
    {
      id: 'webm',
      title: 'WebM video',
      desc: 'Recorded in your browser in real time. Great for social media and editing.',
    },
  ]

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export “{doc.nm ?? fileName}”</h2>
        <div className="tagline">
          ✓ Unlimited · ✓ No watermark · ✓ No account · ✓ Nothing leaves your browser
        </div>

        <div className="fmt-options">
          {options.map((o) => (
            <label key={o.id} className={`fmt-option${format === o.id ? ' active' : ''}`}>
              <input
                type="radio"
                name="fmt"
                checked={format === o.id}
                onChange={() => setFormat(o.id)}
              />
              <span>
                <b>{o.title}</b>
                <div className="desc">{o.desc}</div>
              </span>
            </label>
          ))}
        </div>

        {(format === 'gif' || format === 'webm') && (
          <div className="gif-opts">
            <label>
              Scale
              <select value={gifScale} onChange={(e) => setGifScale(Number(e.target.value))}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <label>
              Background
              <input type="color" value={gifBg} onChange={(e) => setGifBg(e.target.value)} />
            </label>
          </div>
        )}

        {busy && (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {error && <div className="export-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={cancel}>Cancel</button>
          <button className="primary" onClick={doExport} disabled={busy}>
            {busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
