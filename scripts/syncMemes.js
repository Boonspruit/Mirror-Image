import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join, extname, basename } from 'node:path'
import { mkdir, readFile, readdir, writeFile, access, copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { EXPRESSION_FEATURES } from '@mimic/core/tracking/featureExtractor'
import { imageHash, sourceId, validateAnalysis, isAnimated, publishManifest, retainPreviousProfiles, EXCLUDED_MEME_TEMPLATES, isExcludedMemeId } from './memeImport.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = JSON.parse(await readFile(join(root, 'scripts/memegen-source.json'), 'utf8'))
const defaultImportedIds = new Set(JSON.parse(await readFile(join(root, 'scripts/meme-defaults.json'), 'utf8')))
if (!/^[\w-]+\/[\w-]+$/.test(source.repository) || !/^[a-f0-9]{40}$/.test(source.revision)) {
  throw new Error('Expected a GitHub repository and a pinned 40-character revision.')
}
// Keep bulk source files outside cloud-synced Documents and the watched project.
const cache = join(tmpdir(), 'mirror-image-memes-sync', source.revision)
await mkdir(cache, { recursive: true })
const archivePath = join(cache, 'source.tar.gz')
const unpacked = join(cache, 'source')
const archiveUrl = `https://codeload.github.com/${source.repository}/tar.gz/${source.revision}`
try {
  await access(join(cache, 'complete'))
} catch {
  console.log(`Downloading ${source.repository} at ${source.revision}…`)
  const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}. Previous collection preserved.`)
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
  await rm(unpacked, { recursive: true, force: true })
  await mkdir(unpacked, { recursive: true })
  await promisify(execFile)('tar', ['-xzf', archivePath, '--strip-components=1', '-C', unpacked])
  await writeFile(join(cache, 'complete'), source.revision)
}

// Only the name and source scalar fields are needed; no YAML is executed.
function scalar(text, key) {
  const value = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
  if (value.startsWith('"')) { try { return JSON.parse(value) } catch { return value } }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  return value
}

const existing = JSON.parse(await readFile(join(root, 'src/data/memes.json'), 'utf8'))
const previous = JSON.parse(await readFile(join(root, 'src/data/importedMemes.json'), 'utf8'))
const seen = new Set()
for (const meme of existing) {
  seen.add(imageHash(await readFile(join(root, 'public', meme.image))))
}
const records = []
const candidates = []
const templatesDir = join(unpacked, 'templates')
for (const template of (await readdir(templatesDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!template.isDirectory() || template.name.startsWith('_')) continue
  const directory = join(templatesDir, template.name)
  const config = await readFile(join(directory, 'config.yml'), 'utf8')
  for (const file of (await readdir(directory)).sort()) {
    const extension = extname(file).toLowerCase()
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) continue
    const id = sourceId(template.name, file)
    if (!defaultImportedIds.has(id)) {
      records.push({ id, template: template.name, file, status: 'excluded', reason: 'removed-from-default-library' })
      continue
    }
    if (EXCLUDED_MEME_TEMPLATES.has(template.name)) {
      records.push({ id, template: template.name, file, status: 'excluded', reason: 'president-meme' })
      continue
    }
    const path = join(directory, file)
    const bytes = await readFile(path)
    const hash = imageHash(bytes)
    const record = { id: sourceId(template.name, file), template: template.name, file, hash }
    if (isAnimated(bytes, extension)) {
      records.push({ ...record, status: 'skipped', reason: 'animated-image' }); continue
    }
    if (seen.has(hash)) {
      records.push({ ...record, status: 'skipped', reason: 'duplicate-image' }); continue
    }
    seen.add(hash)
    candidates.push({ ...record, path, name: scalar(config, 'name') || template.name,
      pageUrl: scalar(config, 'source'), rights: scalar(config, 'license') || 'Image rights not specified by upstream.' })
  }
}

const profiles = []
let browser
const viteCache = await mkdtemp(join(tmpdir(), 'mirror-meme-sync-'))
function addSyncRoutes(server) {
server.middlewares.use('/__meme_sync_session__', (_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!doctype html><title>Meme image analysis</title>
    <script type="module">
      import { createImageAnalyzer } from '/scripts/analyzeMeme.js';
      window.analyzerReady = createImageAnalyzer().then((analyzer) => {
        window.analyzeMeme = (url) => analyzer.analyze(url);
        window.closeAnalyzer = () => analyzer.close();
      }).catch((error) => { window.analyzerError = String(error); });
    </script>`)
})
server.middlewares.use('/__meme_sync__', async (request, response) => {
  const index = Number(request.url?.slice(1))
  const item = Number.isInteger(index) ? candidates[index] : null
  if (!item) { response.statusCode = 404; response.end(); return }
  try {
    response.setHeader('Content-Type', { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(item.path).toLowerCase()])
    response.end(await readFile(item.path))
  } catch { response.statusCode = 500; response.end() }
})
}
// A failed source download should not initialize the browser/build toolchain.
const [{ chromium }, { createServer }] = await Promise.all([import('@playwright/test'), import('vite')])
const server = await createServer({ root, configFile: false, cacheDir: viteCache,
  plugins: [{ name: 'meme-sync-routes', configureServer: addSyncRoutes }],
  optimizeDeps: { noDiscovery: true, include: ['@mediapipe/tasks-vision', '@mimic/core/tracking/featureExtractor'] },
  server: { host: '127.0.0.1', port: 0, open: false, watch: null, hmr: false }, logLevel: 'error' })

