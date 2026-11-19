import { expectTypeOf, it } from 'vitest'
import type {
  ProducerRegistration,
  ChangeMaterial,
  RegistrationChange,
  ReadOutcome,
  ChangesResult,
  HolderOperations,
  ProducerHandle,
  SupplyAnswer,
  CommitInput,
} from '@omne-harness/runtime-context-contract'
it('preserves the adopted constructive type boundaries', () => {
  expectTypeOf<'current' extends keyof ChangeMaterial ? true : false>().toEqualTypeOf<false>()
  expectTypeOf<Extract<RegistrationChange, { kind: 'add' }>['creating']>().toEqualTypeOf<boolean>()
  expectTypeOf<
    Extract<ProducerRegistration, { declaration: { volatility: 'per-request' } }>['supply']
  >().not.toBeUndefined()
  expectTypeOf<Extract<RegistrationChange, { kind: 'update' }>>().not.toHaveProperty('required')
})
it('carries the principal, the tenant and the closed supply answers (J41)', () => {
  expectTypeOf<Parameters<HolderOperations<string>['applyCommit']>[0]>().toEqualTypeOf<string>()
  expectTypeOf<ProducerRegistration>().toHaveProperty('tenant')
  expectTypeOf<Parameters<ProducerHandle['publish']>[0]>().toHaveProperty('tenant')
  expectTypeOf<SupplyAnswer<number>['kind']>().toEqualTypeOf<
    'value' | 'none' | 'unavailable' | 'refused' | 'unknown'
  >()
  expectTypeOf<Extract<CommitInput, { kind: 'scope' }>['scopeEnded']>().toEqualTypeOf<true>()
})
function exhaustive(result: ReadOutcome<unknown>): void {
  switch (result.kind) {
    case 'success':
    case 'refused':
    case 'missing':
    case 'unknown':
      return
    default:
      result satisfies never
  }
}
function changes(result: ChangesResult): void {
  if (result.kind === 'cursor-invalidated') return
  exhaustive(result)
}
void changes

import type {
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '@omne-harness/runtime-context-contract'
import type { MemoryRuntimeContextOptions } from '@omne-harness/runtime-context-contract/testing'
declare const authority: RuntimeContextAuthority<string>
declare const bindings: ScopeBindingSource
it('RuntimeContextTrust is exactly the two original ports, read-only', () => {
  expectTypeOf<RuntimeContextTrust<string>>().toEqualTypeOf<
    Readonly<{ authority: RuntimeContextAuthority<string>; bindings: ScopeBindingSource }>
  >()
  const ok: RuntimeContextTrust<string> = { authority, bindings }
  // @ts-expect-error bindings is required
  const noBindings: RuntimeContextTrust<string> = { authority }
  // @ts-expect-error authority is required
  const noAuthority: RuntimeContextTrust<string> = { bindings }
  // @ts-expect-error an unknown property is not a third port
  const extra: RuntimeContextTrust<string> = { authority, bindings, current: true }
  // @ts-expect-error the authority slot takes the authority port, not the binding source
  const wrong: RuntimeContextTrust<string> = { authority: bindings, bindings }
  // @ts-expect-error the trust object is read-only
  ok.authority = authority
  void [noBindings, noAuthority, extra, wrong]
})
it('MemoryRuntimeContextOptions accepts the same values as the two-field shape', () => {
  type Old = Readonly<{
    authority: RuntimeContextAuthority<string>
    bindings: ScopeBindingSource
    retention?: number
    replayCapacity?: number
    supplyBoundMs?: number
    settleBoundMs?: number
  }>
  expectTypeOf<MemoryRuntimeContextOptions<string>>().toExtend<Old>()
  expectTypeOf<Old>().toExtend<MemoryRuntimeContextOptions<string>>()
  const trust: RuntimeContextTrust<string> = { authority, bindings }
  const viaTrust: MemoryRuntimeContextOptions<string> = { ...trust, retention: 1 }
  // @ts-expect-error both ports stay required
  const missing: MemoryRuntimeContextOptions<string> = { authority }
  void [viaTrust, missing]
})
