import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

export async function createHandTracker() {
  const base = import.meta.env.BASE_URL
  const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm')
  const options = {
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.4,
  }

  try {
    const tracker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate: 'GPU' },
    })
    return { tracker, delegate: 'GPU' }
  } catch (gpuError) {
    console.info('GPU hand tracking unavailable; trying CPU.', gpuError)
    const tracker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate: 'CPU' },
    })
    return { tracker, delegate: 'CPU' }
  }
}

export function startHandTracking(video, tracker, onResult, onError) {
  let frameId
  let stopped = false
  let lastVideoTime = -1
  let lastInferenceTime = -Infinity

  function tick(now) {
    if (stopped) return
    try {
      // Keep gestures responsive while limiting the cost of the second model.
      if (video.readyState >= 2 && video.videoWidth > 0 &&
          video.currentTime !== lastVideoTime && now - lastInferenceTime >= 1000 / 20) {
        lastVideoTime = video.currentTime
        lastInferenceTime = now
        onResult(tracker.detectForVideo(video, now))
      }
    } catch (error) {
      stopped = true
      onError(error)
      return
    }
    if (!stopped) frameId = requestAnimationFrame(tick)
  }

  frameId = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(frameId)
  }
}
