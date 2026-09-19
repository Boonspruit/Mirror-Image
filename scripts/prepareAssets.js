import { cp, mkdir, access, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const modelDir = path.join(root, 'public/models')
await mkdir(modelDir, { recursive: true })
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  path.join(root, 'public/mediapipe/wasm'), { recursive: true })

const modelPath = path.join(modelDir, 'face_landmarker.task')
try {
  await access(modelPath)
} catch {
  // Google's versioned, pretrained float16 Face Landmarker bundle. No training.
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
  console.log('Downloading the pretrained Face Landmarker model…')
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error('Model download failed: HTTP ' + response.status)
  await writeFile(modelPath + '.download', Buffer.from(await response.arrayBuffer()))
  await rename(modelPath + '.download', modelPath)
}
console.log('Local MediaPipe runtime and model are ready.')
