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
function main(argv: string[]): void {
  const [kind, ...args] = argv
  if (kind === '--help' || kind === undefined) {
    process.stdout.write(CONTRACT_CHECK_USAGE)
    return
  }
  if (kind === 'contract-check') {
    process.exitCode = runCheck(args)
    return
  }
  throw new IntegrationError('input-error', 'Unknown command')
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ code: error instanceof IntegrationError ? error.code : 'unknown', message: error instanceof Error ? error.message : String(error) })}\n`,
    )
    process.exitCode = 2
  }
}
