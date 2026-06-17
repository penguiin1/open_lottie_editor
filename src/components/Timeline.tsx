import { useRef } from 'react'
import { getAtPath, layersFor, useStore } from '../store/useStore'
import { hasKeyframeAt, isAnimated, keyframeTimes } from '../lottie/props'
import { EASING_NAMES } from '../lottie/easing'
import type { EasingName, LottieLayer, TransformKey } from '../types/lottie'

/** One draggable keyframe row under the selected layer (transform or trim). */
interface SubEntry {
  id: string
  label: string
  times: number[]
  move: (from: number, to: number) => void
  freshProp: () => any
  toggleAtCurrent: () => void
}

const TRIM_LABELS: ['s' | 'e' | 'o', string][] = [
  ['s', 'Trim start'],
  ['e', 'Trim end'],
  ['o', 'Trim offset'],
]

function trimIndex(layer: LottieLayer): number {
  return Array.isArray(layer.shapes)
    ? layer.shapes.findIndex((it: any) => it?.ty === 'tm')
    : -1
}

const TKEYS: { key: TransformKey; label: string }[] = [
  { key: 'p', label: 'Position' },
  { key: 'a', label: 'Anchor' },
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
  const compId = useStore((s) => s.compId)
  const rulerRef = useRef<HTMLDivElement>(null)
  const activeLayers = layersFor(doc, compId)

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
    entry: SubEntry,
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
      entry.move(cur, clamped)
      // The move is refused when another keyframe occupies the target frame;
      // only advance our cursor if the keyframe actually left `cur`.
      if (!hasKeyframeAt(entry.freshProp(), cur)) {
        cur = clamped
        useStore.getState().setFrame(clamped)
      }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!moved) {
        useStore.getState().setFrame(t0)
        if (ev.altKey) entry.toggleAtCurrent()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const buildSub = (layer: LottieLayer): SubEntry[] => {
    if (layer.ind !== selectedInd) return []
    const entries: SubEntry[] = []
    for (const { key, label } of TKEYS) {
      const prop = layer.ks?.[key]
      if (!isAnimated(prop)) continue
      entries.push({
        id: key,
        label,
        times: keyframeTimes(prop),
        move: (from, to) => useStore.getState().moveKeyframe(layer.ind, key, from, to, false),
        freshProp: () => {
          const st = useStore.getState()
          return layersFor(st.doc, st.compId).find((l) => l.ind === layer.ind)?.ks?.[key]
        },
        toggleAtCurrent: () => useStore.getState().toggleKeyframe(layer.ind, key),
      })
    }
    const ti = trimIndex(layer)
    if (ti >= 0) {
      for (const [p, label] of TRIM_LABELS) {
        const prop = (layer.shapes as any[])[ti]?.[p]
        if (!isAnimated(prop)) continue
        const path = ['shapes', ti, p]
        entries.push({
          id: `tm-${p}`,
          label,
          times: keyframeTimes(prop),
          move: (from, to) =>
            useStore.getState().movePathKeyframe(layer.ind, path, from, to, false),
          freshProp: () => {
            const st = useStore.getState()
            return getAtPath(
              layersFor(st.doc, st.compId).find((l) => l.ind === layer.ind),
              path,
            )
          },
          toggleAtCurrent: () => useStore.getState().togglePathKeyframe(layer.ind, path),
        })
      }
    }
    return entries
  }

  const ticks: number[] = []
  const step = pickTickStep(span)
  for (let t = doc.ip; t <= doc.op; t += step) ticks.push(t)

  const rows: { layer: LottieLayer; sub: SubEntry[] }[] = activeLayers.map((layer) => ({
    layer,
    sub: buildSub(layer),
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
              {sub.map((entry) => (
                <div key={entry.id} className="tl-name-row subrow selected">
                  {entry.label}
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
            {(doc.markers ?? []).map((m: any, i: number) => (
              <div
                key={`m${i}`}
                className="ruler-marker"
                style={{
                  left: pct(m.tm),
                  width: `${(Math.max(0, Math.min(m.tm + m.dr, doc.op) - m.tm) / span) * 100}%`,
                }}
                title={`${m.cm} · ${m.tm}–${m.tm + m.dr}`}
              >
                <span>{m.cm}</span>
              </div>
            ))}
          </div>

          {rows.map(({ layer, sub }) => {
            const ti = trimIndex(layer)
            const trimTimes =
              ti >= 0
                ? TRIM_LABELS.flatMap(([p]) => keyframeTimes((layer.shapes as any[])[ti]?.[p]))
                : []
            const aggregate = Array.from(
              new Set(
                [...TKEYS.flatMap(({ key }) => keyframeTimes(layer.ks?.[key])), ...trimTimes].map(
                  (t) => Math.round(t),
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
                {sub.map((entry) => (
                  <div key={entry.id} className="tl-track-row subrow">
                    {entry.times.map((t) => (
                      <div
                        key={t}
                        className="kf-diamond"
                        style={{ left: pct(t) }}
                        title={`frame ${Math.round(t)} · drag to retime · alt+click to delete`}
                        onPointerDown={(e) => onDiamondDown(e, layer, Math.round(t), entry)}
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
