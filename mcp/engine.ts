// Headless Lottie editing engine for the MCP server.
//
// Wraps the editor's pure modules (src/lottie/*) into document-level
// operations. No React, no Zustand, no history — just load a doc, mutate it,
// save it. Every mutation funnels through the same functions the GUI editor
// uses, so MCP edits and GUI edits are byte-for-byte equivalent.

import { readFileSync, writeFileSync } from 'node:fs'
import { normalizeDoc } from '../src/lottie/normalize'
import {
  upsertKeyframe,
  setStatic,
  removeKeyframeAt,
  applyEasing,
  getValue,
  isAnimated,
  keyframeTimes,
} from '../src/lottie/props'
import { createEmptyDoc, createShapeLayer, type ShapeKind } from '../src/lottie/doc'
import { solveTwoBoneIK } from '../src/lottie/rig'
import type { AnimProp, EasingName, LottieDoc, LottieLayer, TransformKey } from '../src/types/lottie'

export type { ShapeKind, TransformKey, EasingName }

// --- document I/O ----------------------------------------------------------

/** Read + parse + normalize a Lottie JSON file (normalize is mandatory: it is
 *  the gate that makes every downstream edit safe). */
export function loadDocFromFile(path: string): LottieDoc {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return normalizeDoc(raw)
}

export function saveDocToFile(path: string, doc: LottieDoc, pretty = false): void {
  writeFileSync(path, JSON.stringify(doc, null, pretty ? 2 : 0))
}

export function newDoc(w = 512, h = 512, fr = 30, op = 90, name?: string): LottieDoc {
  const doc = createEmptyDoc(w, h, fr, op)
  if (name) doc.nm = name
  return doc
}

// --- layer access ----------------------------------------------------------

/** Layers of the composition being edited: the root doc, or a precomp asset. */
export function getLayers(doc: LottieDoc, compId?: string | null): LottieLayer[] {
  if (compId) {
    const a = doc.assets?.find((x: any) => x?.id === compId)
    if (a && Array.isArray(a.layers)) return a.layers
  }
  return doc.layers
}

export function findLayer(
  doc: LottieDoc,
  ind: number,
  compId?: string | null,
): LottieLayer | undefined {
  return getLayers(doc, compId).find((l) => l.ind === ind)
}

function requireLayer(doc: LottieDoc, ind: number, compId?: string | null): LottieLayer {
  const l = findLayer(doc, ind, compId)
  if (!l) throw new Error(`layer ind=${ind} not found${compId ? ` in comp ${compId}` : ''}`)
  return l
}

/** Walk an object path like ['shapes', 2, 'e'] down from a layer. */
export function getAtPath(obj: any, path: (string | number)[]): any {
  let cur = obj
  for (const seg of path) cur = cur?.[seg]
  return cur
}

/** Pad UI-supplied transform values to the dimension count Lottie expects.
 *  Mirrors the GUI store so MCP and GUI writes are identical. */
export function padDims(key: TransformKey, value: number[]): number[] {
  if (key === 'p') {
    return value.length >= 3 ? value.slice(0, 3) : [value[0] ?? 0, value[1] ?? 0, 0]
  }
  if (key === 's') {
    return value.length >= 3 ? value.slice(0, 3) : [value[0] ?? 100, value[1] ?? value[0] ?? 100, 100]
  }
  return value.slice(0, 1)
}

// --- summaries (compact, model-friendly views) -----------------------------

export function docSummary(doc: LottieDoc) {
  return {
    v: doc.v,
    name: doc.nm,
    w: doc.w,
    h: doc.h,
    fps: doc.fr,
    in: doc.ip,
    out: doc.op,
    layers: doc.layers.length,
    assets: (doc.assets ?? []).length,
  }
}

export function layerSummary(l: LottieLayer) {
  return {
    ind: l.ind,
    name: l.nm,
    type: l.ty,
    parent: l.parent ?? null,
    in: l.ip,
    out: l.op,
    animated: {
      p: isAnimated(l.ks?.p),
      s: isAnimated(l.ks?.s),
      r: isAnimated(l.ks?.r),
      o: isAnimated(l.ks?.o),
    },
    keyframes: {
      p: keyframeTimes(l.ks?.p),
      s: keyframeTimes(l.ks?.s),
      r: keyframeTimes(l.ks?.r),
      o: keyframeTimes(l.ks?.o),
    },
  }
}

export function listLayers(doc: LottieDoc, compId?: string | null) {
  return getLayers(doc, compId).map(layerSummary)
}

// --- layer creation --------------------------------------------------------

export function addShapeLayer(
  doc: LottieDoc,
  kind: ShapeKind,
  name?: string,
  compId?: string | null,
): number {
  const layers = getLayers(doc, compId)
  const ind = layers.reduce((m, l) => Math.max(m, l.ind), 0) + 1
  const layer = createShapeLayer(doc, kind, ind, layers.length)
  if (name) layer.nm = name
  layers.unshift(layer) // first in array = top of stack
  return ind
}

// --- transform animation ---------------------------------------------------

export function setTransformKeyframe(
  doc: LottieDoc,
  ind: number,
  key: TransformKey,
  frame: number,
  value: number[],
  easing: EasingName = 'easeInOut',
  compId?: string | null,
) {
  const l = requireLayer(doc, ind, compId)
  const prop = l.ks[key] as AnimProp
  upsertKeyframe(prop, frame, padDims(key, value), easing)
  return { ind, key, frame, value: getValue(prop, frame) }
}

