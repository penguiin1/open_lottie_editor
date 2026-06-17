import { EASINGS } from './easing'
import type { EasingName } from '../types/lottie'

// ---------------------------------------------------------------------------
// Editor-side state machine model.
//
// The editor keeps a deliberately small internal model and serializes it to
// the dotLottie v2 state machine JSON only at export/preview time, so UI code
// never depends on spec field names. Schema verified against the
// dotlottie-web 0.74.0 WASM engine — see docs/dotlottie-v2-reference.md.
//
// Trigger kinds:
// - Event triggers (Click/Pointer*/OnComplete): an interaction fires an Event
//   input; transitions guard on it.
// - Hover triggers (HoverIn/HoverOut): PointerEnter/Exit interactions set a
//   Boolean input; transitions guard on its value. More robust than enter/
//   exit events because the condition holds across state changes.
// ---------------------------------------------------------------------------

export type SMTrigger =
  | 'Click'
  | 'PointerDown'
  | 'PointerUp'
  | 'PointerEnter'
  | 'PointerExit'
  | 'OnComplete'
  | 'HoverIn'
  | 'HoverOut'

export const SM_TRIGGERS: SMTrigger[] = [
  'Click',
  'PointerDown',
  'PointerUp',
  'HoverIn',
  'HoverOut',
  'PointerEnter',
  'PointerExit',
  'OnComplete',
]

export const TRIGGER_LABELS: Record<SMTrigger, string> = {
  Click: 'Click',
  PointerDown: 'Pointer down',
  PointerUp: 'Pointer up',
  PointerEnter: 'Pointer enter (event)',
  PointerExit: 'Pointer exit (event)',
  OnComplete: 'Animation complete',
  HoverIn: 'Hover starts',
  HoverOut: 'Hover ends',
}

export interface SMStateDef {
  name: string
  /** Lottie marker name (cm) this state plays. */
  segment: string
  loop: boolean
  speed: number
}

export interface SMTransitionDef {
  from: string
  to: string
  trigger: SMTrigger
  /** Restrict the trigger's hit-test to a named layer (whole canvas if unset). */
  hitLayer?: string
  /** Cross-fade into the target state instead of cutting. */
  tween?: { duration: number; easing: EasingName }
}

export interface EditorSM {
  id: string
  initial: string
  states: SMStateDef[]
  transitions: SMTransitionDef[]
}

export function emptyStateMachine(): EditorSM {
  return { id: 'state_machine_1', initial: '', states: [], transitions: [] }
}

const isHover = (tr: SMTrigger) => tr === 'HoverIn' || tr === 'HoverOut'

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '_')

const eventInputName = (tr: SMTrigger, hitLayer?: string) =>
  `on_${tr.toLowerCase()}${hitLayer ? `__${slug(hitLayer)}` : ''}`

const hoverInputName = (hitLayer?: string) =>
  `hovered${hitLayer ? `__${slug(hitLayer)}` : ''}`

const easingArray = (name: EasingName): number[] => {
  const e = EASINGS[name]
  return [e.o.x[0], e.o.y[0], e.i.x[0], e.i.y[0]]
}

/** Serialize to dotLottie v2 state machine JSON. */
export function serializeStateMachine(
  sm: EditorSM,
  animId = '',
  fireTag: 'Fire' | 'FireEvent' = 'Fire',
): any {
  // Unique (trigger, hitLayer) pairs, split by kind.
  const eventKeys = new Map<string, { trigger: SMTrigger; hitLayer?: string }>()
  const hoverKeys = new Map<string, { hitLayer?: string }>()
  for (const t of sm.transitions) {
    if (isHover(t.trigger)) hoverKeys.set(hoverInputName(t.hitLayer), { hitLayer: t.hitLayer })
    else eventKeys.set(eventInputName(t.trigger, t.hitLayer), { trigger: t.trigger, hitLayer: t.hitLayer })
  }

  const guardFor = (t: SMTransitionDef) =>
    isHover(t.trigger)
      ? {
          type: 'Boolean',
          inputName: hoverInputName(t.hitLayer),
          conditionType: 'Equal',
          compareTo: t.trigger === 'HoverIn',
        }
      : { type: 'Event', inputName: eventInputName(t.trigger, t.hitLayer) }

  const interactions: any[] = []
  for (const [name, { trigger, hitLayer }] of eventKeys) {
    interactions.push({
      type: trigger,
      ...(hitLayer ? { layerName: hitLayer } : {}),
      actions: [{ type: fireTag, inputName: name }],
    })
  }
  for (const [name, { hitLayer }] of hoverKeys) {
    interactions.push(
      {
        type: 'PointerEnter',
        ...(hitLayer ? { layerName: hitLayer } : {}),
        actions: [{ type: 'SetBoolean', inputName: name, value: true }],
      },
      {
        type: 'PointerExit',
        ...(hitLayer ? { layerName: hitLayer } : {}),
        actions: [{ type: 'SetBoolean', inputName: name, value: false }],
      },
    )
  }

  return {
    initial: sm.initial || sm.states[0]?.name || '',
    states: sm.states.map((st) => ({
      type: 'PlaybackState',
      name: st.name,
      animation: animId,
      ...(st.segment ? { segment: st.segment } : {}),
      loop: st.loop,
      autoplay: true,
      speed: st.speed,
      mode: 'Forward',
      transitions: sm.transitions
        .filter((t) => t.from === st.name)
        .map((t) => ({
          type: t.tween ? 'Tweened' : 'Transition',
          toState: t.to,
          guards: [guardFor(t)],
          ...(t.tween
            ? { duration: t.tween.duration, easing: easingArray(t.tween.easing) }
            : {}),
        })),
    })),
    inputs: [
      ...[...eventKeys.keys()].map((name) => ({ type: 'Event', name })),
      ...[...hoverKeys.keys()].map((name) => ({ type: 'Boolean', name, value: false })),
    ],
    interactions,
  }
}

