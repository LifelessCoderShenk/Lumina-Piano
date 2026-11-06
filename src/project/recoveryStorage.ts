import { parseLuminaProject, serializeLuminaProject, type LuminaProjectDocument } from './luminaProject'

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lumina-create-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('workspace')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other Lumina windows to enable recovery.'))
  })
}
export async function readRecovery(): Promise<LuminaProjectDocument | null> {
  const db = await database()
  try {
    const text = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('workspace').objectStore('workspace').get('current')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return text == null ? null : parseLuminaProject(String(text))
  } finally { db.close() }
}
export async function writeRecovery(document: LuminaProjectDocument | null): Promise<void> {
  const text = document == null ? null : serializeLuminaProject(document)
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite')
      const store = transaction.objectStore('workspace')
      if (text == null) store.delete('current')
      else store.put(text, 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('Recovery save was interrupted.'))
    })
  } finally { db.close() }
}
