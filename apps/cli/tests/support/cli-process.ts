import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-cli-')))
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
  // `os.homedir()` reads HOME on POSIX and USERPROFILE on Windows. Both point at the sandbox, so a
  // child that creates the default state directory creates it there and the test can see it.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: sandbox.home,
    USERPROFILE: sandbox.home,
  }
  if (options.omneHome !== undefined) env.OMNE_HOME = options.omneHome
  const result = spawnSync(process.execPath, [options.bin ?? builtBin, ...argv], {
    cwd: sandbox.cwd,
    env,
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

export interface AsyncOptions {
  readonly omneHome?: string
  readonly omneServer?: string
  readonly stdin?: string
}

/** Spawns the built bin without blocking this process, so an HTTP server in this process can answer it. */
export function runCliAsync(
  sandbox: Sandbox,
  argv: readonly string[],
  options: AsyncOptions = {},
): Promise<CliResult> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: sandbox.home,
    USERPROFILE: sandbox.home,
  }
  // Windows sockets need the system directory; it carries no state of this repository.
  if (process.env.SystemRoot !== undefined) env.SystemRoot = process.env.SystemRoot
  if (options.omneHome !== undefined) env.OMNE_HOME = options.omneHome
  if (options.omneServer !== undefined) env.OMNE_SERVER = options.omneServer
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [builtBin, ...argv], { cwd: sandbox.cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', status => resolve({ status, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(options.stdin ?? '')
  })
}
