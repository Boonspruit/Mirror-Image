const DATABASE_NAME = 'mirror-image-library'
const STORE_NAME = 'custom-memes'
const HIDDEN_KEY = 'mirror-image-hidden-builtins'
const OVERRIDES_KEY = 'mirror-image-profile-overrides'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => {
      database.close()
      resolve(request.result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export const loadCustomMemes = () => runTransaction<import('@mimic/core').MemeProfile[]>('readonly', (store) => store.getAll())
export const saveCustomMeme = (meme) => runTransaction('readwrite', (store) => store.put(meme))
export const deleteCustomMeme = (id) => runTransaction('readwrite', (store) => store.delete(id))

export function loadHiddenBuiltIns() {
  try {
    const ids = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveHiddenBuiltIns(ids) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(ids)]))
}

export function loadProfileOverrides() {
  try {
    const overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}')
    return overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}
  } catch {
    return {}
  }
}

export function saveProfileOverrides(overrides) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
}

export async function prepareMemeImage(file, maxDimension = 1000) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) throw new TypeError('Choose an image file.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

export async function saveCustomMemeBatch(memes) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    for (const meme of memes) transaction.objectStore(STORE_NAME).put(meme)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('The profile import was cancelled.')) }
    transaction.onerror = () => { /* onabort reports failures after rollback. */ }
  })
}
