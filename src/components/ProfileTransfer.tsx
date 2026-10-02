import { useEffect, useRef, useState } from 'react'
import { MAX_BACKUP_BYTES } from '../data/profileTransfer.ts'

export default function ProfileTransfer({ library }) {
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const url = useRef(null)
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])
  function download() {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(new Blob([JSON.stringify(library.exportProfiles(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url.current; link.download = 'mirror-image-profiles-v2.json'; link.click()
  }
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setMessage(''); setFailed(false)
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a profile backup smaller than 30 MB.')
      const {count, skipped} = await library.importProfiles(JSON.parse(await file.text()))
      setMessage(`Imported ${count} profiles. Other custom profiles and hidden built-ins were preserved.${skipped ? ` Skipped ${skipped} retired profiles.` : ''}`)
    } catch (cause) { setFailed(true); setMessage(cause instanceof SyntaxError ? 'This file is not valid JSON.' : cause.message) }
    finally { setBusy(false) }
  }
  return <section className="settings-controls" aria-label="Profile backup"><h2>Profile backup</h2>
    <p>Save a backup of your custom images, profile edits, and hidden profiles. Import a backup to add or update profiles in this browser.</p>
    <button className="secondary" disabled={!library.ready} onClick={() => setPreview(JSON.stringify(library.exportProfiles(), null, 2))}>Preview backup</button>
    {preview && <label>Backup JSON<textarea aria-label="Backup JSON" readOnly value={preview} rows={8} /></label>}
    <div className="booth-actions"><button className="secondary" disabled={!library.ready || busy} onClick={download}>Export profiles</button>
      <label className={`profile-import ${!library.ready || busy ? 'is-disabled' : ''}`}>{busy ? 'Importing profiles…' : 'Import profiles'}<input type="file" accept="application/json,.json" disabled={!library.ready || busy} onChange={upload} /></label></div>
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>
}
