import { expectTypeOf, it } from 'vitest'
import type {
  CallAccess,
  DispatchRecord,
  GrowingContentKind,
  ModelCalls,
  Mutation,
  Reply,
} from '@omne-harness/model-contract'
import {
  account,
  adoption,
  call,
  capacity,
  consumer,
  dispatch,
  evidence,
  operation,
  request,
  revision,
  supplier,
  tenant,
} from './values.ts'

it('GrowingContentKind names the four content that may still grow', () => {
  expectTypeOf<GrowingContentKind>().toEqualTypeOf<
    'text' | 'thinking' | 'tool-arguments' | 'voice'
  >()
})

it('DispatchRecord keeps the send state and the cost apart', () => {
  const sent: DispatchRecord = {
    dispatch,
    supplier,
    intent: operation,
    send: 'started',
    firstContent: 'observed',
    terminal: null,
    account,
    materialization: null,
  }
  const prepared: DispatchRecord = { ...sent, send: 'prepared', account: null, terminal: null }
  // @ts-expect-error an unlisted send state
  const guessed: DispatchRecord = { ...sent, send: 'sent' }
  const { account: _omitted, ...withoutAccount } = sent
  // @ts-expect-error a missing cost is null, not absent
  const noAccount: DispatchRecord = withoutAccount
  void [prepared, guessed, noAccount]
})

it('an adapter can implement ModelCalls from the contract alone', () => {
  const calls: ModelCalls<string> = {
    admit: async () => ({ ok: { call, revision, recovered: false } }),
    inspect: async input => ({ ok: { kind: 'not-accepted', operation: input.admission } }),
    dispatches: async () => ({ ok: [] }),
    cancel: async () => ({ ok: { kind: 'none' } }),
  }
  void calls
  expectTypeOf<ModelCalls<string>['cancel']>().parameter(0).toEqualTypeOf<Mutation<string>>()
  expectTypeOf<ModelCalls<string>['dispatches']>().returns.toEqualTypeOf<
    Reply<readonly DispatchRecord[]>
  >()
  expectTypeOf<ModelCalls<string>['admit']>().parameter(0).toExtend<Mutation<string>>()
  expectTypeOf<ModelCalls<string>['inspect']>().parameter(0).toExtend<CallAccess<string>>()
})

declare const calls: ModelCalls<string>

it('cancel carries no reason and admit needs the tenant', () => {
  void calls.cancel({
    principal: 'p',
    tenant,
    call,
    operation,
    // @ts-expect-error a cancel carries no reason
    reason: 'user asked',
  })
  // @ts-expect-error the tenant is required
  void calls.admit({ principal: 'p', call, operation, request, consumer, capacity })
  void [adoption, evidence]
})
