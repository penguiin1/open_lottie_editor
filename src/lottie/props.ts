import type { AnimProp, EasingName, LottieKeyframe } from '../types/lottie'
import { EASINGS } from './easing'

// ---------------------------------------------------------------------------
// Helpers for Lottie animated properties.
//
// A property is `{ a: 0, k: value }` when static, or
// `{ a: 1, k: Keyframe[] }` when animated. Static scalar props may store a
// bare number; static vector props store an array. Keyframe values are always
// arrays (`s: number[]`), even for scalars. All functions below normalize to
// `number[]` on read and write back in the property's native shape.
// ---------------------------------------------------------------------------

export function isAnimated(prop: AnimProp | undefined): boolean {
  return !!prop && prop.a === 1 && Array.isArray(prop.k)
}

/** AE "separate dimensions" position: { s: true, x: AnimProp, y: AnimProp }. */
export function isSplit(prop: AnimProp | undefined): boolean {
  return !!prop && (prop as any).s === true && !!(prop as any).x
}

export function toArray(v: any): number[] {
  if (Array.isArray(v)) return v.map(Number)
  return [Number(v)]
}

function sanitize(values: number[]): number[] {
  return values.map((n) => (Number.isFinite(n) ? n : 0))
}

/** If the property is a split-dimension position, collapse it to a joint
 *  static value so subsequent writes can't produce a split/joint hybrid
 *  (lottie-web reads the split channels first and would ignore our edits). */
function collapseSplit(prop: AnimProp, frame: number): void {
  if (!isSplit(prop)) return
  const v = getValue(prop, frame)
  delete (prop as any).s
  delete (prop as any).x
  delete (prop as any).y
  delete (prop as any).z
  prop.a = 0
  prop.k = v
}

function keyframes(prop: AnimProp): LottieKeyframe[] {
  return prop.k as LottieKeyframe[]
}

export function keyframeTimes(prop: AnimProp | undefined): number[] {
  if (!prop || !isAnimated(prop)) return []
  return keyframes(prop).map((k) => k.t)
}

export function hasKeyframeAt(prop: AnimProp | undefined, frame: number): boolean {
  if (!prop || !isAnimated(prop)) return false
  return keyframes(prop).some((k) => Math.round(k.t) === Math.round(frame))
}

/** Value of the property at a frame, normalized to number[].
 *  Uses linear interpolation between keyframes (ignores bezier shaping —
 *  good enough for UI readouts and canvas dragging; playback itself is
 *  rendered by lottie-web which honors the real easing). */
export function getValue(prop: AnimProp | undefined, frame: number): number[] {
  if (!prop) return [0]
  if (isSplit(prop)) {
    const p = prop as any
    return [getValue(p.x, frame)[0], getValue(p.y ?? { a: 0, k: 0 }, frame)[0], 0]
  }
  if (!isAnimated(prop)) return toArray(prop.k)
  const kfs = keyframes(prop)
  if (kfs.length === 0) return [0]
  if (frame <= kfs[0].t) return toArray(kfs[0].s ?? 0)
  const last = kfs[kfs.length - 1]
  if (frame >= last.t) {
    // Old-style files may omit `s` on the final keyframe; fall back to the
    // previous keyframe's end value if lottie put it in `e`.
    if (last.s != null) return toArray(last.s)
    const prev = kfs[kfs.length - 2]
    return toArray(prev?.e ?? prev?.s ?? 0)
  }
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]
    const b = kfs[i + 1]
    // Half-open match: landing exactly on keyframe b must return b's value,
    // not a's (critical after a hold keyframe, where there is no interpolation).
    if (frame >= a.t && frame < b.t) {
      const av = toArray(a.s ?? 0)
      const bv = toArray(b.s ?? a.e ?? a.s ?? 0)
      if (a.h === 1) return av
      const t = (frame - a.t) / (b.t - a.t)
      return av.map((x, d) => x + ((bv[d] ?? bv[0] ?? 0) - x) * t)
    }
    if (frame === b.t) return toArray(b.s ?? a.e ?? a.s ?? 0)
  }
  return toArray(last.s ?? 0)
}

/** Number of dimensions this property's values carry (1 for r/o, 2-3 for p/s). */
export function dims(prop: AnimProp): number {
  if (isSplit(prop)) return 3
  if (isAnimated(prop)) {
    const k = keyframes(prop)[0]
    return toArray(k?.s ?? 0).length
  }
  return toArray(prop.k).length
}

