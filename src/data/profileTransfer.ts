import { createProfileBackup as createLegacyBackup, validateProfileBackup as validateLegacyBackup } from '@mimic/core/data/profileTransfer'
import retiredIds from './retiredMemeIds.json' with { type: 'json' }
import { poseKind, validateGestureProfile } from '../tracking/gestureProfile.ts'
import { validatePreferences } from './cameraPreferences.ts'
export { MAX_BACKUP_BYTES, PROFILE_FORMAT } from '@mimic/core/data/profileTransfer'
export const PROFILE_VERSION = 2
const retired = new Set(retiredIds)
export function createProfileBackup(profiles, hiddenBuiltInIds, preferences?) {
  const backup = createLegacyBackup(profiles,hiddenBuiltInIds)
  return {...backup,version:2,profiles:backup.profiles.map((p,i)=>({...p,poseKind:poseKind(profiles[i]),gestureProfile:profiles[i].gestureProfile??null})),
    ...(preferences ? {preferences:validatePreferences(preferences)} : {})}
}
export function validateProfileBackup(input, builtIns) {
  if (!input || ![1,2].includes(input.version)) throw new Error('Supported backup versions are version 1 and version 2.')
  if (!Array.isArray(input.profiles) || input.profiles.length>500 || !Array.isArray(input.hiddenBuiltInIds) || input.hiddenBuiltInIds.length>500) throw new Error('The backup has an invalid profile list.')
  const skippedRetiredIds = [...new Set([...input.profiles.map(p=>p?.id),...input.hiddenBuiltInIds].filter(id=>retired.has(id)))]
  const profiles=input.profiles.filter(p=>!retired.has(p?.id))
  const legacy=validateLegacyBackup({...input,version:1,profiles,hiddenBuiltInIds:input.hiddenBuiltInIds.filter(id=>!retired.has(id))},builtIns)
  const validated=legacy.profiles.map((profile,i)=> {
    if (input.version===1) return {...profile,gestureProfile:null,poseKind:poseKind(profile),handsTrained:false}
    const entry=profiles[i]
    if (!['face','one-hand','two-hands'].includes(entry.poseKind)) throw new Error('Invalid profile pose requirement.')
    const gestureProfile=entry.gestureProfile==null ? null : validateGestureProfile(entry.gestureProfile)
    if (gestureProfile && (entry.poseKind==='face' || gestureProfile.handCount!==(entry.poseKind==='two-hands'?2:1))) throw new Error('Gesture profile does not match its required hand count.')
    const requiredKind = poseKind({...profile,poseKind:entry.poseKind,gestureProfile})
    if (gestureProfile && gestureProfile.handCount!==(requiredKind==='two-hands'?2:1)) throw new Error('Gesture profile does not match the image hand requirement.')
    return {...profile,poseKind:requiredKind,gestureProfile,handsTrained:Boolean(gestureProfile),handFeatures:requiredKind==='face'?undefined:profile.handFeatures}
  })
  return {...legacy,profiles:validated,skippedRetiredIds,...(input.version===2 && input.preferences ? {preferences:validatePreferences(input.preferences)} : {})}
}
