import defaults from './sitePreferences.json' with { type: 'json' }
import type { MatchingMode } from '../tracking/gestureProfile.ts'
export const CAMERA_PREFERENCES_KEY = 'mirror-image-camera-preferences-v1'
export interface CameraPreferences { showOverlay: boolean; matchingMode: MatchingMode; baseline: any }
export function validatePreferences(value) {
  if (!value || typeof value.showOverlay!=='boolean' || !['auto','face-only'].includes(value.matchingMode)) throw new Error('Invalid matching preferences.')
  return {showOverlay:value.showOverlay,matchingMode:value.matchingMode as MatchingMode}
}
export function readCameraPreferences(): CameraPreferences {
  try {
    const saved=JSON.parse(localStorage.getItem(CAMERA_PREFERENCES_KEY)??'null')
    return {showOverlay: typeof saved?.showOverlay==='boolean' ? saved.showOverlay : defaults.showOverlay,
      matchingMode: ['auto','face-only'].includes(saved?.matchingMode) ? saved.matchingMode : defaults.matchingMode as MatchingMode,
      baseline: saved?.baseline && typeof saved.baseline==='object' && !Array.isArray(saved.baseline) ? saved.baseline : null}
  } catch { return {...defaults,matchingMode:defaults.matchingMode as MatchingMode,baseline:null} }
}
export function writeCameraPreferences(preferences: CameraPreferences) {
  localStorage.setItem(CAMERA_PREFERENCES_KEY,JSON.stringify(preferences))
}
