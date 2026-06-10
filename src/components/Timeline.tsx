import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { hasKeyframeAt, isAnimated, keyframeTimes } from '../lottie/props'
import { EASING_NAMES } from '../lottie/easing'
import type { EasingName, LottieLayer, TransformKey } from '../types/lottie'

const TKEYS: { key: TransformKey; label: string }[] = [
  { key: 'p', label: 'Position' },
  { key: 's', label: 'Scale' },
  { key: 'r', label: 'Rotation' },
  { key: 'o', label: 'Opacity' },
]

function pickTickStep(span: number): number {
  for (const c of [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600]) {
    if (span / c <= 12) return c
  }
  return 1200
}

export default function Timeline() {
  const doc = useStore((s) => s.doc)
  const currentFrame = useStore((s) => s.currentFrame)
  const playing = useStore((s) => s.playing)
  const selectedInd = useStore((s) => s.selectedInd)
  const defaultEasing = useStore((s) => s.defaultEasing)
  const rulerRef = useRef<HTMLDivElement>(null)

  const span = Math.max(1, doc.op - doc.ip)
  const pct = (t: number) => `${((t - doc.ip) / span) * 100}%`

  const scrubTo = (clientX: number) => {
    const el = rulerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const t = doc.ip + ((clientX - r.left) / Math.max(1, r.width)) * span
    useStore.getState().setFrame(t)
  }

  const onRulerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const st = useStore.getState()
    st.setPlaying(false)
    scrubTo(e.clientX)
    const move = (ev: PointerEvent) => scrubTo(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onDiamondClick = (
    e: React.MouseEvent,
    layer: LottieLayer,
    t: number,
    key: TransformKey | null,
  ) => {
    e.stopPropagation()
    const st = useStore.getState()
    st.setPlaying(false)
    st.selectLayer(layer.ind)
    st.setFrame(t)
    // Alt+click on a property diamond deletes that keyframe.
    if (e.altKey && key) st.toggleKeyframe(layer.ind, key)
  }

  /** Property-row diamonds support horizontal dragging to retime keyframes;
   *  a plain click keeps the jump/alt-delete behavior. */
  const onDiamondDown = (
    e: React.PointerEvent,
    layer: LottieLayer,
    t0: number,
    key: TransformKey,
  ) => {
    e.stopPropagation()
    e.preventDefault()
    const st = useStore.getState()
    st.setPlaying(false)
    st.selectLayer(layer.ind)
    const el = rulerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let cur = t0
    let moved = false
    let snapshotted = false
    const move = (ev: PointerEvent) => {
      const frame = Math.round(doc.ip + ((ev.clientX - r.left) / Math.max(1, r.width)) * span)
      const clamped = Math.max(doc.ip, Math.min(frame, doc.op))
      if (clamped === cur) return
      moved = true
      if (!snapshotted) {
        snapshotted = true
        useStore.getState().beginEdit()
      }
      useStore.getState().moveKeyframe(layer.ind, key, cur, clamped, false)
      // The move is refused when another keyframe occupies the target frame;
      // only advance our cursor if the keyframe actually left `cur`.
      const now = useStore.getState().doc.layers.find((l) => l.ind === layer.ind)
      if (now && !hasKeyframeAt(now.ks?.[key], cur)) {
        cur = clamped
        useStore.getState().setFrame(clamped)
      }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!moved) {
        useStore.getState().setFrame(t0)
        if (ev.altKey) useStore.getState().toggleKeyframe(layer.ind, key)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ticks: number[] = []
  const step = pickTickStep(span)
  for (let t = doc.ip; t <= doc.op; t += step) ticks.push(t)

  const rows: { layer: LottieLayer; sub: { key: TransformKey; label: string }[] }[] =
    doc.layers.map((layer) => ({
      layer,
      sub:
        layer.ind === selectedInd
          ? TKEYS.filter(({ key }) => isAnimated(layer.ks?.[key]))
          : [],
    }))

  return (
    <div className="timeline">
      <div className="transport">
        <button
          className="icon"
          title="Play / Pause (Space)"
          onClick={() => useStore.getState().setPlaying(!playing)}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="frame-display">
          frame <b>{Math.round(currentFrame)}</b> / {doc.op} · {(doc.op / doc.fr).toFixed(2)}s @
          {doc.fr}fps
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-dim)' }}>New keyframe easing</span>
        <select
          value={defaultEasing}
          onChange={(e) => useStore.getState().setDefaultEasing(e.target.value as EasingName)}
        >
          {EASING_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="tl-body">
        <div className="tl-names">
          <div style={{ height: 26, borderBottom: '1px solid var(--border)' }} />
          {rows.map(({ layer, sub }) => (
            <div key={layer.ind}>
              <div
                className={`tl-name-row${layer.ind === selectedInd ? ' selected' : ''}`}
                onClick={() => useStore.getState().selectLayer(layer.ind)}
              >
                {layer.nm}
              </div>
              {sub.map(({ key, label }) => (
                <div key={key} className="tl-name-row subrow selected">
                  {label}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="tl-tracks">
          <div className="tl-ruler" ref={rulerRef} onPointerDown={onRulerDown}>
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: pct(t) }}>
                <span>{t}</span>
              </div>
            ))}
          </div>

          {rows.map(({ layer, sub }) => {
            const aggregate = Array.from(
              new Set(
                TKEYS.flatMap(({ key }) => keyframeTimes(layer.ks?.[key])).map((t) =>
                  Math.round(t),
                ),
              ),
            )
            return (
              <div key={layer.ind}>
                <div className="tl-track-row">
                  <div
                    className="layer-bar"
                    style={{
                      left: pct(Math.max(layer.ip, doc.ip)),
                      width: `${(Math.max(0, Math.min(layer.op, doc.op) - Math.max(layer.ip, doc.ip)) / span) * 100}%`,
                    }}
                  />
                  {aggregate.map((t) => (
                    <div
                      key={t}
                      className="kf-diamond"
                      style={{ left: pct(t) }}
                      title={`frame ${t}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => onDiamondClick(e, layer, t, null)}
                    />
                  ))}
                </div>
                {sub.map(({ key }) => (
                  <div key={key} className="tl-track-row subrow">
                    {keyframeTimes(layer.ks?.[key]).map((t) => (
                      <div
                        key={t}
                        className="kf-diamond"
                        style={{ left: pct(t) }}
                        title={`frame ${Math.round(t)} · drag to retime · alt+click to delete`}
                        onPointerDown={(e) => onDiamondDown(e, layer, Math.round(t), key)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )
          })}

          <div className="playhead" style={{ left: pct(currentFrame) }} />
        </div>
      </div>
    </div>
  )
}
