// The contribution types come from the protocol contract: a handler whose body or answer
// disagrees with the contract, or a contribution that leaves out an operation, does not compile.
import { expectTypeOf, test } from 'vitest'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import type {
  AccessContribution,
  AnswerOf,
  BodyOf,
  CallContext,
  LoginIdentity,
  OperationHandler,
  Principal,
} from '@omne-harness/access-cordis-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const noteRef = ruleCodec({ kind: 'object', fields: { noteId: { rule: { kind: 'text' } } } })
const note = ruleCodec({
  kind: 'object',
  fields: { noteId: { rule: { kind: 'text' } }, title: { rule: { kind: 'text' } } },
})

const notes = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    open: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
    read: {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: noteRef,
      outcomes: { succeeded: note, 'not-found': empty },
    },
    save: {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'input',
      body: note,
      outcomes: { succeeded: empty, conflict: empty },
    },
  },
  observations: {
    watch: { identity: 'login', open: noteRef, frame: note, ends: ['note-deleted'] },
  },
})
type Notes = typeof notes
type Read = Notes['operations']['read']
type Save = Notes['operations']['save']

const contribution = {
  protocol: notes,
  operations: {
    open: async () => ({ outcome: 'succeeded', body: {} }),
    read: async (_call, body) =>
      body.noteId === 'n-1'
        ? { outcome: 'succeeded', body: { noteId: 'n-1', title: 'Plan' } }
        : { outcome: 'not-found', body: {} },
    save: async () => ({ outcome: 'unknown' }),
  },
  observations: {
    watch: async () => ({ outcome: 'basis-unavailable' }),
  },
} satisfies AccessContribution<Notes>

test('a contribution that follows the contract compiles', () => {
  expectTypeOf(contribution).toExtend<AccessContribution<Notes>>()
})

test('the body type and the answer type come from the contract', () => {
  expectTypeOf<BodyOf<Read>>().toEqualTypeOf<{ readonly noteId: string }>()
  expectTypeOf<AnswerOf<Read>>().toEqualTypeOf<
    | {
        readonly outcome: 'succeeded'
        readonly body: { readonly noteId: string; readonly title: string }
      }
    | { readonly outcome: 'not-found'; readonly body: {} }
    | { readonly outcome: 'protocol-rejected' }
    | { readonly outcome: 'basis-unavailable' }
    | { readonly outcome: 'denied' }
  >()
  expectTypeOf<OperationHandler<Read>>().parameter(1).toEqualTypeOf<{ readonly noteId: string }>()
})

test('the principal follows the identity column', () => {
  expectTypeOf<CallContext<Notes['operations']['open']>['principal']>().toEqualTypeOf<undefined>()
  expectTypeOf<CallContext<Read>['principal']>().toEqualTypeOf<LoginIdentity>()
  expectTypeOf<CallContext<Save>['principal']>().toEqualTypeOf<Principal>()
  expectTypeOf<CallContext<Read>['signal']>().toEqualTypeOf<AbortSignal>()
})

test('a contribution that disagrees with the contract does not compile', () => {
  const missing = {
    protocol: notes,
    // @ts-expect-error The contribution leaves out the operation `save`.
    operations: {
      open: contribution.operations.open,
      read: contribution.operations.read,
    },
    observations: contribution.observations,
  } satisfies AccessContribution<Notes>
  const wrongBody = {
    protocol: notes,
    operations: {
      ...contribution.operations,
      // @ts-expect-error `read` reads `noteId` as text, not as a number.
      read: async (_call: CallContext<Read>, body: { readonly noteId: number }) => ({
        outcome: 'not-found' as const,
        body: { id: body.noteId },
      }),
    },
    observations: contribution.observations,
  } satisfies AccessContribution<Notes>
  const outsideOutcome = {
    protocol: notes,
    operations: {
      ...contribution.operations,
      // @ts-expect-error `gone` is not in the result set of `save`.
      save: async () => ({ outcome: 'gone' as const }),
    },
    observations: contribution.observations,
  } satisfies AccessContribution<Notes>
  const wrongAnswerBody = {
    protocol: notes,
    operations: {
      ...contribution.operations,
      // @ts-expect-error The `succeeded` body of `read` has `noteId` and `title`, both text.
      read: async () => ({ outcome: 'succeeded' as const, body: { noteId: 'n-1', title: 3 } }),
    },
    observations: contribution.observations,
  } satisfies AccessContribution<Notes>
  const extraOperation = {
    protocol: notes,
    operations: {
      ...contribution.operations,
      // @ts-expect-error `delete` is not an operation of the contract.
      delete: async () => ({ outcome: 'succeeded' as const, body: {} }),
    },
    observations: contribution.observations,
  } satisfies AccessContribution<Notes>
  void [missing, wrongBody, outsideOutcome, wrongAnswerBody, extraOperation]
})
