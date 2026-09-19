import { test, expect } from '@playwright/test'

const startButton = (page) => page.getByRole('button', { name: 'Start camera' })
const stopButton = (page) => page.getByRole('button', { name: 'Stop camera' })
// Count painted pixels rather than relying only on the canvas being present.
const overlayPixels = (page) => page.locator('.face-overlay').evaluate((canvas) => {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count += 1
  return count
})

const metric = (page, name) => page.locator('.metrics > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd')

test('starts idle, requests no camera, and fits desktop and narrow screens', async ({ page }) => {
  let requests = 0
  await page.exposeFunction('recordCameraRequest', () => { requests += 1 })
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { await window.recordCameraRequest(); throw new Error('Unexpected camera request') }
  })
  await page.goto('/#settings')
  await expect(page).toHaveTitle('Mirror Image')
  await expect(page.getByRole('status')).toContainText('Camera is off')
  await expect(startButton(page)).toBeVisible()
  expect(requests).toBe(0)
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 375, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})

test('permission denial gives a recoverable error', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
  })
  await page.goto('/#settings')
  await startButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Camera access was denied')
  await expect(startButton(page)).toBeEnabled()
  expect(await page.locator('.camera-stage video').evaluate((v) => v.srcObject)).toBeNull()
})

test('real model runs on a synthetic webcam and releases tracks across restart', async ({ page }) => {
  const uncaught = []
  page.on('pageerror', (error) => uncaught.push(error.message))
  await page.goto('/#settings')
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await startButton(page).click()
    await expect(page.getByRole('status')).toContainText('Tracking is running')
    await expect(page.getByRole('status')).toContainText('No face detected')
    await page.locator('.camera-stage video').evaluate((video) => { window.savedTracks = video.srcObject.getTracks() })
    await stopButton(page).click()
    await expect(page.getByRole('status')).toContainText('Camera is off')
    expect(await page.evaluate(() => window.savedTracks.every((t) => t.readyState === 'ended'))).toBe(true)
    expect(await page.locator('.camera-stage video').evaluate((v) => v.srcObject)).toBeNull()
  }
  expect(uncaught).toEqual([])
})

test('cancellation releases a permission request that resolves late', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
      window.finishPermission = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640; canvas.height = 480
        canvas.getContext('2d').fillRect(0, 0, 640, 480)
        const stream = canvas.captureStream(10)
        window.lateTracks = stream.getTracks()
        resolve(stream)
      }
    })
  })
  await page.goto('/#settings')
  await startButton(page).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.evaluate(() => window.finishPermission())
  await expect.poll(() => page.evaluate(() => window.lateTracks.every((t) => t.readyState === 'ended'))).toBe(true)
  await expect(page.getByRole('status')).toContainText('Camera is off')
})

test('a model load error stops the camera and offers retry', async ({ page }) => {
  await page.route('**/models/face_landmarker.task', (route) => route.abort())
  await page.goto('/#settings')
  await startButton(page).click()
  await expect(page.getByRole('alert')).toContainText('face tracker could not load')
  await expect(startButton(page)).toBeEnabled()
  expect(await page.locator('.camera-stage video').evaluate((v) => v.srcObject)).toBeNull()
})

test('stop during model loading does not resurrect tracking', async ({ page }) => {
  let releaseModel
  const gate = new Promise((resolve) => { releaseModel = resolve })
  let modelRequested
  const requested = new Promise((resolve) => { modelRequested = resolve })
  await page.route('**/models/face_landmarker.task', async (route) => {
    modelRequested()
    await gate
    await route.continue()
  })
  await page.goto('/#settings')
  await startButton(page).click()
  await requested
  await page.locator('.camera-stage video').evaluate((video) => { window.savedTracks = video.srcObject.getTracks() })
  await stopButton(page).click()
  releaseModel()
  await expect(page.getByRole('status')).toContainText('Camera is off')
  expect(await page.evaluate(() => window.savedTracks.every((t) => t.readyState === 'ended'))).toBe(true)
  // Let the real pending initialization complete, then ensure a fresh session works.
  await startButton(page).click()
  await expect(page.getByRole('status')).toContainText('Tracking is running')
  await stopButton(page).click()
})

