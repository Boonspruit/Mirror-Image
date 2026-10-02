import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatureVector } from '../src/tracking/featureExtractor.ts'

export async function createImageAnalyzer() {
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  const tracker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true,
  })
  return {
    close: () => tracker.close(),
    async analyze(url) {
      const image = new Image()
      image.src = url
      await image.decode()
      const result = tracker.detect(image)
      const features = extractFeatureVector(result)?.expression ?? null
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 800 / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return { faces: result.faceLandmarks.length, features, image: canvas.toDataURL('image/jpeg', .86) }
    },
  }
}
