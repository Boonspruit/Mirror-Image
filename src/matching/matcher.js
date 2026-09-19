import { compareExpressions, DEFAULT_FEATURE_WEIGHTS } from './similarity.js'

export function rankMemes(userExpression, memes, weights = DEFAULT_FEATURE_WEIGHTS) {
  if (!Array.isArray(memes)) throw new TypeError('memes must be an array.')

  return memes.map((meme) => ({
    meme,
    comparison: compareExpressions(userExpression, meme.features, weights),
  })).sort((a, b) => {
    // Uncomparable entries sort last. Stable IDs make exact ties deterministic.
    if (!a.comparison) return b.comparison ? 1 : a.meme.id.localeCompare(b.meme.id)
    if (!b.comparison) return -1
    return a.comparison.distance - b.comparison.distance || a.meme.id.localeCompare(b.meme.id)
  })
}

export function findBestMatch(userExpression, memes, weights = DEFAULT_FEATURE_WEIGHTS) {
  const first = rankMemes(userExpression, memes, weights)[0]
  return first?.comparison ? first : null
}
