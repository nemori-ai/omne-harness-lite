#!/usr/bin/env node
// The command `omne-telemetry-summary`: reads telemetry JSON lines from a file or standard input and
// prints the report of `summarizeTelemetry`. Exit codes: 0 report printed, 1 input not readable,
// 2 usage error. The rules are SPEC.md TN-11.
import { createReadStream, realpathSync } from 'node:fs'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { tenantCodec } from '@omne-harness/legal-identity'
import { summarizeTelemetry, type SummaryFilter, type TelemetrySummary } from './summary.ts'

export type SummaryCliIo = Readonly<{
  stdin: Readable
  stdout: (text: string) => void
  stderr: (text: string) => void
}>

const USAGE = [
  'usage: omne-telemetry-summary [--json] [--tenant <tenant text>] [--from <time>] [--to <time>] [<file>]',
  '  <file>     JSON lines from `serve` stdout or the `file` outlet; standard input when absent',
  '  --json     print the machine-readable report; the default is a table',
  '  --tenant   keep the records of one tenant: {"organization":"org_…","account":"acc_…"}',
  '  --from     keep the records at or after this ISO 8601 time',
  '  --to       keep the records before this ISO 8601 time',
].join('\n')

class UsageError extends Error {}

type Invocation = Readonly<{ help: boolean; json: boolean; file?: string; filter: SummaryFilter }>

function timeOption(name: string, value: string | undefined): Date | undefined {
  if (value === undefined) return undefined
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw new UsageError(`--${name} is not a time: ${value}`)
  return new Date(time)
}

function invocation(argv: readonly string[]): Invocation {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        tenant: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    })
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
  const { values, positionals } = parsed
  if (positionals.length > 1) throw new UsageError('give at most one file')
  let tenant
  if (values.tenant !== undefined) {
    const result = tenantCodec.parse(values.tenant)
    if (!result.ok) throw new UsageError(`--tenant is not tenant text: ${values.tenant}`)
    tenant = result.value
  }
  const from = timeOption('from', values.from)
  const to = timeOption('to', values.to)
  return {
    help: values.help === true,
    json: values.json === true,
    ...(positionals[0] !== undefined && { file: positionals[0] }),
    filter: {
      ...(tenant !== undefined && { tenant }),
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    },
  }
}

async function readLines(input: Readable): Promise<string[]> {
  const lines: string[] = []
  for await (const line of createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY }))
    lines.push(line)
  return lines
}

function number(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/** Columns padded to their widest cell, two spaces apart. */
function table(header: readonly string[], rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return ['(none)']
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map(row => row[column]?.length ?? 0)),
  )
  return [header, ...rows].map(row =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd(),
  )
}

function humanReport(summary: TelemetrySummary): string {
  const segments = table(
    ['owner', 'name', 'count', 'ok', 'failure', 'unknown', 'min', 'p50', 'p95', 'p99', 'max'],
    summary.segments.map(segment => [
      segment.owner,
      segment.name,
      String(segment.count),
      String(segment.outcomes.ok),
      String(segment.outcomes.failure),
      String(segment.outcomes.unknown),
      ...[
        segment.durationMs.min,
        segment.durationMs.p50,
        segment.durationMs.p95,
        segment.durationMs.p99,
        segment.durationMs.max,
      ].map(number),
    ]),
  )
  const events = table(
    ['owner', 'name', 'level', 'count'],
    summary.events.map(event => [event.owner, event.name, event.level, String(event.count)]),
  )
  const totals = table(
    ['total', 'count'],
    [
      ...Object.entries(summary.logs).map(([level, count]) => [`log ${level}`, String(count)]),
      ['unfinished segments', String(summary.unfinished)],
      ['skipped invalid', String(summary.skipped.invalid)],
      ['skipped other kinds', String(summary.skipped.otherKinds)],
    ],
  )
  const window = summary.window === null ? 'none' : `${summary.window.from} to ${summary.window.to}`
  return [
    'Segments (durations in ms, descending p95)',
    ...segments,
    '',
    'Events',
    ...events,
    '',
    ...totals,
    '',
    `Window: ${window}`,
    '',
  ].join('\n')
}

/** Runs the command and returns its exit code. It does not exit the process. */
export async function runSummaryCli(argv: readonly string[], io: SummaryCliIo): Promise<number> {
  let call: Invocation
  try {
    call = invocation(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    io.stderr(`omne-telemetry-summary: ${error.message}\n${USAGE}\n`)
    return 2
  }
  if (call.help) {
    io.stdout(`${USAGE}\n`)
    return 0
  }
  let lines: string[]
  try {
    lines = await readLines(call.file === undefined ? io.stdin : createReadStream(call.file))
  } catch (error) {
    const source = call.file ?? 'standard input'
    const reason = error instanceof Error ? error.message : String(error)
    io.stderr(`omne-telemetry-summary: cannot read ${source}: ${reason}\n`)
    return 1
  }
  const summary = summarizeTelemetry(lines, call.filter)
  io.stdout(call.json ? `${JSON.stringify(summary, null, 2)}\n` : humanReport(summary))
  return 0
}

function invokedDirectly(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  process.exitCode = await runSummaryCli(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
  })
}
