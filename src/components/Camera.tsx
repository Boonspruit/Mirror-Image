import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import type { FeatureValues } from '@mimic/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createFaceTracker, startFaceTracking } from '../tracking/faceTracker.ts'
import { createHandTracker, startHandTracking } from '../tracking/handTracker.ts'
import FaceOverlay from './FaceOverlay.tsx'
import HandOverlay from './HandOverlay.tsx'
import DebugPanel from './DebugPanel.tsx'
import ExpressionPanel from './ExpressionPanel.tsx'
import SimilarityPanel from './SimilarityPanel.tsx'
import MemeDisplay from './MemeDisplay.tsx'
import MemeGallery from './MemeGallery.tsx'
import TrainingPreview from './TrainingPreview.tsx'
import ProfileTransfer from './ProfileTransfer.tsx'
import { extractFeatureVector } from '../tracking/featureExtractor.ts'
import { EMPTY_HAND_FEATURES, extractHandFeatures } from '../tracking/handFeatureExtractor.ts'
import { rankMemes } from '../matching/matcher.ts'
import { createVectorSmoother, smoothValues } from '../matching/smoothing.ts'
import { createMatchStabilizer } from '../matching/matchStabilizer.ts'
import { applyNeutralBaseline, averageFeatureVectors } from '../tracking/faceCalibration.ts'

interface CameraResources { cancelCalibration?: () => void; startHandTimer?: number; cancelLoop?: () => void; cancelHandLoop?: () => void; removeListeners?: () => void; stream?: MediaStream; tracker?: FaceLandmarker; handTracker?: HandLandmarker }
const EMPTY_RESULT = { faces: 0, landmarks: 0, blendshapes: 0, pose: false, hands: 0, handLandmarks: 0, handFeatures: EMPTY_HAND_FEATURES as FeatureValues, categories: [], vector: null, rawVector: null }
const EMPTY_MATCH = { matches: [], pendingId: null }
const LABELS = {
  idle: 'Camera is off', requesting: 'Waiting for permission',
  loading: 'Loading face and hand trackers', running: 'Tracking is running', error: 'Session stopped',
}
function cameraErrorMessage(error) {
  switch (error.name) {
    case 'NotAllowedError': return 'Camera access was denied. Allow camera access in your browser’s site settings, then try again.'
    case 'NotFoundError': return 'No camera was found. Connect a webcam, then try again.'
    case 'NotReadableError': return 'Your camera could not start. Close other apps using it and check your system camera permissions.'
    case 'OverconstrainedError': return 'This camera cannot use the requested settings. Try another camera.'
    case 'AbortError': return 'Camera startup was interrupted. Please try again.'
    default: return 'The camera could not start. Check your browser and system camera permissions, then try again.'
  }
}

