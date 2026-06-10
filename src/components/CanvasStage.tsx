import { useEffect, useRef, useState } from 'react'
import lottie, { type AnimationItem } from 'lottie-web'
import { useStore } from '../store/useStore'
import { getValue } from '../lottie/props'
import { getPathVertices, type PenPoint } from '../lottie/path'

function draftPathD(points: PenPoint[], scale: number): string {
  if (points.length === 0) return ''
  const n = (v: number) => (v * scale).toFixed(1)
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const c1x = a.x + (a.outTan?.[0] ?? 0)
    const c1y = a.y + (a.outTan?.[1] ?? 0)
    const c2x = b.x + (b.inTan?.[0] ?? 0)
    const c2y = b.y + (b.inTan?.[1] ?? 0)
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(b.x)} ${n(b.y)}`
  }
  return d
}

export default function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<AnimationItem | null>(null)
  const doc = useStore((s) => s.doc)
  const playing = useStore((s) => s.playing)
  const currentFrame = useStore((s) => s.currentFrame)
  const selectedInd = useStore((s) => s.selectedInd)
  const tool = useStore((s) => s.tool)
  const [stageSize, setStageSize] = useState({ w: 512, h: 512 })
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState<PenPoint[]>([])
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // Mirror of `draft` for event handlers — committing a layer inside a
  // setState updater would double-fire under React StrictMode.
  const draftRef = useRef<PenPoint[]>([])
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const scale = stageSize.w / doc.w
  const selLayer = doc.layers.find((l) => l.ind === selectedInd)
  const selName = selLayer?.nm
  const pathVerts = tool === 'select' && selLayer ? getPathVertices(selLayer) : null

  // Fit the stage to the available area, preserving the comp's aspect ratio.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const pad = 56
      const aw = Math.max(80, el.clientWidth - pad)
      const ah = Math.max(80, el.clientHeight - pad)
      const sc = Math.min(aw / doc.w, ah / doc.h, 1.5)
      setStageSize({ w: Math.round(doc.w * sc), h: Math.round(doc.h * sc) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc.w, doc.h])

  // (Re)load the lottie-web instance whenever the document changes.
  // Debounced slightly so canvas drags don't reload on every pointermove.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const host = hostRef.current
      if (!host) return
      animRef.current?.destroy()
      animRef.current = null
      const anim = lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        // lottie-web mutates animationData, so hand it a deep copy
        animationData: JSON.parse(JSON.stringify(doc)),
      })
      anim.addEventListener('enterFrame', () => {
        const st = useStore.getState()
        if (st.playing) st.setFrame(anim.currentFrame + (doc.ip ?? 0))
      })
      const st = useStore.getState()
      anim.goToAndStop(Math.max(0, st.currentFrame - (doc.ip ?? 0)), true)
      if (st.playing) anim.play()
      animRef.current = anim
    }, 30)
    return () => window.clearTimeout(id)
  }, [doc])

  useEffect(() => () => animRef.current?.destroy(), [])

  // Play / pause.
  useEffect(() => {
    const anim = animRef.current
    if (!anim) return
    if (playing) anim.play()
    else anim.pause()
  }, [playing])

  // Scrubbing while paused.
  useEffect(() => {
    const anim = animRef.current
    if (!anim || playing) return
    anim.goToAndStop(Math.max(0, currentFrame - (doc.ip ?? 0)), true)
  }, [currentFrame, playing, doc.ip])

  // Pen mode keyboard: Enter commits an open path, Escape cancels.
  useEffect(() => {
    if (tool !== 'pen') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Enter') {
        const d = draftRef.current
        if (d.length >= 2) useStore.getState().addPenLayer(d, false)
        setDraft([])
      } else if (e.key === 'Escape') {
        setDraft([])
        useStore.getState().setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool])

  // Leaving pen mode discards the draft.
  useEffect(() => {
    if (tool !== 'pen') {
      setDraft([])
      setCursor(null)
    }
  }, [tool])

  const toComp = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const onPenDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    const pt = toComp(e, el)

    // Clicking near the first point (≥3 points placed) closes the path.
    if (draft.length >= 3) {
      const first = draft[0]
      const distPx = Math.hypot((first.x - pt.x) * scale, (first.y - pt.y) * scale)
      if (distPx < 10) {
        useStore.getState().addPenLayer(draft, true)
        setDraft([])
        return
      }
    }

    const index = draft.length
    setDraft((d) => [...d, { x: pt.x, y: pt.y }])

    // Dragging before release shapes smooth tangents for the new point.
    const move = (ev: PointerEvent) => {
      const cur = toComp(ev, el)
      const tx = cur.x - pt.x
      const ty = cur.y - pt.y
      if (Math.hypot(tx * scale, ty * scale) < 3) return
      setDraft((d) =>
        d.map((p, i) => (i === index ? { ...p, outTan: [tx, ty], inTan: [-tx, -ty] } : p)),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onPenDoubleClick = () => {
    // The double-click's second press added a duplicate point — drop it.
    const pts = draftRef.current.slice(0, -1)
    if (pts.length >= 2) useStore.getState().addPenLayer(pts, false)
    setDraft([])
  }

  const onSelectDown = (e: React.PointerEvent) => {
    const st = useStore.getState()
    if (st.selectedInd == null) return
    const ind = st.selectedInd
    const layer = st.doc.layers.find((l) => l.ind === ind)
    if (!layer || !layer.ks?.p) return
    e.preventDefault()
    st.setPlaying(false)
    setDragging(true)
    const startX = e.clientX
    const startY = e.clientY
    const startP = getValue(layer.ks.p, st.currentFrame)
    // Snapshot lazily on the first real movement — a plain click must not
    // push a no-op history entry (which would wipe the redo stack).
    let snapshotted = false
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale
      const dy = (ev.clientY - startY) / scale
      if (!snapshotted) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return
        snapshotted = true
        useStore.getState().beginEdit()
      }
      useStore
        .getState()
        .setTransformValue(ind, 'p', [startP[0] + dx, (startP[1] ?? 0) + dy, startP[2] ?? 0], false)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onVertexDown = (e: React.PointerEvent, vi: number) => {
    e.stopPropagation()
    e.preventDefault()
    const st = useStore.getState()
    if (st.selectedInd == null) return
    const ind = st.selectedInd
    const overlay = (e.currentTarget as SVGElement).closest('.stage') as HTMLElement
    st.setPlaying(false)
    let snapshotted = false
    const move = (ev: PointerEvent) => {
      if (!snapshotted) {
        snapshotted = true
        useStore.getState().beginEdit()
      }
      const pt = toComp(ev, overlay)
      useStore.getState().movePathVertex(ind, vi, pt.x, pt.y, false)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const penHint =
    draft.length === 0
      ? 'Pen: click to add points · drag for curves'
      : 'Pen: double-click or Enter to finish · click first point to close · Esc to cancel'

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="stage" style={{ width: stageSize.w, height: stageSize.h }}>
        <div className="lottie-host" ref={hostRef} style={{ width: '100%', height: '100%' }} />

        <div
          className={`drag-overlay${dragging ? ' dragging' : ''}${tool === 'pen' ? ' pen' : ''}`}
          onPointerDown={tool === 'pen' ? onPenDown : onSelectDown}
          onDoubleClick={tool === 'pen' ? onPenDoubleClick : undefined}
          onPointerMove={
            tool === 'pen'
              ? (e) => setCursor(toComp(e, e.currentTarget as HTMLElement))
              : undefined
          }
          title={
            tool === 'pen'
              ? penHint
              : selName
                ? `Drag to move "${selName}"`
                : 'Select a layer to move it'
          }
        />

        {(tool === 'pen' || pathVerts) && (
          <svg className="editing-overlay" width={stageSize.w} height={stageSize.h}>
            {tool === 'pen' && draft.length > 0 && (
              <>
                <path d={draftPathD(draft, scale)} className="draft-path" />
                {cursor && (
                  <line
                    x1={draft[draft.length - 1].x * scale}
                    y1={draft[draft.length - 1].y * scale}
                    x2={cursor.x * scale}
                    y2={cursor.y * scale}
                    className="draft-rubber"
                  />
                )}
                {draft.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x * scale}
                    cy={p.y * scale}
                    r={i === 0 ? 5 : 3.5}
                    className={i === 0 ? 'draft-vertex first' : 'draft-vertex'}
                  />
                ))}
              </>
            )}
            {pathVerts?.map((v, i) => (
              <circle
                key={i}
                cx={v.x * scale}
                cy={v.y * scale}
                r={5}
                className="path-vertex"
                onPointerDown={(e) => onVertexDown(e, i)}
              />
            ))}
          </svg>
        )}

        {tool === 'pen' ? (
          <div className="sel-badge">{penHint}</div>
        ) : (
          selName && (
            <div className="sel-badge">
              {selName} — drag canvas to move{pathVerts ? ' · drag dots to edit path' : ''}
            </div>
          )
        )}
      </div>
    </div>
  )
}
