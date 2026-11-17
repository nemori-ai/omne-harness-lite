import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from '@typescript/typescript6'

export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const fold = (name: string) => (process.platform === 'win32' ? name.toUpperCase() : name)
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    const name = fold(key)
    if (name === fold('NODE_PATH') || name === fold('NODE_OPTIONS')) continue
    if (!name.startsWith(fold('npm_config_'))) env[key] = value
  }
  return { ...env, ...extra }
}

// pnpm is the one that runs this test (npm_execpath). The consumer pins no pnpm, so a pnpm on PATH
// would be whatever the machine has; there is no fallback to it.
function commandLine(command: string, args: readonly string[]): [string, readonly string[]] {
  if (command !== 'pnpm') return [command, args]
  const entry = process.env['npm_execpath']
  if (entry === undefined || entry === '')
    throw new Error(
      'npm_execpath is not set: run the tests through pnpm (pnpm exec vitest, pnpm run test) so that the pinned pnpm is known',
    )
  return /\.[cm]?js$/u.test(entry) ? [process.execPath, [entry, ...args]] : [entry, args]
}

export function exec(
  command: string,
  args: readonly string[],
  cwd: string,
  extra?: Record<string, string>,
  timeoutMs?: number,
) {
  const [file, argv] = commandLine(command, args)
  const result = spawnSync(file, argv, {
    cwd,
    env: childEnv(extra),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
  })
  return {
    status: result.status ?? -1,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function tail(text: string): string {
  return text.trim().split('\n').slice(-4).join(' | ')
}

export function diagnostics(output: string): string {
  return output
    .split('\n')
    .filter(line => line.includes('error TS'))
    .slice(0, 4)
    .join(' | ')
}

export function compilerCommand(): string {
  const root = dirname(
    createRequire(import.meta.url).resolve('@typescript/typescript6/package.json'),
  )
  return join(root, 'lib', 'tsc.js')
}

export function libraryRoot(): string {
  return dirname(ts.getDefaultLibFilePath({}))
}
