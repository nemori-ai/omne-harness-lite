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

export type BetweenSegments = {
  readonly data: Uint8Array
  readonly count: OutputCount
}

export type OutputSummary =
  | { readonly mode: 'separate'; readonly stdout: OutputCount; readonly stderr: OutputCount }
  | {
      readonly mode: 'terminal'
      readonly terminal: OutputCount
      readonly between?: BetweenSegments
    }

export type RetainedProcessRef = { readonly id: string; readonly generation: string }

export type ResidueStopReason = 'policy' | 'unbound' | 'closed' | 'capacity' | 'uncontained'

export type ResidueReport =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'retained'
      readonly process: RetainedProcessRef
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
  readonly output: AsyncIterable<OutputChunk>
  readonly outputPolicy: OutputPolicy
  readonly result: Promise<CommandOutcome>
  stop(mode: 'graceful' | 'forced'): Promise<'confirmed' | 'unconfirmed'>
}

export type RetainedProcessInformation = {
  readonly process: RetainedProcessRef
  readonly origin: OriginRef
  readonly handedOverAtMs: number
  readonly state: 'running' | 'stopping'
  readonly processes: number | 'unknown'
}

export type RetainedOutputFrom = Readonly<Partial<Record<OutputChunk['stream'], number>>>

export type RetainedStreamTail = {
  readonly stream: OutputChunk['stream']
  readonly savedFrom: number
  readonly start: number
  readonly end: number
  readonly discardedBytes: number
  /** Raw bytes from `start` to `end`, never split by line or character. */
  readonly data: Uint8Array
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
      readonly version: number
      readonly streams: readonly RetainedStreamTail[]
    }
  | { readonly kind: 'none' }
  | { readonly kind: 'unsupported' }

export interface CommandRetention<P> {
  list(request: FacilityRequest<P>): Promise<FacilityResult<readonly RetainedProcessInformation[]>>
  stop?(
    request: FacilityRequest<P> & {
      readonly process: RetainedProcessRef
      readonly mode: 'graceful' | 'forced'
    },
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>>
  output?(
    request: FacilityRequest<P> & {
      readonly process: RetainedProcessRef
      readonly from?: RetainedOutputFrom
    },
  ): Promise<FacilityResult<RetainedOutput>>
}

export type CommandRetentionOperation = keyof CommandRetention<unknown>

export type Containment = 'sealed' | 'none'

export interface CommandFacility<P> {
  readonly retention?: CommandRetention<P>
  readonly containment?: Containment
  start(
    request: FacilityRequest<P> & {
      readonly executable: string
      readonly args: readonly string[]
      readonly cwd: string
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
