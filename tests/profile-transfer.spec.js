import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createProfileBackup, validateProfileBackup } from '../src/data/profileTransfer.ts'
const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url)))

test('portable backup preserves saved face/hand profiles and hidden choices', () => {
  const backup = createProfileBackup(memes, [memes[0].id])
  const restored = validateProfileBackup(JSON.parse(JSON.stringify(backup)), memes)
  expect(restored.hiddenBuiltInIds).toEqual([memes[0].id])
  for (const [i, profile] of restored.profiles.entries()) {
    expect(profile.features).toEqual(memes[i].features)
    expect(profile.handFeatures).toEqual(memes[i].handFeatures)
  }
})

test('reject unsupported versions, duplicate IDs, invalid scores and external custom images', () => {
  const backup = createProfileBackup([memes[0]], [])
  expect(() => validateProfileBackup({ ...backup, version: 99 }, memes)).toThrow('version 1')
  expect(() => validateProfileBackup({ ...backup, profiles: [...backup.profiles, ...backup.profiles] }, memes)).toThrow('unique')
  expect(() => validateProfileBackup({ ...backup, profiles: [{ ...memes[0], features: { smile: Infinity } }] }, memes)).toThrow('feature')
  expect(() => validateProfileBackup({ ...backup, profiles: [{ ...memes[0], id: 'custom-test', image: 'https://example.com/image.jpg' }] }, memes)).toThrow('image')
})

test('browser import persists, exports the trained values, and rejects malformed files without changing them', async ({ page }) => {
  await page.goto('/#settings')
  const fileInput = page.getByLabel('Import profiles', { exact: true })
  await expect(fileInput).toBeEnabled()
  const changed = { ...memes[0], features: { ...memes[0].features, smile: .987 } }
  const backup = createProfileBackup([changed], [memes[1].id])
  await fileInput.setInputFiles({ name: 'profiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByText('Imported 1 profiles. Your other custom memes are still here.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Export profiles' })).toBeEnabled()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export profiles' }).click()
  const download = await downloadEvent
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(exported.profiles.find((m) => m.id === changed.id).features.smile).toBe(.987)
  expect(exported.hiddenBuiltInIds).toContain(memes[1].id)
  const before = await page.evaluate(() => localStorage.getItem('mirror-image-profile-overrides'))
  await fileInput.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad') })
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  expect(await page.evaluate(() => localStorage.getItem('mirror-image-profile-overrides'))).toBe(before)
})
