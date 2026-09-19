import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const sampleImage = fileURLToPath(new URL(
  '../public/memes/alma-hamsters/alma-hamster-3132149.jpg',
  import.meta.url,
))

test('a custom meme can be added, persists across reloads, and can be removed', async ({ page }) => {
  await page.goto('/#meme-collection')
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })

  await gallery.getByRole('button', { name: 'Add a meme face' }).click()
  await gallery.getByLabel('Meme name').fill('My Test Hamster')
  await gallery.getByLabel('Expression label').fill('A very suspicious squint')
  await gallery.getByLabel('Face image').setInputFiles(sampleImage)
  await gallery.getByRole('slider', { name: 'eyeSquint' }).fill('0.84')
  await gallery.getByRole('slider', { name: 'browDown' }).fill('0.61')
  await gallery.getByRole('button', { name: 'Add to collection' }).click()

  await expect(gallery.locator('.meme-card')).toHaveCount(27)
  await expect(gallery.getByRole('heading', { name: 'My Test Hamster' })).toBeVisible()
  await expect(gallery.getByText('Stored in this browser')).toBeVisible()

  await page.reload()
  await expect(gallery.getByRole('button', { name: 'Inspect My Test Hamster' })).toBeVisible()
  await gallery.getByRole('button', { name: 'Inspect My Test Hamster' }).click()
  await expect(gallery.getByRole('heading', { name: 'My Test Hamster' })).toBeVisible()
  await gallery.getByRole('button', { name: 'Remove meme' }).click()
  await expect(gallery.getByRole('button', { name: 'Inspect My Test Hamster' })).toHaveCount(0)
  await expect(gallery.locator('.meme-card')).toHaveCount(26)
})

test('a built-in meme can be hidden and restored', async ({ page }) => {
  await page.goto('/#meme-collection')
  const gallery = page.getByRole('region', { name: 'Meet your meme counterparts' })

  await gallery.getByRole('button', { name: 'Inspect Surprised Pikachu' }).click()
  await gallery.getByRole('button', { name: 'Remove meme' }).click()
  await expect(gallery.getByRole('button', { name: 'Inspect Surprised Pikachu' })).toHaveCount(0)
  await expect(gallery.locator('.meme-card')).toHaveCount(25)

  await gallery.getByRole('button', { name: 'Restore 1 built-in' }).click()
  await expect(gallery.getByRole('button', { name: 'Inspect Surprised Pikachu' })).toBeVisible()
  await expect(gallery.locator('.meme-card')).toHaveCount(26)
})
