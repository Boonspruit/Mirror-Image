import originalMemes from './memes.json' with { type: 'json' }
import importedMemes from './importedMemes.json' with { type: 'json' }
import defaultImportedIds from '../../scripts/meme-defaults.json' with { type: 'json' }
import savedProfiles from './profileDefaults.json' with { type: 'json' }
import { BUILT_IN_GESTURE_KINDS, validateGestureProfile, type PoseKind, type GestureProfile } from '../tracking/gestureProfile.ts'
import type { MemeProfile } from '@mimic/core'

interface BundledMeme extends MemeProfile {
  poseKind?: PoseKind
  gestureProfile?: GestureProfile | null
  name: string
  image: string
  alt: string
  expressionLabel: string
  profileSource: string
  notes: string
  headPose: null
  source: { pageUrl: string; imageUrl: string; [key: string]: string | null } | null
}

// Keep the profiles currently selected for this site as its shipped defaults.
// Removed imports stay out of future builds and syncs unless deliberately restored here.
export const DEFAULT_IMPORTED_MEME_IDS = new Set<string>(defaultImportedIds)

// One registry lets imported profiles share the existing persistence/backup behavior.
const builtInMemes: BundledMeme[] = [
  ...originalMemes,
  ...importedMemes.filter(({ id }) => DEFAULT_IMPORTED_MEME_IDS.has(id)),
].map(meme => {
  const saved = savedProfiles[meme.id]
  const gestureProfile = saved?.gestureProfile ? validateGestureProfile(saved.gestureProfile) : null
  return {
    ...meme, ...saved,
    poseKind: BUILT_IN_GESTURE_KINDS[meme.id] ?? saved?.poseKind ?? 'face',
    gestureProfile,
    handsTrained: Boolean(gestureProfile),
  }
})
export default builtInMemes
