import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createSixSevenDetector } from '../src/tracking/sixSevenGesture.ts'
import { handLandmarks, installTrackers } from './fixtures/gestures.js'

const handsAt=(t,kind='alternate',aspect=4/3)=>{
  const motion=.12*Math.cos(t*2*Math.PI/700)
  const a=kind==='jitter'?.004*Math.cos(t/40):kind==='still'?0:motion
  const b=kind==='one'?0:kind==='together'?a:-a
  const hands=[handLandmarks([1,1,1,1,1],.25,.65+a),handLandmarks([1,1,1,1,1],.75,.65+b)]
  // Convert a landscape fixture to portrait without changing physical geometry.
  return hands.map(hand=>hand.map(p=>({...p,x:.5+(p.x-.5)*(4/3)/aspect,z:p.z*(4/3)/aspect})))
}
const feed=(detector,kind='alternate',duration=2200,aspect=4/3,swap=false)=>{
  let state
  for(let t=0;t<=duration;t+=50) {
    const hands=handsAt(t,kind,aspect)
    state=detector.update(swap && t%100===0?hands.reverse():hands,t,aspect)
  }
  return state
}
test('alternating open hands trigger; mirrored labels follow identities despite swapped order',()=>{
  const detector=createSixSevenDetector()
  const state=feed(detector,'alternate',2200,4/3,true)
  expect(state.labels).toHaveLength(2)
  expect(state.labels.find(label=>label.x>.5).digit).toBe('6')
  expect(state.labels.find(label=>label.x<.5).digit).toBe('7')
  const swapped=detector.update(handsAt(2250).reverse(),2250,4/3)
  expect(swapped.labels.find(label=>label.x>.5).digit).toBe('6')
  expect(feed(createSixSevenDetector(),'alternate',2200,3/4).labels).toHaveLength(2)
})
test('stationary, jittering, together, single-hand and closed-hand motion cannot trigger',()=>{
  for(const kind of ['still','jitter','together','one']) expect(feed(createSixSevenDetector(),kind).labels).toEqual([])
  const single=createSixSevenDetector(),closed=createSixSevenDetector()
  for(let t=0;t<=2200;t+=50) {
    expect(single.update([handsAt(t)[0]],t,4/3).labels).toEqual([])
    expect(closed.update([handLandmarks([0,0,0,0,0],.25,.65+.12*Math.cos(t/100)),handLandmarks([0,0,0,0,0],.75,.65-.12*Math.cos(t/100))],t,4/3).labels).toEqual([])
  }
})
test('two alternating changes must fit within four seconds',()=>{
  const detector=createSixSevenDetector()
  for(let t=0;t<=9000;t+=50) expect(detector.update(handsAt(t*700/10000),t,4/3).labels).toEqual([])
})
test('hands can start at different heights without crossing one another',()=>{
  const detector=createSixSevenDetector()
  let state
  for(let t=0;t<=2200;t+=50) {
    const motion=.08*Math.cos(t*2*Math.PI/700)
    state=detector.update([handLandmarks([1,1,1,1,1],.25,.72+motion),handLandmarks([1,1,1,1,1],.75,.42-motion)],t,4/3)
  }
  expect(state.labels).toHaveLength(2)
})
test('world landmarks recognize open palms despite foreshortened image finger shapes',()=>{
  const detector=createSixSevenDetector()
  let state
  for(let t=0;t<=2200;t+=50) {
    const movement=.12*Math.cos(t*2*Math.PI/700)
    const image=[handLandmarks([0,0,0,0,0],.25,.65+movement),handLandmarks([0,0,0,0,0],.75,.65-movement)]
    const world=handsAt(t).map(hand=>hand.map(p=>({x:p.x*.1,y:p.y*.1,z:p.z*.1})))
    state=detector.update(image,t,4/3,world)
  }
  expect(state.labels).toHaveLength(2)
})
test('brief openness flicker and pre-activation hand loss do not erase motion progress',()=>{
  const detector=createSixSevenDetector()
  let triggered=false
  for(let t=0;t<=2200;t+=50) {
    const movement=.12*Math.cos(t*2*Math.PI/700)
    const hands=t%350===100?[]:t%200===100?
      [handLandmarks([0,0,0,0,0],.25,.65+movement),handLandmarks([0,0,0,0,0],.75,.65-movement)]:handsAt(t)
    if(detector.update(hands,t,4/3).labels.length) triggered=true
  }
  expect(triggered).toBe(true)
})
test('numbers hold for five seconds, fade for 250ms, and continuous motion extends visibility',()=>{
  const detector=createSixSevenDetector()
  let activatedAt, frozen
  for(let t=0;t<2200;t+=50) {
    const hands=handsAt(t)
    if(detector.update(hands,t,4/3).labels.length) {activatedAt=t;frozen=hands;break}
  }
  expect(activatedAt).toBeDefined()
  for(let delta=50;delta<=5000;delta+=50) expect(detector.update(frozen,activatedAt+delta,4/3).opacity).toBe(1)
  let faded=false, ended
  // The 250ms motion window can include movement just before the hands stopped.
  for(let delta=5025;delta<=5500;delta+=25) {
    ended=detector.update(frozen,activatedAt+delta,4/3)
    if(ended.opacity>0 && ended.opacity<1) faded=true
  }
  expect(faded).toBe(true)
  expect(ended.labels).toEqual([])
  expect(feed(createSixSevenDetector(),'alternate',6000).opacity).toBe(1)
})
test('malformed and stale tracker readings reset, requiring a fresh gesture',()=>{
  for(const invalid of [[Array(21).fill({x:.5,y:.5,z:0}),handsAt(2200)[1]]]) {
    const detector=createSixSevenDetector();expect(feed(detector).labels).toHaveLength(2)
    expect(detector.update(invalid,2250,4/3).labels).toEqual([])
    expect(detector.update(handsAt(2300),2300,4/3).labels).toEqual([])
  }
  const detector=createSixSevenDetector();feed(detector)
  expect(detector.snapshot(2451).labels).toEqual([])
  expect(detector.update(handsAt(2500),2500,4/3).labels).toEqual([])
  feed(detector);detector.reset();expect(detector.snapshot(2200).labels).toEqual([])
})

