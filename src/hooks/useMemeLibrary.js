import { useEffect, useMemo, useState } from 'react'
import builtInMemes from '../data/memes.json'
import { deleteCustomMeme, loadCustomMemes, loadHiddenBuiltIns, loadProfileOverrides, saveCustomMeme, saveHiddenBuiltIns, saveProfileOverrides } from '../data/memeLibrary.js'

export default function useMemeLibrary() {
  const [customMemes, setCustomMemes] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => loadHiddenBuiltIns())
  const [profileOverrides, setProfileOverrides] = useState(() => loadProfileOverrides())
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    loadCustomMemes()
      .then((records) => { if (current) setCustomMemes(records) })
      .catch(() => { if (current) setError('Saved custom memes could not be loaded in this browser.') })
    return () => { current = false }
  }, [])

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
