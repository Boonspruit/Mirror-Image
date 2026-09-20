export function createMatchStabilizer({ holdMs = 900, switchMargin = 0.015 } = {}) {
  if (!Number.isFinite(holdMs) || holdMs < 0) throw new RangeError('holdMs must be a nonnegative number.')
  if (!Number.isFinite(switchMargin) || switchMargin < 0) throw new RangeError('switchMargin must be a nonnegative number.')

  let selectedId = null
  let pendingId = null
  let pendingSince = 0

  function reset() {
    selectedId = null
    pendingId = null
    pendingSince = 0
  }

  return {
    update(rankedMatches, now) {
      const comparable = rankedMatches.filter(({ comparison }) => comparison)
      const best = comparable[0]
      if (!best) {
        reset()
        return { selectedId: null, pendingId: null }
      }

      let selected = comparable.find(({ meme }) => meme.id === selectedId)
      if (!selected) {
        selectedId = best.meme.id
        pendingId = null
        return { selectedId, pendingId }
      }

      if (best.meme.id === selectedId) {
        pendingId = null
        return { selectedId, pendingId }
      }

      // Hand mode and satisfied gestures are explicit ranking tiers, so they
      // can override a lower raw face-only distance without waiting.
      if ((best.priority ?? 0) > (selected.priority ?? 0)) {
        selectedId = best.meme.id
        pendingId = null
        return { selectedId, pendingId }
      }

      if (selected.comparison.distance - best.comparison.distance <= switchMargin) {
        pendingId = null
        return { selectedId, pendingId }
      }

      if (holdMs === 0) {
        selectedId = best.meme.id
        pendingId = null
        return { selectedId, pendingId }
      }

      if (pendingId !== best.meme.id) {
        pendingId = best.meme.id
        pendingSince = now
      } else if (now - pendingSince >= holdMs) {
        selectedId = best.meme.id
        pendingId = null
      }

      return { selectedId, pendingId }
    },
    reset,
  }
}
