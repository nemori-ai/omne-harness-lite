export type CloseResult =
  | { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly codes: readonly ('setup' | 'close')[] }

/** close settles only after all work owned by this row is quiescent. */
export interface OwnedWork {
  readonly ready: Promise<void>
  close(): Promise<void>
}

/** retained does not establish quiescence or release of resources. */
export type RetainedCloseAttempt = 'closed' | 'retained'

/** Maintenance of the same original close, without starting assembly shutdown. */
export interface RetainedCloseControl {
  closeAttempt(): Promise<RetainedCloseAttempt>
  retryClose(): Promise<RetainedCloseAttempt>
}

export interface LifetimeRegistration {
  readonly closed: Promise<CloseResult>
  requestStop(): void
}

export interface AssemblyLifetimePort {
  isCurrent(): boolean
  register(work: OwnedWork): LifetimeRegistration
  retainClose(control: RetainedCloseControl): void
}

export interface AssemblyCloseReport {
  readonly complete: boolean
  readonly assemblyErrors: readonly (
    | 'assembly-stop-failed'
    | 'assembly-protocol-failed'
    | 'assembly-fiber-dispose-failed'
    | 'assembly-port-dispose-failed'
  )[]
  readonly rows: readonly { readonly id: string; readonly result: CloseResult }[]
}

export interface AssemblyLifetime {
  readonly ids: readonly string[]
  readonly closed: Promise<AssemblyCloseReport>
  isPristine(): boolean
  tryClaim(): boolean
  isCurrent(): boolean
  port(id: string): AssemblyLifetimePort
  closeControl(id: string): RetainedCloseControl | undefined
  close(): Promise<AssemblyCloseReport>
}
