#!/usr/bin/env node
// 进程入口：只解析参数、调用 `runS0`、`runServe` 或 `runSetup`、设置退出码（s0-spec-r2 §2、§10；DP1-C1、C2）。
// 位置参数里有 `serve` 时走真实模式，有 `setup` 时走本机首次配置，否则走 S0 的基线解析路径：`parseArgs` 允许位置参数，
// 子命令可在任意位置，参数、输出、退出码与 stderr 文字与加入 `serve` 之前逐字节相同。`serve` 另加 `--state-root` 与
// `--stop-on-stdin-close`。`serve` 的参数都可省：省掉的取本机单用户档的默认值（src/local/）。
// 退出码：0 就绪且关闭 settled；2 配置、解析或装载前检查失败；3 有 FAILED、启动失败或入口对象安装失败；
// 4 仍有 PENDING 或 LOADING；5 启动为 0 但关闭 incomplete；1 是未预期的内部错误。
import { chmodSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  DEFAULT_READINESS_TIMEOUT_MS,
  DEFAULT_SHUTDOWN_DEADLINE_MS,
} from './local/operator-defaults.ts'
import { processSecretReader } from './local/secret-input.ts'
import { localServeInputs } from './local/serve-local.ts'
import { runSetup } from './local/setup.ts'
import { runS0, runServe, type S0Record } from './run.ts'

class UsageError extends Error {}

/** The host has no complete local setup: one sentence, then the command that fixes it. */
class NotSetUpError extends Error {}

const S0_USAGE =
  'usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>'
const SERVE_USAGE =
  'usage: serve [--distribution <abs json>] [--operator <abs json>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--state-root <abs dir>] [--stop-on-stdin-close]'

/** The distribution that ships with the application: `config/serve.distribution.json`. */
const BUNDLED_DISTRIBUTION = fileURLToPath(
  new URL('../config/serve.distribution.json', import.meta.url),
)

const COMMON_OPTIONS = {
  distribution: { type: 'string' },
  operator: { type: 'string' },
  'readiness-timeout-ms': { type: 'string' },
  'shutdown-deadline-ms': { type: 'string' },
} as const

const SERVE_OPTIONS = {
  ...COMMON_OPTIONS,
  'state-root': { type: 'string' },
  'stop-on-stdin-close': { type: 'boolean' },
} as const

function positiveInt(name: string, text: string | undefined): number {
  if (text === undefined) throw new UsageError(`missing --${name}`)
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UsageError(`--${name} must be a positive integer`)
  }
  return value
}

async function readJson(name: string, path: string | undefined, required: boolean) {
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

/** DP1-C19: only "an existing absolute directory" is checked. Its protection is a documented premise. */
async function stateRoot(path: string | undefined): Promise<string> {
  if (path === undefined) throw new UsageError('missing --state-root')
  if (!isAbsolute(path)) throw new UsageError('--state-root must be an absolute path')
  try {
    if ((await stat(path)).isDirectory()) return path
  } catch {
    // reported below
  }
  throw new UsageError('--state-root must be an existing directory')
}

type Common = Readonly<{
  distribution: unknown
  operator?: unknown
  readinessTimeoutMs: number
  shutdownDeadlineMs: number
}>

async function commonOf(
  subcommand: string,
  values: Readonly<{ [K in keyof typeof COMMON_OPTIONS]?: string }>,
  positionals: readonly string[],
): Promise<Common> {
  if (positionals.length !== 1 || positionals[0] !== subcommand)
    throw new UsageError(`expected subcommand ${subcommand}`)
  const readinessTimeoutMs = positiveInt('readiness-timeout-ms', values['readiness-timeout-ms'])
  const shutdownDeadlineMs = positiveInt('shutdown-deadline-ms', values['shutdown-deadline-ms'])
  const distribution = await readJson('distribution', values.distribution, true)
  const operator = await readJson('operator', values.operator, false)
  return {
    distribution,
    ...(operator === undefined ? {} : { operator }),
    readinessTimeoutMs,
    shutdownDeadlineMs,
  }
}

const write = (record: unknown) => process.stdout.write(`${JSON.stringify(record)}\n`)
const stderr = (line: string) => process.stderr.write(`${line}\n`)

async function mainS0(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: COMMON_OPTIONS,
  })
  const common = await commonOf('s0', values, positionals)
  const result = await runS0({ ...common, write, stderr })
  return result.exitCode
}

