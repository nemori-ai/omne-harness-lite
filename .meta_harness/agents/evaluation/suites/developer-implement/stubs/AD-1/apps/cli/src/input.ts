import type { PromptResult } from '@omne-harness/governance-client-operations'
import type { Invocation } from './parser.ts'

/**
 * Reads one owned input file exactly once. `limit` is the byte bound; `secret`
 * selects the protected-file checks. Failures are `InputFailure` with a closed
 * diagnostic code; a rejected close is a defect, not an input failure.
 */
export async function readInputFile(
  _path: string,
  _limit: number,
  _secret: boolean,
  _signal: AbortSignal,
): Promise<string> {
  throw new Error('not-implemented')
}

/** CQ1 JSON syntax for the nonsecret payload object. */
export function payloadJSON(_text: string): Record<string, unknown> {
  throw new Error('not-implemented')
}

/** Builds the nonsecret CG2 Intent candidate for one parsed command. */
export async function buildIntent(
  _invocation: Extract<Invocation, { kind: 'command' }>,
  _signal: AbortSignal,
): Promise<unknown> {
  throw new Error('not-implemented')
}

/** Obtains every secret named by the command from its protected file source. */
export async function readSecrets(
  _invocation: Extract<Invocation, { kind: 'command' }>,
  _signal: AbortSignal,
): Promise<PromptResult> {
  throw new Error('not-implemented')
}