export default function Camera({ library, view }) {
  const { memes } = library
  const [previewStream, setPreviewStream] = useState(null)
  const videoRef = useRef(null)
  const memesRef = useRef(memes)
  const overlayRef = useRef(null)
  const handOverlayRef = useRef(null)
  const latestFaceLandmarks = useRef(null)
  const latestHandResult = useRef<{ hands: number; landmarks: number; features: FeatureValues; observedAt?: number }>({ hands: 0, landmarks: 0, features: EMPTY_HAND_FEATURES })
  const resources = useRef<CameraResources>({})
  const session = useRef(0)
  const pipeline = useRef(null)
  const baselineRef = useRef(null)
  const calibrationCapture = useRef(null)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState(EMPTY_RESULT)
  const [delegate, setDelegate] = useState('—')
  const [showOverlay, setShowOverlay] = useState(false)
  const [matchView, setMatchView] = useState(EMPTY_MATCH)
  const [calibration, setCalibration] = useState({ status: 'idle', count: null, baseline: null, message: '' })

  useEffect(() => {
    memesRef.current = memes
  }, [memes])


  // Invalidate async work first, then release every resource owned by the session.
  const release = useCallback(() => {
    session.current += 1
    const owned = resources.current
    resources.current = {}
    setPreviewStream(null)
    owned.cancelCalibration?.()
    if (owned.startHandTimer) window.clearTimeout(owned.startHandTimer)
    owned.cancelLoop?.()
    owned.cancelHandLoop?.()
    overlayRef.current?.clear()
    handOverlayRef.current?.clear()
    owned.removeListeners?.()
    owned.stream?.getTracks().forEach((track) => track.stop())
    owned.tracker?.close()
    owned.handTracker?.close()
    pipeline.current = null
    calibrationCapture.current = null
    latestFaceLandmarks.current = null
    latestHandResult.current = { hands: 0, landmarks: 0, features: EMPTY_HAND_FEATURES }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  const stop = useCallback(() => {
    release()
    setPhase('idle')
    setError('')
    setResult(EMPTY_RESULT)
    setMatchView(EMPTY_MATCH)
    setDelegate('—')
    setCalibration((current) => ({ ...current, status: current.baseline ? 'ready' : 'idle', count: null, message: '' }))
  }, [release])

  useEffect(() => {
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener('pagehide', stop)
      release()
    }
  }, [release, stop])

  async function start() {
    release()
    const id = session.current
    const isCurrent = () => id === session.current
    setError('')
    setResult(EMPTY_RESULT)
    setMatchView(EMPTY_MATCH)
    setDelegate('—')
    setPhase('requesting')
    let stage = 'camera'

    function fail(message: string, cause?: unknown) {
      if (!isCurrent()) return
      if (cause) console.error(cause)
      release()
      setResult(EMPTY_RESULT)
      setMatchView(EMPTY_MATCH)
      setDelegate('—')
      setError(message)
      setPhase('error')
      setCalibration((current) => ({ ...current, status: current.baseline ? 'ready' : 'idle', count: null, message: '' }))
    }

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        fail('Camera access requires a supported browser on localhost or HTTPS. Open this app using the local Vite URL.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      // A permission prompt can resolve after Stop or unmount. Discard its stream.
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      resources.current.stream = stream
      setPreviewStream(stream)
      const onEnded = () => fail('The camera was disconnected or access was revoked. Reconnect it or restore permission, then try again.')
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', onEnded))
      resources.current.removeListeners = () => stream.getVideoTracks().forEach((track) => track.removeEventListener('ended', onEnded))
      const video = videoRef.current
      video.srcObject = stream
      await video.play()
      if (!isCurrent()) return

      stage = 'tracker'
      setPhase('loading')
      const faceTracking = await createFaceTracker()
      const { tracker, delegate: activeDelegate } = faceTracking
      // WASM initialization cannot be cancelled; close a late result immediately.
      if (!isCurrent()) {
        tracker.close()
        return
      }
      resources.current.tracker = tracker
      setDelegate(`Face ${activeDelegate} · Hand loading`)
      setPhase('running')
      let lastUpdate = -Infinity
      let lastMatchEvaluation = -Infinity
      let hadFace = false
      const smoother = createVectorSmoother({ alpha: 0.65 })
      const stabilizer = createMatchStabilizer({ holdMs: 0, switchMargin: 0.005 })
      pipeline.current = { smoother, stabilizer }
      // Face matching starts immediately. The larger hand model joins the same
      // session when ready and closes itself if the user stopped in the meantime.
      resources.current.startHandTimer = window.setTimeout(() => {
        resources.current.startHandTimer = undefined
        void createHandTracker().then((handTracking) => {
          if (!isCurrent()) {
            handTracking.tracker.close()
            return
          }
          resources.current.handTracker = handTracking.tracker
          setDelegate(`Face ${activeDelegate} · Hand ${handTracking.delegate}`)
          resources.current.cancelHandLoop = startHandTracking(video, handTracking.tracker, (handResult) => {
            if (!isCurrent()) return
            handOverlayRef.current?.draw(handResult.landmarks, video.videoWidth, video.videoHeight)
            const currentFeatures = extractHandFeatures(handResult, latestFaceLandmarks.current)
            const previousFeatures = latestHandResult.current.features
            latestHandResult.current = {
              observedAt: performance.now(),
              hands: handResult.landmarks.length,
              landmarks: handResult.landmarks.reduce((total, landmarks) => total + landmarks.length, 0),
              features: smoothValues(previousFeatures, currentFeatures, 0.55),
            }
          }, (cause) => {
            console.error('Hand tracking stopped unexpectedly.', cause)
            handOverlayRef.current?.clear()
            latestHandResult.current = { hands: 0, landmarks: 0, features: EMPTY_HAND_FEATURES }
            setDelegate(`Face ${activeDelegate} · Hand unavailable`)
          })
        }, (cause) => {
          if (!isCurrent()) return
          console.warn('Hand tracking is unavailable; face matching will continue.', cause)
          setDelegate(`Face ${activeDelegate} · Hand unavailable`)
        })
      }, 300)
      resources.current.cancelLoop = startFaceTracking(video, tracker, (trackingResult) => {
        if (!isCurrent()) return
        // Draw every inference; the text summary below stays throttled to 4 Hz.
        overlayRef.current?.draw(trackingResult.faceLandmarks[0], video.videoWidth, video.videoHeight)
        latestFaceLandmarks.current = trackingResult.faceLandmarks[0] ?? null
        const rawVector = extractFeatureVector(trackingResult)
        const now = performance.now()

        if (rawVector && calibrationCapture.current?.collecting) {
          calibrationCapture.current.samples.push(rawVector)
        }

        if (!rawVector) {
          smoother.reset()
          stabilizer.reset()
          if (hadFace) setMatchView(EMPTY_MATCH)
          hadFace = false
        } else {
          hadFace = true
        }

        const calibratedVector = rawVector ? applyNeutralBaseline(rawVector, baselineRef.current) : null
        const vector = calibratedVector ? smoother.update(calibratedVector) : null
        if (vector && now - lastMatchEvaluation >= 100) {
          lastMatchEvaluation = now
          const matchFeatures = { ...vector.expression, ...latestHandResult.current.features }
          const ranked = rankMemes(matchFeatures, memesRef.current).filter(({ comparison }) => comparison)
          const stabilized = stabilizer.update(ranked, now)
          const selected = ranked.find(({ meme }) => meme.id === stabilized.selectedId)
          const displayMatches = selected
            ? [selected, ...ranked.filter(({ meme }) => meme.id !== stabilized.selectedId)]
            : []
          setMatchView({ matches: displayMatches, pendingId: stabilized.pendingId })
        }

        if (now - lastUpdate < 250) return
        lastUpdate = now
        const handResult = latestHandResult.current
        setResult({
          faces: trackingResult.faceLandmarks.length,
          landmarks: trackingResult.faceLandmarks[0]?.length ?? 0,
          blendshapes: trackingResult.faceBlendshapes[0]?.categories.length ?? 0,
          pose: Boolean(trackingResult.facialTransformationMatrixes[0]),
          hands: handResult.hands,
          handLandmarks: handResult.landmarks,
          handFeatures: handResult.features,
          vector,
          rawVector,
          // Preserve the raw readings alongside the combined expression vector.
          categories: trackingResult.faceLandmarks.length
            ? (trackingResult.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => ({ categoryName, score }))
            : [],
        })
      }, (cause) => fail('Face tracking stopped unexpectedly. Try starting the camera again.', cause))
    } catch (cause) {
      fail(stage === 'camera' ? cameraErrorMessage(cause) :
        'The face tracker could not load. Run “npm run setup”, restart Vite, and try again. See the browser console for details.', cause)
    }
  }

  function beginCalibration() {
    if (phase !== 'running' || !result.faces || calibration.status === 'countdown') return

    resources.current.cancelCalibration?.()
    const activeSession = session.current
    const capture = { collecting: false, samples: [] }
    const timers = []
    calibrationCapture.current = capture
    setCalibration((current) => ({ ...current, status: 'countdown', count: 3, message: 'Relax your face and look straight at the camera.' }))

    const schedule = (callback, delay) => {
      const timer = window.setTimeout(callback, delay)
      timers.push(timer)
    }
    const cancel = () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      calibrationCapture.current = null
    }
    resources.current.cancelCalibration = cancel

    schedule(() => setCalibration((current) => ({ ...current, count: 2 })), 1000)
    schedule(() => {
      capture.collecting = true
      setCalibration((current) => ({ ...current, count: 1, message: 'Hold that neutral expression.' }))
    }, 2000)
    schedule(() => {
      if (activeSession !== session.current) return
      capture.collecting = false
      calibrationCapture.current = null
      resources.current.cancelCalibration = undefined
      const baseline = capture.samples.length >= 5 ? averageFeatureVectors(capture.samples) : null
      if (!baseline) {
        setCalibration((current) => ({ ...current, status: 'error', count: null, message: 'Calibration missed your face. Look toward the camera and try again.' }))
        return
      }

      baselineRef.current = baseline
      pipeline.current?.smoother.reset()
      pipeline.current?.stabilizer.reset()
      setMatchView(EMPTY_MATCH)
      setResult((current) => ({ ...current, vector: applyNeutralBaseline(current.rawVector, baseline) }))
      setCalibration({ status: 'ready', count: null, baseline, message: `Neutral baseline saved from ${capture.samples.length} readings.` })
    }, 3000)
  }

  const active = ['requesting', 'loading', 'running'].includes(phase)
  const videoVisible = phase === 'loading' || phase === 'running'
  return (
    <>
    <section hidden={view !== 'mirror'} className="workspace" aria-label="Live camera and meme match">
      <div className="camera-panel">
        <div className="panel-heading"><div><p className="eyebrow">LIVE INPUT</p><h2>Your camera</h2></div><span className={`status ${active ? 'active' : ''}`}><span />{active ? 'LIVE SESSION' : 'OFFLINE'}</span></div>
        <div className="camera-stage">
          <video ref={videoRef} autoPlay muted playsInline className={videoVisible ? 'visible' : ''} aria-label="Mirrored webcam preview" />
          <FaceOverlay ref={overlayRef} enabled={showOverlay} />
          <HandOverlay ref={handOverlayRef} enabled={showOverlay} />
          {!videoVisible && <div className="camera-placeholder"><div className="face-frame" aria-hidden="true"><span>· ·</span><span>⌣</span></div><h3>{phase === 'requesting' ? 'A quick permission check.' : 'Ready when you are.'}</h3><p>{phase === 'requesting' ? 'Allow camera access in your browser to begin.' : 'Your next expression starts here.'}</p></div>}
          {videoVisible && <span className="preview-label">MIRRORED PREVIEW</span>}
          {phase === 'loading' && <div className="loading-label">Preparing MediaPipe…</div>}
          {calibration.status === 'countdown' && <div className="calibration-countdown" role="status" aria-live="assertive"><span>NEUTRAL FACE</span><strong>{calibration.count}</strong><p>{calibration.message}</p></div>}
        </div>
        <div className="camera-controls"><p>{phase === 'running' ? (result.faces ? `Face detected${result.hands ? ` · ${result.hands} hand${result.hands === 1 ? '' : 's'} detected` : ''}` : 'Look toward the camera') : 'Your camera stays private.'}</p><button onClick={active ? stop : start} className={active ? 'secondary' : 'primary'}>{active ? (phase === 'requesting' ? 'Cancel' : 'Stop camera') : 'Start camera'}</button></div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
      <MemeDisplay matches={matchView.matches} pendingId={matchView.pendingId} expression={result.vector?.expression} handFeatures={result.handFeatures} phase={phase} calibrated={Boolean(calibration.baseline)} />
    </section>
    <section hidden={view !== 'settings'} className="settings-view" aria-label="Settings">
      <div className="view-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Make it yours.</h1></div><p>Camera controls and tracking diagnostics.</p></div>
      <ProfileTransfer library={library} />
      <section className="settings-controls" aria-label="Camera preferences"><h2>Camera & calibration</h2>
        <div className="settings-preview"><TrainingPreview stream={previewStream} phase={phase} onStart={start} onStop={stop} cameraError="" /></div>
        <label className="overlay-toggle"><input type="checkbox" checked={showOverlay} onChange={(event) => setShowOverlay(event.target.checked)} />Show face mesh + hands<span>Follows your face and hand landmarks</span></label>
        <p className={`calibration-feedback ${calibration.status}`} aria-live="polite">{calibration.message || 'Calibrate once with a relaxed, neutral expression.'}</p>
        <div className="camera-controls"><p><span className="privacy-dot" /> Camera frames stay in this browser.</p><div className="camera-actions"><button onClick={beginCalibration} className="calibrate-button" disabled={phase !== 'running' || !result.faces || calibration.status === 'countdown'}>{calibration.baseline ? 'Recalibrate face' : 'Calibrate face'}</button><button onClick={active ? stop : start} className={active ? 'secondary' : 'primary'}>{active ? (phase === 'requesting' ? 'Cancel' : 'Stop camera') : 'Start camera'}<span aria-hidden="true">{active ? '■' : '↗'}</span></button></div></div>

      </section>
      {calibration.status === 'countdown' && <p role="status">Look at the camera with a relaxed face. {calibration.count}</p>}
      <aside className="tracking-panel tracking-strip">
        <div className="tracking-intro">
        <p className="eyebrow">UNDER THE HOOD</p><h2>A face, two hands, a set of signals.</h2><p className="panel-description">MediaPipe finds facial and hand landmarks directly on your device.</p>
        </div>
        <div className="tracking-readout">
        <div className="tracking-status" role="status" aria-live="polite"><span className={`signal-dot ${phase === 'running' ? 'on' : ''}`} /><div><strong>{LABELS[phase]}</strong><p>{phase === 'running' ? (result.faces ? `Face detected.${result.hands ? ` ${result.hands} hand${result.hands === 1 ? '' : 's'} detected.` : ' Show a hand for gesture-aware memes.'}` : 'No face detected. Look toward the camera.') : 'One face and up to two hands at a time.'}</p></div></div>
        <dl className="metrics"><div><dt>Faces detected</dt><dd>{result.faces} <small>/ 1</small></dd></div><div><dt>Hands detected</dt><dd>{result.hands} <small>/ 2</small></dd></div><div><dt>Facial landmarks</dt><dd>{result.landmarks}</dd></div><div><dt>Hand landmarks</dt><dd>{result.handLandmarks}</dd></div><div><dt>Fingertip near mouth</dt><dd>{Math.round((result.handFeatures.fingertipNearMouth ?? 0) * 100)}<small>%</small></dd></div><div><dt>Blendshape signals</dt><dd>{result.blendshapes}</dd></div><div><dt>Head transform</dt><dd className="text-value">{result.pose ? 'Available' : 'Waiting'}</dd></div><div><dt>Processing</dt><dd className="text-value">{delegate}</dd></div></dl>
        </div>
        <div className="tracking-notes">
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="next-note"><span>STEP 11 ACTIVE</span><p>{calibration.baseline ? 'Your neutral baseline is active for expression values and head angles.' : 'Calibrate a neutral face to account for your personal resting expression.'}</p></div>
        </div>
      </aside>
    <ExpressionPanel vector={result.vector} />
    <SimilarityPanel expression={result.vector?.expression} memeCount={memes.length} />
    <DebugPanel categories={result.categories} phase={phase} hasFace={result.faces > 0} />
    </section>
    <div hidden={view !== 'library'}>
      <MemeGallery {...library} liveExpression={result.vector?.expression} liveHandFeatures={result.handFeatures} stream={previewStream} phase={phase} onStart={start} onStop={stop} cameraError={error} />
    </div>
    </>
  )
}
