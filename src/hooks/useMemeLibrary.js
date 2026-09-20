import { useEffect, useMemo, useState } from 'react'
import builtInMemes from '../data/memes.json'
import { deleteCustomMeme, loadCustomMemes, loadHiddenBuiltIns, loadProfileOverrides, saveCustomMeme, saveHiddenBuiltIns, saveProfileOverrides } from '../data/memeLibrary.js'

const MIGRATED_CUSTOM_IDS = new Set(['custom-01ba68e3-a370-40be-9e07-e26c6c70fe20'])
const BUILT_IN_BY_ID = new Map(builtInMemes.map((meme) => [meme.id, meme]))

function hasSameFeatures(left, right) {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])
  return [...keys].every((key) => left?.[key] === right?.[key])
}

export default function useMemeLibrary() {
  const [customMemes, setCustomMemes] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => loadHiddenBuiltIns().filter((id) => BUILT_IN_BY_ID.has(id)))
  const [profileOverrides, setProfileOverrides] = useState(() => Object.fromEntries(
    Object.entries(loadProfileOverrides()).filter(([id, features]) => {
      const builtIn = BUILT_IN_BY_ID.get(id)
      return builtIn && !hasSameFeatures(features, builtIn.features)
    }),
  ))
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    loadCustomMemes()
      .then(async (records) => {
        const migrated = records.filter(({ id }) => MIGRATED_CUSTOM_IDS.has(id))
        await Promise.all(migrated.map(({ id }) => deleteCustomMeme(id)))
        if (current) setCustomMemes(records.filter(({ id }) => !MIGRATED_CUSTOM_IDS.has(id)))
      })
      .catch(() => { if (current) setError('Saved custom memes could not be loaded in this browser.') })

    return () => { current = false }
  }, [])

  useEffect(() => {
    saveHiddenBuiltIns(hiddenIds)
    saveProfileOverrides(profileOverrides)
  }, [hiddenIds, profileOverrides])

  const memes = useMemo(() => [
    ...builtInMemes
      .filter(({ id }) => !hiddenIds.includes(id))
      .map((meme) => profileOverrides[meme.id]
        ? { ...meme, features: profileOverrides[meme.id], browserTrained: true }
        : meme),
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

  async function updateMemeFeatures(id, features) {
    if (id.startsWith('custom-')) {
      const meme = customMemes.find((entry) => entry.id === id)
      if (!meme) throw new Error('That custom meme is no longer available.')
      const updated = { ...meme, features, browserTrained: true }
      await saveCustomMeme(updated)
      setCustomMemes((current) => current.map((entry) => entry.id === id ? updated : entry))
    } else {
      setProfileOverrides((current) => {
        const next = { ...current, [id]: features }
        saveProfileOverrides(next)
        return next
      })
    }
    setError('')
  }

  function resetMemeFeatures(id) {
    setProfileOverrides((current) => {
      const next = { ...current }
      delete next[id]
      saveProfileOverrides(next)
      return next
    })
  }

  return { memes, addMeme, removeMeme, restoreBuiltIns, updateMemeFeatures, resetMemeFeatures, hiddenCount: hiddenIds.length, error }
}
