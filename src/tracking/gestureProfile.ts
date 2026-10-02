export type MatchingMode = 'auto' | 'face-only'
export type PoseKind = 'face' | 'one-hand' | 'two-hands'
export interface HandDescriptor { shape: number[]; direction: number[]; position: number[] }
export interface GestureProfile { version: 1; handCount: 1 | 2; hands: HandDescriptor[] }
export interface GestureObservation { observedAt: number; handCount: number; hands: HandDescriptor[] }
export const HAND_FRESH_MS = 250
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))
const vec = (a, b) => [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)]
const angle = (a, b, c) => {
  const u = vec(b, a), v = vec(b, c)
  const norm = Math.hypot(...u) * Math.hypot(...v)
  return norm > 1e-8 ? Math.acos(Math.max(-1, Math.min(1, u.reduce((s, n, i) => s + n * v[i], 0) / norm))) / Math.PI : NaN
}
export function extractGestureObservation(result, face, observedAt: number, imageAspect = 1): GestureObservation {
  // MediaPipe x and y are normalized by different image dimensions; use width units for both.
  const yScale = Number.isFinite(imageAspect) && imageAspect>0 ? 1/imageAspect : 1
  const scale = point => ({...point, y:point.y*yScale})
  face = face?.map(scale)
  const landmarks = (result?.landmarks ?? []).map(hand=>hand.map(scale))
  const hands: HandDescriptor[] = []
  const cheekA = face?.[234], cheekB = face?.[454], nose = face?.[1], mouth = face?.[13]
  const faceWidth = cheekA && cheekB ? Math.hypot(cheekA.x - cheekB.x, cheekA.y - cheekB.y) : 0
  if (faceWidth > 0.01 && nose && mouth) for (const hand of landmarks) {
    if (hand.length !== 21 || hand.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z ?? 0))) continue
    const palmSize = distance(hand[0], hand[9])
    if (palmSize < 0.005) continue
    const fingers = [[1,2,3,4], [5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]]
    const shape = fingers.flatMap(([base, joint, dip, tip]) => [
      angle(hand[base], hand[joint], hand[dip]), angle(hand[joint], hand[dip], hand[tip]),
      clamp(distance(hand[tip], hand[0]) / (palmSize * 3)),
    ])
    for (const [a,b] of [[4,8],[8,12],[12,16],[16,20]]) shape.push(clamp(distance(hand[a],hand[b]) / (palmSize * 2)))
    const axis = vec(hand[0],hand[9]), norm = Math.hypot(...axis)
    const across = vec(hand[5],hand[17]), acrossNorm = Math.hypot(...across)
    if (acrossNorm < 1e-8) continue
    const direction = [...axis.map(n => (n / norm + 1) / 2), ...across.map(n => (n / acrossNorm + 1) / 2)]
    const center = { x:(cheekA.x+cheekB.x)/2, y:(cheekA.y+cheekB.y)/2 }
    const position = [clamp(.5 + (hand[0].x-center.x)/(faceWidth*4)), clamp(.5 + (hand[0].y-center.y)/(faceWidth*4)),
      clamp(.5 + (hand[8].x-center.x)/(faceWidth*2)), clamp(.5 + (hand[8].y-center.y)/(faceWidth*2)),
      ...[mouth,nose,cheekA,cheekB].map(target => clamp(Math.hypot(hand[8].x-target.x, hand[8].y-target.y) / faceWidth))]
    if ([...shape,...direction,...position].every(Number.isFinite)) hands.push({shape,direction,position})
  }
  return { observedAt, handCount: landmarks.length, hands }
}
const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum,n,i) => sum+(n-b[i])**2,0)/a.length)
function reflect(hand: HandDescriptor): HandDescriptor {
  return { shape: hand.shape, direction: hand.direction.map((n,i) => i===0 || i===3 ? 1-n : n), position: [1-hand.position[0],hand.position[1],1-hand.position[2],hand.position[3],hand.position[4],hand.position[5],hand.position[7],hand.position[6]] }
}
export function compareGestures(live: HandDescriptor[], target: HandDescriptor[]) {
  if (!live.length || live.length !== target.length) return null
  let best = null
  for (const mirrored of [false,true]) for (const reversed of [false,true]) {
    const ordered = reversed ? [...live].reverse() : live
    let shape=0, direction=0, position=0, fingerMax=0, positionMax=0
    let anchorCompatible = true
    ordered.forEach((original,i) => {
      const hand = mirrored ? reflect(original) : original, reference = target[i]
      shape=Math.max(shape,rms(hand.shape,reference.shape)); direction=Math.max(direction,rms(hand.direction,reference.direction)); position=Math.max(position,rms(hand.position,reference.position))
      const mouth=reference.position[4], nose=reference.position[5]
      if (Math.min(mouth,nose)<.25 && Math.abs(mouth-nose)>.08) {
        const nearest=mouth<nose ? 4 : 5, other=nearest===4 ? 5 : 4
        if (hand.position[nearest]>hand.position[other]+.03) anchorCompatible=false
      }
      positionMax=Math.max(positionMax,...hand.position.map((n,j)=>Math.abs(n-reference.position[j])))
      fingerMax=Math.max(fingerMax,...hand.shape.slice(0,15).map((n,j)=> Math.abs(n-reference.shape[j])))
    })
    const distance = Math.sqrt(.6*shape**2+.15*direction**2+.25*position**2)
    const compatible = anchorCompatible && shape <= .18 && fingerMax <= .4 && direction <= .3 && position <= .12 && positionMax <= .22
    if (!best || (compatible && !best.compatible) || compatible===best.compatible && distance < best.distance) best={distance,compatible,shape,direction,position}
  }
  return best
}
// Image requirements remain authoritative when updating only facial values.
export const BUILT_IN_GESTURE_KINDS: Record<string, PoseKind> = {
  shocked: 'two-hands', 'thinking-monkey': 'one-hand', 'call-me-cat': 'one-hand',
  'actually-cat': 'one-hand', 'nose-picking': 'one-hand', 'memegen-aag-default-jpg': 'two-hands',
  'memegen-captain-default-jpg': 'one-hand', 'memegen-drake-yes-jpg': 'one-hand',
  'memegen-rollsafe-default-jpg': 'one-hand', 'memegen-saltbae-default-jpg': 'one-hand',
}
export function poseKind(meme): PoseKind {
  if (!meme) return 'face'
  return BUILT_IN_GESTURE_KINDS[meme.id] ?? meme.poseKind ?? (meme.gestureProfile?.handCount === 2 || meme.handFeatures?.twoHandsPresent >= .5 ? 'two-hands' : meme.gestureProfile || meme.handFeatures ? 'one-hand' : 'face')
}
export function validateGestureProfile(value): GestureProfile {
  if (!value || value.version !== 1 || ![1,2].includes(value.handCount) || !Array.isArray(value.hands) || value.hands.length !== value.handCount) throw new Error('Invalid gesture profile.')
  for (const hand of value.hands) for (const [key,count] of [['shape',19],['direction',6],['position',8]] as const) {
    if (!Array.isArray(hand?.[key]) || hand[key].length !== count || hand[key].some(n => typeof n !== 'number' || !Number.isFinite(n) || n<0 || n>1)) throw new Error('Invalid gesture descriptor.')
  }
  return {version:1,handCount:value.handCount,hands:value.hands.map(h=>({shape:[...h.shape],direction:[...h.direction],position:[...h.position]}))}
}
export function freshGesture(observation: GestureObservation, now: number) {
  return observation && now >= observation.observedAt && now-observation.observedAt <= HAND_FRESH_MS
}
