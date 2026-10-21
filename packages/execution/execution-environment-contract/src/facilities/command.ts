import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'

export type OutputChunk = {
  readonly stream: 'stdout' | 'stderr' | 'terminal'
  /** Raw bytes, including CRLF, ANSI and carriage returns; never split by line or character. */
  readonly data: Uint8Array
  /** Bytes of this stream observed before this chunk; a gap from the previous chunk means a discard. */
  readonly observedOffset: number
}

export type OutputPolicy = {
  readonly maxBufferedBytes: number
  readonly maxChunkBytes: number
  readonly overflow: 'discard'
}

export type OutputCount = { readonly observedBytes: number; readonly discardedBytes: number }

export type OutputSummary =
  | { readonly mode: 'separate'; readonly stdout: OutputCount; readonly stderr: OutputCount }
  | { readonly mode: 'terminal'; readonly terminal: OutputCount }

export type CommandOutcome =
  | {
      readonly kind: 'completed'
      readonly exit:
        | { readonly code: number }
        | { readonly signal: string }
        | { readonly unknown: true }
      readonly durationMs: number
      readonly output: OutputSummary
    }
  | {
      readonly kind: 'failed'
      readonly reason: 'unavailable' | 'effectUnknown'
      readonly observedDurationMs: number
      readonly output: OutputSummary
    }

export interface ProcessHandle {
  /** Process identity from the provider; never a bare PID. */
  readonly process: { readonly id: string; readonly generation: string }
  readonly outputMode: 'separate' | 'terminal'
  /** The only output body. One reader only; `return()` gives up the read right, it does not stop. */
  readonly output: AsyncIterable<OutputChunk>
  readonly outputPolicy: OutputPolicy
  /** Final outcome. Repeated or concurrent waits do not start anything again. */
  readonly result: Promise<CommandOutcome>
  stop(mode: 'graceful' | 'forced'): Promise<'confirmed' | 'unconfirmed'>
}

export interface CommandFacility<P> {
  start(
    request: FacilityRequest<P> & {
      readonly executable: string
      readonly args: readonly string[]
      readonly cwd: string
      /** Explicit environment; nothing is inherited from the host. */
      readonly env: Readonly<Record<string, string>>
      readonly stdin?: Uint8Array
      readonly outputMode: 'separate' | 'terminal'
      readonly geometry?: { readonly columns: number; readonly rows: number }
    },
  ): Promise<FacilityResult<ProcessHandle>>
}

declare module '../facility.ts' {
  interface EnvironmentFacilities {
    command: CommandFacility<unknown>
  }
}

export const commandFacility: FacilityDescriptor<'command'> = describeFacility('command', {
  start: 'guarded',
})
