import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url), 'utf8'))

function categoriesFor(features) {
  const paired = {
    eyeWide: ['eyeWideLeft', 'eyeWideRight'], eyeSquint: ['eyeSquintLeft', 'eyeSquintRight'],
    browDown: ['browDownLeft', 'browDownRight'], smile: ['mouthSmileLeft', 'mouthSmileRight'],
    frown: ['mouthFrownLeft', 'mouthFrownRight'], cheekSquint: ['cheekSquintLeft', 'cheekSquintRight'],
    noseSneer: ['noseSneerLeft', 'noseSneerRight'],
  }
  const single = { browInnerUp: 'browInnerUp', jawOpen: 'jawOpen', mouthPucker: 'mouthPucker' }
  return Object.entries(features).flatMap(([name, score]) => paired[name]
    ? paired[name].map((categoryName) => ({ categoryName, score }))
    : [{ categoryName: single[name], score }])
}

async function installControlledTracker(page, initialFeatures, { handToMouth = false, handCount = handToMouth ? 1 : 0 } = {}) {
  await page.addInitScript((categories) => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    landmarks[13] = { x: 0.5, y: 0.49, z: 0 }
    landmarks[14] = { x: 0.5, y: 0.51, z: 0 }
    landmarks[234] = { x: 0.3, y: 0.5, z: 0 }
    landmarks[454] = { x: 0.7, y: 0.5, z: 0 }
    window.matchFixture = {
      faceLandmarks: [landmarks], faceBlendshapes: [{ categories }],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1] }],
    }
  }, categoriesFor(initialFeatures))
  await page.addInitScript(({ count, nearMouth }) => {
    const coordinate = nearMouth ? 0.5 : 0.9
    const landmarks = Array.from({ length: 21 }, () => ({ x: coordinate, y: coordinate, z: 0 }))
    window.handFixture = { landmarks: Array.from({ length: count }, () => landmarks), worldLandmarks: [], handedness: [] }
  }, { count: handCount, nearMouth: handToMouth })
  await page.route('**/src/tracking/faceTracker.ts*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function createFaceTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startFaceTracking(video, tracker, onResult) {
        const timer = setInterval(() => onResult(window.matchFixture), 50)
        return () => clearInterval(timer)
      }
    `,
  }))
  await page.route('**/src/tracking/handTracker.ts*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function createHandTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startHandTracking(video, tracker, onResult) {
        const timer = setInterval(() => onResult(window.handFixture), 50)
        return () => clearInterval(timer)
      }
    `,
  }))
}

