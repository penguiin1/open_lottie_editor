import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EasingName, LottieDoc, LottieLayer, TransformKey } from '../types/lottie'
import { createEmptyDoc, createShapeLayer, nextLayerInd, type ShapeKind } from '../lottie/doc'
import { normalizeDoc } from '../lottie/normalize'
import { applyTextStyle, createTextLayer, type TextStyle } from '../lottie/text'
import {
  createPenLayer,
  deleteVertex,
  getPathGeometry,
  insertVertex,
  moveTangent,
  moveVertex,
  type PenPoint,
} from '../lottie/path'
import {
  findPaint,
  findStroke,
  isAnimatedGradient,
  makeGradientFill,
  makeSolidFill,
  setPaint,
  shapeExtent,
  type PaintInfo,
} from '../lottie/paint'
import { applyCustomEasing, moveKeyframeTime } from '../lottie/props'
import {
  applyEasing,
  convertToStatic,
  getValue,
  hasKeyframeAt,
  isAnimated,
  removeKeyframeAt,
  setStatic,
  upsertKeyframe,
} from '../lottie/props'

const HISTORY_LIMIT = 60

export type Tool = 'select' | 'pen'

export interface BezierHandles {
  o: { x: number[]; y: number[] }
  i: { x: number[]; y: number[] }
}

interface EditorState {
  doc: LottieDoc
  fileName: string
  selectedInd: number | null
  currentFrame: number
  playing: boolean
  defaultEasing: EasingName
  tool: Tool
  past: string[]
  future: string[]
  setTool: (t: Tool) => void
  // document lifecycle
  newDoc: () => void
  loadDoc: (doc: LottieDoc, fileName?: string) => void
  setDocMeta: (meta: Partial<Pick<LottieDoc, 'w' | 'h' | 'fr' | 'op' | 'nm'>>) => void
  // layers
  addShapeLayer: (kind: ShapeKind) => void
  addTextLayer: () => void
  addPenLayer: (points: PenPoint[], closed: boolean) => void
  deleteLayer: (ind: number) => void
  duplicateLayer: (ind: number) => void
  renameLayer: (ind: number, name: string) => void
  moveLayer: (ind: number, dir: -1 | 1) => void
  setLayerTiming: (ind: number, ip: number, op: number) => void
  selectLayer: (ind: number | null) => void
  // playback
  setFrame: (f: number) => void
  setPlaying: (p: boolean) => void
  // animation editing
  setTransformValue: (ind: number, key: TransformKey, value: number[], commit?: boolean) => void
  toggleKeyframe: (ind: number, key: TransformKey) => void
  removeAnimation: (ind: number, key: TransformKey) => void
  setPropEasing: (ind: number, key: TransformKey, easing: EasingName) => void
  setDefaultEasing: (e: EasingName) => void
  // shape editing
  setShapeValue: (ind: number, path: (string | number)[], value: any) => void
  setFillColor: (ind: number, rgba: number[], commit?: boolean) => void
  updatePaint: (ind: number, info: PaintInfo, commit?: boolean) => void
  setStroke: (ind: number, patch: { color?: number[]; width?: number }, commit?: boolean) => void
  addStroke: (ind: number) => void
  removeStroke: (ind: number) => void
  moveKeyframe: (ind: number, key: TransformKey, from: number, to: number, commit?: boolean) => void
  movePathVertex: (ind: number, vertexIndex: number, x: number, y: number, commit?: boolean) => void
  movePathTangent: (
    ind: number,
    vertexIndex: number,
    which: 'in' | 'out',
    x: number,
    y: number,
    mirror: boolean,
    commit?: boolean,
  ) => void
  insertPathVertex: (ind: number, segIndex: number, x: number, y: number) => void
  deletePathVertex: (ind: number, vertexIndex: number) => void
  setTextStyle: (ind: number, patch: Partial<TextStyle>, commit?: boolean) => void
  setPropEasingCustom: (ind: number, key: TransformKey, handles: BezierHandles, commit?: boolean) => void
  // history
  beginEdit: () => void
  undo: () => void
  redo: () => void
}

