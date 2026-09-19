import { test, expect } from '@playwright/test'
import { applyNeutralBaseline, averageFeatureVectors } from '../src/tracking/faceCalibration.js'

test('averages expression and head-pose samples without mixing their units', () => {
  const baseline = averageFeatureVectors([
    { expression: { smile: 0.2, jawOpen: 0.1 }, headPose: { yaw: 4, pitch: -2 } },
    { expression: { smile: 0.4, jawOpen: 0.3 }, headPose: { yaw: 8, pitch: 2 } },
  ])

  expect(baseline.expression.smile).toBeCloseTo(0.3)
  expect(baseline.expression.jawOpen).toBeCloseTo(0.2)
  expect(baseline.headPose.yaw).toBeCloseTo(6)
  expect(baseline.headPose.pitch).toBeCloseTo(0)
})

test('subtracts a neutral baseline, clamps negative activations, and offsets pose', () => {
  const calibrated = applyNeutralBaseline(
    { expression: { smile: 0.7, frown: 0.1, jawOpen: null }, headPose: { yaw: 15, roll: -3 } },
    { expression: { smile: 0.2, frown: 0.3, jawOpen: 0.1 }, headPose: { yaw: 5, roll: -1 } },
  )

  expect(calibrated.expression.smile).toBeCloseTo(0.5)
  expect(calibrated.expression.frown).toBe(0)
  expect(calibrated.expression.jawOpen).toBeNull()
  expect(calibrated.headPose).toEqual({ yaw: 10, roll: -2 })
})

test('no samples return no baseline and an absent baseline leaves a vector unchanged', () => {
  const vector = { expression: { smile: 0.4 }, headPose: null }
  expect(averageFeatureVectors([])).toBeNull()
  expect(applyNeutralBaseline(vector, null)).toBe(vector)
})