test('real face mesh aligns, toggles, resizes, and clears on face loss and stop', async ({ page }) => {
  // A public MediaPipe test photo, never a photo from the user's camera.
  const response = await fetch('https://storage.googleapis.com/mediapipe-assets/portrait.jpg')
  if (!response.ok) throw new Error('Could not download MediaPipe test portrait')
  const portrait = Buffer.from(await response.arrayBuffer())
  await page.route('**/test-portrait.jpg', (route) => route.fulfill({ contentType: 'image/jpeg', body: portrait }))
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image()
      img.src = '/test-portrait.jpg'
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 360
      const ctx = canvas.getContext('2d')
      window.showTestFace = true
      const draw = () => {
        ctx.fillStyle = '#444'
        ctx.fillRect(0, 0, 640, 360)
        if (window.showTestFace) {
          const scale = Math.min(640 / img.width, 360 / img.height)
          const w = img.width * scale; const h = img.height * scale
          ctx.drawImage(img, (640 - w) / 2, (360 - h) / 2, w, h)
        }
      }
      draw()
      const timer = setInterval(draw, 100)
      const stream = canvas.captureStream(10)
      stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer))
      return stream
    }
  })
  await page.goto('/#settings')
  await startButton(page).click()
  await expect(page.getByRole('status')).toContainText('Face detected.')
  await expect(metric(page, 'Facial landmarks')).toHaveText('478')
  await expect(metric(page, 'Blendshape signals')).toHaveText('52')
  await expect(metric(page, 'Head transform')).toHaveText('Available')
  const expression = page.getByRole('region', { name: 'Expression vector' })
  const similarity = page.getByRole('region', { name: 'Weighted similarity' })
  await expect(similarity.locator('.debug-status')).toHaveText('10 / 10 features ready')
  await expect(expression.locator('meter')).toHaveCount(10)
  for (const axis of ['yaw', 'pitch', 'roll']) {
    await expect(expression.locator('[data-pose="' + axis + '"]')).toHaveText(/^-?\d+\.\d°$/)
  }
  const combinedSmile = Number(await expression.locator('[data-expression="smile"] .feature-value').textContent())
  expect(combinedSmile).toBeGreaterThan(0.1)
  const debug = page.getByRole('region', { name: 'Live blendshapes' })
  await expect(debug.locator('.debug-status')).toContainText('Live')
  await expect(debug.locator('.feature-groups meter')).toHaveCount(17)
  await debug.getByText('All raw blendshapes (52)', { exact: true }).click()
  await expect(debug.locator('.all-feature-grid .feature-row')).toHaveCount(52)
  const scores = await debug.locator('.all-feature-grid meter').evaluateAll((meters) => meters.map((m) => m.value))
  expect(scores.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true)
  expect(scores.some((v) => v > 0.1)).toBe(true)
  await debug.getByText('All raw blendshapes (52)', { exact: true }).click()
  await page.getByRole('checkbox', { name: /Show face mesh/ }).check()
  await expect.poll(() => overlayPixels(page)).toBeGreaterThan(100)
  await page.getByRole('link', { name: 'Mirror', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('.face-overlay')
    const video = document.querySelector('video')
    const c = canvas.getBoundingClientRect(); const v = video.getBoundingClientRect()
    return {
      dimensions: [canvas.width, canvas.height, video.videoWidth, video.videoHeight],
      rects: [c.x, c.y, c.width, c.height, v.x, v.y, v.width, v.height],
      styles: [getComputedStyle(canvas).objectFit, getComputedStyle(video).objectFit,
        getComputedStyle(canvas).transform, getComputedStyle(video).transform],
    }
  })
  expect(geometry.dimensions).toEqual([640, 360, 640, 360])
  expect(geometry.rects.slice(0, 4)).toEqual(geometry.rects.slice(4))
  expect(geometry.styles[0]).toBe('contain')
  expect(geometry.styles[0]).toBe(geometry.styles[1])
  expect(geometry.styles[2]).toBe(geometry.styles[3])
  await page.screenshot({ path: 'test-results/face-mesh.png', fullPage: true })
  const trackId = await page.locator('.camera-stage video').evaluate((v) => v.srcObject.getVideoTracks()[0].id)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const toggle = page.getByRole('checkbox', { name: /Show face mesh/ })
  await toggle.uncheck()
  await expect(page.locator('.face-overlay')).toBeHidden()
  await expect.poll(() => overlayPixels(page)).toBe(0)
  await expect(page.getByRole('status')).toContainText('Tracking is running')
  expect(await page.locator('.camera-stage video').evaluate((v) => v.srcObject.getVideoTracks()[0].id)).toBe(trackId)
  await toggle.check()
  await expect.poll(() => overlayPixels(page)).toBeGreaterThan(100)
  await page.setViewportSize({ width: 375, height: 900 })
  await expect.poll(() => overlayPixels(page)).toBeGreaterThan(100)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/face-mesh-mobile.png', fullPage: true })
  await page.evaluate(() => { window.showTestFace = false })
  await expect(page.getByRole('status')).toContainText('No face detected')
  await expect(metric(page, 'Facial landmarks')).toHaveText('0')
  await expect(metric(page, 'Blendshape signals')).toHaveText('0')
  await expect(metric(page, 'Head transform')).toHaveText('Waiting')
  await expect(expression.locator('meter')).toHaveCount(0)
  await expect(similarity.locator('.debug-status')).toHaveText('0 / 10 features ready')
  await expect(expression.locator('[data-pose="yaw"]')).toHaveText('—')
  await expect(debug.locator('.debug-status')).toHaveText('No face detected')
  await expect(debug.locator('meter')).toHaveCount(0)
  await expect(debug.locator('.feature-value').first()).toHaveText('—')
  await expect.poll(() => overlayPixels(page)).toBe(0)
  await page.evaluate(() => { window.showTestFace = true })
  await expect.poll(() => overlayPixels(page)).toBeGreaterThan(100)
  await stopButton(page).click()
  await expect.poll(() => overlayPixels(page)).toBe(0)
  await expect(debug.locator('.debug-status')).toHaveText('Start the camera to see values')
  await expect(debug.locator('meter')).toHaveCount(0)
  await expect(expression.locator('meter')).toHaveCount(0)
  await expect(expression.locator('[data-pose="pitch"]')).toHaveText('—')
})

