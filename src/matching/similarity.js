// Expression scores share a 0–1 scale. Larger weights make a feature contribute
// more strongly to distance; scaling every weight equally does not change the
// normalized result.
export const DEFAULT_FEATURE_WEIGHTS = Object.freeze({
  eyeWide: 2,
  eyeSquint: 1.4,
  browInnerUp: 1.5,
  browDown: 1.3,
  jawOpen: 2,
  smile: 1,
  frown: 1,
  mouthPucker: 0.8,
  cheekSquint: 0.8,
  noseSneer: 0.7,
})

export const HAND_FEATURE_WEIGHTS = Object.freeze({
  handPresent: 4,
  twoHandsPresent: 4,
  handNearFace: 8,
  fingertipNearMouth: 32,
})

export const DEFAULT_MATCH_WEIGHTS = Object.freeze({
  ...DEFAULT_FEATURE_WEIGHTS,
  ...HAND_FEATURE_WEIGHTS,
})

const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 1

export function compareExpressions(userExpression, memeExpression, weights = DEFAULT_FEATURE_WEIGHTS) {
  if (!userExpression || !memeExpression) return null

  let weightedSquaredError = 0
  let usedWeight = 0
  const usedFeatures = []

  for (const [feature, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`Weight for ${feature} must be a positive finite number.`)
    }
    const userValue = userExpression[feature]
    const memeValue = memeExpression[feature]
    // Missing readings are omitted rather than invented as zero. Coverage tells
    // the caller how much of the configured comparison was actually possible.
    if (!isScore(userValue) || !isScore(memeValue)) continue
    const difference = userValue - memeValue
    weightedSquaredError += weight * difference * difference
    usedWeight += weight
    usedFeatures.push(feature)
  }

  const configuredWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
  if (usedWeight === 0) return null

  // Dividing by usedWeight produces a weighted RMS distance in [0, 1]. That
  // keeps percentages comparable if a reading is temporarily unavailable.
  const distance = Math.sqrt(weightedSquaredError / usedWeight)
  return {
    distance,
    percentage: Math.max(0, Math.min(100, (1 - distance) * 100)),
    coverage: usedWeight / configuredWeight,
    usedFeatures,
  }
}
