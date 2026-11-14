import { chmodSync, symlinkSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHIM = pathToFileURL(join(import.meta.dirname, 'gh-shim.ts')).href

export function writeGh(bin: string, script: string): void {
  const gh = join(bin, 'gh')
  writeFileSync(gh, script)
  chmodSync(gh, 0o755)
  if (process.platform === 'win32') symlinkSync(process.execPath, `${gh}.exe`, 'file')
}

export function ghEnv(bin: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const path = { PATH: `${bin}${delimiter}${env['PATH'] ?? ''}` }
  if (process.platform !== 'win32') return path
  const options = env['NODE_OPTIONS']
  return { ...path, NODE_OPTIONS: `${options ? `${options} ` : ''}--import ${SHIM}` }
}

export function stubGhEnv(bin: string, stub: (name: string, value: string) => void): void {
  for (const [name, value] of Object.entries(ghEnv(bin))) if (value !== undefined) stub(name, value)
}