function easingNameFromArray(arr: unknown): EasingName {
  if (Array.isArray(arr)) {
    for (const [name, e] of Object.entries(EASINGS)) {
      const a = [e.o.x[0], e.o.y[0], e.i.x[0], e.i.y[0]]
      if (a.every((v, i) => Math.abs(v - Number(arr[i])) < 0.001)) return name as EasingName
    }
  }
  return 'easeInOut'
}

/** Best-effort inverse of serializeStateMachine for round-tripping our own
 *  .lottie files. Returns null for foreign state machines that don't match
 *  the editor's pattern. */
export function deserializeStateMachine(json: any, id: string): EditorSM | null {
  try {
    if (!json || !Array.isArray(json.states)) return null

    // Map input names back to (trigger, hitLayer) via the interactions list.
    const eventMeta = new Map<string, { trigger: SMTrigger; hitLayer?: string }>()
    const hoverLayers = new Map<string, string | undefined>()
    for (const it of json.interactions ?? []) {
      const action = it?.actions?.[0]
      if (!action) continue
      if ((action.type === 'Fire' || action.type === 'FireEvent') && SM_TRIGGERS.includes(it.type)) {
        eventMeta.set(String(action.inputName), { trigger: it.type, hitLayer: it.layerName })
      } else if (it.type === 'PointerEnter' && action.type === 'SetBoolean') {
        hoverLayers.set(String(action.inputName), it.layerName)
      }
    }

    const states: SMStateDef[] = []
    const transitions: SMTransitionDef[] = []
    for (const st of json.states) {
      if (st?.type !== 'PlaybackState' || typeof st.name !== 'string') return null
      states.push({
        name: st.name,
        segment: typeof st.segment === 'string' ? st.segment : '',
        loop: st.loop !== false,
        speed: typeof st.speed === 'number' ? st.speed : 1,
      })
      for (const t of st.transitions ?? []) {
        if (typeof t?.toState !== 'string') return null
        const g = t.guards?.[0]
        let def: SMTransitionDef | null = null
        if (g?.type === 'Event') {
          const meta = eventMeta.get(String(g.inputName))
          if (meta) def = { from: st.name, to: t.toState, trigger: meta.trigger, hitLayer: meta.hitLayer }
        } else if (g?.type === 'Boolean' && String(g.inputName).startsWith('hovered')) {
          def = {
            from: st.name,
            to: t.toState,
            trigger: g.compareTo === false ? 'HoverOut' : 'HoverIn',
            hitLayer: hoverLayers.get(String(g.inputName)),
          }
        }
        if (!def) return null
        if (t.type === 'Tweened') {
          def.tween = {
            duration: typeof t.duration === 'number' ? t.duration : 0.3,
            easing: easingNameFromArray(t.easing),
          }
        }
        transitions.push(def)
      }
    }
    return { id, initial: String(json.initial ?? states[0]?.name ?? ''), states, transitions }
  } catch {
    return null
  }
}

/** Validation problems shown in the editor before export. */
export function validateStateMachine(
  sm: EditorSM,
  markerNames: string[],
  layerNames: string[] = [],
): string[] {
  const problems: string[] = []
  if (sm.states.length === 0) problems.push('Add at least one state.')
  const names = new Set<string>()
  for (const st of sm.states) {
    if (!st.name.trim()) problems.push('A state has an empty name.')
    if (names.has(st.name)) problems.push(`Duplicate state name "${st.name}".`)
    names.add(st.name)
    if (!markerNames.includes(st.segment)) {
      problems.push(`State "${st.name}" plays segment "${st.segment}" which doesn't exist.`)
    }
  }
  if (sm.states.length > 0 && !names.has(sm.initial || sm.states[0].name)) {
    problems.push('Initial state does not exist.')
  }
  for (const t of sm.transitions) {
    if (!names.has(t.from)) problems.push(`Transition from unknown state "${t.from}".`)
    if (!names.has(t.to)) problems.push(`Transition to unknown state "${t.to}".`)
    if (t.hitLayer && layerNames.length > 0 && !layerNames.includes(t.hitLayer)) {
      problems.push(`Transition hit-tests layer "${t.hitLayer}" which doesn't exist.`)
    }
  }
  return problems
}
