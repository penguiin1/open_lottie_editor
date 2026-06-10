import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { importAnyFile } from '../io/dotlottie'
import { SAMPLES } from '../samples/samples'

export default function Toolbar({ onExport }: { onExport: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const newDoc = useStore((s) => s.newDoc)
  const loadDoc = useStore((s) => s.loadDoc)
  const addShapeLayer = useStore((s) => s.addShapeLayer)
  const addTextLayer = useStore((s) => s.addTextLayer)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { doc, name } = await importAnyFile(file)
      loadDoc(doc, name)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open this file.')
    }
  }

  return (
    <div className="toolbar">
      <div className="brand">
        <h1>OpenLottie Studio</h1>
        <span className="free-chip">free forever · no watermark</span>
      </div>

      <button onClick={newDoc}>New</button>
      <button onClick={() => fileRef.current?.click()}>Open…</button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.lottie,application/json"
        style={{ display: 'none' }}
        onChange={onFile}
      />
      <select
        value=""
        onChange={(e) => {
          const s = SAMPLES.find((x) => x.name === e.target.value)
          if (s) loadDoc(s.make(), s.name.toLowerCase().replace(/\s+/g, '-'))
        }}
      >
        <option value="" disabled>
          Samples…
        </option>
        {SAMPLES.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="sep" />

      <button onClick={() => addShapeLayer('rect')}>▢ Rect</button>
      <button onClick={() => addShapeLayer('ellipse')}>◯ Ellipse</button>
      <button onClick={() => addShapeLayer('star')}>✦ Star</button>
      <button onClick={addTextLayer}>T Text</button>
      <button
        className={tool === 'pen' ? 'tool-active' : ''}
        title="Pen tool — click on canvas to add points, double-click to finish, Esc to cancel"
        onClick={() => setTool(tool === 'pen' ? 'select' : 'pen')}
      >
        ✎ Pen
      </button>

      <div className="sep" />

      <button className="icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        ↶
      </button>
      <button className="icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        ↷
      </button>

      <div className="spacer" />

      <button className="primary" onClick={onExport}>
        Export
      </button>
    </div>
  )
}
