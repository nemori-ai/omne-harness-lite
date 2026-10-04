export type CloseResult =
  | { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly codes: readonly ('setup' | 'close')[] }

/** close settles only after all work owned by this row is quiescent. */
export interface OwnedWork {
  readonly ready: Promise<void>
  close(): Promise<void>
}

export interface LifetimeRegistration {
  readonly closed: Promise<CloseResult>
  requestStop(): void
}

export interface AssemblyLifetimePort {
  isCurrent(): boolean
  register(work: OwnedWork): LifetimeRegistration
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
  close(): Promise<AssemblyCloseReport>
}
