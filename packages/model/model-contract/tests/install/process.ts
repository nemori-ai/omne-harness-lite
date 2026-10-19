// Child processes of the install-closure facility, and the TypeScript compiler that it owns. A
// member does not depend on the compiler: the facility brings its own.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from '@typescript/typescript6'

/** Child processes get no NODE_PATH, no inherited npm configuration and no Node options. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env))
    if (key !== 'NODE_PATH' && key !== 'NODE_OPTIONS' && !key.startsWith('npm_config_'))
      env[key] = value
  return { ...env, ...extra }
}

export function exec(
  command: string,
  args: readonly string[],
  cwd: string,
  extra?: Record<string, string>,
  timeoutMs?: number,
) {
  const result = spawnSync(command, args, {
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
