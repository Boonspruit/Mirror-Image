import { test, expect } from '@playwright/test'
import { EMPTY_HAND_FEATURES, extractHandFeatures } from '../src/tracking/handFeatureExtractor.js'

function faceLandmarks() {
  const landmarks = []
  landmarks[13] = { x: 0.5, y: 0.49 }
  landmarks[14] = { x: 0.5, y: 0.51 }
  landmarks[234] = { x: 0.3, y: 0.5 }
  landmarks[454] = { x: 0.7, y: 0.5 }
  return landmarks
}

test('no detected hand produces explicit zero-valued hand features', () => {
  expect(extractHandFeatures({ landmarks: [] }, faceLandmarks())).toEqual(EMPTY_HAND_FEATURES)
})

test('hand and fingertip proximity are normalized by face width', () => {
  const touching = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  const farAway = Array.from({ length: 21 }, () => ({ x: 1, y: 1 }))

  expect(extractHandFeatures({ landmarks: [touching] }, faceLandmarks())).toEqual({
    handPresent: 1,
    twoHandsPresent: 0,
    handNearFace: 1,
    fingertipNearMouth: 1,
  })
  expect(extractHandFeatures({ landmarks: [farAway] }, faceLandmarks())).toEqual({
    handPresent: 1,
    twoHandsPresent: 0,
    handNearFace: 0,
    fingertipNearMouth: 0,
  })
})

test('either of two hands can satisfy a face-relative gesture', () => {
  const farAway = Array.from({ length: 21 }, () => ({ x: 1, y: 1 }))
  const touching = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))

  expect(extractHandFeatures({ landmarks: [farAway, touching] }, faceLandmarks())).toEqual({
    handPresent: 1,
    twoHandsPresent: 1,
    handNearFace: 1,
    fingertipNearMouth: 1,
  })
})

test('a hand remains detectable when face-relative proximity is unavailable', () => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  expect(extractHandFeatures({ landmarks: [hand] }, [])).toEqual({
    handPresent: 1,
    twoHandsPresent: 0,
    handNearFace: null,
    fingertipNearMouth: null,
  })
})
