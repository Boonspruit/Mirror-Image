import { createHash } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'

export const imageHash = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const sourceId = (template, file) => `memegen-${template}-${file.replaceAll('.', '-')}`
export const EXCLUDED_MEME_TEMPLATES = new Set(['sad-biden', 'sad-bush', 'sad-clinton', 'sad-obama', 'trump'])
export const isExcludedMemeId = (id) => [...EXCLUDED_MEME_TEMPLATES].some((template) => id.startsWith(`memegen-${template}-`))

export function retainPreviousProfiles(current, previous) {
  const ids = new Set(current.map((meme) => meme.id))
  return [...current, ...previous.filter((meme) => !ids.has(meme.id))]
}

export function validateAnalysis(analysis, featureNames) {
  if (analysis.faces !== 1) return analysis.faces > 1 ? 'multiple-faces' : 'no-face'
  if (!featureNames.every((key) => Number.isFinite(analysis.features?.[key]) &&
    analysis.features[key] >= 0 && analysis.features[key] <= 1)) return 'incomplete-features'
  return null
}

// Recognize animated containers before the browser decodes just their first frame.
export function isAnimated(bytes, extension) {
  if (extension === '.gif') return true
  if (extension === '.png') return bytes.includes(Buffer.from('acTL'))
  if (extension === '.webp') return bytes.includes(Buffer.from('ANIM'))
  return false
}

export async function publishManifest(path, profiles) {
  if (!profiles.length) throw new Error('No usable profiles; previous collection was preserved.')
  const content = `${JSON.stringify(profiles, null, 2)}\n`
  try {
    if (await readFile(path, 'utf8') === content) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const temporary = `${path}.tmp`
  await writeFile(temporary, content)
  await rename(temporary, path)
}
