import { extractHeadPose } from './headPose.js'

// A fixed, named schema shared by the UI and the future meme dataset/matcher.
export const EXPRESSION_FEATURES = {
  eyeWide: ['eyeWideLeft', 'eyeWideRight'],
  eyeSquint: ['eyeSquintLeft', 'eyeSquintRight'],
  browInnerUp: ['browInnerUp'],
  browDown: ['browDownLeft', 'browDownRight'],
  jawOpen: ['jawOpen'],
  smile: ['mouthSmileLeft', 'mouthSmileRight'],
  frown: ['mouthFrownLeft', 'mouthFrownRight'],
  mouthPucker: ['mouthPucker'],
  cheekSquint: ['cheekSquintLeft', 'cheekSquintRight'],
  noseSneer: ['noseSneerLeft', 'noseSneerRight'],
}

export function extractExpression(categories = []) {
  const scores = new Map(categories.map(({ categoryName, score }) => [categoryName, score]))
  return Object.fromEntries(Object.entries(EXPRESSION_FEATURES).map(([name, sources]) => {
    const values = sources.map((source) => scores.get(source))
    // Both sides must exist: silently substituting zero would invent an expression.
    const valid = values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    return [name, valid ? values.reduce((sum, value) => sum + value, 0) / values.length : null]
  }))
}

export function extractFeatureVector(result) {
  if (!result?.faceLandmarks?.length) return null
  return {
    expression: extractExpression(result.faceBlendshapes?.[0]?.categories ?? []),
    // Keep degrees separate from 0–1 expression values for future weighting.
    headPose: extractHeadPose(result.facialTransformationMatrixes?.[0]),
  }
}
