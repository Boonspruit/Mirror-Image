interface Point { x: number; y: number; z?: number }
interface Palm { x: number; y: number; size: number; open: boolean }
export interface SixSevenLabel { digit: '6' | '7'; x: number; y: number; opacity: number }
export interface SixSevenState { labels: SixSevenLabel[]; opacity: number; active: boolean }
const STROKE_WINDOW_MS=4000
const EMPTY: SixSevenState = { labels: [], opacity: 0, active: false }
const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y, (a.z??0)-(b.z??0))
function straight(a: Point, b: Point, c: Point) {
  const u=[a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0)], v=[c.x-b.x,c.y-b.y,(c.z??0)-(b.z??0)]
  const length=Math.hypot(...u)*Math.hypot(...v)
  return length>1e-8 && u.reduce((sum,n,i)=>sum+n*v[i],0)/length < -.15
}
function palm(points: Point[], aspect: number, world?: Point[]): Palm | null {
  if (points?.length!==21 || points.some(p=>!p || ![p.x,p.y,p.z??0].every(Number.isFinite))) return null
  // Measure all distances in image-height units, including portrait video.
  const hand=points.map(p=>({x:p.x*aspect,y:p.y,z:(p.z??0)*aspect}))
  const size=Math.max(Math.hypot(hand[0].x-hand[9].x,hand[0].y-hand[9].y),Math.hypot(hand[5].x-hand[17].x,hand[5].y-hand[17].y)*.7)
  if (size<.015) return null
  // World geometry preserves finger extension when upward-facing palms look foreshortened.
  const shape=world?.length===21 && world.every(p=>p && [p.x,p.y,p.z??0].every(Number.isFinite)) && distance(world[0],world[9])>.001 ? world : hand
  const open=[5,9,13,17].filter(base=>straight(shape[base],shape[base+1],shape[base+2]) &&
    straight(shape[base+1],shape[base+2],shape[base+3]) && distance(shape[0],shape[base+3])>distance(shape[0],shape[base])*1.05).length>=3
  const center=[0,5,9,13,17].map(i=>points[i])
  return {x:center.reduce((sum,p)=>sum+p.x,0)/5,y:center.reduce((sum,p)=>sum+p.y,0)/5,size,open}
}
export function createSixSevenDetector() {
  let palms: Palm[] = [], positions: Palm[] = [], lastSeen=-Infinity, lastRead=-Infinity, lastMotion=-Infinity
  let anchor: Palm[] = [], side=0, changes: number[] = [], anchorAt=-Infinity
  let digits: ('6'|'7')[] = []
  let lastOpen=[-Infinity,-Infinity]
  // Palm labels use fresh coordinates; the GIF requires ongoing opposing motion.
  let aspect=1, revealUntil=-Infinity
  let positionAt=[-Infinity,-Infinity], velocity=[{x:0,y:0},{x:0,y:0}]
  let motionSamples: {at: number; y: number[]}[]=[]
  function resetMotion() { anchor=[]; side=0; changes=[]; anchorAt=-Infinity }
  function resetTracking() { positionAt=[-Infinity,-Infinity]; velocity=[{x:0,y:0},{x:0,y:0}]; motionSamples=[]; palms=[]; positions=[]; revealUntil=-Infinity; digits=[]; lastSeen=-Infinity; lastRead=-Infinity; lastMotion=-Infinity; lastOpen=[-Infinity,-Infinity]; resetMotion() }
  function reset() { resetTracking(); revealUntil=-Infinity }
  function recordPosition(p: Palm,i: number,now: number) {
    const old=positions[i], dt=now-positionAt[i]
    const cap=(n: number)=>Math.max(-.002,Math.min(.002,n))
    velocity[i]=old && dt>0 && dt<=800 ? {x:cap((p.x-old.x)/dt),y:cap((p.y-old.y)/dt)} : {x:0,y:0}
    positions[i]={...p}; positionAt[i]=now
  }
  function partial(next: Palm[],now: number) {
    if(palms.length===2 && next.length) {
      const candidates=next.flatMap(p=>palms.map((old,i)=>({p,i,cost:Math.abs(p.x-old.x)*aspect+Math.min(Math.abs(p.y-old.y),Math.max(p.size,old.size)*2)*.2}))).sort((a,b)=>a.cost-b.cost)
      const best=candidates[0], other=candidates.find(c=>c.i!==best.i)
      if(best.cost<.45 && other.cost-best.cost>.03) {
        recordPosition(best.p,best.i,now); palms[best.i]={...best.p}
      }
    }
    return snapshot(now)
  }
  function snapshot(now: number): SixSevenState {
    // Missing detections and a tracker that has stopped producing frames are different.
    if (now<lastRead || now-lastRead>250 || now-lastSeen>800) resetTracking()
    const hidden={...EMPTY,active:now<revealUntil}
    const age=now-lastMotion
    if (!digits.length || age>=5250) { digits=[]; return hidden }
    const labels=positions.flatMap((p,i)=>{
      const lostFor=now-positionAt[i]
      if(lostFor>=450) return []
      const prediction=Math.min(lostFor,120)
      const clamp=(n: number)=>Math.max(0,Math.min(1,n))
      return [{digit:digits[i],x:clamp(p.x+velocity[i].x*prediction),y:clamp(p.y+velocity[i].y*prediction),opacity:lostFor<=150?1:1-(lostFor-150)/300}]
    })
    return {labels,opacity:age<=5000?1:1-(age-5000)/250,active:now<revealUntil}
  }
  return {
    reset, snapshot,
    update(hands: Point[][], now: number, imageAspect=1, worldHands?: Point[][]): SixSevenState {
      if (!Number.isFinite(now) || !Number.isFinite(imageAspect) || imageAspect<=0) { reset(); return EMPTY }
      if (now-lastRead>250 || now<lastRead || now-lastSeen>800 || aspect!==imageAspect) resetTracking()
      lastRead=now
      aspect=imageAspect
      if (hands?.length!==2) {
        const available=(hands??[]).map((hand,i)=>palm(hand,aspect,worldHands?.[i])).filter(Boolean)
        return partial(available,now)
      }
      let next=hands.map((hand,i)=>palm(hand,aspect,worldHands?.[i]))
      if (next.some(p=>!p)) { resetTracking(); return snapshot(now) }
      const d=(a: Palm,b: Palm)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y)
      const size=(next[0].size+next[1].size)/2
      if (d(next[0],next[1])<Math.max(.06,size*.6)) return partial(next,now)
      const previous=palms
      if (palms.length) {
        // Broad vertical strokes can jump past the other hand's old height.
        // Keep identity anchored mainly to horizontal position, allowing full-height motion.
        const identityDistance=(a: Palm,b: Palm)=>Math.abs(a.x-b.x)*aspect + Math.min(Math.abs(a.y-b.y),size*2)*.2
        const direct=identityDistance(next[0],palms[0])+identityDistance(next[1],palms[1])
        const swapped=identityDistance(next[1],palms[0])+identityDistance(next[0],palms[1])
        if (Math.abs(direct-swapped)<.02) { resetTracking(); return snapshot(now) }
        if (swapped<direct) next.reverse()
        if (next.some((p,i)=>Math.abs(p.x-palms[i].x)*aspect>Math.max(.35,size*3))) { resetTracking(); return snapshot(now) }
        next.forEach((p,i)=>recordPosition(p,i,now))
        next=next.map((p,i)=>({...p,x:palms[i].x+.7*(p.x-palms[i].x),y:palms[i].y+.7*(p.y-palms[i].y)}))
      }
      if (!previous.length) next.forEach((p,i)=>recordPosition(p,i,now))
      palms=next; lastSeen=now
      palms.forEach((p,i)=>{if(p.open) lastOpen[i]=now})
      if (lastOpen.some(at=>now-at>200)) { resetMotion(); return snapshot(now) }
      // Measure displacement over time, rather than requiring a minimum step on every frame.
      // Slow, broad strokes produce small frame steps even while the hands keep moving.
      motionSamples=motionSamples.filter(sample=>now-sample.at<=250)
      motionSamples.push({at:now,y:positions.map(p=>p.y)})
      const start=motionSamples[0]
      if (digits.length && now-start.at>=100) {
        const a=positions[0].y-start.y[0], b=positions[1].y-start.y[1]
        if (a*b<0 && Math.min(Math.abs(a),Math.abs(b))>=Math.max(.009,size*.06)) {
          revealUntil=now+500
          lastMotion=now
        }
      }
      if (anchor.length && now-anchorAt>STROKE_WINDOW_MS) resetMotion()
      if (!anchor.length) { anchor=palms.map(p=>({...p})); anchorAt=now; return snapshot(now) }
      const a=palms[0].y-anchor[0].y, b=palms[1].y-anchor[1].y
      const direction=Math.sign(a-b)
      // Follow each stroke's turning point, rather than requiring equal starting heights.
      if (side && direction===side) {
        anchor=palms.map(p=>({...p})); anchorAt=now
      } else if (a*b<0 && Math.min(Math.abs(a),Math.abs(b))>=Math.max(.025,size*.22) && Math.abs(a-b)>=Math.max(.05,size*.45)) {
        changes=changes.filter(at=>now-at<=STROKE_WINDOW_MS)
        changes.push(now)
        if (changes.length>=2 || digits.length) {
          if (!digits.length) digits=palms[0].x>palms[1].x?['6','7']:['7','6']
          lastMotion=now; revealUntil=now+500
        }
        side=direction; anchor=palms.map(p=>({...p})); anchorAt=now
      }
      return snapshot(now)
    },
  }
}
