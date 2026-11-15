export const assemblyLifecycleKey = 's0.assemblyLifecycle'

export const sessionProviderRow = 'session-provider'

export type StopResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'incomplete'; detail: string }>
  | Readonly<{ kind: 'failed'; detail: string }>

export type LifecycleHandle = Readonly<{
  phase: 'business'
  row: string
  start(): Promise<void>
  stop(deadlineMonotonicMs: number): Promise<StopResult>
}>

export interface AssemblyLifecycle {
  register(handle: LifecycleHandle): void
}
