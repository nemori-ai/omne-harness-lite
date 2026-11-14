import { spawnSync } from 'node:child_process'

export function shortNameOf(path: string): string {
  const ran = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${path}") do @echo %~sI"`], {
    windowsVerbatimArguments: true,
    encoding: 'utf8',
  })
  const found = ran.stdout.trim()
  if (ran.status !== 0 || found === '') throw new Error(`cmd gave no short name for ${path}`)
  return found
}
