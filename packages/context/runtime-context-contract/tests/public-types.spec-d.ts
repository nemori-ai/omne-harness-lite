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
