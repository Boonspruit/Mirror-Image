import { cp, mkdir, access, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const modelDir = path.join(root, 'public/models')
await mkdir(modelDir, { recursive: true })
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  path.join(root, 'public/mediapipe/wasm'), { recursive: true })

const models = [
  ['face_landmarker.task', 'Face Landmarker', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  ['hand_landmarker.task', 'Hand Landmarker', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
]

for (const [filename, label, url] of models) {
  const modelPath = path.join(modelDir, filename)
  try {
    await access(modelPath)
  } catch {
    console.log(`Downloading the pretrained ${label} model…`)
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`${label} model download failed: HTTP ${response.status}`)
    await writeFile(modelPath + '.download', Buffer.from(await response.arrayBuffer()))
    await rename(modelPath + '.download', modelPath)
  }
}
console.log('Local MediaPipe runtime and models are ready.')
