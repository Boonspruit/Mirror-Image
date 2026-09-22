import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url)))

async function setup(page) {
  await page.route('**/src/tracking/faceTracker.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `export async function createFaceTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startFaceTracking(video, tracker, onResult) {
        const timer = setInterval(() => onResult({ facialTransformationMatrixes: [], faceLandmarks: window.noFace ? [] : [Array.from({length:478},()=>({x:.5,y:.5,z:0}))], faceBlendshapes: [{ categories: [] }] }), 50)
        return () => clearInterval(timer)
      }`,
  }))
  await page.route('**/src/tracking/featureExtractor*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `export const EXPRESSION_FEATURES = ${JSON.stringify(Object.fromEntries(Object.keys(memes[0].features).map(k => [k, []])))};
      export function extractFeatureVector(result) { return result.faceLandmarks.length ? { expression: ${JSON.stringify(memes[0].features)}, headPose: null } : null }`,
  }))
  await page.route('**/src/tracking/handTracker.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'export async function createHandTracker(){return {tracker:{close(){}},delegate:"CPU"}}; export function startHandTracking(){return ()=>{}}',
  }))
  await page.goto('/#photobooth')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start posing' })).toBeEnabled()
}

test('four-pose strip preserves other photos on retake and downloads all four rows', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Four-pose strip', exact: true }).click()
  await page.getByRole('button', { name: 'Shuffle poses' }).click()
  const ids = await page.locator('.strip-choice select').evaluateAll((selects) => selects.map((select) => select.value))
  expect(new Set(ids).size).toBe(4)
  await page.getByLabel('Pose 1', { exact: true }).selectOption('call-me-cat')
  await page.getByRole('button', { name: 'Start strip', exact: true }).click()
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByRole('heading', { name: `Pose ${i} of 4` })).toBeVisible()
    await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  }
  await expect(page.getByRole('link', { name: 'Download strip' })).toBeVisible()
  const before = await page.locator('.strip-review img').evaluateAll((images) => images.map((image) => image.src))
  await page.getByRole('button', { name: 'Retake pose 2', exact: true }).click()
  await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  await page.getByRole('button', { name: 'Cancel capture', exact: true }).click()
  await page.getByRole('button', { name: 'Back to strip', exact: true }).click()
  expect(await page.locator('.strip-review img').evaluateAll((images) => images.map((image) => image.src))).toEqual(before)
  await page.getByRole('button', { name: 'Retake pose 2', exact: true }).click()
  await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  await expect(page.getByRole('link', { name: 'Download strip' })).toBeVisible()
  const after = await page.locator('.strip-review img').evaluateAll((images) => images.map((image) => image.src))
  expect(after[1]).not.toBe(before[1])
  for (const i of [0, 2, 3]) expect(after[i]).toBe(before[i])
  const dimensions = await page.getByRole('link', { name: 'Download strip' }).evaluate(async (link) => {
    const bitmap = await createImageBitmap(await (await fetch(link.href)).blob())
    const size = [bitmap.width, bitmap.height]
    bitmap.close()
    return size
  })
  expect(dimensions).toEqual([800, 1520])
  const downloaded = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download strip' }).click()
  expect((await downloaded).suggestedFilename()).toBe('mirror-image-four-poses.png')
  await page.setViewportSize({ width: 375, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'New strip', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pick your four poses.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download strip' })).toHaveCount(0)
})

test('automatic pose capture locks the meme and exports a comparison; retake and navigation cancel work', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Start posing' }).click()
  await expect(page.getByLabel('Your pose', { exact: true })).toBeDisabled()
  await expect(page.getByRole('status', { name: 'Capturing in 3' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download photo' })).toBeVisible()
  const dimensions = await page.locator('.booth-review > img').evaluate(async (image) => { await image.decode(); return [image.naturalWidth, image.naturalHeight] })
  expect(dimensions).toEqual([1600, 760])
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download photo' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('mirror-image-surprised-pikachu.png')
  await page.getByRole('button', { name: 'Retake', exact: true }).click()
  await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  await page.getByRole('link', { name: 'Mirror', exact: true }).click()
  await page.getByRole('link', { name: 'Photobooth', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start posing' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download photo' })).toHaveCount(0)
})

test('lost face resets automatic countdown, manual capture works without a match, and cancel stops capture', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Start posing' }).click()
  await expect(page.getByRole('status', { name: 'Capturing in 3' })).toBeVisible()
  await page.evaluate(() => { window.noFace = true })
  await expect(page.getByText('Look toward the camera.', { exact: true })).toBeVisible()
  await expect(page.locator('.booth-countdown')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel capture' }).click()
  await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  await page.getByRole('button', { name: 'Cancel capture' }).click()
  await expect(page.getByRole('button', { name: 'Start posing' })).toBeVisible()
  await page.getByRole('button', { name: 'Take photo in 3 seconds' }).click()
  await expect(page.getByRole('link', { name: 'Download photo' })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
