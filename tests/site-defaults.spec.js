import {test,expect} from '@playwright/test'
import {readFileSync} from 'node:fs'
import builtIns from '../src/data/builtInMemes.ts'
import {createProfileBackup,validateProfileBackup} from '../src/data/profileTransfer.ts'
import {rankPoseMemes} from '../src/matching/gestureMatcher.ts'
const defaults=JSON.parse(readFileSync(new URL('../src/data/profileDefaults.json',import.meta.url)))
const preferences=JSON.parse(readFileSync(new URL('../src/data/sitePreferences.json',import.meta.url)))

test('saved gesture defaults participate in matching and survive backup round trips',()=>{
 const backup=createProfileBackup(builtIns,[],preferences)
 const restored=validateProfileBackup(backup,builtIns)
 for(const meme of builtIns.filter(m=>defaults[m.id]?.gestureProfile)) {
  expect(meme.handsTrained).toBe(true)
  const observation={observedAt:100,handCount:meme.gestureProfile.handCount,hands:meme.gestureProfile.hands}
  expect(rankPoseMemes(meme.features,[meme],'auto',observation,100,'ready').ranked[0]?.meme.id).toBe(meme.id)
  expect(restored.profiles.find(p=>p.id===meme.id).gestureProfile).toEqual(defaults[meme.id].gestureProfile)
 }
 expect(restored.preferences).toEqual(preferences)
})

test('a fresh browser loads the captured preferences and facial and hand profiles',async({page})=>{
 await page.goto('/#settings')
 await expect(page.getByRole('combobox',{name:'Settings matching mode',exact:true})).toHaveValue(preferences.matchingMode)
 const overlay=page.getByRole('checkbox',{name:/Show face and hand landmarks/})
 if(preferences.showOverlay) await expect(overlay).toBeChecked()
 else await expect(overlay).not.toBeChecked()
 await page.getByRole('button',{name:'Preview backup',exact:true}).click()
 const backup=await page.getByRole('textbox',{name:'Backup JSON'}).evaluate(el=>JSON.parse(el.value))
 expect(backup.preferences).toEqual(preferences)
 for(const [id,saved] of Object.entries(defaults)) {
  const profile=backup.profiles.find(p=>p.id===id)
  expect(profile.features).toEqual(saved.features)
  expect(profile.poseKind).toBe(saved.poseKind)
  expect(profile.gestureProfile).toEqual(saved.gestureProfile)
 }
 expect(backup.preferences).not.toHaveProperty('baseline')
 await page.screenshot({path:'test-results/saved-site-defaults.png',fullPage:false})
})

test('local preferences and an explicitly cleared gesture override shipped defaults',async({page})=>{
 const id='actually-cat', saved=defaults[id]
 await page.addInitScript(({id,saved})=>{
  localStorage.setItem('mirror-image-camera-preferences-v1',JSON.stringify({showOverlay:false,matchingMode:'face-only',baseline:{eyeWide:.123}}))
  localStorage.setItem('mirror-image-profile-overrides',JSON.stringify({[id]:{features:saved.features,poseKind:'one-hand',gestureProfile:null}}))
 },{id,saved})
 await page.goto('/#settings')
 await expect(page.getByRole('combobox',{name:'Settings matching mode',exact:true})).toHaveValue('face-only')
 await expect(page.getByRole('checkbox',{name:/Show face and hand landmarks/})).not.toBeChecked()
 await page.getByRole('button',{name:'Preview backup',exact:true}).click()
 const backup=await page.getByRole('textbox',{name:'Backup JSON'}).evaluate(el=>JSON.parse(el.value))
 expect(backup.profiles.find(p=>p.id===id).gestureProfile).toBeNull()
 expect(backup.preferences).toEqual({showOverlay:false,matchingMode:'face-only'})
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mirror-image-camera-preferences-v1')).baseline)).toEqual({eyeWide:.123})
})
