import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { EXPRESSION_FEATURES } from '../src/tracking/featureExtractor.js'

const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url), 'utf8'))

test('retained Almarts27 hamster references are stored locally with valid image files', () => {
  const directory = new URL('../public/memes/alma-hamsters/', import.meta.url)
  const images = readdirSync(directory).filter((name) => /\.(jpg|png)$/.test(name)).sort()
  expect(images).toHaveLength(4)
  for (const image of images) {
    const bytes = readFileSync(new URL(image, directory))
    const signature = bytes.subarray(0, image.endsWith('.png') ? 8 : 3).toString('hex')
    expect(signature).toBe(image.endsWith('.png') ? '89504e470d0a1a0a' : 'ffd8ff')
  }
})

test('all default meme profiles share the exact expression schema and have local image files', () => {
  expect(memes).toHaveLength(11)
  expect(new Set(memes.map((m) => m.id)).size).toBe(11)
  expect(new Set(memes.map((m) => m.image)).size).toBe(11)
  for (const meme of memes) {
    expect(meme.id).toMatch(/^[a-z0-9-]+$/)
    expect(meme.name.length).toBeGreaterThan(0)
    expect(meme.alt.length).toBeGreaterThan(0)
    expect(['manual', 'trained']).toContain(meme.profileSource)
    expect(meme.headPose).toBeNull()
    expect(Object.keys(meme.features).sort()).toEqual(Object.keys(EXPRESSION_FEATURES).sort())
    for (const score of Object.values(meme.features)) {
      expect(Number.isFinite(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
    expect(meme.image).toMatch(/^\/memes\/(?:[a-z0-9-]+\/)*[a-z0-9_-]+\.(jpeg|jpg|png)$/)
    if (meme.source) {
      expect(new URL(meme.source.pageUrl).protocol).toBe('https:')
      expect(new URL(meme.source.imageUrl).protocol).toBe('https:')
    }
    const bytes = readFileSync(new URL('../public' + meme.image, import.meta.url))
    const signature = bytes.subarray(0, meme.image.endsWith('.png') ? 8 : 3).toString('hex')
    expect(signature).toBe(meme.image.endsWith('.png') ? '89504e470d0a1a0a' : 'ffd8ff')
  }
})

test('gallery loads local images, switches profiles, and works without webcam or external requests', async ({ page }) => {
  const externalRequests = []
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith('http://127.0.0.1:5174/')) {
      externalRequests.push(route.request().url())
      return route.abort()
    }
    return route.continue()
  })
  await page.addInitScript(() => {
    window.cameraRequests = 0
    navigator.mediaDevices.getUserMedia = async () => {
      window.cameraRequests += 1
      throw new Error('Gallery must not start the camera')
    }
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })
  const inspector = gallery.getByRole('region', { name: 'Selected meme profile' })
  await expect(gallery.locator('.meme-card')).toHaveCount(11)
  await expect.poll(() => gallery.locator('.meme-thumbnail img').evaluateAll((images) => images.every((i) => i.complete && i.naturalWidth > 0))).toBe(true)
  const imagesClearLabels = await gallery.locator('.meme-card').evaluateAll((cards) => cards.every((card) => {
    const image = card.querySelector('img').getBoundingClientRect()
    const label = card.querySelector('.meme-name').getBoundingClientRect()
    return image.bottom <= label.top
  }))
  expect(imagesClearLabels).toBe(true)
  for (const meme of memes) {
    const card = gallery.getByRole('button', { name: 'Inspect ' + meme.name, exact: true })
    await card.click()
    await expect(gallery.getByRole('dialog')).toBeVisible()
    await expect(gallery.locator('.meme-card[aria-pressed="true"]')).toHaveCount(1)
    await expect(gallery.getByRole('dialog').getByRole('heading', { name: meme.name, exact: true })).toBeVisible()
    await gallery.getByText('Expression values & notes', { exact: true }).click()
    await expect(inspector.locator('dt')).toHaveCount(meme.handFeatures ? 13 : 10)
    await expect(inspector.locator('dd')).toHaveText([...Object.values(meme.features), ...Object.values(meme.handFeatures ?? {})].map((v) => v.toFixed(2)))
    if (meme.source) await expect(inspector.getByRole('link', { name: 'Image source' })).toHaveAttribute('href', meme.source.pageUrl)
    await expect.poll(() => inspector.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
    await gallery.getByRole('button', { name: 'Close', exact: true }).click()
  }
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0)
  expect(externalRequests).toEqual([])
  await gallery.getByRole('button', { name: 'Inspect Surprised Pikachu', exact: true }).click()
  await gallery.screenshot({ path: 'test-results/meme-gallery.png' })
  await gallery.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize({ width: 375, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await gallery.getByRole('button', { name: 'Inspect Crying Cat', exact: true }).click()
  await expect(gallery.getByRole('dialog').getByRole('heading', { name: 'Crying Cat', exact: true })).toBeVisible()
  await gallery.screenshot({ path: 'test-results/meme-gallery-mobile.png' })
})

test('missing images display a fallback and other cards still work', async ({ page }) => {
  await page.route('**/memes/surprised_pikachu.jpg', (route) => route.abort())
  await page.goto('/#meme-collection')
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })
  await expect(gallery.locator('.meme-grid').getByText('Image unavailable: Surprised Pikachu', { exact: true })).toHaveCount(1)
  await gallery.getByRole('button', { name: 'Inspect The Rock Eyebrow', exact: true }).click()
  const inspector = gallery.getByRole('region', { name: 'Selected meme profile' })
  await expect.poll(() => inspector.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
})
