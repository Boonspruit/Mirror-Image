import { compareGestures, freshGesture, type PoseKind, type GestureProfile } from './gestureProfile.ts'
interface CaptureState { message: string; failed?: boolean; done?: boolean; features?: Record<string, number>; gestureProfile?: GestureProfile | null; handFeatures?: Record<string, number> }
export function createProfileCapture(kind: PoseKind, startedAt: number, featureNames: string[]) {
  const requiredHands=kind==='two-hands'?2:kind==='one-hand'?1:0
  let samples=[]; let lastAt=-Infinity; let lastHandAt=-Infinity
  const reset=message=> {samples=[];return {message}}
  return {
    update(sample, now: number): CaptureState {
      if (now-startedAt<3000) return {message:`Prepare your pose… ${Math.ceil((3000-(now-startedAt))/1000)}`}
      if (now-startedAt>18000) return {failed:true,message:'Capture timed out. Position your face and hands, then try again.'}
      if (!sample || now-sample.observedAt>250 || !featureNames.every(key=>Number.isFinite(sample.expression?.[key]))) return reset('Keep your face visible to capture the profile.')
      if (requiredHands && sample.handStatus!=='ready') return {failed:true,message:'Hand tracking unavailable. Restart the camera or capture a Face only profile.'}
      if (requiredHands && (!freshGesture(sample.gesture,now) || sample.gesture.handCount!==requiredHands || sample.gesture.hands.length!==requiredHands)) return reset(`Keep ${requiredHands===2?'both hands':'one hand'} fully visible in frame.`)
      if (sample.observedAt===lastAt || requiredHands && sample.gesture.observedAt===lastHandAt) return {message:'Hold steady while the camera collects fresh readings.'}
      lastAt=sample.observedAt;lastHandAt=sample.gesture?.observedAt
      const previous=samples.at(-1)
      if (previous && sample.observedAt-previous.observedAt>250) samples=[]
      const anchor=samples[0]
      if (anchor) {
        const faceDelta=Math.sqrt(featureNames.reduce((sum,key)=>sum+(anchor.expression[key]-sample.expression[key])**2,0)/featureNames.length)
        const hands=requiredHands ? compareGestures(sample.gesture.hands,anchor.gesture.hands) : null
        if (faceDelta>.08 || requiredHands && (!hands || hands.shape>.1 || hands.direction>.15 || hands.position>.08)) return reset('Pose moved. Hold still to restart the capture.')
      }
      samples.push(sample)
      if (samples.length<6 || sample.observedAt-samples[0].observedAt<750) return {message:'Hold steady… capturing your profile.'}
      const features=Object.fromEntries(featureNames.map(key=>[key,samples.reduce((sum,s)=>sum+s.expression[key],0)/samples.length]))
      // Use the middle stable observation; averaging unmatched hand arrays can mix left/right hands.
      const middle=samples[Math.floor(samples.length/2)]
      return {done:true,message:'Saving profile…',features,gestureProfile:requiredHands ? {version:1,handCount:requiredHands as 1 | 2,hands:middle.gesture.hands} : null,
        handFeatures:requiredHands ? middle.handFeatures : undefined}
    },
  }
}
