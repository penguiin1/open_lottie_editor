import { useEffect, useRef, useState } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import { useStore } from '../store/useStore'
import { cleanDoc } from '../io/download'
import { serializeStateMachine, type EditorSM } from '../lottie/statemachine'

// Serve the WASM from our own bundle instead of a CDN — keeps the
// "nothing leaves your machine" promise intact.
DotLottie.setWasmUrl(wasmUrl)

export default function InteractivePreview({
  sm,
  onClose,
}: {
  sm: EditorSM
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading runtime…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const doc = cleanDoc(useStore.getState().doc)

    const player = new DotLottie({
      canvas,
      data: JSON.stringify(doc),
      autoplay: false,
      loop: false,
    })

    player.addEventListener('load', () => {
      // The engine accepts 'Fire' for event actions per dotlottie-rs sources,
      // but some engine builds use 'FireEvent' — try both.
      let loaded = player.stateMachineLoadData(JSON.stringify(serializeStateMachine(sm, '', 'Fire')))
      if (!loaded) {
        loaded = player.stateMachineLoadData(
          JSON.stringify(serializeStateMachine(sm, '', 'FireEvent')),
        )
      }
      if (!loaded) {
        setError('State machine was rejected by the dotLottie runtime.')
        return
      }
      // The player attaches the needed pointer/click listeners to the canvas
      // itself on start — no manual event forwarding required.
      if (!player.stateMachineStart()) {
        setError('State machine failed to start.')
        return
      }
      setStatus(`running · state: ${player.stateMachineGetCurrentState() || sm.initial}`)
    })
    player.addEventListener('loadError' as any, (e: any) =>
      setError(`Load error: ${e?.error ?? 'unknown'}`),
    )
    player.addEventListener('stateMachineError' as any, (e: any) =>
      setError(`Runtime: ${e?.error ?? 'unknown error'}`),
    )
    player.addEventListener('stateMachineStateEntered' as any, (e: any) =>
      setStatus(`state: ${e?.state ?? '?'}`),
    )
    player.addEventListener('stateMachineTransition' as any, (e: any) =>
      setStatus(`${e?.fromState} → ${e?.toState}`),
    )

    return () => player.destroy()
  }, [sm])

  return (
    <div className="modal-backdrop" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Interactive test</h2>
        <div className="tagline">Official dotlottie-web runtime · exactly what ships</div>
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          style={{ width: '100%', borderRadius: 8, background: '#fff' }}
        />
        <div className="prop-row" style={{ justifyContent: 'space-between' }}>
          <span style={{ color: error ? 'var(--danger)' : 'var(--ok)', fontSize: 12 }}>
            {error ?? status}
          </span>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