for(const viewport of [{width:1058,height:721},{width:390,height:844}]) test(`Mirror draws readable digits with landmarks off at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport)
  await page.addInitScript(()=>localStorage.setItem('mirror-image-camera-preferences-v1',JSON.stringify({showOverlay:false,matchingMode:'auto'})))
  const vector=JSON.parse(readFileSync(new URL('../src/data/memes.json',import.meta.url)))[0].features
  await installTrackers(page,vector)
  await page.goto('/#mirror')
  if (viewport.width===390) {
    await page.getByRole('link',{name:'Settings',exact:true}).click()
    await page.getByRole('combobox',{name:'Settings matching mode',exact:true}).selectOption('face-only')
    await page.getByRole('link',{name:'Mirror',exact:true}).click()
  }
  await page.getByRole('button',{name:'Start camera',exact:true}).click()
  await page.evaluate(()=>{
    const base=[[.25,.65],[.75,.65]]
    const hand=(x,y)=>{
      const points=[{x,y,z:0}]
      for(const [dx,dy] of [[-.085,-.035],[-.055,-.11],[0,-.13],[.045,-.115],[.085,-.09]]) {
        for(const rise of [0,.055,.1,.15]) points.push({x:x+dx,y:y+dy-rise,z:0})
      }
      return points
    }
    const start=performance.now()
    window.motionTimer=setInterval(()=>{
      const t=performance.now()-start,motion=.12*Math.cos(t*2*Math.PI/700)
      window.handFixture.landmarks=base.map(([x,y],i)=>hand(x,y+(i? -motion:motion)))
    },50)
  })
  const overlay=page.locator('.six-seven-overlay')
  await expect(overlay).toHaveAttribute('data-visible','true')
  await expect.poll(()=>overlay.evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
    let painted=0
    for(let i=3;i<pixels.length;i+=4) if(pixels[i]) painted++
    return painted
  })).toBeGreaterThan(200)
  await expect(page.locator('.hand-overlay')).toBeHidden()
  await expect(page.locator('#live-match img')).toHaveAttribute('src','/easter-eggs/67.gif')
  const alignment=await overlay.evaluate(canvas=>{
    const video=document.querySelector('.camera-stage video'),a=canvas.getBoundingClientRect(),b=video.getBoundingClientRect()
    return {same:a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height,width:canvas.width,height:canvas.height,transform:getComputedStyle(canvas).transform}
  })
  expect(alignment.same).toBe(true);expect(alignment.transform).toBe('none')
  expect(alignment.width).toBeGreaterThan(0);expect(alignment.height).toBeGreaterThan(0)
  await expect.poll(()=>page.locator('#live-match img').evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/six-seven-${viewport.width}.png`,fullPage:true})
  await page.evaluate(()=>{window.matchFixture.faceLandmarks=[]})
  await expect(page.locator('.camera-panel .camera-controls')).toContainText('No face detected')
  await expect(overlay).toHaveAttribute('data-visible','true')
  await page.evaluate(()=>{clearInterval(window.motionTimer)})
  await expect(page.locator('#live-match h2')).toHaveText('Closest match',{timeout:1500})
  await expect(overlay).toHaveAttribute('data-visible','true')
  await page.evaluate(()=>{window.handFixture.landmarks=[]})
  await expect(overlay).toHaveAttribute('data-visible','false')
  await page.getByRole('link',{name:'Settings',exact:true}).click()
  await expect(overlay).toBeHidden()
  // Returning cannot reveal the previous activation.
  await page.evaluate(()=>{clearInterval(window.motionTimer);window.handFixture.landmarks=[]})
  await page.getByRole('link',{name:'Mirror',exact:true}).click()
  await expect(overlay).toHaveAttribute('data-visible','false')
  await page.getByRole('button',{name:'Stop camera',exact:true}).click()
  await expect(overlay).toBeHidden()
})

