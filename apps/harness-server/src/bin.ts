#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  COMMON_OPTIONS,
  NotSetUpError,
  SERVE_OPTIONS,
  UsageError,
  positiveInt,
  readJson,
  recordWriter,
  serveInputs,
  serveUntilStopped,
  setupCommand,
  stderrWriter,
} from './local/serve-command.ts'
import { SUPERVISE_USAGE, superviseCommand } from './local/supervise-command.ts'
import { runS0 } from './run.ts'
import { endProcess } from './process-end.ts'

const S0_USAGE =
  'usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>'
const SERVE_USAGE =
  'usage: serve [--distribution <abs json>] [--operator <abs json>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--drain-deadline-ms <n>] [--root-disposal-deadline-ms <n>] [--state-root <abs dir>] [--stop-on-stdin-close]'

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

async function mainS0(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: COMMON_OPTIONS,
  })
  const common = await commonOf('s0', values, positionals)
  const result = await runS0({ ...common, write: recordWriter, stderr: stderrWriter })
  return result.exitCode
}

async function mainServe(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: SERVE_OPTIONS,
  })
  if (positionals.length !== 1 || positionals[0] !== 'serve')
    throw new UsageError('expected subcommand serve')
  return serveUntilStopped(await serveInputs(values), values['stop-on-stdin-close'] === true)
}

function isUsageError(error: unknown): boolean {
  if (error instanceof UsageError) return true
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')
}

type Subcommand = 'serve' | 'setup' | 's0'

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

async function mainSupervise(argv: readonly string[]): Promise<number> {
  try {
    return await superviseCommand(argv, fileURLToPath(import.meta.url))
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    process.stderr.write(`supervise: ${error.message}\n${SUPERVISE_USAGE}\n`)
    return 2
  }
}

async function main(argv: readonly string[]): Promise<number> {
  // The supervisor is named first: the rest of the line belongs to the `serve` it starts.
  if (argv[0] === 'supervise') return mainSupervise(argv.slice(1))
  const subcommand = selectedSubcommand(argv)
  if (subcommand === 'setup') {
    try {
      return await setupCommand(argv)
    } catch (error) {
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

await endProcess(await main(process.argv.slice(2)))
