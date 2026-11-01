#!/usr/bin/env node
// 进程入口：只解析参数、调用 `runS0`、设置退出码（s0-spec-r2 §2、§10）。
// 退出码：0 就绪且关闭 settled；2 配置、解析或装载前检查失败；3 有 FAILED；4 仍有 PENDING 或 LOADING；
// 5 启动为 0 但关闭 incomplete；1 是未预期的内部错误。
import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { runS0 } from './run.ts'

class UsageError extends Error {}

const USAGE =
  'usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>'

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

async function main(argv: readonly string[]): Promise<number> {
  try {
    const { positionals, values } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        distribution: { type: 'string' },
        operator: { type: 'string' },
        'readiness-timeout-ms': { type: 'string' },
        'shutdown-deadline-ms': { type: 'string' },
      },
    })
    if (positionals.length !== 1 || positionals[0] !== 's0')
      throw new UsageError('expected subcommand s0')
    const readinessTimeoutMs = positiveInt('readiness-timeout-ms', values['readiness-timeout-ms'])
    const shutdownDeadlineMs = positiveInt('shutdown-deadline-ms', values['shutdown-deadline-ms'])
    const distribution = await readJson('distribution', values.distribution, true)
    const operator = await readJson('operator', values.operator, false)
    const result = await runS0({
      distribution,
      ...(operator === undefined ? {} : { operator }),
      readinessTimeoutMs,
      shutdownDeadlineMs,
      write: record => process.stdout.write(`${JSON.stringify(record)}\n`),
      stderr: line => process.stderr.write(`${line}\n`),
    })
    return result.exitCode
  } catch (error) {
    if (
      error instanceof UsageError ||
      (error as { code?: unknown }).code?.toString().startsWith('ERR_PARSE_ARGS')
    ) {
      process.stderr.write(`s0: ${(error as Error).message}\n${USAGE}\n`)
      return 2
    }
    process.stderr.write(
      `s0: internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    return 1
  }
}

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
process.exitCode = await main(process.argv.slice(2))