test('GIF stops promptly after stationary hands while labels retain their hold',()=>{
  const detector=createSixSevenDetector()
  expect(feed(detector,'alternate',650).active).toBe(true)
  const frozen=handsAt(650)
  for(let t=700;t<=1450;t+=50) detector.update(frozen,t,4/3)
  const stopped=detector.snapshot(1450)
  expect(stopped.active).toBe(false)
  expect(stopped.labels).toHaveLength(2)
  expect(feed(createSixSevenDetector(),'alternate',6000).active).toBe(true)
})
test('brief hand dropouts retain activation, but stale tracking clears it',()=>{
  const detector=createSixSevenDetector()
  expect(feed(detector,'alternate',650).active).toBe(true)
  expect(detector.update([],700,4/3).active).toBe(true)
  expect(detector.update(handsAt(750),750,4/3).labels).toHaveLength(2)
  expect(feed(detector,'alternate',650).active).toBe(true)
  expect(detector.snapshot(901).active).toBe(false)
})
test('labels use the latest palm positions without smoothing delay',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  const hands=handsAt(700).reverse()
  const state=detector.update(hands,700,4/3)
  for(const hand of hands) {
    const x=[0,5,9,13,17].reduce((sum,i)=>sum+hand[i].x,0)/5
    const y=[0,5,9,13,17].reduce((sum,i)=>sum+hand[i].y,0)/5
    const label=state.labels.find(label=>Math.abs(label.x-x)<1e-8)
    expect(label.y).toBeCloseTo(y,8)
  }
})

for(const aspect of [4/3,3/4]) test(`broad high and low strokes preserve labels across height swaps at aspect ${aspect}`,()=>{
  const detector=createSixSevenDetector()
  const frames=[[.87,.38],[.38,.87],[.87,.38],[.38,.87],[.87,.38]]
  let state
  frames.forEach(([left,right],i)=>{
    const hands=[handLandmarks([1,1,1,1,1],.25,left),handLandmarks([1,1,1,1,1],.75,right)]
      .map(hand=>hand.map(p=>({...p,x:.5+(p.x-.5)*(4/3)/aspect,z:p.z*(4/3)/aspect})))
    state=detector.update(i%2?hands.reverse():hands,i*200,aspect)
    if(i>=2) {
      expect(state.active).toBe(true)
      expect(state.labels.find(label=>label.x>.5).digit).toBe('6')
      expect(state.labels.find(label=>label.x<.5).digit).toBe('7')
    }
  })
})
test('alternating strokes trigger near the top and bottom of the frame',()=>{
  for(const center of [.36,.85]) {
    const detector=createSixSevenDetector()
    let state
    for(let t=0;t<=1400;t+=50) {
      const motion=.07*Math.cos(t*2*Math.PI/700)
      state=detector.update([handLandmarks([1,1,1,1,1],.25,center+motion),handLandmarks([1,1,1,1,1],.75,center-motion)],t,4/3)
    }
    expect(state.active).toBe(true)
    expect(state.labels).toHaveLength(2)
  }
})

