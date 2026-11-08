import { spawn } from 'node:child_process'

/** Every request owns a helper and its pipes until the process closes. */
export function spawnFilesHelper(executable: string) {
  return spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] })
}
