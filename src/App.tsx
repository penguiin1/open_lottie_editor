import React, { useEffect, useState } from 'react'
import Toolbar from './components/Toolbar'
import LayerList from './components/LayerList'
import CanvasStage from './components/CanvasStage'
import PropertiesPanel from './components/PropertiesPanel'
import Timeline from './components/Timeline'
import ExportDialog from './components/ExportDialog'
import InteractivityPanel from './components/InteractivityPanel'
import { useStore } from './store/useStore'

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/** Last line of defense: a malformed document must never white-screen the
 *  whole app and destroy the session. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, lineHeight: 1.6 }}>
          <h2>Something went wrong rendering this document.</h2>
          <p style={{ color: 'var(--text-dim)' }}>{String(this.state.error)}</p>
          <button
            className="primary"
            onClick={() => {
              useStore.getState().undo()
              this.setState({ error: null })
            }}
          >
            Undo last action and recover
          </button>{' '}
          <button onClick={() => location.reload()}>Reload app</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [exportOpen, setExportOpen] = useState(false)
  const [interactivityOpen, setInteractivityOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While a text field is focused, let the browser handle everything
      // (including native input undo via Ctrl+Z).
      if (isTyping(e)) return
      const s = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedInd != null) {
        e.preventDefault()
        s.deleteLayer(s.selectedInd)
      } else if (e.key === 'Escape' && s.tool !== 'pen' && s.selectedInd != null) {
        s.selectLayer(null)
      } else if (e.key === 'ArrowLeft') {
        s.setPlaying(false)
        s.setFrame(s.currentFrame - (e.shiftKey ? 10 : 1))
      } else if (e.key === 'ArrowRight') {
        s.setPlaying(false)
        s.setFrame(s.currentFrame + (e.shiftKey ? 10 : 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ErrorBoundary>
      <div className="app">
        <Toolbar
          onExport={() => setExportOpen(true)}
          onInteractivity={() => setInteractivityOpen(true)}
        />
        <LayerList />
        <CanvasStage />
        <PropertiesPanel />
        <Timeline />
        {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
        {interactivityOpen && <InteractivityPanel onClose={() => setInteractivityOpen(false)} />}
      </div>
    </ErrorBoundary>
  )
}
