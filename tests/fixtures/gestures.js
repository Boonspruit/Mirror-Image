export function faceLandmarks() {
  const face=Array.from({length:478},()=>({x:.5,y:.5,z:0}))
  face[13]={x:.5,y:.58,z:0};face[14]={x:.5,y:.6,z:0};face[1]={x:.5,y:.48,z:0}
  face[234]={x:.3,y:.5,z:0};face[454]={x:.7,y:.5,z:0}
  return face
}
// Articulated hand skeleton with individually straight/bent fingers, unlike the old coincident-point fixtures.
export function handLandmarks(extended=[0,1,0,0,0], x=.54,y=.77) {
  const points=[{x,y,z:0}]
  const bases=[[-.085,-.035],[-.055,-.11],[0,-.13],[.045,-.115],[.085,-.09]]
  bases.forEach(([dx,dy],i)=> {
    const bx=x+dx,by=y+dy
    if (i===0) {
      points.push({x:bx,y:by,z:0},{x:bx-.02,y:by-.035,z:0},{x:bx-(extended[i]?.055:.01),y:by-(extended[i]?.06:.005),z:extended[i]?0:-.02},{x:bx-(extended[i]?.085:-.015),y:by-(extended[i]?.085:-.025),z:extended[i]?0:-.04})
    } else {
      points.push({x:bx,y:by,z:0},{x:bx,y:by-.055,z:0},{x:bx+(extended[i]?0:.01),y:by-(extended[i]?.1:.035),z:extended[i]?0:-.03},{x:bx+(extended[i]?0:.015),y:by-(extended[i]?.15:-.01),z:extended[i]?0:-.06})
    }
  })
  return points
}
export function mirrored(hand) {return hand.map(p=>({...p,x:1-p.x}))}
export function categoriesFor(features) {
  const paired={eyeWide:['eyeWideLeft','eyeWideRight'],eyeSquint:['eyeSquintLeft','eyeSquintRight'],browDown:['browDownLeft','browDownRight'],smile:['mouthSmileLeft','mouthSmileRight'],frown:['mouthFrownLeft','mouthFrownRight'],cheekSquint:['cheekSquintLeft','cheekSquintRight'],noseSneer:['noseSneerLeft','noseSneerRight']}
  const single={browInnerUp:'browInnerUp',jawOpen:'jawOpen',mouthPucker:'mouthPucker'}
  return Object.entries(features).flatMap(([name,score])=>paired[name]?paired[name].map(categoryName=>({categoryName,score})):[{categoryName:single[name],score}])
}
export async function installTrackers(page,features,hands=[],failure=false) {
  await page.addInitScript(({face,categories,hands})=>{
    window.matchFixture={faceLandmarks:[face],faceBlendshapes:[{categories}],facialTransformationMatrixes:[{rows:4,columns:4,data:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-50,1]}]}
    window.handFixture={landmarks:hands,worldLandmarks:[],handedness:[]}
  },{face:faceLandmarks(),categories:categoriesFor(features),hands})
  await page.route('**/src/tracking/faceTracker.ts*',route=>route.fulfill({contentType:'application/javascript',body:`export async function createFaceTracker(){return {tracker:{close(){}},delegate:'CPU'}}; export function startFaceTracking(video,tracker,onResult){const timer=setInterval(()=>onResult(window.matchFixture),40);return ()=>clearInterval(timer)}`}))
  await page.route('**/src/tracking/handTracker.ts*',route=>route.fulfill({contentType:'application/javascript',body:failure?`export async function createHandTracker(){throw new Error('Fixture failure')}; export function startHandTracking(){}`:`export async function createHandTracker(){return {tracker:{close(){}},delegate:'CPU'}}; export function startHandTracking(video,tracker,onResult){const timer=setInterval(()=>{if(!window.pauseHands)onResult(window.handFixture)},50);return ()=>clearInterval(timer)}`}))
}
