import { chmodSync, statSync } from 'node:fs'
import { stat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_DRAIN_DEADLINE_MS,
  DEFAULT_READINESS_TIMEOUT_MS,
  DEFAULT_ROOT_DISPOSAL_DEADLINE_MS,
  DEFAULT_SHUTDOWN_DEADLINE_MS,
} from './operator-defaults.ts'
import { processSecretReader } from './secret-input.ts'
import { localServeInputs } from './serve-local.ts'
import { runSetup } from './setup.ts'
import { watchProcessFalls } from '../process-fall.ts'
import {
  lineWriter,
  recordLineWriter,
  runServe,
  type S0Record,
  type RunServeOptions,
} from '../run.ts'

export class UsageError extends Error {}

export class NotSetUpError extends Error {}

export const BUNDLED_DISTRIBUTION = fileURLToPath(
  new URL('../../config/serve.distribution.json', import.meta.url),
)

export const COMMON_OPTIONS = {
  distribution: { type: 'string' },
  operator: { type: 'string' },
  'readiness-timeout-ms': { type: 'string' },
  'shutdown-deadline-ms': { type: 'string' },
} as const

export const SERVE_OPTIONS = {
  ...COMMON_OPTIONS,
  'drain-deadline-ms': { type: 'string' },
  'root-disposal-deadline-ms': { type: 'string' },
  'state-root': { type: 'string' },
  'stop-on-stdin-close': { type: 'boolean' },
} as const

export type ServeValues = Readonly<{
  [
    K in
      | keyof typeof COMMON_OPTIONS
      | 'state-root'
      | 'drain-deadline-ms'
      | 'root-disposal-deadline-ms'
  ]?: string
}> &
  Readonly<{ 'stop-on-stdin-close'?: boolean }>

export function positiveInt(name: string, text: string | undefined): number {
  if (text === undefined) throw new UsageError(`missing --${name}`)
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UsageError(`--${name} must be a positive integer`)
  }
  return value
}

export async function readJson(name: string, path: string | undefined, required: boolean) {
  if (path === undefined) {
    if (required) throw new UsageError(`missing --${name}`)
    return undefined
  }
  if (!isAbsolute(path)) throw new UsageError(`--${name} must be an absolute path`)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    throw new UsageError(`--${name} cannot be read as JSON: ${(error as Error).message}`)
  }
}

async function stateRoot(path: string | undefined): Promise<string> {
  if (path === undefined) throw new UsageError('missing --state-root')
  if (!isAbsolute(path)) throw new UsageError('--state-root must be an absolute path')
  try {
    if ((await stat(path)).isDirectory()) return path
  } catch {}
  throw new UsageError('--state-root must be an existing directory')
}

export type ServeInputs = Readonly<{
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
  drainDeadlineMs: number
  rootDisposalDeadlineMs: number
  stateRoot: string
  port?: number
}>

export async function serveInputs(values: ServeValues): Promise<ServeInputs> {
  const readinessText = values['readiness-timeout-ms']
  const deadlineText = values['shutdown-deadline-ms']
  const readinessTimeoutMs =
    readinessText === undefined
      ? DEFAULT_READINESS_TIMEOUT_MS
      : positiveInt('readiness-timeout-ms', readinessText)
  const shutdownDeadlineMs =
    deadlineText === undefined
      ? DEFAULT_SHUTDOWN_DEADLINE_MS
      : positiveInt('shutdown-deadline-ms', deadlineText)
  const distribution = await readJson(
    'distribution',
    values.distribution ?? BUNDLED_DISTRIBUTION,
    true,
  )
  const operator = await readJson('operator', values.operator, false)
  const givenRoot = values['state-root']
  const root = givenRoot === undefined ? undefined : await stateRoot(givenRoot)
  const local = localServeInputs({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    needOperator: operator === undefined,
    needStateRoot: root === undefined,
    distribution,
    shutdownDeadlineMs,
  })
  if (local.kind === 'not-set-up') throw new NotSetUpError(local.detail)
  if (local.kind === 'refused') throw new UsageError(local.message)
  const layer = operator ?? local.operator
  const resolvedRoot = root ?? local.stateRoot
  if (resolvedRoot === undefined) throw new UsageError('missing --state-root')
  return {
    distribution,
    ...(layer === undefined ? {} : { operator: layer }),
    readinessTimeoutMs,
    shutdownDeadlineMs,
    drainDeadlineMs:
      values['drain-deadline-ms'] === undefined
        ? DEFAULT_DRAIN_DEADLINE_MS
        : positiveInt('drain-deadline-ms', values['drain-deadline-ms']),
    rootDisposalDeadlineMs:
      values['root-disposal-deadline-ms'] === undefined
        ? DEFAULT_ROOT_DISPOSAL_DEADLINE_MS
        : positiveInt('root-disposal-deadline-ms', values['root-disposal-deadline-ms']),
    stateRoot: resolvedRoot,
    ...(local.kind === 'ready' && local.settings !== undefined
      ? { port: local.settings.port }
      : {}),
  }
}

export const recordWriter = recordLineWriter(process.stdout)
export const stderrWriter = lineWriter(process.stderr)

/** Runs one serve process until a signal, or the end of standard input when asked, stops it. */
export async function serveUntilStopped(
  inputs: ServeInputs,
  stopOnStdinClose: boolean,
  extra: Pick<RunServeOptions, 'time' | 'instance' | 'extraPlugins'> = {},
): Promise<number> {
  const { port, ...rest } = inputs
  const controller = new AbortController()
  const keepAlive = setInterval(() => {}, 1 << 30)
  const requestStop = (reason: string) => controller.abort(reason)
  const onSigint = () => requestStop('SIGINT')
  const onSigterm = () => requestStop('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  if (stopOnStdinClose) {
    process.stdin.once('end', () => requestStop('stdin closed'))
    process.stdin.once('close', () => requestStop('stdin closed'))
    process.stdin.resume()
  }
  const announce = (record: S0Record) => {
    recordWriter(record)
    if (port !== undefined && record.kind === 'startup-result' && record['accepting'] === true)
      stderrWriter(`serve: accepting on http://127.0.0.1:${port}`)
  }
  const unwatch = watchProcessFalls(inputs.stateRoot)
  try {
    const result = await runServe({
      ...rest,
      ...extra,
      stop: controller.signal,
      write: announce,
      stderr: stderrWriter,
    })
    return result.exitCode
  } finally {
    unwatch()
    clearInterval(keepAlive)
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    if (stopOnStdinClose) process.stdin.destroy()
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function setupCommand(argv: readonly string[]): Promise<number> {
  return runSetup(
    argv,
    {
      stdout: text => process.stdout.write(text),
      stderr: text => process.stderr.write(text),
    },
    {
      platform: process.platform,
      env: process.env,
      home: homedir(),
      cwd: process.cwd(),
      readSecret: processSecretReader(process.stdin, process.stderr),
      ...(process.platform === 'win32' ? {} : { chmod: chmodSync }),
      isFile,
    },
  )
}
