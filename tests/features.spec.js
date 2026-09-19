import { test, expect } from '@playwright/test'
import { extractExpression, extractFeatureVector } from '../src/tracking/featureExtractor.js'
import { extractHeadPose } from '../src/tracking/headPose.js'

const categories = (scores) => Object.entries(scores).map(([categoryName, score]) => ({ categoryName, score }))
const identity = () => ({ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })
const near = (actual, expected) => {
  for (const key of Object.keys(expected)) expect(actual[key]).toBeCloseTo(expected[key], 7)
}

test('expression schema averages every pair and preserves single features without mutating raw data', () => {
  const raw = categories({
    eyeWideLeft: 0.2, eyeWideRight: 0.8, eyeSquintLeft: 0.1, eyeSquintRight: 0.3,
    browInnerUp: 0.7, browDownLeft: 0.4, browDownRight: 0.8, jawOpen: 0.9,
    mouthSmileLeft: 0.3, mouthSmileRight: 0.9, mouthFrownLeft: 0.1, mouthFrownRight: 0.7,
    mouthPucker: 0.25, cheekSquintLeft: 0.2, cheekSquintRight: 0.4, noseSneerLeft: 0.5, noseSneerRight: 0.9,
  })
  const original = structuredClone(raw)
  const vector = extractExpression(raw.reverse())
  expect(Object.keys(vector)).toHaveLength(10)
  near(vector, { eyeWide: 0.5, eyeSquint: 0.2, browInnerUp: 0.7, browDown: 0.6,
    jawOpen: 0.9, smile: 0.6, frown: 0.4, mouthPucker: 0.25, cheekSquint: 0.3, noseSneer: 0.7 })
  expect(raw).toEqual(original.reverse())
})

test('zero is valid; absent, nonfinite, and out-of-range inputs stay missing', () => {
  const vector = extractExpression(categories({
    eyeWideLeft: 0, eyeWideRight: 0, mouthSmileLeft: 1, jawOpen: NaN,
    mouthPucker: Infinity, browInnerUp: -0.1, browDownLeft: 1.1, browDownRight: 0,
  }))
  expect(vector.eyeWide).toBe(0)
  for (const key of ['smile', 'jawOpen', 'mouthPucker', 'browInnerUp', 'browDown']) expect(vector[key]).toBeNull()
  expect(Object.values(extractExpression()).every((value) => value === null)).toBe(true)
})

test('no face discards stale scores and pose; missing pose does not discard expression', () => {
  const frame = { faceLandmarks: [{}], faceBlendshapes: [{ categories: categories({ jawOpen: 0.6 }) }], facialTransformationMatrixes: [] }
  expect(extractFeatureVector(frame).expression.jawOpen).toBe(0.6)
  expect(extractFeatureVector(frame).headPose).toBeNull()
  expect(extractFeatureVector({ ...frame, faceLandmarks: [], facialTransformationMatrixes: [identity()] })).toBeNull()
  expect(extractFeatureVector(undefined)).toBeNull()
})

test('column-major axis rotations produce signed yaw, pitch, and roll', () => {
  for (const sign of [-1, 1]) {
    const a = sign * Math.PI / 6, c = Math.cos(a), s = Math.sin(a)
    const matrices = [
      { data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1], expected: { yaw: sign * 30, pitch: 0, roll: 0 } },
      { data: [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1], expected: { yaw: 0, pitch: sign * 30, roll: 0 } },
      { data: [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], expected: { yaw: 0, pitch: 0, roll: sign * 30 } },
    ]
    for (const { data, expected } of matrices) near(extractHeadPose({ rows: 4, columns: 4, data }), expected)
  }
})

// Construct fixtures by multiplying row-major elementary rotations, then pack
// column-major, independently of the extraction formulas.
function compose({ yaw, pitch, roll }) {
  const [y, p, r] = [yaw, pitch, roll].map((v) => v * Math.PI / 180)
  const rx = [[1, 0, 0], [0, Math.cos(p), -Math.sin(p)], [0, Math.sin(p), Math.cos(p)]]
  const ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]]
  const rz = [[Math.cos(r), -Math.sin(r), 0], [Math.sin(r), Math.cos(r), 0], [0, 0, 1]]
  const multiply = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)))
  const rotation = multiply(multiply(rz, ry), rx)
  const matrix = identity()
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) matrix.data[col * 4 + row] = rotation[row][col]
  return matrix
}

test('combined rotations ignore translation and positive scale', () => {
  const expected = { yaw: -28, pitch: 17, roll: 42 }
  const matrix = compose(expected)
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) matrix.data[col * 4 + row] *= col + 2
  matrix.data[12] = 8; matrix.data[13] = -12; matrix.data[14] = -50
  near(extractHeadPose(matrix), expected)
  near(extractHeadPose(identity()), { yaw: 0, pitch: 0, roll: 0 })
})

test('gimbal-lock poses remain finite and reconstruct the same rotation', () => {
  for (const yaw of [-90, 90]) {
    const matrix = compose({ yaw, pitch: 20, roll: -35 })
    const pose = extractHeadPose(matrix)
    expect(Object.values(pose).every(Number.isFinite)).toBe(true)
    expect(pose.roll).toBe(0)
    const reconstructed = compose(pose)
    matrix.data.forEach((value, i) => expect(reconstructed.data[i]).toBeCloseTo(value, 7))
  }
})

test('bad transforms are unavailable rather than fabricated zero angles', () => {
  const reflected = identity(); reflected.data[0] = -1
  const sheared = identity(); sheared.data[4] = 0.5
  const nonfinite = identity(); nonfinite.data[0] = NaN
  const perspective = identity(); perspective.data[3] = 0.1
  for (const input of [undefined, {}, { ...identity(), rows: 3 }, { ...identity(), data: [] },
    { ...identity(), data: Array(16).fill(0) }, reflected, sheared, nonfinite, perspective]) {
    expect(extractHeadPose(input)).toBeNull()
  }
})
