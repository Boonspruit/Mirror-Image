import { test, expect } from '@playwright/test'

async function trackingFixture(page) {
  await page.route('**/src/tracking/faceTracker.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function createFaceTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startFaceTracking(video, tracker, onResult) {
        const names = ['eyeWideLeft','eyeWideRight','eyeSquintLeft','eyeSquintRight','browInnerUp','browDownLeft','browDownRight','jawOpen','mouthSmileLeft','mouthSmileRight','mouthFrownLeft','mouthFrownRight','mouthPucker','cheekSquintLeft','cheekSquintRight','noseSneerLeft','noseSneerRight'];
        const timer = setInterval(() => onResult({faceLandmarks: window.noFace ? [] : [[]], faceBlendshapes: [{categories: names.map(categoryName => ({categoryName, score: .35}))}], facialTransformationMatrixes: []}), 50);
        return () => clearInterval(timer);
      }
    `,
  }))
  await page.route('**/src/tracking/handTracker.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function createHandTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startHandTracking(video, tracker, onResult) {
        const timer = setInterval(() => onResult({ landmarks: [], worldLandmarks: [], handedness: [] }), 50)
        return () => clearInterval(timer)
      }
    `,
  }))
}

test('focused navigation preserves one camera session and trains beside a live preview', async ({ page }) => {
  await trackingFixture(page)
  await page.goto('/')
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page.locator('.meme-gallery')).toBeHidden()
  await expect(page.getByRole('region', {name: 'Settings', exact: true})).toBeHidden()
  await page.getByRole('button', {name: 'Start camera', exact: true}).click()
  await expect(page.locator('#live-match .match-meter')).toBeVisible()
  await page.locator('.camera-stage video').evaluate(video => {window.originalStream = video.srcObject})
  await page.screenshot({path:'test-results/clean-mirror.png',fullPage:true})
  await page.getByRole('link', {name: 'Library', exact:true}).click()
  await expect(page.locator('.workspace')).toBeHidden()
  await page.getByRole('button', {name:'Inspect Alma Blank Stare',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const video = dialog.getByLabel('Expression training camera')
  await expect.poll(() => video.evaluate(el => el.videoWidth > 0 && el.srcObject === window.originalStream)).toBe(true)
  await page.screenshot({path:'test-results/training-editor.png',fullPage:true})
  await dialog.getByRole('button', {name:'Match this meme to my face'}).click()
  await expect(dialog).toContainText('Alma Blank Stare now matches this expression.')
  await page.evaluate(() => {window.noFace = true})
  await expect(dialog.getByRole('button', {name:'Match this meme to my face'})).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('link', {name:'Settings',exact:true}).click()
  await expect(page.getByRole('checkbox', {name:/Show face mesh/})).toBeVisible()
  await page.getByRole('checkbox', {name:/Show face mesh/}).check()
  await page.getByRole('link', {name:'Mirror',exact:true}).click()
  expect(await page.locator('.camera-stage video').evaluate(el => el.srcObject === window.originalStream)).toBe(true)
  await expect(page.locator('.workspace')).toBeVisible()
  await page.locator('.workspace').getByRole('button', {name:'Stop camera',exact:true}).click()
  expect(await page.evaluate(() => window.originalStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true)
  await page.reload()
  await page.getByRole('link', {name:'Library',exact:true}).click()
  await page.getByRole('button', {name:'Inspect Alma Blank Stare',exact:true}).click()
  await expect(dialog).toContainText('TRAINED WITH YOUR FACE')
})

test('library can start its camera directly and the editor fits a narrow screen', async ({page}) => {
  await trackingFixture(page)
  await page.setViewportSize({width:390,height:844})
  await page.goto('/#meme-collection')
  await page.getByRole('button', {name:'Inspect Alma Happy Hamster',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', {name:'Match this meme to my face'})).toBeDisabled()
  await dialog.getByRole('button', {name:'Start camera',exact:true}).click()
  await expect(dialog.getByRole('button', {name:'Match this meme to my face'})).toBeEnabled()
  await expect.poll(() => dialog.locator('video').evaluate(v => v.videoWidth > 0)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({path:'test-results/training-mobile.png',fullPage:true})
  await dialog.getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('link',{name:'Mirror',exact:true}).click()
  await page.screenshot({path:'test-results/mirror-mobile.png',fullPage:true})
})
