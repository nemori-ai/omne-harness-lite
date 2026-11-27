import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statfsSync } from 'node:fs'
import type { Sources } from './field.ts'

const orNull = <T>(take: () => T): T | null => {
  try {
    return take()
  } catch {
    return null
  }
}

/** The machine this process runs on. */
export const hostSources: Sources = {
  platform: process.platform,
  architecture: process.arch,
  read: path => orNull(() => readFileSync(path, 'utf8')),
  list: path => orNull(() => readdirSync(path)),
  resolve: path => orNull(() => realpathSync(path)),
  run: (command, args) =>
    orNull(() =>
      execFileSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
    ),
  used: path =>
    orNull(() => {
      const stat = statfsSync(path)
      return stat.blocks === 0 ? 0 : 1 - stat.bavail / stat.blocks
    }),
}
