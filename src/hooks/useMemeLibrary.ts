import { useEffect, useMemo, useState } from 'react'
import builtInMemes from '../data/builtInMemes.ts'
import { deleteCustomMeme, loadCustomMemes, loadHiddenBuiltIns, loadProfileOverrides, saveCustomMeme, saveCustomMemeBatch, saveHiddenBuiltIns, saveProfileOverrides } from '../data/memeLibrary.ts'

import { readCameraPreferences, writeCameraPreferences } from '../data/cameraPreferences.ts'
import { createProfileBackup, validateProfileBackup } from '../data/profileTransfer.ts'

const MIGRATED_CUSTOM_IDS = new Set(['custom-01ba68e3-a370-40be-9e07-e26c6c70fe20'])
const BUILT_IN_BY_ID = new Map(builtInMemes.map((meme) => [meme.id, meme]))

function hasSameFeatures(left, right) {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])
  return [...keys].every((key) => left?.[key] === right?.[key])
}

function normalizeOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.features && typeof value.features === 'object' && !Array.isArray(value.features)) return value
  return { features: value }
}

export default function useMemeLibrary() {
  const [customMemes, setCustomMemes] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => loadHiddenBuiltIns().filter((id) => BUILT_IN_BY_ID.has(id)))
  const [profileOverrides, setProfileOverrides] = useState(() => Object.fromEntries(
    Object.entries(loadProfileOverrides()).filter(([id, value]) => {
      const builtIn = BUILT_IN_BY_ID.get(id)
      if (!builtIn) return false
      const override = normalizeOverride(value)
      if (!override) return false
      return !hasSameFeatures(override.features, builtIn.features) ||
        (override.handFeatures && !hasSameFeatures(override.handFeatures, builtIn.handFeatures)) ||
        override.poseKind !== undefined || override.gestureProfile !== undefined
    }).map(([id, value]) => [id, normalizeOverride(value)]),
  ))
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let current = true
    loadCustomMemes()
      .then(async (records) => {
        const migrated = records.filter(({ id }) => MIGRATED_CUSTOM_IDS.has(id))
        await Promise.all(migrated.map(({ id }) => deleteCustomMeme(id)))
        if (current) { setCustomMemes(records.filter(({ id }) => !MIGRATED_CUSTOM_IDS.has(id))); setReady(true) }
      })
      .catch(() => { if (current) setError('Saved custom memes could not be loaded in this browser.') })

    return () => { current = false }
  }, [])

  useEffect(() => {
    try {
      saveHiddenBuiltIns(hiddenIds)
      saveProfileOverrides(profileOverrides)
    } catch { setError('Library settings could not be saved. Browser storage may be full or unavailable.') }
  }, [hiddenIds, profileOverrides])

  const memes = useMemo(() => [
    ...builtInMemes
      .filter(({ id }) => !hiddenIds.includes(id))
      .map((meme) => {
        const override = profileOverrides[meme.id]
        return override ? {
          ...meme,
          features: override.features,
          handFeatures: override.poseKind==='face' ? undefined : override.handFeatures ?? meme.handFeatures,
          browserTrained: true,
          poseKind: override.poseKind ?? meme.poseKind,
          gestureProfile: override.gestureProfile !== undefined ? override.gestureProfile : meme.gestureProfile,
          handsTrained: Boolean(override.gestureProfile !== undefined ? override.gestureProfile : meme.gestureProfile),
        } : meme
      }),
    ...customMemes,
  ], [customMemes, hiddenIds, profileOverrides])

  async function addMeme(meme) {
    await saveCustomMeme(meme)
    setCustomMemes((current) => [...current.filter(({ id }) => id !== meme.id), meme])
    setError('')
  }

  async function removeMeme(id) {
    if (id.startsWith('custom-')) {
      await deleteCustomMeme(id)
      setCustomMemes((current) => current.filter((meme) => meme.id !== id))
    } else {
      setHiddenIds((current) => {
        const next = [...new Set([...current, id])]
        saveHiddenBuiltIns(next)
        return next
      })
    }
    setError('')
  }

  function restoreBuiltIns() {
    saveHiddenBuiltIns([])
    setHiddenIds([])
  }

  async function updateMemeFeatures(id, features, handFeatures, poseKind, gestureProfile) {
    if (id.startsWith('custom-')) {
      const meme = customMemes.find((entry) => entry.id === id)
      if (!meme) throw new Error('That custom meme is no longer available.')
      const updated = {
        ...meme,
        features,
        handFeatures, poseKind, gestureProfile,
        browserTrained: true,
        handsTrained: Boolean(gestureProfile),
      }
      await saveCustomMeme(updated)
      setCustomMemes((current) => current.map((entry) => entry.id === id ? updated : entry))
    } else {
      const next = { ...profileOverrides, [id]: { features, handFeatures, poseKind, gestureProfile } }
      // Persist before publishing the state so a failed write leaves the previous profile intact.
      saveProfileOverrides(next)
      setProfileOverrides(next)
    }
    setError('')
  }

  function resetMemeFeatures(id) {
    const next = { ...profileOverrides }
    delete next[id]
    saveProfileOverrides(next)
    setProfileOverrides(next)
    return BUILT_IN_BY_ID.get(id)
  }

  function exportProfiles() {
    // Include hidden profiles too, so hiding one never loses its trained vector.
    return createProfileBackup([
      ...builtInMemes.map((meme) => ({ ...meme, ...profileOverrides[meme.id] })), ...customMemes,
    ], hiddenIds, readCameraPreferences())
  }

  async function importProfiles(input) {
    if (!ready) throw new Error('Wait for your library to finish loading before importing.')
    const backup = validateProfileBackup(input, builtInMemes)
    const supportedProfiles = backup.profiles.filter((m) =>
      BUILT_IN_BY_ID.has(m.id) || !m.id.startsWith('memegen-'))
    const nextOverrides = { ...profileOverrides }
    for (const meme of supportedProfiles.filter((m) => BUILT_IN_BY_ID.has(m.id))) {
      nextOverrides[meme.id] = { features: meme.features, handFeatures: meme.handFeatures, poseKind: meme.poseKind, gestureProfile: meme.gestureProfile }
    }
    const incoming = supportedProfiles.filter((m) => !BUILT_IN_BY_ID.has(m.id))
    const nextHidden = [...new Set([
      ...hiddenIds,
      ...backup.hiddenBuiltInIds.filter((id) => BUILT_IN_BY_ID.has(id)),
    ])]
    const oldPreferences = readCameraPreferences()
    try {
      if (backup.preferences) writeCameraPreferences({ ...oldPreferences, ...backup.preferences })
      saveHiddenBuiltIns(nextHidden)
      saveProfileOverrides(nextOverrides)
      await saveCustomMemeBatch(incoming)
    } catch (cause) {
      writeCameraPreferences(oldPreferences)
      saveHiddenBuiltIns(hiddenIds)
      saveProfileOverrides(profileOverrides)
      throw cause
    }
    setHiddenIds(nextHidden); setProfileOverrides(nextOverrides)
    setCustomMemes((current) => [...current.filter((m) => !incoming.some((n) => n.id === m.id)), ...incoming])
    setError('')
    if (backup.preferences) window.dispatchEvent(new Event('mirror-preferences-imported'))
    return {count:supportedProfiles.length, skipped:backup.skippedRetiredIds.length}
  }

  return { ready, exportProfiles, importProfiles, memes, addMeme, removeMeme, restoreBuiltIns, updateMemeFeatures, resetMemeFeatures, hiddenCount: hiddenIds.length, error }
}
