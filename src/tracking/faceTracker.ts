import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Setup copies WASM from the installed package version. All assets are local.
export async function createFaceTracker() {
  const base = import.meta.env.BASE_URL
  const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm')
  const options = {
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  }
  try {
    const tracker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: base + 'models/face_landmarker.task', delegate: 'GPU' },
    })
    return { tracker, delegate: 'GPU' }
  } catch (gpuError) {
    console.info('GPU initialization unavailable; trying CPU.', gpuError)
    const tracker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: base + 'models/face_landmarker.task', delegate: 'CPU' },
    })
    return { tracker, delegate: 'CPU' }
  }
}

// The overlay consumes these results to draw landmarks. Later feature extraction
// and matching modules will not need to own or initialize the webcam.
export function startFaceTracking(video, tracker, onResult, onError) {
  let frameId
  let stopped = false
  let lastVideoTime = -1
  let lastInferenceTime = -Infinity
  function tick(now) {
    if (stopped) return
    try {
      // Inference is synchronous. Limit to fresh frames at up to 30 Hz.
      // Consider a worker later if profiling shows UI stuttering.
      if (video.readyState >= 2 && video.videoWidth > 0 &&
          video.currentTime !== lastVideoTime && now - lastInferenceTime >= 1000 / 30) {
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
