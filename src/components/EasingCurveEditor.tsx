import { useRef } from 'react'
import { EASINGS, EASING_NAMES } from '../lottie/easing'

export interface BezierHandles {
  o: { x: number[]; y: number[] }
  i: { x: number[]; y: number[] }
}

// Viewport geometry. The inner plot ([0,1] x [0,1]) is horizontally padded by
// PAD_X and vertically centered; the vertical margins leave room to show the
// full y overshoot range of [-0.4, 1.4] without clipping.
const W = 168
const H = 168
const PAD_X = 20
const PLOT_W = W - PAD_X * 2 // 128
const PLOT_H = 92 // 0.4 * 92 = 36.8 <= 38 (top/bottom margin), so overshoot stays visible
const PAD_Y = (H - PLOT_H) / 2 // 38

const Y_MIN = -0.4
const Y_MAX = 1.4

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** Defensive first-element read with fallback for missing/empty arrays. */
function first(arr: number[] | undefined, fallback: number): number {
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'number' && isFinite(arr[0])) {
    return arr[0]
  }
  return fallback
}

// plot coords -> pixels
function px(t: number): number {
  return PAD_X + t * PLOT_W
}
function py(v: number): number {
  return PAD_Y + (1 - v) * PLOT_H
}

export default function EasingCurveEditor(props: {
  value: BezierHandles
  onChange: (v: BezierHandles) => void
  onDragStart?: () => void
}): JSX.Element {
  const { value, onChange, onDragStart } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<'o' | 'i' | null>(null)

  // Fall back to linear preset values when arrays are missing/empty.
  const lin = EASINGS.linear
  const p1x = first(value?.o?.x, lin.o.x[0])
  const p1y = first(value?.o?.y, lin.o.y[0])
  const p2x = first(value?.i?.x, lin.i.x[0])
  const p2y = first(value?.i?.y, lin.i.y[0])

  const emit = (handle: 'o' | 'i', t: number, v: number) => {
    const next: BezierHandles =
      handle === 'o'
        ? { o: { x: [round3(t)], y: [round3(v)] }, i: { x: [p2x], y: [p2y] } }
        : { o: { x: [p1x], y: [p1y] }, i: { x: [round3(t)], y: [round3(v)] } }
    onChange(next)
  }

  const startDrag = (handle: 'o' | 'i') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = handle
    onDragStart?.()
    // Capture on the SVG so moves keep flowing to us even outside the element.
    const svg = svgRef.current
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId)
      } catch {
        // ignore (e.g. pointer already gone)
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const handle = dragRef.current
    if (!handle) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const xPix = (e.clientX - rect.left) * (W / rect.width)
    const yPix = (e.clientY - rect.top) * (H / rect.height)
    const t = clamp((xPix - PAD_X) / PLOT_W, 0, 1)
    const v = clamp(1 - (yPix - PAD_Y) / PLOT_H, Y_MIN, Y_MAX)
    emit(handle, t, v)
  }

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current === null) return
    dragRef.current = null
    const svg = svgRef.current
    if (svg && svg.hasPointerCapture(e.pointerId)) {
      try {
        svg.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  const applyPreset = (name: (typeof EASING_NAMES)[number]) => {
    const p = EASINGS[name]
    onDragStart?.()
    onChange({
      o: { x: [...p.o.x], y: [...p.o.y] },
      i: { x: [...p.i.x], y: [...p.i.y] },
    })
  }

  // Grid lines at quarters of the plot area.
  const quarters = [0.25, 0.5, 0.75]

  const curvePath = `M ${px(0)} ${py(0)} C ${px(p1x)} ${py(p1y)}, ${px(p2x)} ${py(p2y)}, ${px(1)} ${py(1)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: W }}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          display: 'block',
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* plot area */}
        <rect
          x={PAD_X}
          y={PAD_Y}
          width={PLOT_W}
          height={PLOT_H}
          fill="none"
          stroke="#2c2c38"
          strokeWidth={1}
        />
        {/* quarter grid */}
        {quarters.map((q) => (
          <g key={q} stroke="#2c2c38" strokeWidth={1}>
            <line x1={px(q)} y1={PAD_Y} x2={px(q)} y2={PAD_Y + PLOT_H} />
            <line x1={PAD_X} y1={py(q)} x2={PAD_X + PLOT_W} y2={py(q)} />
          </g>
        ))}
        {/* reference diagonal */}
        <line
          x1={px(0)}
          y1={py(0)}
          x2={px(1)}
          y2={py(1)}
          stroke="var(--text-dim)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.6}
        />
        {/* handle arms */}
        <line x1={px(0)} y1={py(0)} x2={px(p1x)} y2={py(p1y)} stroke="#ffd166" strokeWidth={1} opacity={0.55} />
        <line x1={px(1)} y1={py(1)} x2={px(p2x)} y2={py(p2y)} stroke="#ffd166" strokeWidth={1} opacity={0.55} />
        {/* the cubic curve */}
        <path d={curvePath} fill="none" stroke="var(--accent-2)" strokeWidth={2} />
        {/* anchor endpoints */}
        <circle cx={px(0)} cy={py(0)} r={3} fill="var(--text-dim)" />
        <circle cx={px(1)} cy={py(1)} r={3} fill="var(--text-dim)" />
        {/* draggable handles */}
        <circle
          cx={px(p1x)}
          cy={py(p1y)}
          r={6}
          fill="#ffd166"
          style={{ cursor: 'grab' }}
          onPointerDown={startDrag('o')}
        />
        <circle
          cx={px(p2x)}
          cy={py(p2y)}
          r={6}
          fill="#ffd166"
          style={{ cursor: 'grab' }}
          onPointerDown={startDrag('i')}
        />
      </svg>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {EASING_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={() => applyPreset(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'monospace' }}>
        cubic-bezier({p1x.toFixed(2)}, {p1y.toFixed(2)}, {p2x.toFixed(2)}, {p2y.toFixed(2)})
      </div>
    </div>
  )
}
