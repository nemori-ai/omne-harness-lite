import type { CallerResult } from '@omne-harness/sdk'
import type { CliOutput, ExitCode } from './cli-types.ts'

/** The values a command sent, in the keys of the spec's `request` table. */
export type RequestEcho = Readonly<Record<string, string>>

/** Exit code 3 to 5 depend on `result` and `outcome` only, never on the HTTP status. */
export function exitCodeOf(result: CallerResult): ExitCode {
  if (result.kind === 'uncertain') return 5
  switch (result.message.outcome) {
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
  result: CallerResult,
  request: RequestEcho,
  body: (body: unknown) => unknown,
): Record<string, unknown> {
  if (result.kind === 'uncertain') return { result: 'uncertain', request }
  return {
    result: 'response',
    outcome: result.message.outcome,
    body: body(result.message.body),
    request,
  }
}

/**
 * Writes the result object to standard output and the uncertainty note to standard error, and
 * returns the exit code. `redact` removes values that must not reach standard output, such as the
 * login proof. A failed write of standard output is a local failure, exit 1.
 */
export function report(
  command: string,
  result: CallerResult,
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
  return code
}
