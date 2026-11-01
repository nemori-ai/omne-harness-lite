#!/usr/bin/env node
// 进程入口：只解析参数、调用 `runS0` 或 `runServe`、设置退出码（s0-spec-r2 §2、§10；DP1-C1、C2）。
// 位置参数里有 `serve` 时走真实模式，否则走 S0 的基线解析路径：`parseArgs` 允许位置参数，子命令可在任意位置，
// 参数、输出、退出码与 stderr 文字与加入 `serve` 之前逐字节相同。`serve` 另加 `--state-root` 与 `--stop-on-stdin-close`。
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

async function mainServe(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: SERVE_OPTIONS,
  })
  const common = await commonOf('serve', values, positionals)
  const root = await stateRoot(values['state-root'])

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
    clearInterval(keepAlive)
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

/**
 * True when `serve` is one of the positionals. The scan is lenient (unknown options never throw),
 * so a malformed call without `serve` still reaches the S0 path and fails there with the S0 text.
 */
function selectsServe(argv: readonly string[]): boolean {
  try {
    const { positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: false,
      options: SERVE_OPTIONS,
    })
    return positionals.includes('serve')
  } catch {
    return false
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const serve = selectsServe(argv)
  const prefix = serve ? 'serve' : 's0'
  try {
    return serve ? await mainServe(argv) : await mainS0(argv)
  } catch (error) {
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