export function setTransformStatic(
  doc: LottieDoc,
  ind: number,
  key: TransformKey,
  value: number[],
  compId?: string | null,
) {
  const l = requireLayer(doc, ind, compId)
  setStatic(l.ks[key] as AnimProp, padDims(key, value))
  return { ind, key, value: padDims(key, value) }
}

export function removeTransformKeyframe(
  doc: LottieDoc,
  ind: number,
  key: TransformKey,
  frame: number,
  compId?: string | null,
) {
  const l = requireLayer(doc, ind, compId)
  const removed = removeKeyframeAt(l.ks[key] as AnimProp, frame)
  return { ind, key, frame, removed }
}

export function setTransformEasing(
  doc: LottieDoc,
  ind: number,
  key: TransformKey,
  easing: EasingName,
  compId?: string | null,
) {
  const l = requireLayer(doc, ind, compId)
  applyEasing(l.ks[key] as AnimProp, easing)
  return { ind, key, easing }
}

/** Keyframe an arbitrary animatable property addressed by object path within a
 *  layer — e.g. a fill color ['shapes',1,'c'] or a trim start ['shapes',2,'s']. */
export function setPropertyKeyframe(
  doc: LottieDoc,
  ind: number,
  path: (string | number)[],
  frame: number,
  value: number[],
  easing: EasingName = 'easeInOut',
  compId?: string | null,
) {
  const l = requireLayer(doc, ind, compId)
  const prop = getAtPath(l, path) as AnimProp
  if (!prop || typeof prop !== 'object' || !('k' in prop)) {
    throw new Error(`path ${JSON.stringify(path)} is not an animatable property on layer ${ind}`)
  }
  upsertKeyframe(prop, frame, value, easing)
  return { ind, path, frame, value: getValue(prop, frame) }
}

// --- rigging ---------------------------------------------------------------

/** Set or clear a layer's parent (a bone link). Rejects self-parenting and
 *  cycles so players never see a broken rig. */
export function setParent(
  doc: LottieDoc,
  childInd: number,
  parentInd: number | null,
  compId?: string | null,
) {
  const layers = getLayers(doc, compId)
  const child = layers.find((l) => l.ind === childInd)
  if (!child) throw new Error(`child layer ind=${childInd} not found`)
  if (parentInd == null) {
    delete child.parent
    return { childInd, parent: null }
  }
  if (parentInd === childInd) throw new Error('a layer cannot be its own parent')
  if (!layers.some((l) => l.ind === parentInd)) {
    throw new Error(`parent layer ind=${parentInd} not found`)
  }
  // Walk up from the proposed parent; if we reach the child, it's a cycle.
  let cur: number | undefined = parentInd
  const seen = new Set<number>()
  while (cur != null && !seen.has(cur)) {
    if (cur === childInd) throw new Error('that link would create a parent cycle')
    seen.add(cur)
    cur = layers.find((l) => l.ind === cur)?.parent
  }
  child.parent = parentInd
  return { childInd, parent: parentInd }
}

/** Analytic 2-bone IK: rotate `ind`'s parent and grandparent so `ind`'s pivot
 *  reaches the composition-space target. When commit is true, the solution is
 *  written as rotation keyframes at `frame`. */
export function ikReach(
  doc: LottieDoc,
  ind: number,
  frame: number,
  targetX: number,
  targetY: number,
  commit = true,
  easing: EasingName = 'easeInOut',
  compId?: string | null,
) {
  const layers = getLayers(doc, compId)
  const sel = layers.find((l) => l.ind === ind)
  if (!sel) throw new Error(`layer ind=${ind} not found`)
  const sol = solveTwoBoneIK(layers, sel, frame, targetX, targetY)
  if (!sol) {
    throw new Error(
      'IK has no solution: the layer needs a 2-bone chain (a parent and a grandparent) ' +
        'and the chain must be at ~100% scale. Set parents first with set_parent.',
    )
  }
  if (commit) {
    const root = layers.find((l) => l.ind === sol.rootInd)!
    const mid = layers.find((l) => l.ind === sol.midInd)!
    upsertKeyframe(root.ks.r as AnimProp, frame, [sol.rootR], easing)
    upsertKeyframe(mid.ks.r as AnimProp, frame, [sol.midR], easing)
  }
  return { ...sol, frame, committed: commit }
}

// --- validation ------------------------------------------------------------

export function validate(doc: LottieDoc) {
  normalizeDoc(doc) // idempotent; repairs anything an edit left non-canonical
  const issues: string[] = []
  const check = (layers: LottieLayer[], where: string) => {
    const inds = new Set(layers.map((l) => l.ind))
    for (const l of layers) {
      if (!l.ks) issues.push(`${where}: layer ${l.ind} (${l.nm}) is missing its transform (ks)`)
      if (l.parent != null && !inds.has(l.parent)) {
        issues.push(`${where}: layer ${l.ind} (${l.nm}) references missing parent ${l.parent}`)
      }
      let cur: number | undefined = l.parent
      const seen = new Set<number>([l.ind])
      while (cur != null && !seen.has(cur)) {
        seen.add(cur)
        cur = layers.find((x) => x.ind === cur)?.parent
      }
      if (cur != null) issues.push(`${where}: layer ${l.ind} (${l.nm}) is in a parent cycle`)
    }
  }
  check(doc.layers, 'root')
  for (const a of doc.assets ?? []) {
    if (a && Array.isArray(a.layers)) check(a.layers, `asset ${a.id}`)
  }
  return { ok: issues.length === 0, issues, layers: doc.layers.length }
}
