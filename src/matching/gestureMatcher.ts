import { rankMemes } from './matcher.ts'
import { compareGestures, freshGesture, poseKind, type GestureObservation, type MatchingMode } from '../tracking/gestureProfile.ts'
import { DEFAULT_FEATURE_WEIGHTS } from './similarity.ts'
export function rankPoseMemes(expression, memes, mode: MatchingMode, observation: GestureObservation, now: number, handStatus: string) {
  const fresh = freshGesture(observation,now)
  const gestureActive = mode==='auto' && fresh && observation.handCount>0
  const status = mode==='auto' && handStatus==='unavailable' ? 'Hand tracking unavailable. Select Face only to continue.' : mode==='auto' && (!fresh || handStatus!=='ready') ? 'Waiting for hand tracking…' : ''
  if (status) return {ranked:[],message:status}
  const eligible = memes.filter(meme => {
    if (!gestureActive) return poseKind(meme)==='face'
    return poseKind(meme)!=='face' && observation.handCount===(poseKind(meme)==='two-hands'?2:1) && meme.gestureProfile?.handCount===observation.handCount && observation.hands.length===observation.handCount
  })
  const ranked = rankMemes(expression,eligible.map(m => ({...m,handFeatures:undefined})),DEFAULT_FEATURE_WEIGHTS).filter(m=>m.comparison).flatMap(entry => {
    const meme=eligible.find(m=>m.id===entry.meme.id)
    if (!gestureActive) return [{...entry,meme}]
    const gesture=compareGestures(observation.hands,meme.gestureProfile.hands)
    if (!gesture?.compatible) return []
    const distance=Math.sqrt(.4*entry.comparison.distance**2+.6*gesture.distance**2)
    return [{meme,comparison:{...entry.comparison,distance,percentage:(1-distance)*100,gesturePercentage:(1-gesture.distance)*100}}]
  }).sort((a,b)=>a.comparison.distance-b.comparison.distance || a.meme.id.localeCompare(b.meme.id))
  return {ranked,message:gestureActive && !ranked.length ? 'No matching gesture' : !ranked.length ? 'No face-only profiles available.' : ''}
}
