import { compareExpressions, DEFAULT_MATCH_WEIGHTS } from './similarity.js'

export function rankMemes(userFeatures, memes, weights = DEFAULT_MATCH_WEIGHTS) {
  if (!Array.isArray(memes)) throw new TypeError('memes must be an array.')

  return memes.map((meme) => {
    const memeFeatures = { ...meme.features, ...meme.handFeatures }
    const applicableWeights = Object.fromEntries(Object.entries(weights).filter(([feature]) => Number.isFinite(memeFeatures[feature])))
    const configuredWeight = Object.values(applicableWeights).reduce((sum, weight) => sum + weight, 0)
    const comparison = compareExpressions(userFeatures, memeFeatures, applicableWeights)
    return { meme, comparison, evidenceWeight: (comparison?.coverage ?? 0) * configuredWeight }
  }).sort((a, b) => {
    // Uncomparable entries sort last. Stable IDs make exact ties deterministic.
    if (!a.comparison) return b.comparison ? 1 : a.meme.id.localeCompare(b.meme.id)
    if (!b.comparison) return -1
    return a.comparison.distance - b.comparison.distance ||
      b.evidenceWeight - a.evidenceWeight ||
      a.meme.id.localeCompare(b.meme.id)
  }).map(({ meme, comparison }) => ({ meme, comparison }))
}

export function findBestMatch(userFeatures, memes, weights = DEFAULT_MATCH_WEIGHTS) {
  const first = rankMemes(userFeatures, memes, weights)[0]
  return first?.comparison ? first : null
}
