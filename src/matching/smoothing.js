function smoothValue(previous, current, alpha) {
  if (!Number.isFinite(current)) return null
  if (!Number.isFinite(previous)) return current
  return previous * (1 - alpha) + current * alpha
}

export function smoothValues(previous = {}, current = {}, alpha = 0.2) {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new RangeError('alpha must be greater than 0 and no greater than 1.')
  }

  return Object.fromEntries(
    Object.entries(current).map(([name, value]) => [name, smoothValue(previous?.[name], value, alpha)]),
  )
}

export function createVectorSmoother({ alpha = 0.2 } = {}) {
  let previous = null

  return {
    update(vector) {
      if (!vector?.expression) return null

      const smoothed = {
        expression: smoothValues(previous?.expression, vector.expression, alpha),
        headPose: vector.headPose
          ? smoothValues(previous?.headPose, vector.headPose, alpha)
          : null,
      }
      previous = smoothed
      return smoothed
    },
    reset() {
      previous = null
    },
  }
}
