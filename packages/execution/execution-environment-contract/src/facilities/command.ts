import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'
import type { OriginRef } from '../identity.ts'

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

/** Bytes the terminal received after the previous segment ended and before this one began. */
export type BetweenSegments = {
  /** Kept bytes in arrival order, at most the provider's between-segment bound. */
  readonly data: Uint8Array
  readonly count: OutputCount
}

export type OutputSummary =
  | { readonly mode: 'separate'; readonly stdout: OutputCount; readonly stderr: OutputCount }
  | {
      readonly mode: 'terminal'
      readonly terminal: OutputCount
      /** Only from a terminal provider that attributes bytes by segment sentinels. */
      readonly between?: BetweenSegments
    }

/** Identity of a retained process: the execution domain a one-shot command handed over. */
export type RetainedProcessRef = { readonly id: string; readonly generation: string }

/** Why a domain with processes left behind is stopped instead of retained. */
export type ResidueStopReason = 'policy' | 'unbound' | 'closed' | 'capacity' | 'uncontained'

/**
 * Disposition after the main process exited. `stopping` does not mean stopped: the stop is
 * confirmed later and does not delay the outcome.
 */
export type ResidueReport =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'retained'
      readonly process: RetainedProcessRef
      /** Processes in the domain other than the provider's own supervisor. */
      readonly processes: number | 'unknown'
    }
  | { readonly kind: 'stopping'; readonly reason: ResidueStopReason }
  | { readonly kind: 'unknown' }

export type CommandOutcome =
  | {
      readonly kind: 'completed'
      readonly exit:
        | { readonly kind: 'code'; readonly code: number }
        | { readonly kind: 'signal'; readonly signal: string }
        | { readonly kind: 'unknown' }
      readonly durationMs: number
      readonly output: OutputSummary
      /** The disposition of what the main process left; only from a provider that disposes. */
      readonly residue?: ResidueReport
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

export type RetainedProcessInformation = {
  readonly process: RetainedProcessRef
  /** The original call whose one-shot command handed the domain over. */
  readonly origin: OriginRef
  /** Wall-clock time of the handover, in milliseconds since the Unix epoch. */
  readonly handedOverAtMs: number
  readonly state: 'running' | 'stopping'
  readonly processes: number | 'unknown'
}

/** Source byte offsets per output stream; `output` gives the bytes from these offsets on. */
export type RetainedOutputFrom = Readonly<Partial<Record<OutputChunk['stream'], number>>>

/**
 * The tail of one output stream after the handover. Offsets count source bytes of the stream. Bytes
 * before `savedFrom` were never saved; the first saved byte is at `savedFrom + discardedBytes`, and
 * `start + data.length === end`. Without `from`, `start` is the first saved byte.
 */
export type RetainedStreamTail = {
  readonly stream: OutputChunk['stream']
  readonly savedFrom: number
  readonly start: number
  readonly end: number
  readonly discardedBytes: number
  /** Raw bytes from `start` to `end`, never split by line or character. */
  readonly data: Uint8Array
  /** `data` decoded; `start` skips continuation bytes a cut left at the beginning. */
  readonly text: {
    readonly encoding: 'utf-8'
    readonly value: string
    readonly start: number
    readonly replaced: boolean
  }
}

export type RetainedOutput =
  | {
      readonly kind: 'tail'
      /** Grows each time a tail changes. */
      readonly version: number
      readonly streams: readonly RetainedStreamTail[]
    }
  /** No stream has observed a byte since the handover. */
  | { readonly kind: 'none' }
  /** The provider keeps no output for this retained process. */
  | { readonly kind: 'unsupported' }

/** Retained processes of the acquisition's retention scope; the whole scope, not only this caller's. */
export interface CommandRetention<P> {
  list(request: FacilityRequest<P>): Promise<FacilityResult<readonly RetainedProcessInformation[]>>
  /** Stops the whole domain of a retained process; see the contract's stop clause. */
  stop?(
    request: FacilityRequest<P> & {
      readonly process: RetainedProcessRef
      readonly mode: 'graceful' | 'forced'
    },
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>>
  /** Reads what a retained process wrote after the handover. */
  output?(
    request: FacilityRequest<P> & {
      readonly process: RetainedProcessRef
      readonly from?: RetainedOutputFrom
    },
  ): Promise<FacilityResult<RetainedOutput>>
}

export type CommandRetentionOperation = keyof CommandRetention<unknown>

/** `sealed`: no process can leave the execution domain; `none`: a process can leave it. */
export type Containment = 'sealed' | 'none'

export interface CommandFacility<P> {
  readonly retention?: CommandRetention<P>
  /** The provider's containment; absent when it does not declare one, which is not `sealed`. */
  readonly containment?: Containment
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
