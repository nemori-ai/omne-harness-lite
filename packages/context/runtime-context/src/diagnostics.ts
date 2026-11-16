import type { ContextBlockKey } from '@omne-harness/runtime-context-contract'

export type RuntimeContextDiagnostic =
  | Readonly<{ kind: 'stale-publication'; key: ContextBlockKey; generation: number }>
  | Readonly<{ kind: 'late-supply'; key: ContextBlockKey; generation: number }>
  | Readonly<{ kind: 'supply-timeout'; key: ContextBlockKey; generation: number }>
  | Readonly<{ kind: 'uninterpretable-supply'; key: ContextBlockKey; generation: number }>
  | Readonly<{ kind: 'incompatible-registration'; key: ContextBlockKey }>
  | Readonly<{ kind: 'change-outlet-failed'; revision: number }>
  | Readonly<{ kind: 'replay-capacity'; size: number; capacity: number }>
  | Readonly<{ kind: 'read-cache'; result: 'hit' | 'miss' | 'evicted' }>
  | Readonly<{
      kind: 'refresh-deferred'
      key: ContextBlockKey
      reason: 'concurrency' | 'retry-interval'
    }>

export type Diagnose = (event: RuntimeContextDiagnostic) => void
