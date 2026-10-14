import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const builtDist = fileURLToPath(new URL('../../dist', import.meta.url))
export const builtBin = join(builtDist, 'bin.js')

export interface CliResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

export interface Sandbox {
  readonly root: string
  readonly home: string
  readonly cwd: string
  remove(): void
}

export function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'omne-cli-'))
  const home = join(root, 'home')
  const cwd = join(root, 'cwd')
  mkdirSync(home)
  mkdirSync(cwd)
  return { root, home, cwd, remove: () => rmSync(root, { recursive: true, force: true }) }
}

export function runCli(
  sandbox: Sandbox,
  argv: readonly string[],
  options: { readonly omneHome?: string; readonly bin?: string } = {},
): CliResult {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: sandbox.home }
  if (options.omneHome !== undefined) env.OMNE_HOME = options.omneHome
  const result = spawnSync(process.execPath, [options.bin ?? builtBin, ...argv], {
    cwd: sandbox.cwd,
    env,
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
