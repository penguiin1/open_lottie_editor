import { useEffect, useRef, useState } from 'react'
import { layersFor, useStore, type BezierHandles, type MaskMode } from '../store/useStore'
import { getValue, hasKeyframeAt, isAnimated, keyframeTimes } from '../lottie/props'
import { EASINGS, EASING_NAMES } from '../lottie/easing'
import { FONTS, getTextStyle } from '../lottie/text'
import {
  findPaint,
  findStroke,
  getPaintInfo,
  isAnimatedGradient,
  type PaintInfo,
} from '../lottie/paint'
import EasingCurveEditor from './EasingCurveEditor'
import type { EasingName, TransformKey } from '../types/lottie'

function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  // Don't clobber in-progress typing with live playback values.
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])
  const commit = () => {
    let n = parseFloat(draft)
    if (!Number.isFinite(n)) {
      setDraft(String(value))
      return
    }
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    if (n !== value) onCommit(n)
    setDraft(String(n))
  }
  return (
    <input
      type="number"
      value={draft}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

const round1 = (n: number) => Math.round(n * 10) / 10

function rgbToHex(rgb: number[]): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`
}

function hexToRgb01(hex: string): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [1, 1, 1, 1]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

export default function PropertiesPanel() {
  const doc = useStore((s) => s.doc)
  const selectedInd = useStore((s) => s.selectedInd)
  const currentFrame = useStore((s) => s.currentFrame)
  const store = useStore.getState
  const colorEditing = useRef(false)
  // Defer the history snapshot until the curve actually changes — a bare
  // click on a handle must not wipe the redo stack.
  const curvePending = useRef(false)
  const [curveKey, setCurveKey] = useState<TransformKey | null>(null)
  const compId = useStore((s) => s.compId)
  const activeLayers = layersFor(doc, compId)

  const layer = activeLayers.find((l) => l.ind === selectedInd)

  if (!layer) {
    return (
      <div className="props">
        <div className="panel-title">Composition</div>
        <section>
          <div className="prop-row">
            <label className="k">Name</label>
            <input
              type="text"
              defaultValue={doc.nm ?? 'Untitled'}
              key={doc.nm}
              onBlur={(e) => store().setDocMeta({ nm: e.target.value || 'Untitled' })}
            />
          </div>
          <div className="prop-row">
            <label className="k">Size</label>
            <NumberField value={doc.w} min={16} max={4096} onCommit={(w) => store().setDocMeta({ w })} />
            <span style={{ color: 'var(--text-dim)' }}>×</span>
            <NumberField value={doc.h} min={16} max={4096} onCommit={(h) => store().setDocMeta({ h })} />
          </div>
          <div className="prop-row">
            <label className="k">FPS</label>
            <NumberField value={doc.fr} min={1} max={120} onCommit={(fr) => store().setDocMeta({ fr })} />
          </div>
          <div className="prop-row">
            <label className="k">Frames</label>
            <NumberField value={doc.op} min={1} max={9999} onCommit={(op) => store().setDocMeta({ op })} />
            <span style={{ color: 'var(--text-dim)' }}>{(doc.op / doc.fr).toFixed(2)}s</span>
          </div>
        </section>
        <div className="panel-title">Segments</div>
        <section>
          {(doc.markers ?? []).map((m: any, i: number) => (
            <div className="prop-row" key={i}>
              <input
                type="text"
                style={{ width: 90, flex: 1 }}
                key={`${i}-${m.cm}`}
                defaultValue={m.cm}
                onBlur={(e) =>
                  e.target.value.trim() && store().updateMarker(i, { name: e.target.value.trim() })
                }
              />
              <NumberField
                value={m.tm}
                min={0}
                max={doc.op}
                onCommit={(n) => store().updateMarker(i, { start: n, end: m.tm + m.dr })}
              />
              <NumberField
                value={m.tm + m.dr}
                min={0}
                max={doc.op}
                onCommit={(n) => store().updateMarker(i, { end: n })}
              />
              <button className="link-btn" title="Remove segment" onClick={() => store().removeMarker(i)}>
                ×
              </button>
            </div>
          ))}
          <div className="prop-row">
            <button
              onClick={() =>
                store().addMarker(`segment ${(doc.markers?.length ?? 0) + 1}`, currentFrame, doc.op)
              }
            >
              + Add segment at playhead
            </button>
          </div>
          <div className="hint" style={{ padding: '0 0 4px 2px' }}>
            Named frame ranges (Lottie markers). State machine states play these segments.
          </div>
        </section>

        <div className="hint">
          Select a layer to edit its transform and add keyframes. Tip: move the playhead, change a
          value, and a keyframe is created automatically once a property is animated (click ◇ to
          start animating it).
        </div>
      </div>
    )
  }

  const ind = layer.ind
  const paint = findPaint(layer)
  const pinfo: PaintInfo | null = paint ? getPaintInfo(paint) : null
  const stroke = findStroke(layer)
  const strokeColor = stroke?.c ? getValue(stroke.c, currentFrame) : null
  const strokeWidth = stroke?.w ? getValue(stroke.w, currentFrame)[0] : null
  const textStyle = layer.ty === 5 ? getTextStyle(layer) : null
  const s0: any = layer.shapes?.[0]
  const tmIdx =
    layer.ty === 4 && Array.isArray(layer.shapes)
      ? layer.shapes.findIndex((it: any) => it?.ty === 'tm')
      : -1
  const trim: any = tmIdx >= 0 ? layer.shapes![tmIdx] : null
  const layerIdx = activeLayers.findIndex((l) => l.ind === ind)
  const masks: any[] = Array.isArray(layer.masksProperties) ? layer.masksProperties : []

  const stopColorChange = (si: number, hex: string) => {
    if (!pinfo) return
    if (!colorEditing.current) {
      colorEditing.current = true
      store().beginEdit()
    }
    const stops = pinfo.stops.map((s2, j) =>
      j === si
        ? { ...s2, color: hexToRgb01(hex).slice(0, 3) as [number, number, number] }
        : s2,
    )
    store().updatePaint(ind, { ...pinfo, stops }, false)
  }

  const transformRows: { key: TransformKey; label: string; dims: 1 | 2; min?: number; max?: number }[] = [
    { key: 'p', label: 'Position', dims: 2 },
    { key: 'a', label: 'Anchor', dims: 2 },
    { key: 's', label: 'Scale %', dims: 2 },
    { key: 'r', label: 'Rotation', dims: 1 },
    { key: 'o', label: 'Opacity', dims: 1, min: 0, max: 100 },
  ]

  return (
    <div className="props">
      <div className="panel-title">Layer</div>
      <section>
        <div className="prop-row">
          <label className="k">Name</label>
          <input
            type="text"
            key={`${ind}-${layer.nm}`}
            defaultValue={layer.nm}
            onBlur={(e) => e.target.value.trim() && store().renameLayer(ind, e.target.value.trim())}
          />
        </div>
        <div className="prop-row">
          <label className="k">Parent</label>
          <select
            className="grow"
            value={layer.parent ?? ''}
            onChange={(e) =>
              store().setParent(ind, e.target.value === '' ? null : Number(e.target.value))
            }
          >
            <option value="">None</option>
            {activeLayers
              .filter((l) => {
                if (l.ind === ind) return false
                // exclude our own descendants (would create a cycle)
                let cur: typeof l | undefined = l
                const seen = new Set<number>()
                while (cur && cur.parent != null && !seen.has(cur.ind)) {
                  if (cur.parent === ind) return false
                  seen.add(cur.ind)
                  cur = activeLayers.find((x) => x.ind === cur!.parent)
                }
                return true
              })
              .map((l) => (
                <option key={l.ind} value={l.ind}>
                  {l.nm}
                </option>
              ))}
          </select>
        </div>
      </section>

      <div className="panel-title">Transform · frame {Math.round(currentFrame)}</div>
      <section>
        {transformRows.map(({ key, label, dims, min, max }) => {
          const prop = layer.ks[key]
          const animated = isAnimated(prop)
          const onFrame = hasKeyframeAt(prop, currentFrame)
          const v = getValue(prop, currentFrame)
          return (
            <div key={key}>
              <div className="prop-row">
                <button
                  className={`kf-btn${animated ? ' animated' : ''}${onFrame ? ' on' : ''}`}
                  title={
                    onFrame
                      ? 'Remove keyframe at this frame'
                      : animated
                        ? 'Add keyframe at this frame'
                        : 'Start animating (adds a keyframe)'
                  }
                  onClick={() => store().toggleKeyframe(ind, key)}
                >
                  {onFrame ? '◆' : '◇'}
                </button>
                <label className="k">{label}</label>
                <NumberField
                  value={round1(v[0] ?? 0)}
                  min={min}
                  max={max}
                  onCommit={(n) =>
                    store().setTransformValue(ind, key, dims === 2 ? [n, v[1] ?? 0] : [n])
                  }
                />
                {dims === 2 && (
                  <NumberField
                    value={round1(v[1] ?? 0)}
                    onCommit={(n) => store().setTransformValue(ind, key, [v[0] ?? 0, n])}
                  />
                )}
              </div>
              {animated && (
                <div className="row-sub">
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                    {keyframeTimes(prop).length} keys
                  </span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) store().setPropEasing(ind, key, e.target.value as EasingName)
                      e.target.value = ''
                    }}
                  >
                    <option value="" disabled>
                      easing…
                    </option>
                    {EASING_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    className="link-btn"
                    onClick={() => setCurveKey(curveKey === key ? null : key)}
                  >
                    {curveKey === key ? 'hide curve' : 'curve'}
                  </button>
                  <button className="link-btn" onClick={() => store().removeAnimation(ind, key)}>
                    remove animation
                  </button>
                </div>
              )}
              {animated && curveKey === key && (
                <div className="curve-box">
                  <EasingCurveEditor
                    value={
                      (prop.k?.[0]?.o?.x != null && prop.k?.[0]?.i?.x != null
                        ? { o: prop.k[0].o, i: prop.k[0].i }
                        : EASINGS.linear) as BezierHandles
                    }
                    onDragStart={() => {
                      curvePending.current = true
                    }}
                    onChange={(v) => {
                      if (curvePending.current) {
                        curvePending.current = false
                        store().beginEdit()
                      }
                      store().setPropEasingCustom(ind, key, v, false)
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </section>

      {textStyle && (
        <>
          <div className="panel-title">Text</div>
          <section>
            <textarea
              key={`${ind}-${textStyle.text}`}
              rows={3}
              defaultValue={textStyle.text}
              onBlur={(e) => {
                if (e.target.value !== textStyle.text) {
                  store().setTextStyle(ind, { text: e.target.value })
                }
              }}
            />
            <div className="prop-row">
              <label className="k">Font</label>
              <select
                className="grow"
                value={textStyle.font}
                onChange={(e) => store().setTextStyle(ind, { font: e.target.value })}
              >
                {FONTS.map((f) => (
                  <option key={f.fName} value={f.fName}>
                    {f.fFamily}
                  </option>
                ))}
              </select>
            </div>
            <div className="prop-row">
              <label className="k">Size</label>
              <NumberField
                value={round1(textStyle.size)}
                min={4}
                max={500}
                onCommit={(n) => store().setTextStyle(ind, { size: n })}
              />
              <input
                type="color"
                value={rgbToHex(textStyle.color)}
                onChange={(e) => {
                  if (!colorEditing.current) {
                    colorEditing.current = true
                    store().beginEdit()
                  }
                  store().setTextStyle(
                    ind,
                    { color: hexToRgb01(e.target.value).slice(0, 3) as [number, number, number] },
                    false,
                  )
                }}
                onBlur={() => {
                  colorEditing.current = false
                }}
              />
            </div>
            <div className="prop-row">
              <label className="k">Align</label>
              {(
                [
                  [0, 'L'],
                  [2, 'C'],
                  [1, 'R'],
                ] as const
              ).map(([j, label]) => (
                <button
                  key={j}
                  className={textStyle.justify === j ? 'tool-active' : ''}
                  onClick={() => store().setTextStyle(ind, { justify: j })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="prop-row">
              <label className="k">Line / Trk</label>
              <NumberField
                value={round1(textStyle.lineHeight)}
                min={0}
                onCommit={(n) => store().setTextStyle(ind, { lineHeight: n })}
              />
              <NumberField
                value={round1(textStyle.tracking)}
                onCommit={(n) => store().setTextStyle(ind, { tracking: n })}
              />
            </div>
          </section>
        </>
      )}

      {(pinfo || s0) && (
        <>
          <div className="panel-title">Shape</div>
          <section>
            {pinfo && isAnimatedGradient(paint) ? (
              <div className="hint" style={{ padding: '4px 0 4px 28px' }}>
                Animated gradient — editing disabled to preserve its keyframes.
              </div>
            ) : (
              pinfo && (
                <div className="prop-row">
                  <label className="k" style={{ marginLeft: 28 }}>
                    Fill
                  </label>
                  <select
                    className="grow"
                    value={pinfo.kind}
                    onChange={(e) =>
                      store().updatePaint(ind, {
                        ...pinfo,
                        kind: e.target.value as PaintInfo['kind'],
                      })
                    }
                  >
                    <option value="solid">Solid</option>
                    <option value="linear">Linear gradient</option>
                    <option value="radial">Radial gradient</option>
                  </select>
                </div>
              )
            )}
            {pinfo && pinfo.kind === 'solid' && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Color
                </label>
                <input
                  type="color"
                  value={rgbToHex(pinfo.color)}
                  onChange={(e) => {
                    // Snapshot once per editing session, on the first actual
                    // change — not on focus (which may end with no change).
                    if (!colorEditing.current) {
                      colorEditing.current = true
                      store().beginEdit()
                    }
                    store().setFillColor(ind, hexToRgb01(e.target.value), false)
                  }}
                  onBlur={() => {
                    colorEditing.current = false
                  }}
                />
              </div>
            )}
            {pinfo && pinfo.kind !== 'solid' && !isAnimatedGradient(paint) && (
              <>
                {pinfo.stops.map((stop, si) => (
                  <div className="prop-row" key={si}>
                    <label className="k" style={{ marginLeft: 28 }}>
                      Stop {si + 1}
                    </label>
                    <input
                      type="color"
                      value={rgbToHex(stop.color)}
                      onChange={(e) => stopColorChange(si, e.target.value)}
                      onBlur={() => {
                        colorEditing.current = false
                      }}
                    />
                    <NumberField
                      value={Math.round(stop.pos * 100)}
                      min={0}
                      max={100}
                      onCommit={(n) => {
                        const stops = pinfo.stops.map((s2, j) =>
                          j === si ? { ...s2, pos: n / 100 } : s2,
                        )
                        store().updatePaint(ind, { ...pinfo, stops })
                      }}
                    />
                    <span style={{ color: 'var(--text-dim)' }}>%</span>
                    <button
                      className="link-btn"
                      title="Remove stop"
                      disabled={pinfo.stops.length <= 2}
                      onClick={() => {
                        const stops = pinfo.stops.filter((_, j) => j !== si)
                        store().updatePaint(ind, { ...pinfo, stops })
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="prop-row">
                  <label className="k" style={{ marginLeft: 28 }} />
                  <button
                    onClick={() => {
                      // Insert into the widest gap, color interpolated.
                      const stops = [...pinfo.stops].sort((a, b) => a.pos - b.pos)
                      if (stops.length < 2) return
                      let gi = 0
                      let gap = -1
                      for (let i = 0; i < stops.length - 1; i++) {
                        const g = stops[i + 1].pos - stops[i].pos
                        if (g > gap) {
                          gap = g
                          gi = i
                        }
                      }
                      const a = stops[gi]
                      const b = stops[gi + 1]
                      const mid = {
                        pos: (a.pos + b.pos) / 2,
                        color: [
                          (a.color[0] + b.color[0]) / 2,
                          (a.color[1] + b.color[1]) / 2,
                          (a.color[2] + b.color[2]) / 2,
                        ] as [number, number, number],
                      }
                      store().updatePaint(ind, {
                        ...pinfo,
                        stops: [...stops.slice(0, gi + 1), mid, ...stops.slice(gi + 1)],
                      })
                    }}
                  >
                    + Add stop
                  </button>
                </div>
                {pinfo.kind === 'linear' && (
                  <div className="prop-row">
                    <label className="k" style={{ marginLeft: 28 }}>
                      Angle
                    </label>
                    <NumberField
                      value={Math.round(pinfo.angle)}
                      min={0}
                      max={360}
                      onCommit={(n) => store().updatePaint(ind, { ...pinfo, angle: n })}
                    />
                  </div>
                )}
              </>
            )}
            {stroke && strokeColor && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Stroke
                </label>
                <input
                  type="color"
                  value={rgbToHex(strokeColor)}
                  onChange={(e) => {
                    if (!colorEditing.current) {
                      colorEditing.current = true
                      store().beginEdit()
                    }
                    store().setStroke(ind, { color: hexToRgb01(e.target.value) }, false)
                  }}
                  onBlur={() => {
                    colorEditing.current = false
                  }}
                />
                <NumberField
                  value={round1(strokeWidth ?? 1)}
                  min={0}
                  onCommit={(w) => store().setStroke(ind, { width: w })}
                />
                <button className="link-btn" onClick={() => store().removeStroke(ind)}>
                  remove
                </button>
              </div>
            )}
            {!stroke && layer.ty === 4 && Array.isArray(layer.shapes) && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Stroke
                </label>
                <button onClick={() => store().addStroke(ind)}>+ Add stroke</button>
              </div>
            )}
            {s0 && (s0.ty === 'rc' || s0.ty === 'el') && s0.s?.a === 0 && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Size
                </label>
                <NumberField
                  value={round1(s0.s.k[0])}
                  min={1}
                  onCommit={(w) => store().setShapeValue(ind, [0, 's', 'k'], [w, s0.s.k[1]])}
                />
                <span style={{ color: 'var(--text-dim)' }}>×</span>
                <NumberField
                  value={round1(s0.s.k[1])}
                  min={1}
                  onCommit={(h) => store().setShapeValue(ind, [0, 's', 'k'], [s0.s.k[0], h])}
                />
              </div>
            )}
            {s0 && s0.ty === 'rc' && s0.r?.a === 0 && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Corner
                </label>
                <NumberField
                  value={round1(s0.r.k)}
                  min={0}
                  onCommit={(r) => store().setShapeValue(ind, [0, 'r', 'k'], r)}
                />
              </div>
            )}
            {s0 && s0.ty === 'sr' && s0.pt?.a === 0 && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Points
                </label>
                <NumberField
                  value={s0.pt?.k ?? 5}
                  min={3}
                  max={20}
                  onCommit={(n) => store().setShapeValue(ind, [0, 'pt', 'k'], Math.round(n))}
                />
              </div>
            )}
            {s0 && s0.ty === 'sr' && s0.or?.a === 0 && s0.ir?.a === 0 && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Radius
                </label>
                <NumberField
                  value={round1(s0.or?.k ?? 100)}
                  min={1}
                  onCommit={(n) => store().setShapeValue(ind, [0, 'or', 'k'], n)}
                />
                <NumberField
                  value={round1(s0.ir?.k ?? 50)}
                  min={1}
                  onCommit={(n) => store().setShapeValue(ind, [0, 'ir', 'k'], n)}
                />
              </div>
            )}
          </section>
        </>
      )}

      {layer.ty === 4 && Array.isArray(layer.shapes) && (
        <>
          <div className="panel-title">Trim Paths · frame {Math.round(currentFrame)}</div>
          <section>
            {!trim && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }}>
                  Trim
                </label>
                <button onClick={() => store().addTrim(ind)}>+ Add trim paths</button>
              </div>
            )}
            {trim &&
              (
                [
                  ['s', 'Start %', 0, 100],
                  ['e', 'End %', 0, 100],
                  ['o', 'Offset °', undefined, undefined],
                ] as const
              ).map(([p, label, min, max]) => {
                const prop = trim[p]
                if (!prop || typeof prop !== 'object') return null
                const path = ['shapes', tmIdx, p]
                const animated = isAnimated(prop)
                const onFrame = hasKeyframeAt(prop, currentFrame)
                const v = getValue(prop, currentFrame)[0] ?? 0
                return (
                  <div key={p}>
                    <div className="prop-row">
                      <button
                        className={`kf-btn${animated ? ' animated' : ''}${onFrame ? ' on' : ''}`}
                        title={
                          onFrame
                            ? 'Remove keyframe at this frame'
                            : animated
                              ? 'Add keyframe at this frame'
                              : 'Start animating (adds a keyframe)'
                        }
                        onClick={() => store().togglePathKeyframe(ind, path)}
                      >
                        {onFrame ? '◆' : '◇'}
                      </button>
                      <label className="k">{label}</label>
                      <NumberField
                        value={round1(v)}
                        min={min}
                        max={max}
                        onCommit={(n) => store().setPathValue(ind, path, [n])}
                      />
                    </div>
                    {animated && (
                      <div className="row-sub">
                        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                          {keyframeTimes(prop).length} keys
                        </span>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              store().setPathEasing(ind, path, e.target.value as EasingName)
                            e.target.value = ''
                          }}
                        >
                          <option value="" disabled>
                            easing…
                          </option>
                          {EASING_NAMES.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <button
                          className="link-btn"
                          onClick={() => store().removePathAnimation(ind, path)}
                        >
                          remove animation
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            {trim && (
              <div className="prop-row">
                <label className="k" style={{ marginLeft: 28 }} />
                <button className="link-btn" onClick={() => store().removeTrim(ind)}>
                  remove trim paths
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {layer.ty === 0 && typeof layer.refId === 'string' && (
        <>
          <div className="panel-title">Precomp</div>
          <section>
            <div className="prop-row">
              <label className="k" style={{ marginLeft: 28 }}>
                Contents
              </label>
              <button onClick={() => store().enterComp(ind)}>⤵ Edit precomp</button>
            </div>
            <div className="hint" style={{ padding: '0 0 4px 28px' }}>
              Edits apply to every layer referencing “{layer.refId}”.
            </div>
          </section>
        </>
      )}

      <div className="panel-title">Masks</div>
      <section>
        {masks.map((m, mi) => (
          <div className="prop-row" key={mi}>
            <label className="k" style={{ marginLeft: 28 }}>
              {m.nm || `Mask ${mi + 1}`}
            </label>
            <select
              value={m.mode ?? 'a'}
              onChange={(e) => store().setMaskMode(ind, mi, e.target.value as MaskMode)}
            >
              <option value="a">Add</option>
              <option value="s">Subtract</option>
              <option value="i">Intersect</option>
              <option value="n">None</option>
            </select>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-dim)' }}
            >
              <input
                type="checkbox"
                checked={!!m.inv}
                onChange={(e) => store().setMaskInv(ind, mi, e.target.checked)}
              />
              inv
            </label>
            <button className="link-btn" title="Remove mask" onClick={() => store().removeMask(ind, mi)}>
              ×
            </button>
          </div>
        ))}
        <div className="prop-row">
          <label className="k" style={{ marginLeft: 28 }} />
          <button onClick={() => store().addMask(ind)}>+ Add mask</button>
        </div>
        {masks.length > 0 && (
          <div className="hint" style={{ padding: '0 0 4px 28px' }}>
            Drag the green dots on the canvas to edit the mask path.
          </div>
        )}
      </section>

      {layerIdx > 0 && (
        <>
          <div className="panel-title">Matte</div>
          <section>
            <div className="prop-row">
              <label className="k" style={{ marginLeft: 28 }}>
                Matte
              </label>
              <select
                className="grow"
                value={layer.tt ?? 0}
                onChange={(e) =>
                  store().setMatte(ind, Number(e.target.value) as 0 | 1 | 2 | 3 | 4)
                }
              >
                <option value={0}>None</option>
                <option value={1}>Alpha (layer above)</option>
                <option value={2}>Alpha inverted</option>
                <option value={3}>Luma</option>
                <option value={4}>Luma inverted</option>
              </select>
            </div>
            {(layer.tt ?? 0) !== 0 && (
              <div className="hint" style={{ padding: '0 0 4px 28px' }}>
                The layer above is used as the matte and is hidden from normal render.
              </div>
            )}
          </section>
        </>
      )}

      <div className="panel-title">Timing</div>
      <section>
        <div className="prop-row">
          <label className="k" style={{ marginLeft: 28 }}>
            In / Out
          </label>
          <NumberField
            value={layer.ip}
            min={0}
            max={doc.op}
            onCommit={(ip) => store().setLayerTiming(ind, ip, layer.op)}
          />
          <NumberField
            value={layer.op}
            min={0}
            max={doc.op}
            onCommit={(op) => store().setLayerTiming(ind, layer.ip, op)}
          />
        </div>
      </section>
    </div>
  )
}
