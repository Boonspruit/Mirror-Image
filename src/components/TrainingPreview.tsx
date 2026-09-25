import { useEffect, useRef, useState } from 'react'

export default function TrainingPreview({ stream, phase, onStart, onStop, cameraError }) {
  const ref = useRef(null)
  const [playError, setPlayError] = useState('')
  useEffect(() => {
    const video = ref.current
    video.srcObject = stream
    if (stream) video.play().catch(() => setPlayError('Preview paused. Stop and restart the camera.'))
    return () => { video.srcObject = null }
  }, [stream])
  const active = ['requesting', 'loading', 'running'].includes(phase)
  return <div className="training-camera">
    <p className="eyebrow">YOUR EXPRESSION</p>
    <div className="training-frame">
      <video ref={ref} autoPlay muted playsInline aria-label="Expression training camera" />
      {!stream && <div className="training-placeholder"><p>{phase === 'requesting' ? 'Allow camera access to continue.' : 'See your expression here.'}</p></div>}
      {phase === 'loading' && <span className="loading-label">Preparing face tracking…</span>}
    </div>
    <button type="button" className="secondary" onClick={active ? onStop : onStart}>{active ? (phase === 'requesting' ? 'Cancel' : 'Stop camera') : 'Start camera'}</button>
    {(cameraError || playError) && <p className="error-message" role="alert">{cameraError || playError}</p>}
  </div>
}
