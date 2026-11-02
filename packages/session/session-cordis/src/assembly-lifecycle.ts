// The registration of the ordered shutdown. The formal `assemblyLifecycle` service belongs to
// kernel-basis and does not exist yet; the assembly entry provides a private key for it
// (apps/harness-server, `s0.assemblyLifecycle`). This file follows that private key and shape and
// registers the deviation from IC-8 (SPEC property 2). When kernel-basis accepts the formal
// definition, this file is replaced by an import.

/** The private service key of the assembly entry. It is in `inject`, so its absence keeps the plugin `PENDING`. */
export const assemblyLifecycleKey = 's0.assemblyLifecycle'

/** The row that this plugin registers for, as the assembly page names it. */
export const sessionProviderRow = 'session-provider'

export type StopResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'incomplete'; detail: string }>
  | Readonly<{ kind: 'failed'; detail: string }>

/** The handle of one row. The coordinator stops `business` rows before it stops `composition` and `storage` rows. */
export type LifecycleHandle = Readonly<{
  phase: 'business'
  row: string
  start(): Promise<void>
  stop(deadlineMonotonicMs: number): Promise<StopResult>
}>

/**
 * The registration lands on the fiber of the caller and the lifecycle service withdraws it when
 * that fiber is removed. A caller therefore has no withdrawal to call.
 */
export interface AssemblyLifecycle {
  register(handle: LifecycleHandle): void
}