type ServeInputs = Common &
  Readonly<{
    stateRoot: string
    /** The loopback port, when the operator layer came from the local settings. */
    port?: number
  }>

/** Every absent flag takes the default of the local single-user profile (SPEC.md「本机单用户档」). */
async function serveInputs(
  values: Readonly<{ [K in keyof typeof COMMON_OPTIONS | 'state-root']?: string }>,
  positionals: readonly string[],
): Promise<ServeInputs> {
  if (positionals.length !== 1 || positionals[0] !== 'serve')
    throw new UsageError('expected subcommand serve')
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
    stateRoot: resolvedRoot,
    ...(local.kind === 'ready' && local.settings !== undefined
      ? { port: local.settings.port }
      : {}),
  }
}

async function mainServe(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: SERVE_OPTIONS,
  })
  const { port, ...inputs } = await serveInputs(values, positionals)

  const controller = new AbortController()
  // Signal listeners do not keep the event loop alive. Without this timer a tree
  // with no open handle reaches the stop wait and exits 13 before any stop request.
  const keepAlive = setInterval(() => {}, 1 << 30)
  const requestStop = (reason: string) => controller.abort(reason)
  const onSigint = () => requestStop('SIGINT')
  const onSigterm = () => requestStop('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  if (values['stop-on-stdin-close'] === true) {
    process.stdin.once('end', () => requestStop('stdin closed'))
    process.stdin.once('close', () => requestStop('stdin closed'))
    process.stdin.resume()
  }
  // With the local settings a person learns the address without reading the records.
  const announce = (record: S0Record) => {
    write(record)
    if (port !== undefined && record.kind === 'startup-result' && record['accepting'] === true)
      stderr(`serve: accepting on http://127.0.0.1:${port}`)
  }
  try {
    const result = await runServe({
      ...inputs,
      stop: controller.signal,
      write: announce,
      stderr,
    })
    return result.exitCode
  } finally {
    clearInterval(keepAlive)
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    if (values['stop-on-stdin-close'] === true) process.stdin.destroy()
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function mainSetup(argv: readonly string[]): Promise<number> {
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

function isUsageError(error: unknown): boolean {
  if (error instanceof UsageError) return true
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')
}

type Subcommand = 'serve' | 'setup' | 's0'

/**
 * `serve` when it is one of the positionals, else `setup` when that is one, else `s0`. The scan is
 * lenient (unknown options never throw), so a malformed call without either still reaches the S0
 * path and fails there with the S0 text.
 */
function selectedSubcommand(argv: readonly string[]): Subcommand {
  try {
    const { positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: false,
      options: SERVE_OPTIONS,
    })
    if (positionals.includes('serve')) return 'serve'
    return positionals.includes('setup') ? 'setup' : 's0'
  } catch {
    return 's0'
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const subcommand = selectedSubcommand(argv)
  if (subcommand === 'setup') {
    try {
      return await mainSetup(argv)
    } catch (error) {
      // Only the name: an unexpected error of the credential step is not printed in full.
      process.stderr.write(
        `setup: internal error: ${error instanceof Error ? error.name : 'Error'}\n`,
      )
      return 1
    }
  }
  const serve = subcommand === 'serve'
  const prefix = serve ? 'serve' : 's0'
  try {
    return serve ? await mainServe(argv) : await mainS0(argv)
  } catch (error) {
    if (error instanceof NotSetUpError) {
      process.stderr.write(`serve: not set up: ${error.message}
Run \`harness-server setup\` first.
`)
      return 2
    }
    if (isUsageError(error)) {
      process.stderr.write(`${prefix}: ${(error as Error).message}
${serve ? SERVE_USAGE : S0_USAGE}
`)
      return 2
    }
    process.stderr.write(
      `${prefix}: internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}
`,
    )
    return 1
  }
}

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
process.exitCode = await main(process.argv.slice(2))
