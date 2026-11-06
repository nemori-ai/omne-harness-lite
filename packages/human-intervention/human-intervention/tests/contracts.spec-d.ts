import { expectTypeOf, it } from 'vitest'
import type {
  CardRef,
  CommandResult,
  HumanInterventionCommands,
  HumanInterventionQueries,
  OperationRef,
  RequestRef,
  SubmitReply,
} from '../src/index.ts'

it('keeps unrelated references and query/write interfaces distinct', () => {
  expectTypeOf<OperationRef>().not.toEqualTypeOf<RequestRef>()
  expectTypeOf<CardRef>().not.toEqualTypeOf<RequestRef>()
  expectTypeOf<HumanInterventionCommands<unknown>>().not.toHaveProperty('getCard')
  expectTypeOf<HumanInterventionQueries<unknown>>().not.toHaveProperty('submitReply')
  expectTypeOf<
    Parameters<HumanInterventionCommands<unknown>['submitReply']>[1]
  >().toEqualTypeOf<SubmitReply>()
  expectTypeOf<
    Awaited<ReturnType<HumanInterventionCommands<unknown>['submitReply']>>
  >().toEqualTypeOf<CommandResult<'submitReply'>>()
})
