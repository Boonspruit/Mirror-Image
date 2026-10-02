import {test,expect} from '@playwright/test'
import {extractGestureObservation,compareGestures} from '../src/tracking/gestureProfile.ts'
import {rankPoseMemes} from '../src/matching/gestureMatcher.ts'
import {createProfileCapture} from '../src/tracking/profileCapture.ts'
import {handLandmarks,faceLandmarks,mirrored,installTrackers} from './fixtures/gestures.js'
import {readFileSync} from 'node:fs'
const face=faceLandmarks(), pointing=handLandmarks(), calling=handLandmarks([1,0,0,0,1])
const observe=(hands,at=100)=>extractGestureObservation({landmarks:hands},face,at)
const vector=JSON.parse(readFileSync(new URL('../src/data/memes.json',import.meta.url)))[0].features
const profile=(id,hands)=>({id,name:id,features:vector,poseKind:hands.length===2?'two-hands':'one-hand',gestureProfile:{version:1,handCount:hands.length,hands:observe(hands).hands}})
const faceMeme={id:'face',features:vector,poseKind:'face'}

test('same face cannot compensate for wrong finger shape; face-only excludes gestures',()=>{
 const memes=[faceMeme,profile('point',[pointing]),profile('call',[calling])]
 expect(rankPoseMemes(vector,memes,'auto',observe([calling]),100,'ready').ranked.map(m=>m.meme.id)).toEqual(['call'])
 expect(rankPoseMemes(vector,memes,'auto',observe([]),100,'ready').ranked.map(m=>m.meme.id)).toEqual(['face'])
 expect(rankPoseMemes(vector,memes,'face-only',observe([calling]),100,'ready').ranked.map(m=>m.meme.id)).toEqual(['face'])
 expect(rankPoseMemes(vector,[profile('point',[pointing])],'auto',observe([calling]),100,'ready').message).toBe('No matching gesture')
})
test('hand count, landmark completeness, freshness and tracker status are hard requirements',()=>{
 const memes=[faceMeme,profile('point',[pointing])]
 for(const live of [observe([pointing,calling]),observe([Array(21).fill({x:.5,y:.5,z:0})])]) expect(rankPoseMemes(vector,memes,'auto',live,100,'ready').ranked).toEqual([])
 expect(rankPoseMemes(vector,memes,'auto',observe([pointing]),351,'ready').ranked).toEqual([])
 expect(rankPoseMemes(vector,memes,'auto',observe([]),100,'unavailable').ranked).toEqual([])
 expect(rankPoseMemes(vector,memes,'face-only',observe([]),100,'unavailable').ranked[0].meme.id).toBe('face')
})
test('matching allows mirrored poses and swapped two-hand order',()=>{
 const two=observe([pointing,calling]).hands
 expect(compareGestures(observe([calling,pointing]).hands,two).compatible).toBe(true)
 expect(compareGestures(observe([mirrored(pointing),mirrored(calling)]).hands,two).compatible).toBe(true)
})
test('pointing near nose versus mouth changes positional matching',()=>{
 const mouth=observe([handLandmarks([0,1,0,0,0],.5,.84)]).hands,nose=observe([handLandmarks([0,1,0,0,0],.5,.74)]).hands
 expect(compareGestures(mouth,nose).compatible).toBe(false)
})
test('capture prepares for three seconds, accepts hands later, and rejects stale or moving samples',()=>{
 const capture=createProfileCapture('one-hand',0,Object.keys(vector))
 const sample=at=>({observedAt:at,expression:vector,gesture:observe([pointing],at),handFeatures:{handPresent:1},handStatus:'ready'})
 expect(capture.update(null,2999).message).toContain('Prepare')
 expect(capture.update({...sample(3000),gesture:observe([],3000)},3000).done).toBeUndefined()
 expect(capture.update(sample(3000),3400).done).toBeUndefined()
 for(let at=3500;at<4250;at+=50) expect(capture.update(sample(at),at).done).toBeUndefined()
 expect(capture.update(sample(4250),4250).done).toBe(true)
 const moving=createProfileCapture('one-hand',0,Object.keys(vector));moving.update(sample(3000),3000)
 expect(moving.update({...sample(3050),gesture:observe([calling],3050)},3050).message).toContain('moved')
 expect(moving.update(null,18001).failed).toBe(true)
})

