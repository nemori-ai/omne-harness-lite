import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkSummary,
  contractCheckExitCode,
  FAILING_STATUSES,
  runContractCheck,
} from './contract-check.ts'
import { IntegrationError } from './parse.ts'

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
function main(argv: string[]): number {
  const [kind, ...args] = argv
  if (kind === '--help' || kind === undefined) {
    process.stdout.write(CONTRACT_CHECK_USAGE)
    return 0
  }
  if (kind === 'contract-check') return runCheck(args)
  throw new IntegrationError('input-error', 'Unknown command')
}
export function failureLine(error: unknown): string {
  return `${JSON.stringify({ code: error instanceof IntegrationError ? error.code : 'unknown', message: error instanceof Error ? error.message : String(error) })}\n`
}
export function runMain(argv: string[], fail: (line: string) => void): number {
  try {
    return main(argv)
  } catch (error) {
    fail(failureLine(error))
    return 2
  }
}
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  return argv1 !== undefined && resolve(argv1) === fileURLToPath(moduleUrl)
}
if (isEntryPoint(process.argv[1], import.meta.url))
  process.exitCode = runMain(process.argv.slice(2), line => process.stderr.write(line))
