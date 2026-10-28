import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  checkSummary,
  contractCheckExitCode,
  FAILING_STATUSES,
  runContractCheck,
} from './contract-check.ts'
import { snapshotContractDiff } from './contract-diff.ts'
import { openIntegration, type Command } from './engine.ts'
import { fields, integer, json, sha, string, IntegrationError } from './parse.ts'
import { riNotes, riNotesExitCode, RI_REFUSING_CODES, type RiNotes } from './ri-notes.ts'
import { riInput } from './ri-source.ts'
import { TaskContextError } from '@omne-harness/repo-toolchain/core/task-context'

export function parseCommand(value: unknown): Command {
  const v = fields(
    value,
    ['kind', 'authority', 'issue', 'revision', 'attempt', 'target'],
    'command',
  )
  switch (v.kind) {
    case 'register':
    case 'start':
      fields(v, ['kind', 'authority', 'issue', 'revision', 'attempt'], v.kind)
      return {
        kind: v.kind,
        authority: string(v.authority, 'authority'),
        issue: string(v.issue, 'issue'),
        revision: integer(v.revision, 'revision'),
        attempt: string(v.attempt, 'attempt'),
      }
    case 'task-sync':
      fields(v, ['kind', 'target'], v.kind)
      return { kind: v.kind, target: sha(v.target, 'target') }
    default:
      throw new IntegrationError('input-error', 'Unsupported integration command')
  }
}
const RI_NOTES_USAGE = `integration ri-notes --track ID [--root PATH] [--format json|markdown]
  Builds the「所含的卡」and「契约变化」sections of a promotion PR. Read-only.
  Exit 1 when a finding is ${RI_REFUSING_CODES.join(', ')}; exit 0 otherwise; exit 2 on bad input or a failed read.
`
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
/**
 * Markdown carries only the two sections on standard output. The findings go to standard error,
 * one JSON line each, then one summary line.
 */
function writeMarkdown(notes: RiNotes): void {
  process.stdout.write(notes.markdown)
  const codes: Record<string, number> = {}
  for (const finding of notes.findings) {
    codes[finding.code] = (codes[finding.code] ?? 0) + 1
    process.stderr.write(`${JSON.stringify(finding)}\n`)
  }
  const summary = { findings: notes.findings.length, codes, contractCheck: notes.contractCheck }
  process.stderr.write(`${JSON.stringify({ severity: 'report', summary })}\n`)
}
/**
 * `ri-notes`: returns 1 when a finding has a refusing code (`RI_REFUSING_CODES`), otherwise 0.
 * An unavailable snapshot difference only reports. The output is the same for both exit codes.
 */
function runRiNotes(args: readonly string[]): 0 | 1 {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(RI_NOTES_USAGE)
    return 0
  }
  const options = parseOptions(args, ['--root', '--track', '--format']),
    track = options.get('--track'),
    format = options.get('--format') ?? 'json'
  if (track === undefined || (format !== 'json' && format !== 'markdown'))
    throw new IntegrationError(
      'input-error',
      'ri-notes requires --track ID and --format json|markdown',
    )
  const notes = riNotes(
    riInput({
      root: resolve(options.get('--root') ?? process.cwd()),
      track,
      contractDiffProvider: snapshotContractDiff,
    }),
  )
  if (format === 'markdown') writeMarkdown(notes)
  else process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`)
  return riNotesExitCode(notes)
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
async function runEngine(kind: string, options: ReadonlyMap<string, string>): Promise<unknown> {
  const engine = await openIntegration({ root: resolve(options.get('--root') ?? process.cwd()) })
  switch (kind) {
    case 'status':
      return engine.inspect({ kind: 'status' })
    case 'baselines': {
      const base = options.get('--base')
      return engine.inspect({
        kind: 'baselines',
        purpose: 'task-check',
        ...(base === undefined ? {} : { explicitBase: base }),
      })
    }
    case 'execute': {
      const path = options.get('--input')
      if (path === undefined) throw new IntegrationError('input-error', 'execute requires --input')
      return engine.execute(parseCommand(json(readFileSync(path, 'utf8'), path)))
    }
    default:
      throw new IntegrationError('input-error', 'Unknown command')
  }
}
async function main(argv: string[]): Promise<void> {
  const [kind, ...args] = argv
  if (kind === '--help' || kind === undefined) {
    process.stdout.write(
      `integration status|baselines|execute [--root PATH] [--base REF] [--input JSON_FILE]\n${RI_NOTES_USAGE}${CONTRACT_CHECK_USAGE}execute reads a strict command union; see integration/README.md\n`,
    )
    return
  }
  if (kind === 'ri-notes') {
    process.exitCode = runRiNotes(args)
    return
  }
  if (kind === 'contract-check') {
    process.exitCode = runCheck(args)
    return
  }
  const result = await runEngine(kind, parseOptions(args, ['--root', '--base', '--input']))
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(
      `${JSON.stringify({ code: error instanceof IntegrationError || error instanceof TaskContextError ? error.code : 'unknown', message: error instanceof Error ? error.message : String(error) })}\n`,
    )
    process.exitCode = 2
  })
}
