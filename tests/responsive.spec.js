import { test, expect } from '@playwright/test'

for (const width of [320, 390, 768, 1058, 1440]) {
  test(`main workflows fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeVisible()
    for (const route of ['Mirror', 'Library', 'Settings']) {
      await page.getByRole('link', { name: route, exact: true }).click()
      await expect(page.getByRole('link', { name: route, exact: true })).toHaveAttribute('aria-current', 'page')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await expect(page.getByRole('heading', { name: 'Tracking diagnostics' })).toBeHidden()
    await page.getByText('Advanced diagnostics', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tracking diagnostics' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Library', exact: true }).click()
    await page.getByRole('button', { name: 'Add profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Meme name' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('camera denial remains recoverable in the main view', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Camera access was denied')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled()
})
