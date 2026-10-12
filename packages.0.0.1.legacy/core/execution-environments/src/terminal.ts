import type { CommandRequest, ProcessHandle, FacilityFailure } from './facilities.ts'
export interface TerminalReference {
  readonly id: string
  readonly generation: string
}
export interface TerminalCreateRequest {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}
export interface TerminalExecuteRequest {
  readonly terminal: TerminalReference
  readonly script: string
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly stdin?: Uint8Array
}
export interface TerminalInformation {
  readonly terminal: TerminalReference
  readonly state: 'idle' | 'running' | 'invalid' | 'closed'
  /** Last successful control observation, not a current permission grant. */
  readonly observedCwd: string
}
export interface CommandFacility {
  readonly start: (
    request: CommandRequest,
  ) => Promise<{ readonly kind: 'started'; readonly process: ProcessHandle } | FacilityFailure>
  readonly createTerminal: (
    request: TerminalCreateRequest,
  ) => Promise<{ readonly kind: 'created'; readonly terminal: TerminalReference } | FacilityFailure>
  readonly executeTerminal: (
    request: TerminalExecuteRequest,
  ) => Promise<{ readonly kind: 'started'; readonly process: ProcessHandle } | FacilityFailure>
  /** Stopping can invalidate an active command and the complete persistent shell. */
  readonly closeTerminal: (
    terminal: TerminalReference,
  ) => Promise<
    { readonly kind: 'closed'; readonly status: 'confirmed' | 'unconfirmed' } | FacilityFailure
  >
  readonly terminals: () => Promise<
    | { readonly kind: 'terminals'; readonly values: readonly TerminalInformation[] }
    | FacilityFailure
  >
}
