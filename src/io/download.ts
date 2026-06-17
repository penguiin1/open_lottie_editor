export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Strip editor-only keys (state machine) from the animation JSON. */
export function cleanDoc<T>(doc: T): T {
  if (doc && typeof doc === 'object' && '__sm' in (doc as any)) {
    const { __sm, ...rest } = doc as any
    return rest as T
  }
  return doc
}

export function exportJson(doc: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(cleanDoc(doc))], { type: 'application/json' })
  downloadBlob(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}