function findLayer(doc: LottieDoc, ind: number): LottieLayer | undefined {
  return doc.layers.find((l) => l.ind === ind)
}

/** First fill item found on the layer (top-level or one group deep). */
export function findFill(layer: LottieLayer): any | undefined {
  for (const s of layer.shapes ?? []) {
    if (s.ty === 'fl') return s
    if (s.ty === 'gr') {
      const inner = (s.it ?? []).find((i: any) => i.ty === 'fl')
      if (inner) return inner
    }
  }
  return undefined
}

export const useStore = create<EditorState>()(
  immer((set, get) => {
    const snapshot = (state: { doc: LottieDoc; past: string[]; future: string[] }) => {
      const json = JSON.stringify(state.doc)
      // No-op guard: don't pollute history (or wipe redo) when nothing changed
      // since the last snapshot.
      if (state.past[state.past.length - 1] === json) return
      state.past.push(json)
      if (state.past.length > HISTORY_LIMIT) state.past.shift()
      state.future = []
    }

    return {
      doc: createEmptyDoc(),
      fileName: 'animation',
      selectedInd: null,
      currentFrame: 0,
      playing: false,
      defaultEasing: 'easeInOut',
      tool: 'select',
      past: [],
      future: [],

      setTool: (t) => set((s) => void (s.tool = t)),

      newDoc: () =>
        set((s) => {
          snapshot(s)
          s.doc = createEmptyDoc()
          s.fileName = 'animation'
          s.selectedInd = null
          s.currentFrame = 0
          s.playing = false
        }),

      loadDoc: (doc, fileName) =>
        set((s) => {
          snapshot(s)
          s.doc = normalizeDoc(doc) as any
          if (fileName) s.fileName = fileName
          s.selectedInd = null
          s.currentFrame = doc.ip ?? 0
          s.playing = false
        }),

      setDocMeta: (meta) =>
        set((s) => {
          snapshot(s)
          Object.assign(s.doc, meta)
          if (meta.op != null) {
            for (const l of s.doc.layers) if (l.op > meta.op || l.op === undefined) l.op = meta.op
            if (s.currentFrame > meta.op) s.currentFrame = meta.op
          }
        }),

      addShapeLayer: (kind) =>
        set((s) => {
          snapshot(s)
          const ind = nextLayerInd(s.doc)
          const layer = createShapeLayer(s.doc, kind, ind, s.doc.layers.length)
          s.doc.layers.unshift(layer) // first in array = top of stack
          s.selectedInd = ind
        }),

      addTextLayer: () =>
        set((s) => {
          snapshot(s)
          const ind = nextLayerInd(s.doc)
          const layer = createTextLayer(s.doc, ind, s.doc.layers.length)
          s.doc.layers.unshift(layer)
          s.selectedInd = ind
        }),

      addPenLayer: (points, closed) =>
        set((s) => {
          if (points.length < 2) return
          snapshot(s)
          const ind = nextLayerInd(s.doc)
          const layer = createPenLayer(s.doc, ind, points, closed, s.doc.layers.length)
          s.doc.layers.unshift(layer)
          s.selectedInd = ind
          s.tool = 'select'
        }),

      deleteLayer: (ind) =>
        set((s) => {
          snapshot(s)
          s.doc.layers = s.doc.layers.filter((l) => l.ind !== ind)
          // Strip dangling parent references (AE semantics: children keep
          // their local transform). Prevents both broken rigs in players and
          // accidental re-parenting if the ind is later reused.
          for (const l of s.doc.layers) {
            if (l.parent === ind) delete l.parent
          }
          if (s.selectedInd === ind) s.selectedInd = null
        }),

      duplicateLayer: (ind) =>
        set((s) => {
          const src = findLayer(s.doc, ind)
          if (!src) return
          snapshot(s)
          const copy = JSON.parse(JSON.stringify(src)) as LottieLayer
          copy.ind = nextLayerInd(s.doc)
          copy.nm = `${src.nm} copy`
          const i = s.doc.layers.findIndex((l) => l.ind === ind)
          s.doc.layers.splice(i, 0, copy)
          s.selectedInd = copy.ind
        }),

      renameLayer: (ind, name) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l || l.nm === name) return
          snapshot(s)
          l.nm = name
        }),

      moveLayer: (ind, dir) =>
        set((s) => {
          const i = s.doc.layers.findIndex((l) => l.ind === ind)
          const j = i + dir
          if (i === -1 || j < 0 || j >= s.doc.layers.length) return
          snapshot(s)
          const [l] = s.doc.layers.splice(i, 1)
          s.doc.layers.splice(j, 0, l)
        }),

      setLayerTiming: (ind, ip, op) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          snapshot(s)
          l.ip = Math.max(0, Math.min(ip, op))
          l.op = Math.max(l.ip, op)
        }),

      selectLayer: (ind) => set((s) => void (s.selectedInd = ind)),

      setFrame: (f) =>
        set((s) => {
          s.currentFrame = Math.max(s.doc.ip, Math.min(Math.round(f), s.doc.op))
        }),

      setPlaying: (p) => set((s) => void (s.playing = p)),

      setTransformValue: (ind, key, value, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          if (commit) snapshot(s)
          const prop = l.ks[key]
          if (isAnimated(prop)) {
            upsertKeyframe(prop, s.currentFrame, padDims(key, value), s.defaultEasing)
          } else {
            setStatic(prop, padDims(key, value))
          }
        }),

      toggleKeyframe: (ind, key) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          snapshot(s)
          const prop = l.ks[key]
          if (isAnimated(prop) && hasKeyframeAt(prop, s.currentFrame)) {
            removeKeyframeAt(prop, s.currentFrame)
          } else {
            const v = getValue(prop, s.currentFrame)
            upsertKeyframe(prop, s.currentFrame, v, s.defaultEasing)
          }
        }),

      removeAnimation: (ind, key) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          snapshot(s)
          convertToStatic(l.ks[key], s.currentFrame)
        }),

      setPropEasing: (ind, key, easing) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          snapshot(s)
          applyEasing(l.ks[key], easing)
        }),

      setDefaultEasing: (e) => set((s) => void (s.defaultEasing = e)),

      setShapeValue: (ind, path, value) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l || !l.shapes) return
          snapshot(s)
          let target: any = l.shapes
          for (let i = 0; i < path.length - 1; i++) target = target?.[path[i]]
          if (target) target[path[path.length - 1]] = value
        }),

      setFillColor: (ind, rgba, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          const fill = findFill(l)
          if (!fill || !fill.c) return
          if (commit) snapshot(s)
          // Preserve animated fills (keyframe at the playhead) instead of
          // silently flattening them to a static color.
          if (isAnimated(fill.c)) {
            upsertKeyframe(fill.c, s.currentFrame, rgba, s.defaultEasing)
          } else {
            setStatic(fill.c, rgba)
          }
        }),

      updatePaint: (ind, info, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          // Animated gradients can't round-trip through PaintInfo — refuse
          // rather than silently flattening the animation.
          if (info.kind !== 'solid' && isAnimatedGradient(findPaint(l))) return
          if (commit) snapshot(s)
          const paint =
            info.kind === 'solid'
              ? makeSolidFill(info.color)
              : makeGradientFill(
                  info.kind,
                  info.stops.length >= 2
                    ? info.stops
                    : [
                        { pos: 0, color: info.color },
                        { pos: 1, color: info.color.map((c) => c * 0.5) as [number, number, number] },
                      ],
                  info.angle,
                  shapeExtent(l),
                  info.alphaTail,
                )
          setPaint(l, paint)
        }),

      setStroke: (ind, patch, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          const st = findStroke(l)
          if (!st) return
          if (commit) snapshot(s)
          if (patch.color) {
            if (isAnimated(st.c)) upsertKeyframe(st.c, s.currentFrame, patch.color, s.defaultEasing)
            else setStatic(st.c, patch.color)
          }
          if (patch.width != null && Number.isFinite(patch.width)) {
            if (isAnimated(st.w)) upsertKeyframe(st.w, s.currentFrame, [patch.width], s.defaultEasing)
            else setStatic(st.w, [Math.max(0, patch.width)])
          }
        }),

      addStroke: (ind) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l || findStroke(l)) return
          snapshot(s)
          if (!Array.isArray(l.shapes)) return
          l.shapes.push({
            ty: 'st',
            c: { a: 0, k: [1, 1, 1, 1] },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 4 },
            lc: 2,
            lj: 2,
            bm: 0,
            nm: 'Stroke',
          })
        }),

      removeStroke: (ind) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l || !Array.isArray(l.shapes)) return
          const st = findStroke(l)
          if (!st) return
          snapshot(s)
          l.shapes = l.shapes.filter((item: any) => item !== st)
          for (const item of l.shapes) {
            if (item?.ty === 'gr' && Array.isArray(item.it)) {
              item.it = item.it.filter((i: any) => i !== st)
            }
          }
        }),

      moveKeyframe: (ind, key, from, to, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l || !l.ks?.[key]) return
          if (commit) snapshot(s)
          const clamped = Math.max(s.doc.ip, Math.min(Math.round(to), s.doc.op))
          moveKeyframeTime(l.ks[key], from, clamped)
        }),

      movePathVertex: (ind, vertexIndex, x, y, commit = false) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          if (commit) snapshot(s)
          moveVertex(l, vertexIndex, x, y)
        }),

      movePathTangent: (ind, vertexIndex, which, x, y, mirror, commit = false) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          if (commit) snapshot(s)
          moveTangent(l, vertexIndex, which, x, y, mirror)
        }),

      insertPathVertex: (ind, segIndex, x, y) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          const geo = getPathGeometry(l)
          if (!geo || segIndex < 0 || segIndex >= geo.verts.length) return
          snapshot(s)
          insertVertex(l, segIndex, x, y)
        }),

      deletePathVertex: (ind, vertexIndex) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          const geo = getPathGeometry(l)
          if (!geo) return
          if (geo.verts.length <= (geo.closed ? 3 : 2)) return
          snapshot(s)
          deleteVertex(l, vertexIndex)
        }),

      setTextStyle: (ind, patch, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          if (commit) snapshot(s)
          applyTextStyle(s.doc, l, patch)
        }),

      setPropEasingCustom: (ind, key, handles, commit = true) =>
        set((s) => {
          const l = findLayer(s.doc, ind)
          if (!l) return
          if (commit) snapshot(s)
          applyCustomEasing(l.ks[key], handles)
        }),

      beginEdit: () =>
        set((s) => {
          snapshot(s)
        }),

      undo: () =>
        set((s) => {
          const prev = s.past.pop()
          if (!prev) return
          s.future.push(JSON.stringify(s.doc))
          s.doc = JSON.parse(prev)
          if (s.selectedInd != null && !findLayer(s.doc, s.selectedInd)) s.selectedInd = null
          if (s.currentFrame > s.doc.op) s.currentFrame = s.doc.op
        }),

      redo: () =>
        set((s) => {
          const next = s.future.pop()
          if (!next) return
          s.past.push(JSON.stringify(s.doc))
          s.doc = JSON.parse(next)
          if (s.selectedInd != null && !findLayer(s.doc, s.selectedInd)) s.selectedInd = null
          if (s.currentFrame > s.doc.op) s.currentFrame = s.doc.op
        }),
    }
  }),
)

/** Pad UI-supplied values to the dimension count Lottie expects. */
function padDims(key: TransformKey, value: number[]): number[] {
  if (key === 'p') {
    if (value.length >= 3) return value.slice(0, 3)
    return [value[0] ?? 0, value[1] ?? 0, 0]
  }
  if (key === 's') {
    if (value.length >= 3) return value.slice(0, 3)
    return [value[0] ?? 100, value[1] ?? value[0] ?? 100, 100]
  }
  return value.slice(0, 1)
}
