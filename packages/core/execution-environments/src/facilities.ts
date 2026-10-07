import type { CommandFacility } from './terminal.ts'
import type { FileFacility } from './file-facility.ts'
export type { CommandFacility } from './terminal.ts'
export type { FileFacility } from './file-facility.ts'
/** A process receives literal arguments and an explicit environment, never ambient env. */
export interface CommandRequest {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly stdin?: Uint8Array
}

export interface CommandOutput {
  readonly stream: 'stdout' | 'stderr'
  readonly data: Uint8Array
}

/** These limits are provider configuration, not implicit protocol defaults. */
export interface CommandOutputPolicy {
  readonly maxBufferedBytes: number
  readonly maxChunkBytes: number
  readonly overflow: 'discard'
}

export interface CommandOutputSummary {
  readonly stdout: { readonly observedBytes: number; readonly discardedBytes: number }
  readonly stderr: { readonly observedBytes: number; readonly discardedBytes: number }
}

export interface CommandResult {
  readonly kind: 'completed'
  readonly exit:
    | { readonly code: number }
    | { readonly signal: string }
    // Completion is confirmed, but the exit detail is unavailable.
    | { readonly unknown: true }
  readonly durationMs: number
  /** Transport observations through process completion, not proof a reader consumed them. */
  readonly output: CommandOutputSummary
}

/** The original command started, but a reliable completion record is unavailable. */
export interface CommandFailure {
  readonly kind: 'failed'
  readonly reason: 'unavailable' | 'effectUnknown'
  readonly observedDurationMs: number
  /** Last known transport counts, including overflow before the failure. */
  readonly output: CommandOutputSummary
}
export type CommandOutcome = CommandResult | CommandFailure

export type FacilityFailure = {
  readonly kind: 'rejected'
  readonly reason:
    | 'invalidInput'
    | 'notAuthorized'
    | 'closed'
    | 'notFound'
    | 'unavailable'
    | 'effectUnknown'
    | 'conflict'
    | 'busy'
    | 'capacity'
    | 'unsupported'
}

export interface ProcessHandle {
  /** One reader. Closing its iterator does not stop the original execution. */
  readonly output: AsyncIterable<CommandOutput>
  readonly outputPolicy: CommandOutputPolicy
  readonly result: Promise<CommandOutcome>
  readonly stop: (mode: 'graceful' | 'forced') => Promise<'confirmed' | 'unconfirmed'>
}

/** Type augmentation declares vocabulary. It installs neither providers nor call authority. */
export interface EnvironmentFacilityMap {
  readonly command: CommandFacility
  readonly files: FileFacility
}
