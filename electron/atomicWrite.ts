import { open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

/** Never truncate the last saved project before its replacement is complete. */
export async function atomicWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}
