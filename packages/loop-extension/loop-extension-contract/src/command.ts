import type {
  ExtensionInput,
  ExtensionInvocationMode,
  ExtensionReplayBinding,
} from '@omne-harness/agent-contract'

export const COMMAND_PROTOCOL = 'omne-loop-extension/1'

/** The most a command implementation may write to its standard output. More is a bad output. */
export const COMMAND_OUTPUT_LIMIT_BYTES = 64 * 1024

/** What a command implementation reads from its standard input: one JSON document. It writes one output to its standard output and exits zero. */
export type CommandRequest = Readonly<{
  protocol: typeof COMMAND_PROTOCOL
  mode: 'fresh' | 'replay'
  input: ExtensionInput
  /** The card rounds this passage already has, with their replies. Empty in a fresh call. */
  rounds: ExtensionReplayBinding['rounds']
}>

export function commandRequest(
  input: ExtensionInput,
  mode: ExtensionInvocationMode,
): CommandRequest {
  const rounds = mode.kind === 'replay' ? mode.binding.rounds : []
  return { protocol: COMMAND_PROTOCOL, mode: mode.kind, input, rounds }
}

const DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/u

/** The time limit of a declaration in milliseconds. Null for a duration with calendar parts or of no length: this group does not run those. */
export function commandTimeoutMs(duration: string): number | null {
  const parts = DURATION.exec(duration)
  if (parts === null) return null
  const [hours, minutes, seconds] = parts.slice(1).map(part => Number(part ?? 0))
  const total = ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000 + (seconds ?? 0) * 1000
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null
}
