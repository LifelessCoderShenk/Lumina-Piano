import { spawn } from 'node:child_process'
import type { SpawnOptionsWithoutStdio } from 'node:child_process'

export function spawnProcess(
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
) {
  return spawn(command, args, options ?? {})
}
