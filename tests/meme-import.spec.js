import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { imageHash, sourceId, validateAnalysis, isAnimated, publishManifest, retainPreviousProfiles } from '../scripts/memeImport.js'
import { EXPRESSION_FEATURES } from '../src/tracking/featureExtractor.ts'

const names = Object.keys(EXPRESSION_FEATURES)
const features = Object.fromEntries(names.map((key) => [key, .25]))

test('imports require exactly one face and every expression score', () => {
  expect(validateAnalysis({ faces: 1, features }, names)).toBeNull()
  expect(validateAnalysis({ faces: 0, features }, names)).toBe('no-face')
  expect(validateAnalysis({ faces: 2, features }, names)).toBe('multiple-faces')
  for (const bad of [null, NaN, Infinity, -1, 2, undefined]) {
    expect(validateAnalysis({ faces: 1, features: { ...features, smile: bad } }, names)).toBe('incomplete-features')
  }
})

test('source IDs and content hashes are repeatable without variant collisions', () => {
  expect(sourceId('drake', 'yes.jpg')).toBe('memegen-drake-yes-jpg')
  expect(sourceId('drake', 'yes.jpg')).not.toBe(sourceId('drake', 'yes.png'))
  const seen = new Set([imageHash(Buffer.from('image'))])
  expect(seen.has(imageHash(Buffer.from('image')))).toBe(true)
  expect(seen.has(imageHash(Buffer.from('different image')))).toBe(false)
})

test('animated formats are rejected before single-frame analysis', () => {
  expect(isAnimated(Buffer.from('GIF89a'), '.gif')).toBe(true)
  expect(isAnimated(Buffer.from('png acTL data'), '.png')).toBe(true)
  expect(isAnimated(Buffer.from('RIFF ANIM'), '.webp')).toBe(true)
  expect(isAnimated(Buffer.from('jpeg'), '.jpg')).toBe(false)
})

test('updates keep earlier IDs when an image disappears or fails analysis', () => {
  const previous = [{ id: 'a', features }, { id: 'b', features }]
  const updated = { id: 'a', features: { ...features, smile: .9 } }
  expect(retainPreviousProfiles([updated], previous)).toEqual([updated, previous[1]])
  expect(previous[0].features.smile).toBe(.25)
})

test('failed publication preserves the last manifest and repeats are identical', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meme-import-'))
  const path = join(directory, 'manifest.json')
  try {
    await writeFile(path, 'previous valid manifest')
    await expect(publishManifest(path, [])).rejects.toThrow('preserved')
    expect(await readFile(path, 'utf8')).toBe('previous valid manifest')
    const profiles = [{ id: sourceId('drake', 'yes.jpg'), features }]
    await publishManifest(path, profiles)
    const first = await readFile(path, 'utf8')
    await publishManifest(path, profiles)
    expect(await readFile(path, 'utf8')).toBe(first)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a source download failure leaves the installed collection and report intact', async () => {
  test.setTimeout(120_000)
  const root = fileURLToPath(new URL('../', import.meta.url))
  const manifest = join(root, 'src/data/importedMemes.json')
  const report = join(root, 'docs/memes/import-report.json')
  const before = [await readFile(manifest, 'utf8'), await readFile(report, 'utf8')]
  const directory = await mkdtemp(join(tmpdir(), 'meme-download-failure-'))
  try {
    const run = promisify(execFile)(process.execPath, ['--input-type=module', '-e',
      "globalThis.fetch = async () => ({ ok: false, status: 503 }); await import('./scripts/syncMemes.js');"],
    { cwd: root, env: { ...process.env, TMPDIR: directory }, timeout: 90_000 })
    await expect(run).rejects.toThrow('Source download failed: HTTP 503')
    expect([await readFile(manifest, 'utf8'), await readFile(report, 'utf8')]).toEqual(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
