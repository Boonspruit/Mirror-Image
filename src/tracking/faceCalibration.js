function averageRecord(records) {
  const names = new Set(records.flatMap((record) => Object.keys(record ?? {})))
  return Object.fromEntries([...names].map((name) => {
    const values = records.map((record) => record?.[name]).filter(Number.isFinite)
    return [name, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null]
  }))
}

export function averageFeatureVectors(samples) {
  const valid = samples.filter((sample) => sample?.expression)
  if (!valid.length) return null

  const poses = valid.map((sample) => sample.headPose).filter(Boolean)
  return {
    expression: averageRecord(valid.map((sample) => sample.expression)),
    headPose: poses.length ? averageRecord(poses) : null,
  }
}

export function applyNeutralBaseline(vector, baseline) {
  if (!vector?.expression || !baseline?.expression) return vector

  return {
    expression: Object.fromEntries(Object.entries(vector.expression).map(([name, value]) => {
      const neutral = baseline.expression[name]
      if (!Number.isFinite(value)) return [name, null]
      return [name, Number.isFinite(neutral) ? Math.max(0, Math.min(1, value - neutral)) : value]
    })),
    headPose: vector.headPose
      ? Object.fromEntries(Object.entries(vector.headPose).map(([name, value]) => {
        const neutral = baseline.headPose?.[name]
        return [name, Number.isFinite(value) && Number.isFinite(neutral) ? value - neutral : value]
      }))
      : null,
  }
}
