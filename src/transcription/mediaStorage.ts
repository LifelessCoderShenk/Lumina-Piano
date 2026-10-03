import type { MediaSegment, TakeCollection, TranscriptionMediaKind } from './types'
import { validNote } from './session'
export interface RecordedMediaAsset { id: string; inputId?: string; kind?: TranscriptionMediaKind; name?: string; blob: Blob; hasMicrophone: boolean; durationMs: number }
export type RecordedCameraTake = RecordedMediaAsset
export interface ResolvedMediaSegment extends MediaSegment { source: RecordedMediaAsset }
const DATABASE = 'lumina-transcription-media'
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('takes')) request.result.createObjectStore('takes')
      if (!request.result.objectStoreNames.contains('collections')) request.result.createObjectStore('collections')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function saveCameraTake(take: RecordedCameraTake): Promise<void> {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('takes', 'readwrite')
      transaction.objectStore('takes').put(take, take.id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
export const saveMediaAsset = saveCameraTake
export async function readCameraTake(id: string): Promise<RecordedCameraTake | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const store = db.transaction('takes').objectStore('takes')
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result?.id === id) { resolve(request.result); return }
        const legacy = store.get('last')
        legacy.onsuccess = () => resolve(legacy.result?.id === id ? legacy.result : null)
        legacy.onerror = () => reject(legacy.error)
      }
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export const readMediaAsset = readCameraTake

export async function readTakeCollection(): Promise<TakeCollection | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('collections').objectStore('collections').get('current')
      request.onsuccess = () => {
        const value = request.result as TakeCollection | undefined
        if (!value) { resolve(null); return }
        if (value.version !== 2 || !Array.isArray(value.takes) || !value.takes.every((take) => typeof take.id === 'string' && Array.isArray(take.editedNotes) && take.editedNotes.every(validNote) && Array.isArray(take.originalNotes) && take.originalNotes.every(validNote))) { reject(new Error('Saved take collection is invalid.')); return }
        resolve(value)
      }
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export async function saveTakeCollection(collection: TakeCollection): Promise<void> {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('collections', 'readwrite')
      transaction.objectStore('collections').put(collection, 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
