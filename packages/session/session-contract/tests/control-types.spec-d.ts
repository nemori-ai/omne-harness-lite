import { expectTypeOf, it } from 'vitest'
import type {
  Decision,
  RunTerminal,
  SessionCallTerminal,
  SessionControlReceipt,
  SessionEntriesReceipt,
  SessionFailure,
  SessionTransactionPort,
  SessionWork,
} from '@omne-harness/session-contract'

it('exposes the shapes of the contract face', () => {
  expectTypeOf<{ kind: 'unsupported' }>().toMatchTypeOf<SessionFailure>()
  expectTypeOf<Extract<Decision, { kind: 'control-answer' }>['answer']['kind']>().toEqualTypeOf<
    'ended' | 'not-found'
  >()
  expectTypeOf<Extract<Decision, { kind: 'entries' }>>().toHaveProperty('progress')
  expectTypeOf<Extract<Decision, { kind: 'entries' }>>().toHaveProperty('interpreted')
  expectTypeOf<ReturnType<SessionWork<string>['cancelRun']>>().resolves.toMatchTypeOf<
    { ok: SessionControlReceipt<RunTerminal> } | { failure: SessionFailure }
  >()
  expectTypeOf<ReturnType<SessionWork<string>['stopCall']>>().resolves.toMatchTypeOf<
    { ok: SessionControlReceipt<SessionCallTerminal> } | { failure: SessionFailure }
  >()
  expectTypeOf<
    ReturnType<SessionTransactionPort<string>['commitEntries']>
  >().resolves.toMatchTypeOf<{ ok: SessionEntriesReceipt } | { failure: SessionFailure }>()
})
