// Child processes of the install-closure facility, and the TypeScript compiler that it owns. A
// member does not depend on the compiler: the facility brings its own.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import ts from '@typescript/typescript6'

/**
 * Child processes get no NODE_PATH, no inherited npm configuration and no Node options. Windows
 * variable names are case-insensitive and can arrive as `NPM_CONFIG_REGISTRY`, so there the names
 * are compared without case.
 */
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

/**
 * The pnpm entry that Node can start on Windows. There `pnpm` on PATH is `pnpm.cmd` and a shell shim,
 * which Node cannot start without a shell; the entry is `node_modules/pnpm/bin/pnpm.cjs` next to
 * `pnpm.cmd` (the npm global layout), run with this process's Node. A missing entry is an error.
 */
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

/** The command line that starts `command`; only `pnpm` on Windows differs from the arguments. */
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
    /** Set when the process was killed, for example at the time limit. */
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

/** The command line of the compiler, ready to run with `process.execPath`. */
export function compilerCommand(): string {
  const root = dirname(
    createRequire(import.meta.url).resolve('@typescript/typescript6/package.json'),
  )
  return join(root, 'lib', 'tsc.js')
}

/** The directory that holds the compiler's own library declarations. */
export function libraryRoot(): string {
  return dirname(ts.getDefaultLibFilePath({}))
}
