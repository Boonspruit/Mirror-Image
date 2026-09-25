import { test, expect } from '@playwright/test'
import { createVectorSmoother, smoothValues } from '../src/matching/smoothing.ts'

test('EMA keeps 80% of the previous value and uses 20% of the new value', () => {
  expect(smoothValues({ smile: 0.2 }, { smile: 0.7 }).smile).toBeCloseTo(0.3)
})

test('the first vector passes through and later expressions and pose are smoothed', () => {
  const smoother = createVectorSmoother()
  const first = smoother.update({ expression: { jawOpen: 0 }, headPose: { yaw: 10 } })
  const second = smoother.update({ expression: { jawOpen: 1 }, headPose: { yaw: -10 } })

  expect(first).toEqual({ expression: { jawOpen: 0 }, headPose: { yaw: 10 } })
  expect(second.expression.jawOpen).toBeCloseTo(0.2)
  expect(second.headPose.yaw).toBeCloseTo(6)
})

test('reset starts a fresh smoothing sequence', () => {
  const smoother = createVectorSmoother()
  smoother.update({ expression: { smile: 0 }, headPose: null })
  smoother.reset()
  expect(smoother.update({ expression: { smile: 1 }, headPose: null }).expression.smile).toBe(1)
})

test('missing values remain missing and invalid alpha is rejected', () => {
  expect(smoothValues({ smile: 0.5 }, { smile: null })).toEqual({ smile: null })
  expect(() => smoothValues({}, {}, 0)).toThrow('alpha')
  expect(() => smoothValues({}, {}, 1.1)).toThrow('alpha')
})
