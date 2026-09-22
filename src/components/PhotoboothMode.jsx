import { useCallback, useEffect, useRef, useState } from 'react'
import Photobooth from './Photobooth.jsx'
import { composeStrip, memeImageUrl } from '../photobooth/capture.js'

function StripBooth(props) {
  const { memes } = props
  const [ids, setIds] = useState(() => Array.from({ length: 4 }, (_, i) => memes[i % memes.length]?.id ?? ''))
  const [targets, setTargets] = useState(null)
  const [shots, setShots] = useState([null, null, null, null])
  const [index, setIndex] = useState(0)
  const [review, setReview] = useState(false)
  const [stripUrl, setStripUrl] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ownedUrls = useRef(new Set())
  const choices = ids.map((id, i) => memes.find((meme) => meme.id === id) ?? memes[i % memes.length])
  const complete = shots.every(Boolean)

  useEffect(() => {
    const urls = ownedUrls.current
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear() }
  }, [])

  useEffect(() => {
    if (!complete) return
    let cancelled = false
    let url
    composeStrip(shots).then((blob) => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setStripUrl(url)
    }).catch(() => { if (!cancelled) setError('Could not prepare the strip. Your four photos are still here.') })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [shots, complete, retry])

  const acceptShot = useCallback((shot) => {
    setStripUrl(null)
    setError('')
    const url = URL.createObjectURL(shot.blob)
    ownedUrls.current.add(url)
    const previous = shots[index]
    if (previous) {
      URL.revokeObjectURL(previous.url)
      ownedUrls.current.delete(previous.url)
    }
    const next = shots.map((entry, i) => i === index ? { ...shot, url } : entry)
    setShots(next)
    const missing = next.findIndex((entry) => !entry)
    if (missing < 0) setReview(true)
    else setIndex(missing)
  }, [index, shots])

  function shuffle() {
    const shuffled = [...memes]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setIds(Array.from({ length: 4 }, (_, i) => shuffled[i % shuffled.length].id))
  }

  if (!memes.length) return <p>Your library is empty. <a href="#meme-collection">Add a meme to start a strip.</a></p>
  return <section aria-label="Four-pose photobooth">
    <div className="view-heading"><div><p className="eyebrow">FOUR-POSE STRIP</p><h1>{review ? 'Four poses. One keepsake.' : targets ? `Pose ${index + 1} of 4` : 'Pick your four poses.'}</h1></div><p>{targets && !review ? targets[index].name : 'Your photos, beside their inspirations.'}</p></div>
    {!targets ? <>
      <div className="strip-choices">{choices.map((meme, i) => <div key={i} className="strip-choice">
        <img src={memeImageUrl(meme.image)} alt={meme.alt || meme.name} />
        <label htmlFor={`strip-pose-${i}`}>Pose {i + 1}</label>
        <select id={`strip-pose-${i}`} value={meme.id} onChange={(event) => setIds((current) => current.map((id, n) => n === i ? event.target.value : id))}>
          {memes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </div>)}</div>
      <div className="booth-actions"><button className="primary" onClick={() => setTargets(choices)}>Start strip</button><button className="secondary" onClick={shuffle}>Shuffle poses</button></div>
      <p className="booth-hint">Choose four memes, or shuffle for a surprise. Start each pose when you’re ready. You can retake individual photos at the end.</p>
    </> : review ? <>
      <div className="strip-review">{shots.map((shot, i) => <div key={i}><img src={shot.url} alt={`Pose ${i + 1}: your photo beside ${shot.name}`} /><button className="secondary" onClick={() => { setIndex(i); setReview(false) }}>Retake pose {i + 1}</button></div>)}</div>
      <div className="booth-actions">{stripUrl ? <a className="booth-download" href={stripUrl} download="mirror-image-four-poses.png">Download strip</a> : <span role="status">{error || 'Preparing your strip…'}</span>}{error && <button onClick={() => setRetry((n) => n + 1)}>Try export again</button>}</div>
      <p className="booth-hint">Download to keep your strip. Leaving Photobooth or changing format discards these previews.</p>
    </> : <>
      <ol className="strip-progress" aria-label="Strip progress">{targets.map((target, i) => <li key={i} aria-current={i === index ? 'step' : undefined}>{i + 1}. {target.name}<span>{shots[i] ? 'Captured' : i === index ? 'Current pose' : 'Up next'}</span></li>)}</ol>
      <Photobooth key={index} {...props} target={targets[index]} onCaptured={acceptShot} />
      {complete && <button className="secondary" onClick={() => setReview(true)}>Back to strip</button>}
    </>}
  </section>
}

export default function PhotoboothMode(props) {
  const [format, setFormat] = useState('single')
  const [session, setSession] = useState(0)
  return <>
    <div className="booth-format" role="group" aria-label="Photo format">
      <button aria-pressed={format === 'single'} onClick={() => setFormat('single')}>Single photo</button>
      <button aria-pressed={format === 'strip'} onClick={() => setFormat('strip')}>Four-pose strip</button>
      {format === 'strip' && <button className="strip-new" onClick={() => setSession((n) => n + 1)}>New strip</button>}
    </div>
    {format === 'single' ? <Photobooth {...props} /> : <StripBooth key={session} {...props} />}
  </>
}
