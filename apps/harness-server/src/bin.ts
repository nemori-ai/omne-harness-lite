#!/usr/bin/env node
// 进程入口：只解析参数、调用 `runS0` 或 `runServe`、设置退出码（s0-spec-r2 §2、§10；DP1-C1、C2）。
// 子命令是第一个参数。`s0` 的选项表与文字保持原样；`serve` 另加 `--state-root` 与 `--stop-on-stdin-close`。
// 退出码：0 就绪且关闭 settled；2 配置、解析或装载前检查失败；3 有 FAILED、启动失败或入口对象安装失败；
// 4 仍有 PENDING 或 LOADING；5 启动为 0 但关闭 incomplete；1 是未预期的内部错误。
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { runS0, runServe } from './run.ts'

class UsageError extends Error {}

const S0_USAGE =
  'usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>'
const SERVE_USAGE =
  'usage: serve --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n> --state-root <abs dir> [--stop-on-stdin-close]'

const COMMON_OPTIONS = {
  distribution: { type: 'string' },
  operator: { type: 'string' },
  'readiness-timeout-ms': { type: 'string' },
  'shutdown-deadline-ms': { type: 'string' },
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
  if (positionals.length !== 0) throw new UsageError(`expected subcommand ${subcommand}`)
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

async function mainServe(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      ...COMMON_OPTIONS,
      'state-root': { type: 'string' },
      'stop-on-stdin-close': { type: 'boolean' },
    },
  })
  const common = await commonOf('serve', values, positionals)
  const root = await stateRoot(values['state-root'])

  const controller = new AbortController()
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
  try {
    const result = await runServe({
      ...common,
      stateRoot: root,
      stop: controller.signal,
      write,
      stderr,
    })
    return result.exitCode
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    if (values['stop-on-stdin-close'] === true) process.stdin.destroy()
  }
}

function isUsageError(error: unknown): boolean {
  if (error instanceof UsageError) return true
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')
}

async function main(argv: readonly string[]): Promise<number> {
  const [subcommand, ...rest] = argv
  const known = subcommand === 's0' || subcommand === 'serve'
  const prefix = known ? subcommand : 'harness-server'
  const usage =
    subcommand === 's0'
      ? S0_USAGE
      : subcommand === 'serve'
        ? SERVE_USAGE
        : `${S0_USAGE}\n${SERVE_USAGE}`
  try {
    if (subcommand === 's0') return await mainS0(rest)
    if (subcommand === 'serve') return await mainServe(rest)
    throw new UsageError('expected subcommand s0 or serve')
  } catch (error) {
    if (isUsageError(error)) {
      process.stderr.write(`${prefix}: ${(error as Error).message}\n${usage}\n`)
      return 2
    }
    process.stderr.write(
      `${prefix}: internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    return 1
  }
}

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
process.exitCode = await main(process.argv.slice(2))
