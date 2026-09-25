import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { compareExpressions, DEFAULT_FEATURE_WEIGHTS } from '../src/matching/similarity.ts'
import { findBestMatch, rankMemes } from '../src/matching/matcher.ts'

const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url), 'utf8'))

test('identical and maximally different vectors map to 100% and 0%', () => {
  const zero = Object.fromEntries(Object.keys(DEFAULT_FEATURE_WEIGHTS).map((key) => [key, 0]))
  const one = Object.fromEntries(Object.keys(DEFAULT_FEATURE_WEIGHTS).map((key) => [key, 1]))
  expect(compareExpressions(zero, zero)).toMatchObject({ distance: 0, percentage: 100, coverage: 1 })
  expect(compareExpressions(zero, one)).toMatchObject({ distance: 1, percentage: 0, coverage: 1 })
})

test('weighted RMS follows the documented formula', () => {
  const result = compareExpressions(
    { eyeWide: 1, smile: 0 },
    { eyeWide: 0, smile: 1 },
    { eyeWide: 2, smile: 1 },
  )
  expect(result.distance).toBeCloseTo(Math.sqrt(3 / 3), 10)
  expect(result.percentage).toBeCloseTo(0, 10)
  expect(result.usedFeatures).toEqual(['eyeWide', 'smile'])

  const eyeOnly = compareExpressions(
    { eyeWide: 1, smile: 0 },
    { eyeWide: 0, smile: 0 },
    { eyeWide: 2, smile: 1 },
  )
  expect(eyeOnly.distance).toBeCloseTo(Math.sqrt(2 / 3), 10)
})

test('scaling all weights leaves normalized distance unchanged', () => {
  const a = { eyeWide: 0.9, jawOpen: 0.7, smile: 0.2 }
  const b = { eyeWide: 0.2, jawOpen: 0.1, smile: 0.8 }
  const base = { eyeWide: 2, jawOpen: 2, smile: 1 }
  const scaled = { eyeWide: 20, jawOpen: 20, smile: 10 }
  expect(compareExpressions(a, b, base).distance).toBeCloseTo(compareExpressions(a, b, scaled).distance, 12)
})

test('missing readings are omitted and reported through coverage', () => {
  const result = compareExpressions(
    { eyeWide: 0.8, jawOpen: null, smile: Number.NaN },
    { eyeWide: 0.2, jawOpen: 0.7, smile: 0.2 },
    { eyeWide: 2, jawOpen: 2, smile: 1 },
  )
  expect(result.distance).toBeCloseTo(0.6, 10)
  expect(result.percentage).toBeCloseTo(40, 10)
  expect(result.coverage).toBeCloseTo(0.4, 10)
  expect(result.usedFeatures).toEqual(['eyeWide'])
  expect(compareExpressions(null, {})).toBeNull()
  expect(compareExpressions({}, {}, { eyeWide: 2 })).toBeNull()
})

test('invalid weights fail loudly', () => {
  for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => compareExpressions({ eyeWide: 1 }, { eyeWide: 0 }, { eyeWide: weight })).toThrow(RangeError)
  }
})

test('ranking finds an exact profile and does not mutate the dataset', () => {
  const pikachu = memes.find((meme) => meme.id === 'surprised-pikachu')
  const before = structuredClone(memes)
  const ranked = rankMemes(pikachu.features, memes)
  expect(ranked).toHaveLength(14)
  expect(ranked[0].meme.id).toBe('surprised-pikachu')
  expect(ranked[0].comparison.percentage).toBe(100)
  const comparable = ranked.filter(({ comparison }) => comparison)
  expect(comparable.every((entry, index) => index === 0 || entry.comparison.distance >= comparable[index - 1].comparison.distance)).toBe(true)
  expect(ranked.find(({ meme }) => meme.id === 'thinking-monkey').comparison).not.toBeNull()
  expect(findBestMatch(pikachu.features, memes).meme.id).toBe('surprised-pikachu')
  expect(memes).toEqual(before)
})

test('hand readings improve hand-aware scores while face-only scores stay unchanged', () => {
  const candidates = [
    { id: 'face-only', features: { smile: 0.5 } },
    { id: 'hand-aware', features: { smile: 0 }, handFeatures: { handPresent: 1, handNearFace: 1, fingertipNearMouth: 1 } },
  ]
  const withoutHand = rankMemes({ smile: 0.5, handPresent: 0, handNearFace: 0, fingertipNearMouth: 0 }, candidates)
  const withHand = rankMemes({ smile: 0.5, handPresent: 1, handNearFace: 1, fingertipNearMouth: 1 }, candidates)

  expect(withoutHand[0].meme.id).toBe('face-only')
  const handAwareWithoutHand = withoutHand.find(({ meme }) => meme.id === 'hand-aware')
  const handAwareWithHand = withHand.find(({ meme }) => meme.id === 'hand-aware')
  expect(handAwareWithoutHand.comparison).not.toBeNull()
  expect(handAwareWithHand.comparison.percentage).toBeGreaterThan(handAwareWithoutHand.comparison.percentage)
  expect(withHand.find(({ meme }) => meme.id === 'face-only').comparison.percentage).toBe(100)
})

test('a close hand-to-mouth pose can make its combined profile beat a nearby face-only profile', () => {
  const monkey = memes.find(({ id }) => id === 'thinking-monkey')
  const cryingCat = memes.find(({ id }) => id === 'crying-cat')
  const userFeatures = {
    ...monkey.features,
    handPresent: 1,
    twoHandsPresent: 1,
    handNearFace: 1,
    fingertipNearMouth: 1,
  }

  const ranked = rankMemes(userFeatures, [cryingCat, monkey])

  expect(ranked[0].meme.id).toBe('thinking-monkey')
  expect(ranked[0].comparison.percentage).toBeGreaterThan(93)
})

test('partial hand gestures remain comparable instead of filtering either profile type', () => {
  const candidates = [
    { id: 'face-only', features: { smile: 0.5 } },
    { id: 'hand-aware', features: { smile: 0 }, handFeatures: { handPresent: 1, handNearFace: 1, fingertipNearMouth: 1 } },
  ]
  const ranked = rankMemes({ smile: 0.5, handPresent: 1, handNearFace: 0.8, fingertipNearMouth: 0.2 }, candidates)
  expect(ranked.map(({ meme }) => meme.id)).toEqual(['face-only', 'hand-aware'])
  expect(ranked.every(({ comparison }) => comparison)).toBe(true)
})

test('exact ties use stable IDs and uncomparable entries sort last', () => {
  const tied = [
    { id: 'zeta', features: { smile: 0.5 } },
    { id: 'alpha', features: { smile: 0.5 } },
    { id: 'missing', features: {} },
  ]
  const ranked = rankMemes({ smile: 0.5 }, tied, { smile: 1 })
  expect(ranked.map(({ meme }) => meme.id)).toEqual(['alpha', 'zeta', 'missing'])
  expect(ranked[2].comparison).toBeNull()
  expect(findBestMatch(null, tied, { smile: 1 })).toBeNull()
})

test('weight panel exposes the configured engine without choosing a winner', async ({ page }) => {
  await page.goto('/#settings')
  const panel = page.getByRole('region', { name: 'Weighted similarity' })
  await expect(panel).toContainText('0 / 10 features ready')
  await expect(panel.locator('.weight-grid > div')).toHaveCount(10)
  await expect(panel.locator('.engine-note')).toContainText('14 profiles loaded')
  await expect(panel).toContainText('100 ms match interval')
  await expect(panel).not.toContainText('Best match')
})
