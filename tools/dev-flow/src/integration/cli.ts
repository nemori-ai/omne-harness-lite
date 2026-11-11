import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkSummary,
  contractCheckExitCode,
  FAILING_STATUSES,
  runContractCheck,
} from './contract-check.ts'
import { IntegrationError } from './parse.ts'

/** Options as `--key value` pairs; an unknown, repeated or valueless option is an input error. */
function parseOptions(args: readonly string[], allowed: readonly string[]): Map<string, string> {
  const options = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1]
    if (key === undefined || !allowed.includes(key) || value === undefined || options.has(key))
      throw new IntegrationError('input-error', 'Invalid or repeated option')
    options.set(key, value)
  }
  return options
}
const CONTRACT_CHECK_USAGE = `integration contract-check [--root PATH]
  Runs the pinned omne-contract-api --check --json. Exit 1 when a member is ${FAILING_STATUSES.join(', ')}; unbuilt only reports.
  Exit 2 when the CLI is missing, fails or prints output of another shape.
`
/**
 * `contract-check`: standard output is the JSON report. Standard error has one line for each
 * failing member, then the summary line. Returns 1 when a member fails, otherwise 0.
 */
function runCheck(args: readonly string[]): 0 | 1 {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(CONTRACT_CHECK_USAGE)
    return 0
  }
  const options = parseOptions(args, ['--root'])
  const report = runContractCheck({ root: resolve(options.get('--root') ?? process.cwd()) })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  for (const failure of report.failures)
    process.stderr.write(
      `contract-check: ${failure.status} ${failure.member}: ${failure.message} 改法：${failure.remedy}\n`,
    )
  process.stderr.write(`contract-check: ${checkSummary(report)}\n`)
  return contractCheckExitCode(report)
}
/** Runs one command and returns its exit code; a failure the command does not handle throws. */
function main(argv: string[]): number {
  const [kind, ...args] = argv
  if (kind === '--help' || kind === undefined) {
    process.stdout.write(CONTRACT_CHECK_USAGE)
    return 0
  }
  if (kind === 'contract-check') return runCheck(args)
  throw new IntegrationError('input-error', 'Unknown command')
}
/** The line on standard error for a failure: a JSON object with the error code and message. */
export function failureLine(error: unknown): string {
  return `${JSON.stringify({ code: error instanceof IntegrationError ? error.code : 'unknown', message: error instanceof Error ? error.message : String(error) })}\n`
}
/** Runs the CLI with `argv` and returns the exit code. A failure goes to `fail` and exits 2. */
export function runMain(argv: string[], fail: (line: string) => void): number {
  try {
    return main(argv)
  } catch (error) {
    fail(failureLine(error))
    return 2
  }
}
/** `argv1` (the script Node started) is the module at `moduleUrl`, so it is the entry point. */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  return argv1 !== undefined && resolve(argv1) === fileURLToPath(moduleUrl)
}
if (isEntryPoint(process.argv[1], import.meta.url))
  process.exitCode = runMain(process.argv.slice(2), line => process.stderr.write(line))