for(const step of [20,33,50,100]) test(`long slow strokes remain visible throughout turns at ${step}ms intervals`,()=>{
  const detector=createSixSevenDetector()
  let activated=false
  for(let t=0;t<=12000;t+=step) {
    const motion=.22*Math.cos(t*2*Math.PI/4000)
    const hands=[handLandmarks([1,1,1,1,1],.25,.62+motion),handLandmarks([1,1,1,1,1],.75,.62-motion)]
    const state=detector.update(Math.floor(t/step)%2?hands.reverse():hands,t,4/3)
    if(state.active) activated=true
    if(activated) {expect(state.active,`visibility at ${t}ms`).toBe(true);expect(state.labels).toHaveLength(2)}
  }
  expect(activated).toBe(true)
})
test('small stationary tracking jitter cannot keep the GIF alive',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  const frozen=handsAt(650)
  let state
  for(let t=700;t<=2500;t+=33) {
    const noise=.003*Math.sin(t/20)
    state=detector.update(frozen.map((hand,i)=>hand.map(p=>({...p,y:p.y+(i?noise:-noise)}))),t,4/3)
  }
  expect(state.active).toBe(false)
})

test('one-hand dropouts keep the visible number moving and restore both identities without retriggering',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  for(let t=700;t<=1150;t+=50) {
    const state=detector.update([handsAt(t)[0]],t,4/3)
    const visible=state.labels.find(label=>label.digit==='7')
    const hand=handsAt(t)[0]
    expect(visible.y).toBeCloseTo([0,5,9,13,17].reduce((sum,i)=>sum+hand[i].y,0)/5,8)
    if(t===750) expect(state.labels).toHaveLength(2)
    if(t===1150) expect(state.labels).toHaveLength(1)
  }
  const recovered=detector.update(handsAt(1200).reverse(),1200,4/3)
  expect(recovered.labels).toHaveLength(2)
  expect(recovered.labels.find(label=>label.x>.5).digit).toBe('6')
  expect(recovered.labels.find(label=>label.x<.5).digit).toBe('7')
})
test('brief duplicate detections do not discard active identities',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  const hand=handsAt(700)[0]
  expect(detector.update([hand,hand.map(p=>({...p,x:p.x+.005}))],700,4/3).labels).toHaveLength(2)
  expect(detector.update(handsAt(750).reverse(),750,4/3).labels).toHaveLength(2)
})
test('missing palm prediction is bounded and fades instead of remaining stuck',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  const last=detector.snapshot(650).labels
  let state
  for(let t=700;t<=1200;t+=50) state=detector.update([],t,4/3)
  expect(state.labels).toEqual([])
  expect(state.active).toBe(false)
  detector.reset();feed(detector,'alternate',650)
  const predicted=detector.update([],800,4/3).labels
  for(const label of predicted) {
    const old=last.find(p=>p.digit===label.digit)
    expect(Math.abs(label.y-old.y)).toBeLessThanOrEqual(.24)
    expect(label.opacity).toBe(1)
  }
  const fading=detector.update([],950,4/3).labels
  expect(fading.every(label=>label.opacity>0 && label.opacity<1)).toBe(true)
  expect(detector.update([],1500,4/3).labels).toEqual([])
  expect(detector.update(handsAt(1550),1550,4/3).labels).toEqual([])
})

test('genuinely ambiguous hand crossings still reset the assignments',()=>{
  const detector=createSixSevenDetector()
  feed(detector,'alternate',650)
  for(let t=700;t<=850;t+=50) detector.update([handLandmarks([1,1,1,1,1],.25,.65),handLandmarks([1,1,1,1,1],.75,.65)],t,4/3)
  const state=detector.update([handLandmarks([1,1,1,1,1],.5,.45),handLandmarks([1,1,1,1,1],.5,.85)],900,4/3)
  expect(state.labels).toEqual([])
  expect(state.active).toBe(false)
})
