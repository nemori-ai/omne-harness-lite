import { spawnSync } from 'node:child_process'

/**
 * The 8.3 short spelling of an existing Windows path, as `cmd` gives it with `%~sI`. A segment
 * without a short name keeps its long name, so on a volume with 8.3 names turned off the result
 * equals the input.
 */
export function shortNameOf(path: string): string {
  const ran = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${path}") do @echo %~sI"`], {
    windowsVerbatimArguments: true,
    encoding: 'utf8',
  })
  const found = ran.stdout.trim()
  if (ran.status !== 0 || found === '') throw new Error(`cmd gave no short name for ${path}`)
  return found
}
