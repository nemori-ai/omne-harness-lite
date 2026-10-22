import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'
import type { ProcessHandle } from './command.ts'

export type TerminalRef = { readonly id: string; readonly generation: string }

export type TerminalInformation = {
  readonly terminal: TerminalRef
  readonly state: 'idle' | 'running' | 'invalid' | 'closed'
  /** Last successful control observation; not a permission. */
  readonly observedCwd: string
}

export interface TerminalFacility<P> {
  create(
    request: FacilityRequest<P> & {
      readonly cwd: string
      readonly env: Readonly<Record<string, string>>
      readonly geometry?: { readonly columns: number; readonly rows: number }
    },
  ): Promise<FacilityResult<{ readonly terminal: TerminalRef }>>
  /** One leg of the terminal; its output mode is always `terminal`. */
  execute(
    request: FacilityRequest<P> & {
      readonly terminal: TerminalRef
      readonly script: string
      readonly cwd?: string
      readonly env?: Readonly<Record<string, string>>
      readonly stdin?: Uint8Array
    },
  ): Promise<FacilityResult<ProcessHandle>>
  close(
    request: FacilityRequest<P> & { readonly terminal: TerminalRef },
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>>
  list(request: FacilityRequest<P>): Promise<FacilityResult<readonly TerminalInformation[]>>
}

declare module '../facility.ts' {
  interface EnvironmentFacilities {
    terminal: TerminalFacility<unknown>
  }
}

export const terminalFacility: FacilityDescriptor<'terminal'> = describeFacility('terminal', {
  create: 'guarded',
  execute: 'guarded',
  close: 'guarded',
  list: 'guarded',
})
