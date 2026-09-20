export const HAND_FEATURES = Object.freeze([
  'handPresent',
  'twoHandsPresent',
  'handNearFace',
  'fingertipNearMouth',
])

export const EMPTY_HAND_FEATURES = Object.freeze({
  handPresent: 0,
  twoHandsPresent: 0,
  handNearFace: 0,
  fingertipNearMouth: 0,
})

const FINGERTIP_INDICES = [4, 8, 12, 16, 20]
const PALM_INDICES = [0, 5, 9, 13, 17]

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const point = (landmarks, index) => {
  const landmark = landmarks?.[index]
  return Number.isFinite(landmark?.x) && Number.isFinite(landmark?.y) ? landmark : null
}
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y)
const midpoint = (left, right) => ({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 })

function proximityTo(target, landmarks, indices, faceWidth) {
  const points = indices.map((index) => point(landmarks, index)).filter(Boolean)
  if (!target || !points.length || !Number.isFinite(faceWidth) || faceWidth <= 0) return null
  const normalizedDistance = Math.min(...points.map((entry) => distance(entry, target))) / faceWidth
  // A landmark at 10% of face width or closer is a full match. It fades to
  // zero by 90%, which tolerates different camera framing and hand sizes.
  return clamp01((0.9 - normalizedDistance) / 0.8)
}

export function extractHandFeatures(handResult, faceLandmarks) {
  const detectedHands = (handResult?.landmarks ?? []).filter((landmarks) => landmarks?.length)
  if (!detectedHands.length) return { ...EMPTY_HAND_FEATURES }

  const presence = {
    handPresent: 1,
    twoHandsPresent: detectedHands.length >= 2 ? 1 : 0,
  }

  const mouthTop = point(faceLandmarks, 13)
  const mouthBottom = point(faceLandmarks, 14)
  const leftCheek = point(faceLandmarks, 234)
  const rightCheek = point(faceLandmarks, 454)
  if (!mouthTop || !mouthBottom || !leftCheek || !rightCheek) {
    return { ...presence, handNearFace: null, fingertipNearMouth: null }
  }

  const mouth = midpoint(mouthTop, mouthBottom)
  const faceWidth = distance(leftCheek, rightCheek)
  const strongestProximity = (indices) => Math.max(
    ...detectedHands.map((landmarks) => proximityTo(mouth, landmarks, indices, faceWidth) ?? 0),
  )
  return {
    ...presence,
    handNearFace: strongestProximity(PALM_INDICES),
    fingertipNearMouth: strongestProximity(FINGERTIP_INDICES),
  }
}
