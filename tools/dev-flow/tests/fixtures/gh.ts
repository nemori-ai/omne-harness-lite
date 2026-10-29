// The `gh` stand-in for cases that run a CLI as a child process. The CLI starts `gh` by name with
// `shell: false`. On POSIX the executable script `bin/gh` answers it. On Windows Node only looks for
// `gh.com` and `gh.exe` on PATH, so the script alone is never found and the installed gh would answer.
// There `bin/gh.exe` is a link to this Node, and gh-shim.ts, preloaded through NODE_OPTIONS, runs
// `bin/gh` in that process with the arguments that gh received.
import { chmodSync, symlinkSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHIM = pathToFileURL(join(import.meta.dirname, 'gh-shim.ts')).href

/** Writes the stand-in `bin/gh` with `script` as its whole text, shebang included. */
export function writeGh(bin: string, script: string): void {
  const gh = join(bin, 'gh')
  writeFileSync(gh, script)
  chmodSync(gh, 0o755)
  if (process.platform === 'win32') symlinkSync(process.execPath, `${gh}.exe`, 'file')
}

/** The variables that put the stand-in in `bin` ahead of any installed gh. */
export function ghEnv(bin: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const path = { PATH: `${bin}${delimiter}${env['PATH'] ?? ''}` }
  if (process.platform !== 'win32') return path
  const options = env['NODE_OPTIONS']
  return { ...path, NODE_OPTIONS: `${options ? `${options} ` : ''}--import ${SHIM}` }
}

/** Sets the variables of `ghEnv` through `stub`, for cases whose own process starts gh. */
export function stubGhEnv(bin: string, stub: (name: string, value: string) => void): void {
  for (const [name, value] of Object.entries(ghEnv(bin))) if (value !== undefined) stub(name, value)
}
