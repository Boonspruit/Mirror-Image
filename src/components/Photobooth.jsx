import { useEffect, useRef, useState } from 'react'
import { rankMemes } from '../matching/matcher.js'
import { captureComparison, memeImageUrl } from '../photobooth/capture.js'

export default function Photobooth({ memes, stream, phase, onStart, onStop, cameraError, result, target, onCaptured }) {
  const [selectedId, setSelectedId] = useState(memes[0]?.id ?? '')
  const meme = target ?? memes.find((entry) => entry.id === selectedId) ?? memes[0]
  const [stage, setStage] = useState('ready')
  const [count, setCount] = useState(3)
  const [progress, setProgress] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const latest = useRef(null)
  const attempt = useRef(0)
  const sequence = useRef(null)
  const photoUrl = useRef(null)
  const comparison = meme && result.vector
    ? rankMemes({ ...result.vector.expression, ...result.handFeatures }, [meme])[0]?.comparison
    : null
  const score = comparison?.percentage ?? 0
  const hasPose = phase === 'running' && result.faces > 0 && comparison?.coverage === 1 &&
    (!meme?.handFeatures || (result.hands > 0 && result.handFeatures.handPresent >= 0.5))
  useEffect(() => {
    latest.current = { meme, score, hasPose, stream, phase }
  }, [meme, score, hasPose, stream, phase])
  const busy = ['posing', 'countdown', 'capturing'].includes(stage)
  const active = ['requesting', 'loading', 'running'].includes(phase)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) video.play().catch(() => setError('Preview paused. Stop and restart the camera.'))
    return () => { video.srcObject = null }
  }, [stream, memes.length])

  useEffect(() => () => {
    attempt.current += 1
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
  }, [])

  function reset() {
    attempt.current += 1
    sequence.current = null
    setStage('ready')
    setProgress(0)
    setError('')
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    photoUrl.current = null
    setPhoto(null)
  }

  function begin(manual) {
    reset()
    if (!meme || !stream) return
    sequence.current = { manual, meme, heldSince: null, deadline: manual ? performance.now() + 3000 : null }
    setCount(3)
    setStage(manual ? 'countdown' : 'posing')
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const sequenceState = sequence.current
      if (!sequenceState) return
      const current = latest.current
      if (document.hidden || !current.stream || !['loading', 'running'].includes(current.phase)) {
        sequence.current = null
        attempt.current += 1
        setStage('ready')
        setProgress(0)
        return
      }
      const now = performance.now()
      if (!sequenceState.manual && (!current.hasPose || current.score < (sequenceState.deadline ? 75 : 85))) {
        sequenceState.heldSince = null
        sequenceState.deadline = null
        setProgress(0)
        setStage('posing')
        return
      }
      if (!sequenceState.deadline) {
        sequenceState.heldSince ??= now
        const held = now - sequenceState.heldSince
        setProgress(Math.min(100, held / 10))
        if (held < 1000) return
        sequenceState.deadline = now + 3000
        setStage('countdown')
      }
      setCount(Math.max(1, Math.ceil((sequenceState.deadline - now) / 1000)))
      if (now < sequenceState.deadline) return
      sequence.current = null
      setStage('capturing')
      const token = ++attempt.current
      captureComparison(videoRef.current, sequenceState.meme).then((blob) => {
        if (attempt.current !== token) return
        if (onCaptured) {
          onCaptured({ blob, name: sequenceState.meme.name })
          return
        }
        const url = URL.createObjectURL(blob)
        photoUrl.current = url
        setPhoto({ url, name: sequenceState.meme.name, filename: `mirror-image-${sequenceState.meme.id}.png` })
        setStage('review')
      }).catch((cause) => {
        if (attempt.current !== token) return
        setError(cause.message)
        setStage('ready')
      })
    }, 100)
    return () => clearInterval(timer)
  }, [onCaptured])

  const message = stage === 'posing'
    ? (!hasPose ? (meme?.handFeatures ? 'Keep your face and hand visible.' : 'Look toward the camera.') : score < 85 ? 'Copy the expression. Reach 85% to start the timer.' : 'Good match. Hold that pose…')
    : stage === 'countdown' ? 'Hold your pose…' : stage === 'capturing' ? 'Preparing your photo…' : 'Choose a meme, then make it your own.'

  return <section className="photobooth" aria-label="Photobooth">
    {!target && <div className="view-heading"><div><p className="eyebrow">PHOTOBOOTH</p><h1>Strike the same pose.</h1></div><p>A little imitation. A photo to keep.</p></div>}
    {!memes.length ? <p>Your library is empty. <a href="#meme-collection">Add a meme to get started.</a></p> : <>
      <div hidden={stage === 'review'}>
        {!target && <div className="booth-picker"><label htmlFor="booth-meme">Your pose</label><select id="booth-meme" value={meme.id} disabled={busy} onChange={(event) => { reset(); setSelectedId(event.target.value) }}>
          {memes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></div>}
        <div className="booth-pair">
          <div><p className="eyebrow">YOU</p><div className="booth-frame">
            <video ref={videoRef} autoPlay muted playsInline aria-label="Photobooth camera preview" />
            {!stream && <div className="booth-placeholder">{phase === 'requesting' ? 'Allow camera access to begin.' : 'Your next pose starts here.'}</div>}
            {stage === 'countdown' && <div className="booth-countdown" role="status" aria-label={`Capturing in ${count}`}><strong>{count}</strong></div>}
          </div></div>
          <div><p className="eyebrow">YOUR INSPIRATION</p><div className="booth-frame"><img src={memeImageUrl(meme.image)} alt={meme.alt || meme.name} /></div></div>
        </div>
        <div className="booth-feedback"><div><p role="status">{message}</p><small>{comparison ? `${Math.round(score)}% match` : 'Waiting for an expression'}{meme.handFeatures ? ' · Face + hand pose' : ''}</small></div>
          {stage === 'posing' && <progress aria-label="Hold your pose" value={progress} max="100" />}
        </div>
        <div className="booth-actions">
          {!active ? <button className="primary" onClick={onStart}>Start camera</button> : <>
            {busy ? <button className="secondary" onClick={reset}>Cancel capture</button> : <>
              <button className="primary" disabled={phase !== 'running'} onClick={() => begin(false)}>Start posing</button>
              <button className="secondary" disabled={!stream} onClick={() => begin(true)}>Take photo in 3 seconds</button>
            </>}
            <button className="secondary" onClick={() => { reset(); onStop() }}>{phase === 'requesting' ? 'Cancel camera' : 'Stop camera'}</button>
          </>}
        </div>
        <p className="booth-hint">Automatic capture starts at 85% held for one second. Or use the timer yourself. Photos stay here until you download them.</p>
      </div>
      {photo && stage === 'review' && <div className="booth-review"><h2>Your take on {photo.name}.</h2><img src={photo.url} alt={`Your photo beside ${photo.name}`} /><div className="booth-actions"><a className="booth-download" href={photo.url} download={photo.filename}>Download photo</a><button className="secondary" onClick={reset}>Retake</button></div><p className="booth-hint">Download to keep this photo. Leaving Photobooth discards the preview.</p></div>}
    </>}
    {(cameraError || error) && <p className="error-message" role="alert">{cameraError || error}</p>}
  </section>
}
