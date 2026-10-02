import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createProfileBackup, validateProfileBackup } from '../src/data/profileTransfer.ts'
const memes = JSON.parse(readFileSync(new URL('../src/data/memes.json', import.meta.url)))
const imported = JSON.parse(readFileSync(new URL('../src/data/importedMemes.json', import.meta.url)))

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
  await expect(page.getByText('Imported 1 profiles. Other custom profiles and hidden built-ins were preserved.')).toBeVisible()
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

test('imported training and hidden choices coexist with original edits and custom profiles', async ({ page }) => {
  const auto = { ...imported[0], features: { ...imported[0].features, smile: .912 } }
  const original = { ...memes[0], features: { ...memes[0].features, smile: .713 } }
  const custom = { id: 'custom-backup-test', name: 'Backup test', features: memes[0].features,
    image: `data:image/jpeg;base64,${readFileSync(new URL('../public' + memes[0].image, import.meta.url)).toString('base64')}` }
  const backup = createProfileBackup([auto, original, custom], [auto.id])
  await page.goto('/#settings')
  const fileInput = page.getByLabel('Import profiles', { exact: true })
  await expect(fileInput).toBeEnabled()
  await fileInput.setInputFiles({ name: 'profiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByText('Imported 3 profiles. Other custom profiles and hidden built-ins were preserved.')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('button', { name: `Inspect ${auto.name}`, exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Inspect Backup test', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore 1 built-in', exact: true }).click()
  await page.getByRole('button', { name: `Inspect ${auto.name}`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Automatically analyzed', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Updated from camera', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Image source' })).toHaveAttribute('href', auto.source.pageUrl)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export profiles' }).click()
  const download = await downloadEvent
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(exported.profiles.find((m) => m.id === auto.id).features.smile).toBe(.912)
  expect(exported.profiles.find((m) => m.id === original.id).features.smile).toBe(.713)
  expect(exported.profiles.find((m) => m.id === custom.id).image).toBe(custom.image)
  expect(exported.hiddenBuiltInIds).toEqual([])
})

test('v1 retired entries are skipped before validation, unrelated unknown IDs still fail', () => {
  const old={format:'mirror-image-profiles',version:1,hiddenBuiltInIds:['leonardo-cheers','memegen-drake-no-jpg'],profiles:[{...memes[0],id:'leonardo-cheers'},memes[0]]}
  const result=validateProfileBackup(old,memes)
  expect(result.profiles).toHaveLength(1)
  expect(result.skippedRetiredIds).toHaveLength(2)
  expect(result.hiddenBuiltInIds).toEqual([])
  expect(()=>validateProfileBackup({...old,profiles:[{...memes[0],id:'unknown-built-in'}]},memes)).toThrow('unknown')
})

test('v2 preserves gesture descriptors and preferences and validates their shape', async () => {
  const {extractGestureObservation}=await import('../src/tracking/gestureProfile.ts')
  const {faceLandmarks,handLandmarks}=await import('./fixtures/gestures.js')
  const gestureProfile={version:1,handCount:1,hands:extractGestureObservation({landmarks:[handLandmarks()]},faceLandmarks(),0).hands}
  const profile={...memes[0],poseKind:'one-hand',gestureProfile}
  const backup=createProfileBackup([profile],[],{showOverlay:true,matchingMode:'face-only'})
  const restored=validateProfileBackup(JSON.parse(JSON.stringify(backup)),memes)
  expect(restored.profiles[0].gestureProfile).toEqual(gestureProfile)
  expect(restored.preferences).toEqual({showOverlay:true,matchingMode:'face-only'})
  expect(()=>validateProfileBackup({...backup,profiles:[{...profile,gestureProfile:{...gestureProfile,handCount:2}}]},memes)).toThrow('gesture')
  expect(()=>validateProfileBackup({...backup,preferences:{showOverlay:true,matchingMode:'unknown'}},memes)).toThrow('preferences')
})

test('backup preference import preserves personal calibration and applies matching mode',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mirror-image-camera-preferences-v1',JSON.stringify({showOverlay:false,matchingMode:'auto',baseline:{expression:{smile:.2},headPose:null}})))
 await page.goto('/#settings')
 const backup=createProfileBackup([],[],{showOverlay:true,matchingMode:'face-only'})
 await page.getByLabel('Import profiles',{exact:true}).setInputFiles({name:'preferences.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
 await expect(page.getByRole('combobox',{name:'Settings matching mode'})).toHaveValue('face-only')
 await expect(page.getByRole('checkbox',{name:/Show face and hand landmarks/})).toBeChecked()
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mirror-image-camera-preferences-v1')))
 expect(saved.baseline.expression.smile).toBe(.2)
 await page.getByRole('button',{name:'Preview backup'}).click()
 const exported=JSON.parse(await page.getByRole('textbox',{name:'Backup JSON'}).inputValue())
 expect(exported.preferences).toEqual({showOverlay:true,matchingMode:'face-only'})
 expect(exported.preferences.baseline).toBeUndefined()
})
