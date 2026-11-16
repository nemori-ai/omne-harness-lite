import { spawn } from 'node:child_process'

export function spawnFilesHelper(executable: string) {
  return spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] })
}