test('live result shows an exact winner and switches immediately to a stronger face', async ({ page }) => {
  const pikachu = memes.find((meme) => meme.id === 'surprised-pikachu')
  const leonardo = memes.find((meme) => meme.id === 'leonardo-cheers')
  await installControlledTracker(page, pikachu.features)
  await page.goto('/')
  const display = page.locator('#live-match')
  await expect(display).toContainText('Start the camera')
  const idleCameraFrame = await page.locator('.camera-stage').boundingBox()
  const idleMemeFrame = await display.locator('.match-placeholder-frame').boundingBox()
  expect(Math.abs(idleCameraFrame.y - idleMemeFrame.y)).toBeLessThan(2)
  expect(Math.abs(idleCameraFrame.height - idleMemeFrame.height)).toBeLessThan(2)
  await page.getByRole('button', { name: 'Start camera' }).click()


  await expect(display.getByRole('heading', { name: 'Surprised Pikachu', exact: true })).toBeVisible()
  await expect(display.locator('.match-meter')).toHaveAttribute('aria-label', '100% overall match')
  await display.getByText('Match details', { exact: true }).click()
  await expect(display.locator('.group-matches dd')).toHaveText(['100%', '100%', '100%'])
  await expect(display.locator('.match-meta')).toContainText('Distance 0.000')
  await expect(display.locator('.match-meta')).toContainText('Coverage 100%')
  await expect(display).toContainText('LIVE MATCH')
  await expect(display.locator('.runner-ups > div')).toHaveCount(3)
  await expect.poll(() => display.locator('.match-image img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
  const imageIsFullyVisible = await display.locator('.match-image img').evaluate((image) => {
    const imageBox = image.getBoundingClientRect()
    const frameBox = image.parentElement.getBoundingClientRect()
    return getComputedStyle(image).objectFit === 'contain'
      && getComputedStyle(image.parentElement).overflow === 'hidden'
      && imageBox.left >= frameBox.left && imageBox.right <= frameBox.right
      && imageBox.top >= frameBox.top && imageBox.bottom <= frameBox.bottom
  })
  expect(imageIsFullyVisible).toBe(true)
  const cameraFrame = await page.locator('.camera-stage').boundingBox()
  const memeFrame = await display.locator('.match-image').boundingBox()
  expect(Math.abs(cameraFrame.y - memeFrame.y)).toBeLessThan(2)
  expect(Math.abs(cameraFrame.height - memeFrame.height)).toBeLessThan(2)
  const cameraBox = await page.locator('.camera-panel').boundingBox()
  const matchBox = await display.boundingBox()
  expect(Math.abs(cameraBox.y - matchBox.y)).toBeLessThan(2)
  expect(matchBox.x).toBeGreaterThanOrEqual(cameraBox.x + cameraBox.width - 2)
  await page.setViewportSize({ width: 664, height: 900 })
  const compactCameraBox = await page.locator('.camera-panel').boundingBox()
  const compactMatchBox = await display.boundingBox()
  const compactCameraFrame = await page.locator('.camera-stage').boundingBox()
  const compactMemeFrame = await display.locator('.match-image').boundingBox()
  expect(Math.abs(compactCameraBox.y - compactMatchBox.y)).toBeLessThan(2)
  expect(compactMatchBox.x).toBeGreaterThanOrEqual(compactCameraBox.x + compactCameraBox.width - 2)
  expect(Math.abs(compactCameraFrame.y - compactMemeFrame.y)).toBeLessThan(2)
  expect(Math.abs(compactCameraFrame.height - compactMemeFrame.height)).toBeLessThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.evaluate((categories) => { window.matchFixture.faceBlendshapes[0].categories = categories }, categoriesFor(leonardo.features))
  await expect(display.getByRole('heading', { name: 'Leonardo Cheers', exact: true })).toBeVisible({ timeout: 500 })
  await display.screenshot({ path: 'test-results/live-match.png' })

  await page.evaluate(() => { window.matchFixture.faceLandmarks = [] })
  await expect(display.getByRole('heading', { name: 'Waiting for an expression' })).toBeVisible()
  await expect(display).toContainText('Look toward the camera')
  await expect(display.locator('.match-meter')).toHaveCount(0)

  await page.getByRole('button', { name: 'Stop camera' }).click()
  await expect(display).toContainText('Start the camera')
})

test('a hand-to-mouth gesture activates a hand-aware meme profile', async ({ page }) => {
  const monkey = memes.find((meme) => meme.id === 'thinking-monkey')
  await installControlledTracker(page, monkey.features, { handToMouth: true, handCount: 2 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera' }).click()

  const display = page.locator('#live-match')
  await expect(display.getByRole('heading', { name: 'Thinking Monkey', exact: true })).toBeVisible({ timeout: 3000 })
  await display.getByText('Match details', { exact: true }).click()
  await expect(display.locator('.group-matches dt')).toContainText(['Eyes', 'Brows', 'Mouth & cheeks', 'Hand gesture'])
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const metrics = page.locator('.metrics')
  await expect(metrics.getByText('Hands detected', { exact: true }).locator('..').locator('dd')).toContainText('2 / 2')
  await expect(metrics.getByText('Fingertip near mouth', { exact: true }).locator('..').locator('dd')).toContainText('100%')
})

test('showing or hiding hands does not exclude an exact face-only match', async ({ page }) => {
  const pikachu = memes.find((meme) => meme.id === 'surprised-pikachu')
  await installControlledTracker(page, pikachu.features)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera' }).click()

  const display = page.locator('#live-match')
  await expect(display.getByRole('heading', { name: 'Surprised Pikachu', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const visibleAwayFromMouth = Array.from({ length: 21 }, () => ({ x: 0.9, y: 0.9, z: 0 }))
    window.handFixture.landmarks = [visibleAwayFromMouth, visibleAwayFromMouth]
  })
  await expect(display.getByRole('heading', { name: 'Surprised Pikachu', exact: true })).toBeVisible({ timeout: 1000 })

  await page.evaluate(() => { window.handFixture.landmarks = [] })
  await expect(display.getByRole('heading', { name: 'Surprised Pikachu', exact: true })).toBeVisible({ timeout: 1000 })
})

test('neutral calibration counts down, saves a baseline, and subtracts it from live values', async ({ page }) => {
  const neutral = Object.fromEntries(Object.keys(memes[0].features).map((name) => [name, 0.2]))
  await installControlledTracker(page, neutral)
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.settings-view')).toBeVisible()
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(page.getByRole('button', { name: 'Calibrate face' })).toBeEnabled()

  await page.getByRole('button', { name: 'Calibrate face' }).click()
  const countdown = page.locator('.settings-view > [role="status"]')
  await expect(countdown).toContainText('3')
  await expect(countdown).toContainText('2', { timeout: 1500 })
  await expect(countdown).toContainText('1', { timeout: 1500 })
  await expect(page.locator('.calibration-feedback')).toContainText('Neutral baseline saved', { timeout: 2000 })
  await expect(page.getByRole('button', { name: 'Recalibrate face' })).toBeVisible()
  await expect(page.locator('.raw-badge')).toContainText('CALIBRATED MATCH')
  await expect(page.locator('[data-expression="smile"] .feature-value')).toHaveText('0.000')

  const smiling = { ...neutral, smile: 0.8 }
  await page.evaluate((categories) => { window.matchFixture.faceBlendshapes[0].categories = categories }, categoriesFor(smiling))
  await expect.poll(async () => Number(await page.locator('[data-expression="smile"] .feature-value').textContent())).toBeGreaterThan(0.5)
  await page.getByRole('button', { name: 'Stop camera' }).click()
})

test('a selected meme can learn the current face and keeps that profile after reload', async ({ page }) => {
  const trainedFace = {
    eyeWide: 0.17,
    eyeSquint: 0.73,
    browInnerUp: 0.36,
    browDown: 0.49,
    jawOpen: 0.27,
    smile: 0.64,
    frown: 0.19,
    mouthPucker: 0.41,
    cheekSquint: 0.58,
    noseSneer: 0.33,
  }
  await installControlledTracker(page, trainedFace)
  await page.goto('/#meme-collection')
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })
  await gallery.getByRole('button', { name: 'Inspect Surprised Pikachu', exact: true }).click()
  const trainButton = gallery.getByRole('button', { name: 'Match this meme to my face' })
  await expect(trainButton).toBeDisabled()

  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(trainButton).toBeEnabled()
  await trainButton.click()

  await expect(gallery.getByText('Surprised Pikachu now matches this expression.')).toBeVisible()
  await expect(gallery.getByText('TRAINED WITH YOUR FACE')).toBeVisible()
  await gallery.getByText('Expression values & notes', { exact: true }).click()
  await expect(gallery.locator('.meme-features dd')).toHaveText(Object.values(trainedFace).map((value) => value.toFixed(2)))
  await expect(page.locator('#live-match h2')).toHaveText('Surprised Pikachu', { timeout: 3000 })

  await page.reload()
  await gallery.getByRole('button', { name: 'Inspect Surprised Pikachu', exact: true }).click()
  await expect(gallery.getByText('TRAINED WITH YOUR FACE')).toBeVisible()
  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(page.locator('#live-match h2')).toHaveText('Surprised Pikachu', { timeout: 3000 })

  await gallery.getByRole('button', { name: 'Reset original values' }).click()
  await expect(gallery.getByText('TRAINED WITH YOUR FACE')).toHaveCount(0)
  await expect(gallery.getByText('Surprised Pikachu restored to its original profile.')).toBeVisible()
})

test('a hand-aware meme saves and restores the live hand profile with the face', async ({ page }) => {
  const monkey = memes.find((meme) => meme.id === 'thinking-monkey')
  await installControlledTracker(page, monkey.features, { handCount: 1 })
  await page.goto('/#meme-collection')
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })
  await gallery.getByRole('button', { name: 'Inspect Thinking Monkey', exact: true }).click()
  const trainButton = gallery.getByRole('button', { name: 'Match this meme to my face + hands' })
  await expect(trainButton).toBeDisabled()

  await page.getByRole('button', { name: 'Start camera' }).click()
  await expect(trainButton).toBeEnabled()
  await trainButton.click()
  await expect(gallery.getByText('Thinking Monkey now matches this expression and hand pose.')).toBeVisible()
  await expect(gallery.getByText('TRAINED WITH YOUR FACE + HANDS')).toBeVisible()
  await gallery.getByText('Expression values & notes', { exact: true }).click()
  const savedHandValues = await gallery.locator('.hand-features dd').allTextContents()
  expect(Number(savedHandValues[0])).toBeGreaterThanOrEqual(0.5)
  expect(savedHandValues.slice(1)).toEqual(['0.00', '0.00'])

  await page.reload()
  await gallery.getByRole('button', { name: 'Inspect Thinking Monkey', exact: true }).click()
  await expect(gallery.getByText('TRAINED WITH YOUR FACE + HANDS')).toBeVisible()
  await gallery.getByText('Expression values & notes', { exact: true }).click()
  await expect(gallery.locator('.hand-features dd')).toHaveText(savedHandValues)
})

test('a tall meme stays inside its frame and cannot overlap match text', async ({ page }) => {
  const shocked = memes.find((meme) => meme.id === 'shocked')
  await installControlledTracker(page, shocked.features)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera' }).click()
  const display = page.locator('#live-match')
  await expect(display.getByRole('heading', { name: 'No Way', exact: true })).toBeVisible()
  await expect.poll(() => display.locator('.match-image img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)

  await display.getByText('Match details', { exact: true }).click()
  const doesNotOverlap = await display.evaluate((element) => {
    const frame = element.querySelector('.match-image').getBoundingClientRect()
    const image = element.querySelector('.match-image img').getBoundingClientRect()
    const alternatives = element.querySelector('.runner-ups').getBoundingClientRect()
    return image.top >= frame.top && image.bottom <= frame.bottom && frame.bottom <= alternatives.top
  })
  expect(doesNotOverlap).toBe(true)
  await page.getByRole('button', { name: 'Stop camera' }).click()
})

test('live result is responsive and recovers from a failed winning image', async ({ page }) => {
  const pikachu = memes.find((meme) => meme.id === 'surprised-pikachu')
  await installControlledTracker(page, pikachu.features)
  await page.route('**/memes/surprised_pikachu.jpg', (route) => route.abort())
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera' }).click()

  const display = page.locator('#live-match')
  await expect(display.getByText('Image unavailable', { exact: false })).toBeVisible()
  const cameraBox = await page.locator('.camera-panel').boundingBox()
  const matchBox = await display.boundingBox()
  expect(matchBox.y).toBeGreaterThanOrEqual(cameraBox.y + cameraBox.height - 2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await display.screenshot({ path: 'test-results/live-match-mobile.png' })
  await page.getByRole('button', { name: 'Stop camera' }).click()
})
