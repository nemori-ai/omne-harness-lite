import { expectTypeOf, it } from 'vitest'
import type {
  CardRef,
  CommandResult,
  HumanInterventionCommands,
  HumanInterventionQueries,
  OperationRef,
  RequestRef,
  SubmitReply,
  ReceiverGeneration,
  Revision,
  RecoveryQueries,
  RecoveryCommands,
} from '../src/index.ts'

it('keeps unrelated references and query/write interfaces distinct', () => {
  expectTypeOf<OperationRef>().not.toEqualTypeOf<RequestRef>()
  expectTypeOf<CardRef>().not.toEqualTypeOf<RequestRef>()
  expectTypeOf<ReceiverGeneration>().not.toEqualTypeOf<Revision>()
  expectTypeOf<RecoveryQueries<unknown>>().not.toHaveProperty('bindReceiver')
  expectTypeOf<RecoveryCommands<unknown>>().not.toHaveProperty('readInbox')
  expectTypeOf<HumanInterventionCommands<unknown>>().not.toHaveProperty('getCard')
  expectTypeOf<HumanInterventionQueries<unknown>>().not.toHaveProperty('submitReply')
  expectTypeOf<
    Parameters<HumanInterventionCommands<unknown>['submitReply']>[1]
  >().toEqualTypeOf<SubmitReply>()
  expectTypeOf<
    Awaited<ReturnType<HumanInterventionCommands<unknown>['submitReply']>>
  >().toEqualTypeOf<CommandResult<'submitReply'>>()
})
