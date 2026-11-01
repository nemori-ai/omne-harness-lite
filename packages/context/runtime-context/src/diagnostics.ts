import type { ContextBlockKey } from '@omne-harness/runtime-context-contract'

/**
 * The closed set of diagnostic events (RC-08). An event carries a block key, a revision, a
 * generation and a result kind. It never carries a block value, a scope reference, a tenant or a
 * principal, so the sink may be a host log that no reader can see.
 */
export type RuntimeContextDiagnostic =
  /** A publication of a replaced generation was refused (RC-07). */
  | Readonly<{ kind: 'stale-publication'; key: ContextBlockKey; generation: number }>
  /** A supply answer arrived after its generation, sequence, scope or instance moved on; it was dropped. */
  | Readonly<{ kind: 'late-supply'; key: ContextBlockKey; generation: number }>
  /** A supply callback ran past the supply bound and read as unknown. */
  | Readonly<{ kind: 'supply-timeout'; key: ContextBlockKey; generation: number }>
  /** A supply callback answered a value that does not match the declaration. */
  | Readonly<{ kind: 'uninterpretable-supply'; key: ContextBlockKey; generation: number }>
  /** A registration made before the declaration arrived does not fit it; the block reads missing. */
  | Readonly<{ kind: 'incompatible-registration'; key: ContextBlockKey }>
  /** The change outlet threw; the write it reported stands. */
  | Readonly<{ kind: 'change-outlet-failed'; revision: number }>
  /** A recovery material exceeded the replay capacity; nothing was truncated. */
  | Readonly<{ kind: 'replay-capacity'; size: number; capacity: number }>
  /** One lookup or eviction of the read cache. */
  | Readonly<{ kind: 'read-cache'; result: 'hit' | 'miss' | 'evicted' }>
  /** A restored supply was not attempted for this read; the refresh mark is kept. */
  | Readonly<{
      kind: 'refresh-deferred'
      key: ContextBlockKey
      reason: 'concurrency' | 'retry-interval'
    }>

export type Diagnose = (event: RuntimeContextDiagnostic) => void
