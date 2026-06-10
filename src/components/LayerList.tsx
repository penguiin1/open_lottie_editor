import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function LayerList() {
  const layers = useStore((s) => s.doc.layers)
  const selectedInd = useStore((s) => s.selectedInd)
  const selectLayer = useStore((s) => s.selectLayer)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const renameLayer = useStore((s) => s.renameLayer)
  const moveLayer = useStore((s) => s.moveLayer)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const commitRename = (ind: number) => {
    if (draft.trim()) renameLayer(ind, draft.trim())
    setEditing(null)
  }

  return (
    <div className="layers">
      <div className="panel-title">Layers</div>
      <div className="layer-rows">
        {layers.length === 0 && (
          <div className="empty">
            No layers yet.
            <br />
            Add a shape from the toolbar, or load a sample.
          </div>
        )}
        {layers.map((l, i) => (
          <div
            key={l.ind}
            className={`layer-row${l.ind === selectedInd ? ' selected' : ''}`}
            onClick={() => selectLayer(l.ind)}
            onDoubleClick={() => {
              setEditing(l.ind)
              setDraft(l.nm)
            }}
          >
            {editing === l.ind ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(l.ind)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(l.ind)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="name" title={l.nm}>
                {l.nm}
              </span>
            )}
            <button
              className="mini"
              title="Move up"
              disabled={i === 0}
              onClick={(e) => {
                e.stopPropagation()
                moveLayer(l.ind, -1)
              }}
            >
              ▲
            </button>
            <button
              className="mini"
              title="Move down"
              disabled={i === layers.length - 1}
              onClick={(e) => {
                e.stopPropagation()
                moveLayer(l.ind, 1)
              }}
            >
              ▼
            </button>
            <button
              className="mini"
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation()
                duplicateLayer(l.ind)
              }}
            >
              ⧉
            </button>
            <button
              className="mini"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                deleteLayer(l.ind)
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
