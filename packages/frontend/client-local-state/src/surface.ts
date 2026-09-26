export interface LocalRecord {
  readonly center: {
    readonly centerId: string
    readonly endpoint: string
    readonly trust:
      | { readonly mode: 'ca'; readonly certificateAuthorities?: string }
      | { readonly mode: 'spki'; readonly sha256: string }
  }
  readonly login?: {
    readonly presentation: string
    readonly handle: string
    readonly accountId?: string
  }
  readonly cache: readonly CachedRead[]
}

export interface CachedRead {
  readonly centerId: string
  readonly accountId: string
  readonly tenant?: { readonly organization: string; readonly account: string }
  readonly operation: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly result: unknown
  readonly acquiredAt: string
}

declare const snapshotBrand: unique symbol
/** Only a live provider can issue this credential. No enumerable secret fields. */
export interface SnapshotToken {
  readonly [snapshotBrand]: true
}

/** Contains bearer material: never print or log the complete reading. */
export interface LocalSnapshot {
  readonly storeId: string
  readonly revision: number
  readonly operationId: string | null
  readonly value: LocalRecord | null
  readonly token: SnapshotToken
}

export type ReadFailure = 'unavailable' | 'invalid-record' | 'unsupported-format'
export type ReadOutcome =
  | { readonly kind: 'read'; readonly snapshot: LocalSnapshot }
  | { readonly kind: 'failed'; readonly reason: ReadFailure }
export type ReplaceOutcome =
  | { readonly kind: 'installed'; readonly snapshot: LocalSnapshot }
  | { readonly kind: 'conflict'; readonly current: LocalSnapshot }
  | { readonly kind: 'not-installed'; readonly reason: ReadFailure | 'invalid-input' }
  | { readonly kind: 'unconfirmed' }

export interface ClientLocalState {
  read(): Promise<ReadOutcome>
  compareAndReplace(
    token: SnapshotToken,
    value: unknown,
    operationId: string,
  ): Promise<ReplaceOutcome>
}

export class ClientStateUsageDefect extends Error {
  override readonly name = 'ClientStateUsageDefect'
  constructor(readonly reason: 'closed' | 'invalid-snapshot') {
    super(`client-local-state: ${reason}`)
  }
}

export class ClientStateOpenFailure extends Error {
  override readonly name = 'ClientStateOpenFailure'
  constructor(readonly reason: ReadFailure | 'unsafe-path' | 'invalid-directory') {
    super(`client-local-state: ${reason}`)
  }
}

export const CLIENT_LOCAL_STATE_SERVICE = 'clientLocalState' as const