/** Overwrite as a static value. Scalars are unwrapped to a bare number. */
export function setStatic(prop: AnimProp, value: number[]): void {
  collapseSplit(prop, 0)
  const v = sanitize(value)
  prop.a = 0
  prop.k = v.length === 1 ? v[0] : v.slice()
}

/** Insert or update a keyframe at `frame` with `value`.
 *  Converts a static property to animated on first use. */
export function upsertKeyframe(
  prop: AnimProp,
  frame: number,
  value: number[],
  easing: EasingName = 'easeInOut',
): void {
  collapseSplit(prop, frame)
  value = sanitize(value)
  const e = EASINGS[easing]
  if (!isAnimated(prop)) {
    const current = toArray(prop.k)
    prop.a = 1
    if (Math.round(frame) === 0) {
      prop.k = [makeKf(0, value, e)]
    } else {
      // Preserve the previous static value at frame 0 so the property
      // doesn't jump at the start of the composition.
      prop.k = [makeKf(0, current, e), makeKf(frame, value, e)]
    }
    return
  }
  const kfs = keyframes(prop)
  const existing = kfs.find((k) => Math.round(k.t) === Math.round(frame))
  if (existing) {
    existing.s = value.slice()
    return
  }
  kfs.push(makeKf(frame, value, e))
  kfs.sort((a, b) => a.t - b.t)
}

function makeKf(
  t: number,
  s: number[],
  e: { o: { x: number[]; y: number[] }; i: { x: number[]; y: number[] } },
): LottieKeyframe {
  return {
    t: Math.round(t),
    s: s.slice(),
    o: { x: e.o.x.slice(), y: e.o.y.slice() },
    i: { x: e.i.x.slice(), y: e.i.y.slice() },
  }
}

/** Remove the keyframe at `frame`. If one keyframe remains afterwards the
 *  property collapses back to a static value. Returns true if removed. */
export function removeKeyframeAt(prop: AnimProp, frame: number): boolean {
  if (!isAnimated(prop)) return false
  const kfs = keyframes(prop)
  const idx = kfs.findIndex((k) => Math.round(k.t) === Math.round(frame))
  if (idx === -1) return false
  const [removed] = kfs.splice(idx, 1)
  if (kfs.length === 1) {
    // Legacy files may leave a bare final {t} keyframe with no value; fall
    // back to the removed keyframe's end/start value instead of zeroing.
    setStatic(prop, toArray(kfs[0].s ?? removed.e ?? removed.s ?? 0))
  } else if (kfs.length === 0) {
    setStatic(prop, toArray(removed.s ?? removed.e ?? 0))
  }
  return true
}

/** Move the keyframe at `from` to `to` (rounded). Fails when there is no
 *  keyframe at `from` or another keyframe already occupies `to`. */
export function moveKeyframeTime(prop: AnimProp, from: number, to: number): boolean {
  if (!isAnimated(prop)) return false
  const kfs = keyframes(prop)
  const f = Math.round(from)
  const t = Math.round(to)
  if (f === t) return true
  const kf = kfs.find((k) => Math.round(k.t) === f)
  if (!kf) return false
  if (kfs.some((k) => k !== kf && Math.round(k.t) === t)) return false
  kf.t = t
  kfs.sort((a, b) => a.t - b.t)
  return true
}

/** Bake the value at `frame` and drop all keyframes. */
export function convertToStatic(prop: AnimProp, frame: number): void {
  const v = getValue(prop, frame)
  setStatic(prop, v)
}

/** Rewrite the bezier handles of every keyframe to a named preset. */
export function applyEasing(prop: AnimProp, easing: EasingName): void {
  applyCustomEasing(prop, EASINGS[easing])
}

/** Rewrite the bezier handles of every keyframe to arbitrary handles. */
export function applyCustomEasing(
  prop: AnimProp,
  handles: { o: { x: number[]; y: number[] }; i: { x: number[]; y: number[] } },
): void {
  if (!isAnimated(prop)) return
  for (const k of keyframes(prop)) {
    k.o = { x: handles.o.x.slice(), y: handles.o.y.slice() }
    k.i = { x: handles.i.x.slice(), y: handles.i.y.slice() }
  }
}