test('camera disconnection releases the session', async ({ page }) => {
  await page.goto('/#settings')
  await startButton(page).click()
  await expect(page.getByRole('status')).toContainText('Tracking is running')
  await page.locator('.camera-stage video').evaluate((video) => {
    window.savedTracks = video.srcObject.getTracks()
    window.savedTracks[0].dispatchEvent(new Event('ended'))
  })
  await expect(page.getByRole('alert')).toContainText('disconnected')
  expect(await page.evaluate(() => window.savedTracks.every((t) => t.readyState === 'ended'))).toBe(true)
})

// Controlled scores verify name mapping, live changes, zero versus absent data,
// and reset behavior. The portrait test above separately exercises real inference.
test('debug panel maps category names and updates raw scores without stale readings', async ({ page }) => {
  await page.addInitScript(() => {
    window.debugFixture = {
      faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [],
    }
  })
  await page.route('**/src/tracking/faceTracker.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function createFaceTracker() { return { tracker: { close() {} }, delegate: 'CPU' } }
      export function startFaceTracking(video, tracker, onResult) {
        const timer = setInterval(() => onResult(window.debugFixture), 50)
        return () => clearInterval(timer)
      }
    `,
  }))
  await page.goto('/#settings')
  const debug = page.getByRole('region', { name: 'Live blendshapes' })
  const value = (name) => debug.locator('.feature-groups [data-feature="' + name + '"] .feature-value')
  await expect(value('jawOpen')).toHaveText('—')
  await startButton(page).click()
  await expect(page.getByRole('status')).toContainText('Tracking is running')
  // Hide the mesh because this test intentionally supplies no landmark geometry.
  await page.getByRole('checkbox', { name: /Show face mesh/ }).uncheck()
  await page.evaluate(() => {
    window.debugFixture = {
      faceLandmarks: [[]], facialTransformationMatrixes: [{ rows: 4, columns: 4,
        data: [Math.sqrt(3) / 2, 0, -0.5, 0, 0, 1, 0, 0, 0.5, 0, Math.sqrt(3) / 2, 0, 0, 0, -50, 1] }],
      faceBlendshapes: [{ categories: [
        { categoryName: 'mouthSmileRight', score: 0.82 },
        { categoryName: 'jawOpen', score: 0.1256 },
        { categoryName: 'eyeWideLeft', score: 0 },
        { categoryName: '_neutral', score: 0.02 },
        { categoryName: 'mouthSmileLeft', score: 0.22 },
      ] }],
    }
  })
  const vectorPanel = page.getByRole('region', { name: 'Expression vector' })
  await expect(vectorPanel.locator('[data-expression="smile"] .feature-value')).toHaveText('0.520')
  await expect(vectorPanel.locator('[data-expression="eyeWide"] .feature-value')).toHaveText('—')
  await expect(vectorPanel.locator('[data-pose="yaw"]')).toHaveText('30.0°')
  await expect(value('jawOpen')).toHaveText('0.126')
  await expect(value('mouthSmileRight')).toHaveText('0.820')
  await expect(value('eyeWideLeft')).toHaveText('0.000')
  await expect(value('eyeWideRight')).toHaveText('—')
  await debug.getByText('All raw blendshapes (5)', { exact: true }).click()
  await expect(debug.locator('.all-feature-grid [data-feature="_neutral"] .feature-value')).toHaveText('0.020')
  await page.evaluate(() => { window.debugFixture.faceBlendshapes[0].categories[1].score = 0.91 })
  await expect(value('jawOpen')).toHaveText('0.910')
  await expect(vectorPanel.locator('[data-expression="jawOpen"] .feature-value')).toHaveText('0.910')
  await page.evaluate(() => { window.debugFixture.facialTransformationMatrixes = [] })
  await expect(vectorPanel.locator('[data-pose="yaw"]')).toHaveText('—')
  await expect(vectorPanel.locator('[data-expression="smile"] .feature-value')).toHaveText('0.520')
  // Keep old categories in the fixture: face loss must still clear every reading.
  await page.evaluate(() => { window.debugFixture.faceLandmarks = [] })
  await expect(debug.locator('.debug-status')).toHaveText('No face detected')
  await expect(value('jawOpen')).toHaveText('—')
  await expect(vectorPanel.locator('meter')).toHaveCount(0)
  await expect(debug.locator('meter')).toHaveCount(0)
  await stopButton(page).click()
  await expect(debug.locator('.debug-status')).toHaveText('Start the camera to see values')
  await startButton(page).click()
  await expect(value('jawOpen')).toHaveText('—')
  await stopButton(page).click()
})
