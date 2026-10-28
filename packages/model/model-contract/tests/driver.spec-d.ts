import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ModelBindingFailure,
  ModelDriveInput,
  ModelDriver,
  ModelDriverBinding,
  ModelDriverHost,
  ModelHostAuthority,
  ModelInstanceHost,
} from '@omne-harness/model-contract/provider'
import { call, evidence, instance, operation, tenant } from './values.ts'

const drive: ModelDriveInput<string> = {
  principal: 'p',
  tenant,
  call,
  instance,
  operation,
  continuity: evidence,
}

it('a drive input carries the instance, the operation and the continuity evidence', () => {
  const { continuity: _continuity, ...withoutContinuity } = drive
  // @ts-expect-error a drive input needs continuity evidence
  const noContinuity: ModelDriveInput<string> = withoutContinuity
  void noContinuity
})

it('an adapter can implement the driver, the host authority and the binding from the contract alone', () => {
  const driver: ModelDriver<string> = { drive: async () => ({ ok: undefined }) }
  const authority: ModelHostAuthority<string> = { resolve: async () => ({ ok: drive }) }
  const binding: ModelDriverBinding = { close: async () => ({ ok: undefined }) }
  void [driver, authority, binding]
})

it('a binding conflict is expressed without a business operation or revision', () => {
  const conflict: ModelBindingFailure = { kind: 'conflict' }
  const unavailable: ModelBindingFailure = { kind: 'unavailable', dependency: 'd', diagnostic: 'x' }
  // @ts-expect-error a binding failure is not an arbitrary model failure
  const denied: ModelBindingFailure = { kind: 'denied', action: 'bind' }
  void [conflict, unavailable, denied]
})

declare const plainHost: ModelInstanceHost<string>

it('a ModelDriverHost is an instance host that also binds a driver', () => {
  expectTypeOf<ModelDriverHost<string>>().toExtend<ModelInstanceHost<string>>()
  expectTypeOf<ModelDriverHost<string>['bind']>().toEqualTypeOf<
    (driver: ModelDriver<string>) => Promise<Outcome<ModelDriverBinding, ModelBindingFailure>>
  >()
  // @ts-expect-error a plain instance host cannot bind a driver
  void plainHost.bind
})
