// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const failures = vi.hoisted(() => ({ rename: false, write: false }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (failures.rename) throw new Error('Replacement denied')
      return actual.rename(...args)
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (failures.write) handle.writeFile = async () => { throw new Error('Disk full') }
      return handle
    },
  }
})
import { atomicWrite } from './atomicWrite'
const directories: string[] = []
afterEach(async () => {
  failures.rename = false; failures.write = false
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'lumina-save-test-'))
  directories.push(dir)
  const file = path.join(dir, 'piece.lumina')
  await writeFile(file, 'original')
  return { dir, file }
}
it('replaces a saved project and leaves no temporary files', async () => {
  const { dir, file } = await fixture()
  await atomicWrite(file, new TextEncoder().encode('updated'))
  expect(await readFile(file, 'utf8')).toBe('updated')
  expect(await readdir(dir)).toEqual(['piece.lumina'])
})
it.each(['write', 'rename'] as const)('preserves the previous save when %s fails', async (failure) => {
  const { dir, file } = await fixture()
  failures[failure] = true
  await expect(atomicWrite(file, new TextEncoder().encode('updated'))).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('original')
  expect(await readdir(dir)).toEqual(['piece.lumina'])
})
