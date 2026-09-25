import { useEffect, useRef, useState } from 'react'
import { MAX_BACKUP_BYTES } from '../data/profileTransfer.ts'

export default function ProfileTransfer({ library }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const url = useRef(null)
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])
  function download() {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(new Blob([JSON.stringify(library.exportProfiles(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url.current; link.download = 'mirror-image-profiles-v1.json'; link.click()
  }
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setMessage(''); setFailed(false)
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a profile backup smaller than 30 MB.')
      const count = await library.importProfiles(JSON.parse(await file.text()))
      setMessage(`Imported ${count} profiles. Your other custom memes are still here.`)
    } catch (cause) { setFailed(true); setMessage(cause instanceof SyntaxError ? 'This file is not valid JSON.' : cause.message) }
    finally { setBusy(false) }
  }
  return <section className="settings-controls" aria-label="Profile backup"><h2>Take your expressions with you.</h2>
    <p>Back up your images, saved poses, and hidden memes. Import adds or updates matching profiles; it keeps your other custom memes and existing hidden choices.</p>
    <div className="booth-actions"><button className="secondary" disabled={!library.ready || busy} onClick={download}>Export profiles</button>
      <label className="profile-import">{busy ? 'Importing profiles…' : 'Import profiles'}<input type="file" accept="application/json,.json" disabled={!library.ready || busy} onChange={upload} /></label></div>
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>
}
