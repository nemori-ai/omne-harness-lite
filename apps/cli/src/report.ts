import type { CliOutput, ExitCode } from './cli-types.ts'
import type { CallResult } from './link.ts'

export type RequestEcho = Readonly<Record<string, string>>

/** Exit code 3 to 5 depend on `result` and `outcome` only, never on the HTTP status. */
export function exitCodeOf(result: CallResult): ExitCode {
  switch (result.kind) {
    case 'uncertain':
      return 5
    case 'unavailable':
      return 4
    case 'response':
      return exitCodeOfOutcome(result.outcome)
    case 'rejected':
      return 2
  }
}

function exitCodeOfOutcome(outcome: string): ExitCode {
  switch (outcome) {
    case 'succeeded':
    case 'no-change':
      return 0
    case 'basis-unavailable':
      return 4
    case 'unknown':
      return 5
    default:
      return 3
  }
}

function resultObject(
  result: CallResult,
  request: RequestEcho,
  body: (body: unknown) => unknown,
): Record<string, unknown> {
  if (result.kind === 'rejected')
    return { result: 'rejected', rejection: result.rejection, request }
  if (result.kind !== 'response') return { result: result.kind, request }
  return { result: 'response', outcome: result.outcome, body: body(result.body), request }
}

export function report(
  command: string,
  result: CallResult,
  request: RequestEcho,
  output: CliOutput,
  redact: (body: unknown) => unknown = body => body,
): ExitCode {
  const code = exitCodeOf(result)
  try {
    output.stdout(`${JSON.stringify(resultObject(result, request, redact))}\n`)
  } catch {
    output.stderr(`omne ${command}: cannot write standard output\n`)
    return 1
  }
  if (code === 5) output.stderr(`omne ${command}: result uncertain\n`)
  if (result.kind === 'unavailable' && result.reason !== undefined)
    output.stderr(`omne ${command}: ${result.reason}\n`)
  return code
}
