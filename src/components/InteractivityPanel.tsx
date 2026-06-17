import { useState } from 'react'
import { useStore } from '../store/useStore'
import {
  emptyStateMachine,
  SM_TRIGGERS,
  TRIGGER_LABELS,
  validateStateMachine,
  type EditorSM,
  type SMTrigger,
} from '../lottie/statemachine'
import { EASING_NAMES } from '../lottie/easing'
import type { EasingName } from '../types/lottie'
import InteractivePreview from './InteractivePreview'

export default function InteractivityPanel({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc)
  const sm: EditorSM = ((doc as any).__sm as EditorSM) ?? emptyStateMachine()
  const markers: string[] = (doc.markers ?? []).map((m: any) => String(m.cm))
  const layerNames: string[] = doc.layers.map((l) => l.nm)
  const [testing, setTesting] = useState(false)

  const commit = (next: EditorSM) => useStore.getState().setStateMachine(next)

  const addState = () => {
    const name = `state_${sm.states.length + 1}`
    commit({
      ...sm,
      initial: sm.initial || name,
      states: [
        ...sm.states,
        { name, segment: markers[0] ?? '', loop: true, speed: 1 },
      ],
    })
  }

  const updateState = (i: number, patch: Partial<EditorSM['states'][number]>) => {
    const oldName = sm.states[i].name
    const states = sm.states.map((st, j) => (j === i ? { ...st, ...patch } : st))
    // renames cascade into transitions + initial
    let { transitions, initial } = sm
    if (patch.name && patch.name !== oldName) {
      transitions = transitions.map((t) => ({
        ...t,
        from: t.from === oldName ? patch.name! : t.from,
        to: t.to === oldName ? patch.name! : t.to,
      }))
      if (initial === oldName) initial = patch.name
    }
    commit({ ...sm, states, transitions, initial })
  }

  const removeState = (i: number) => {
    const name = sm.states[i].name
    commit({
      ...sm,
      states: sm.states.filter((_, j) => j !== i),
      transitions: sm.transitions.filter((t) => t.from !== name && t.to !== name),
      initial: sm.initial === name ? (sm.states.find((_, j) => j !== i)?.name ?? '') : sm.initial,
    })
  }

  const addTransition = () => {
    if (sm.states.length === 0) return
    commit({
      ...sm,
      transitions: [
        ...sm.transitions,
        {
          from: sm.states[0].name,
          to: sm.states[Math.min(1, sm.states.length - 1)].name,
          trigger: 'Click',
        },
      ],
    })
  }

  const updateTransition = (i: number, patch: Partial<EditorSM['transitions'][number]>) => {
    commit({
      ...sm,
      transitions: sm.transitions.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    })
  }

  const problems = validateStateMachine(sm, markers, layerNames)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Interactivity — state machine</h2>
        <div className="tagline">
          Exports as a dotLottie v2 state machine · runs on the official MIT players
        </div>

        {markers.length === 0 && (
          <div className="hint" style={{ padding: '4px 0' }}>
            First define segments (named frame ranges) in the Composition panel — states play
            segments.
          </div>
        )}

        <div className="sm-section-title">States</div>
        {sm.states.map((st, i) => (
          <div className="sm-row" key={i}>
            <input
              type="text"
              style={{ width: 110 }}
              key={`${i}-${st.name}`}
              defaultValue={st.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== st.name) updateState(i, { name: v })
              }}
            />
            <span className="dim">plays</span>
            <select value={st.segment} onChange={(e) => updateState(i, { segment: e.target.value })}>
              {!markers.includes(st.segment) && <option value={st.segment}>{st.segment || '—'}</option>}
              {markers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="dim">
              <input
                type="checkbox"
                checked={st.loop}
                onChange={(e) => updateState(i, { loop: e.target.checked })}
              />
              loop
            </label>
            <label className="dim">
              ×
              <input
                type="number"
                step={0.1}
                min={0.1}
                style={{ width: 52 }}
                value={st.speed}
                onChange={(e) => updateState(i, { speed: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="dim">
              <input
                type="radio"
                name="sm-initial"
                checked={(sm.initial || sm.states[0]?.name) === st.name}
                onChange={() => commit({ ...sm, initial: st.name })}
              />
              initial
            </label>
            <button className="link-btn" onClick={() => removeState(i)}>
              ×
            </button>
          </div>
        ))}
        <button onClick={addState} disabled={markers.length === 0}>
          + Add state
        </button>

        <div className="sm-section-title">Transitions</div>
        {sm.transitions.map((t, i) => (
          <div className="sm-row" key={i}>
            <span className="dim">on</span>
            <select
              value={t.trigger}
              onChange={(e) => updateTransition(i, { trigger: e.target.value as SMTrigger })}
            >
              {SM_TRIGGERS.map((tr) => (
                <option key={tr} value={tr}>
                  {TRIGGER_LABELS[tr]}
                </option>
              ))}
            </select>
            <span className="dim">of</span>
            <select
              value={t.hitLayer ?? ''}
              title="Restrict the hit-test to one layer (or the whole canvas)"
              onChange={(e) =>
                updateTransition(i, { hitLayer: e.target.value === '' ? undefined : e.target.value })
              }
            >
              <option value="">whole canvas</option>
              {layerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="dim">in</span>
            <select value={t.from} onChange={(e) => updateTransition(i, { from: e.target.value })}>
              {sm.states.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="dim">→</span>
            <select value={t.to} onChange={(e) => updateTransition(i, { to: e.target.value })}>
              {sm.states.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="dim">
              <input
                type="checkbox"
                checked={!!t.tween}
                onChange={(e) =>
                  updateTransition(i, {
                    tween: e.target.checked ? { duration: 0.3, easing: 'easeInOut' } : undefined,
                  })
                }
              />
              tween
            </label>
            {t.tween && (
              <>
                <input
                  type="number"
                  step={0.1}
                  min={0.05}
                  max={10}
                  style={{ width: 56 }}
                  value={t.tween.duration}
                  onChange={(e) =>
                    updateTransition(i, {
                      tween: { ...t.tween!, duration: Number(e.target.value) || 0.3 },
                    })
                  }
                />
                <span className="dim">s</span>
                <select
                  value={t.tween.easing}
                  onChange={(e) =>
                    updateTransition(i, {
                      tween: { ...t.tween!, easing: e.target.value as EasingName },
                    })
                  }
                >
                  {EASING_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              className="link-btn"
              onClick={() =>
                commit({ ...sm, transitions: sm.transitions.filter((_, j) => j !== i) })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button onClick={addTransition} disabled={sm.states.length === 0}>
          + Add transition
        </button>

        {problems.length > 0 && (
          <div className="export-error" style={{ marginTop: 10 }}>
            {problems.map((p, i) => (
              <div key={i}>• {p}</div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          <button
            className="primary"
            disabled={problems.length > 0 || sm.states.length === 0}
            onClick={() => setTesting(true)}
          >
            ▶ Test interactive
          </button>
        </div>

        {testing && <InteractivePreview sm={sm} onClose={() => setTesting(false)} />}
      </div>
    </div>
  )
}