try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error(`Analyzer: ${error.message}`))
  await page.goto(`${server.resolvedUrls.local[0]}__meme_sync_session__`, { timeout: 90_000 })
  await page.waitForFunction(() => window.analyzeMeme || window.analyzerError, { timeout: 90_000 })
  const initializationError = await page.evaluate(() => window.analyzerError)
  if (initializationError) throw new Error(initializationError)
  const assets = join(root, 'public/memes/imported')
  await mkdir(assets, { recursive: true })
  console.log(`Analyzing ${candidates.length} unique static images…`)
  for (const [index, item] of candidates.entries()) {
    const { id, template, file, hash, name, pageUrl, rights } = item
    const record = { id, template, file, hash }
    try {
      const analysis = await page.evaluate((i) => window.analyzeMeme(`/__meme_sync__/${i}`), index)
      const reason = validateAnalysis(analysis, Object.keys(EXPRESSION_FEATURES))
      if (reason) { records.push({ ...record, status: 'skipped', reason, faces: analysis.faces }); continue }
      const bytes = Buffer.from(analysis.image.split(',')[1], 'base64')
      const filename = `${imageHash(bytes)}.jpg`
      try { await access(join(assets, filename)) }
      catch { await writeFile(join(assets, filename), bytes) }
      const variant = basename(item.file, extname(item.file))
      const variantName = variant === 'default' ? name : `${name} · ${variant.replaceAll('-', ' ')}`
      const displayName = existing.some((m) => m.name === variantName) ? `${variantName} · Imported` : variantName
      profiles.push({ id: item.id, name: displayName, image: `/memes/imported/${filename}`,
        alt: `${displayName} meme`, expressionLabel: 'Automatically analyzed expression',
        profileSource: 'automatic', features: analysis.features, headPose: null,
        notes: 'Expression values extracted from the source image. You can refine them using your camera.',
        source: { pageUrl: `https://github.com/${source.repository}/blob/${source.revision}/templates/${item.template}/${item.file}`,
          originalPageUrl: /^https?:\/\//.test(pageUrl) ? pageUrl : null,
          imageUrl: `https://raw.githubusercontent.com/${source.repository}/${source.revision}/templates/${item.template}/${item.file}`,
          repository: source.repository, revision: source.revision, imageHash: item.hash, rights } })
      records.push({ ...record, status: 'accepted', faces: analysis.faces })
    } catch (error) {
      if (page.isClosed() || /Execution context was destroyed|analyzeMeme is not a function/.test(error.message)) {
        throw new Error('Analyzer interrupted; previous collection was preserved.', { cause: error })
      }
      records.push({ ...record, status: 'skipped', reason: 'analysis-error', error: String(error.message) })
    }
    if ((index + 1) % 50 === 0) console.log(`Processed ${index + 1}/${candidates.length}; accepted ${profiles.length}`)
  }
  await page.evaluate(() => window.closeAnalyzer())
  if (!profiles.length) throw new Error('No usable profiles; previous collection was preserved.')
  // Retain old IDs when upstream removes an image or a new version fails analysis.
  // Otherwise an update could erase hidden choices and camera-trained overrides.
  const collection = retainPreviousProfiles(profiles, previous.filter((meme) =>
    defaultImportedIds.has(meme.id) && !isExcludedMemeId(meme.id)))
  const retainedProfiles = collection.slice(profiles.length).map((meme) => ({ id: meme.id, revision: meme.source.revision }))
  const report = { ...source, archiveUrl, profileCount: collection.length, retainedProfiles,
    candidateCount: candidates.length, records: records.sort((a, b) => a.id.localeCompare(b.id)) }
  await mkdir(join(root, 'docs/memes'), { recursive: true })
  await writeFile(join(root, 'docs/memes/import-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await copyFile(join(unpacked, 'LICENSE.txt'), join(root, 'docs/memes/MEMEGEN-LICENSE.txt'))
  // Images are immutable and written first. Only a complete, nonempty run publishes profiles.
  await publishManifest(join(root, 'src/data/importedMemes.json'), collection)
  console.log(`Imported ${profiles.length} profiles; retained ${retainedProfiles.length} earlier profiles. ${records.length - profiles.length} images skipped. See docs/memes/import-report.json.`)
} finally {
  await browser?.close()
  await server.close()
  await rm(viteCache, { recursive: true, force: true })
}