test('untrained gestures do not match; save starts before hands and survives reload',async({page})=>{
 await installTrackers(page,vector)
 await page.goto('/#meme-collection');await page.getByRole('button',{name:'Inspect Actually Cat',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByText('Start the camera to save a profile.',{exact:true})).toBeVisible()
 await dialog.getByRole('button',{name:'Start camera'}).click()
 const save=dialog.getByRole('button',{name:'Save expression and hand profile'})
 await expect(save).toBeEnabled();await save.click()
 await expect(dialog.getByRole('status')).toContainText('Prepare')
 await page.evaluate(hands=>window.handFixture.landmarks=hands,[pointing])
 await expect(dialog.getByRole('status')).toContainText('Saved the current expression and hand pose', {timeout:7000})
 await dialog.getByRole('button',{name:'Close',exact:true}).click()
 await page.getByRole('link',{name:'Mirror',exact:true}).click()
 await expect(page.locator('#live-match .matched-name')).toHaveText('Actually Cat')
 await page.evaluate(hands=>window.handFixture.landmarks=hands,[calling])
 await expect(page.locator('#live-match')).toContainText('No matching gesture')
 await page.getByRole('combobox',{name:'Matching mode',exact:true}).selectOption('face-only')
 await expect(page.locator('#live-match .matched-name')).toHaveText('Surprised Pikachu')
 await page.reload();await expect(page.getByRole('combobox',{name:'Matching mode',exact:true})).toHaveValue('face-only')
 await page.getByRole('link',{name:'Library',exact:true}).click();await page.getByRole('button',{name:'Inspect Actually Cat',exact:true}).click()
 await expect(dialog.getByText('Updated from camera · Includes hand gesture')).toBeVisible()
})
test('hand tracker failure explains disabled gesture capture and offers face-only matching',async({page})=>{
 await installTrackers(page,vector,[],true);await page.goto('/');await page.getByRole('button',{name:'Start camera'}).click()
 await expect(page.getByRole('alert')).toContainText('Hand tracking unavailable')
 await page.getByRole('combobox',{name:'Matching mode',exact:true}).selectOption('face-only')
 await expect(page.locator('#live-match .matched-name')).toHaveText('Surprised Pikachu')
 await page.getByRole('link',{name:'Library',exact:true}).click();await page.getByRole('button',{name:'Inspect Actually Cat',exact:true}).click()
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Save expression and hand profile'})).toBeDisabled()
 await expect(dialog.getByText('Hand tracker unavailable. Restart the camera or select Face only.')).toBeVisible()
 await dialog.getByRole('combobox',{name:'Profile pose'}).selectOption('face')
 await expect(dialog.getByRole('button',{name:'Save expression profile'})).toBeEnabled()
})

test('two-hand capture can start with no hands; interruption and cancellation preserve the previous profile',async({page})=>{
 await installTrackers(page,vector);await page.setViewportSize({width:390,height:844})
 await page.goto('/#meme-collection');await page.getByRole('button',{name:'Inspect No Way',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Start camera'}).click()
 const save=dialog.getByRole('button',{name:'Save expression and hand profile'})
 await expect(save).toBeEnabled();await save.click()
 await page.evaluate(hands=>window.handFixture.landmarks=hands,[pointing])
 await expect(dialog.getByRole('status')).toContainText('both hands', {timeout:5000})
 await dialog.getByRole('button',{name:'Cancel capture'}).click()
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mirror-image-profile-overrides')??'{}').shocked)).toBeUndefined()
 await save.click();await page.evaluate(hands=>window.handFixture.landmarks=hands,[pointing,mirrored(pointing)])
 await expect(dialog.getByRole('status')).toContainText('Saved the current expression and hand pose',{timeout:7000})
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mirror-image-profile-overrides')).shocked)
 expect(stored.gestureProfile.handCount).toBe(2)
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
 await dialog.screenshot({path:'test-results/gesture-capture-mobile.png'})
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('link',{name:'Mirror',exact:true}).click()
 await expect(page.locator('#live-match .matched-name')).toHaveText('No Way')
 await page.evaluate(()=>window.pauseHands=true)
 await expect(page.locator('#live-match .matched-name')).toHaveCount(0)
 await expect(page.locator('#live-match')).toContainText('Waiting for hand tracking')
 await page.evaluate(()=>{window.pauseHands=false;window.handFixture.landmarks=[]})
 await expect(page.locator('#live-match .matched-name')).toHaveText('Surprised Pikachu')
})

test('descriptors use consistent geometry across portrait and landscape camera inputs',()=>{
 const landscape=extractGestureObservation({landmarks:[pointing]},face,0,1)
 // Same physical geometry encoded in a portrait image with half the width-to-height ratio.
 const portraitPoint=p=>({...p,y:p.y*.5})
 const portrait=extractGestureObservation({landmarks:[pointing.map(portraitPoint)]},face.map(portraitPoint),0,.5)
 expect(compareGestures(portrait.hands,landscape.hands).distance).toBeLessThan(1e-8)
})

test('a failed profile storage write leaves the previous values intact and allows retry',async({page})=>{
 await page.addInitScript(()=>{
  const original=Storage.prototype.setItem
  Storage.prototype.setItem=function(key,value){if(key==='mirror-image-profile-overrides' && window.failProfileSave)throw new Error('Storage is full.');return original.call(this,key,value)}
 })
 await installTrackers(page,vector);await page.goto('/#meme-collection')
 await page.getByRole('button',{name:'Inspect Surprised Pikachu',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Start camera'}).click()
 const save=dialog.getByRole('button',{name:'Save expression profile'})
 await expect(save).toBeEnabled()
 const before=await page.evaluate(()=>localStorage.getItem('mirror-image-profile-overrides'))
 await page.evaluate(()=>window.failProfileSave=true);await save.click()
 await expect(dialog.getByRole('status')).toHaveText('Storage is full.',{timeout:7000})
 expect(await page.evaluate(()=>localStorage.getItem('mirror-image-profile-overrides'))).toBe(before)
 await expect(save).toBeEnabled();await page.evaluate(()=>window.failProfileSave=false);await save.click()
 await expect(dialog.getByRole('status')).toContainText('Saved the current expression',{timeout:7000})
})

test('updating only facial values cannot turn a known gesture image into a face-only match',()=>{
 const handImage={...faceMeme,id:'actually-cat',poseKind:'face'}
 expect(rankPoseMemes(vector,[handImage,faceMeme],'face-only',observe([]),100,'ready').ranked.map(m=>m.meme.id)).toEqual(['face'])
 const wrongCount={...profile('shocked',[pointing]),poseKind:'one-hand'}
 expect(rankPoseMemes(vector,[wrongCount],'auto',observe([pointing]),100,'ready').ranked).toEqual([])
})
