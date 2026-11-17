import type { DurableEvidence, ExtensionInvocationResult } from '@omne-harness/agent-contract'
import { COMMAND_OUTPUT_LIMIT_BYTES } from '@omne-harness/loop-extension-contract'

/** What one physical run of a command implementation was seen to do. */
export type CommandObservation =
  | Readonly<{ kind: 'not-entered' }>
  | Readonly<{ kind: 'start-unknown'; recovery: DurableEvidence }>
  | Readonly<{ kind: 'exited'; code: number; stdout: Uint8Array; dropped: boolean }>
  | Readonly<{ kind: 'timed-out' }>
  | Readonly<{ kind: 'lost'; started: DurableEvidence; recovery: DurableEvidence }>

const BAD_OUTPUT = { kind: 'errored', classification: 'bad_output' } as const

function outputOf(stdout: Uint8Array, dropped: boolean): ExtensionInvocationResult {
  if (dropped || stdout.byteLength > COMMAND_OUTPUT_LIMIT_BYTES)
    return { ...BAD_OUTPUT, error: 'the output is over the limit' }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout))
  } catch {
    return { ...BAD_OUTPUT, error: 'the output is not a JSON document' }
  }
  const isOutput =
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { kind?: unknown }).kind === 'string'
  return isOutput
    ? { kind: 'output', value }
    : { ...BAD_OUTPUT, error: 'the output is not an extension output' }
}

/** The result of a command run. A run that cannot be proved not to have started is unresolved, never unavailable. */
export function commandResult(observation: CommandObservation): ExtensionInvocationResult {
  switch (observation.kind) {
    case 'not-entered':
      return { kind: 'notStartedUnavailable' }
    case 'start-unknown':
      return {
        kind: 'invocationUnresolved',
        start: { kind: 'unknown' },
        recovery: observation.recovery,
      }
    case 'lost':
      return {
        kind: 'invocationUnresolved',
        start: { kind: 'started', evidence: observation.started },
        recovery: observation.recovery,
      }
    case 'timed-out':
      return {
        kind: 'errored',
        classification: 'timeout',
        error: 'the command ran over its time limit',
      }
    case 'exited':
      return observation.code === 0
        ? outputOf(observation.stdout, observation.dropped)
        : {
            kind: 'errored',
            classification: 'nonzero_exit',
            error: `the command exited with code ${observation.code}`,
          }
  }
}
