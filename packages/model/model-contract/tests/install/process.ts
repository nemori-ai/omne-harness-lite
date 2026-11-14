import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
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

function windowsPnpmEntry(): string {
  const seen: string[] = []
  for (const directory of (process.env['PATH'] ?? process.env['Path'] ?? '').split(delimiter)) {
    if (directory === '' || !existsSync(join(directory, 'pnpm.cmd'))) continue
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(entry)) return entry
    seen.push(join(directory, 'pnpm.cmd'))
  }
  throw new Error(
    seen.length === 0
      ? 'no pnpm.cmd on PATH'
      : `no node_modules/pnpm/bin/pnpm.cjs next to ${seen.join(', ')}`,
  )
}

function commandLine(command: string, args: readonly string[]): [string, readonly string[]] {
  if (process.platform !== 'win32' || command !== 'pnpm') return [command, args]
  return [process.execPath, [windowsPnpmEntry(), ...args]]
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
