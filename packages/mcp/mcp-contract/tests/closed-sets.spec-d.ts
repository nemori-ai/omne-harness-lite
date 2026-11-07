import { expectTypeOf, test } from 'vitest'
import type {
  AnswerMalformed,
  ContentDefect,
  DegradedReason,
  EffectUnknown,
  EndpointBodyRejection,
  KeptReason,
  ListingDefect,
  LostReason,
  NoAnswerCause,
  NotSentReason,
  OperationFailure,
  ProtocolFault,
  Refusal,
  UnavailableReason,
} from '@omne-harness/mcp-contract'
import type {
  EligibilityVerdict,
  TaskAnswer,
  TransportFailure,
  WithheldReason,
} from '@omne-harness/mcp-contract/provider'
import type { CLOSED_SETS } from './closed-sets.ts'

type Members<K extends keyof typeof CLOSED_SETS> = (typeof CLOSED_SETS)[K][number]

test('each code list has exactly the members of its type', () => {
  expectTypeOf<Members<'EndpointBodyRejection'>>().toEqualTypeOf<EndpointBodyRejection>()
  expectTypeOf<Members<'ListingDefect'>>().toEqualTypeOf<ListingDefect>()
  expectTypeOf<Members<'UnavailableReason'>>().toEqualTypeOf<UnavailableReason>()
  expectTypeOf<Members<'ContentDefect'>>().toEqualTypeOf<ContentDefect>()
  expectTypeOf<Members<'ProtocolFault'>>().toEqualTypeOf<ProtocolFault['kind']>()
  expectTypeOf<Members<'NoAnswerCause'>>().toEqualTypeOf<NoAnswerCause>()
  expectTypeOf<Members<'Refusal'>>().toEqualTypeOf<Refusal['kind']>()
  expectTypeOf<Members<'NotSentReason'>>().toEqualTypeOf<NotSentReason['kind']>()
  expectTypeOf<Members<'KeptReason'>>().toEqualTypeOf<KeptReason['kind']>()
  expectTypeOf<Members<'OperationFailure'>>().toEqualTypeOf<OperationFailure['kind']>()
  expectTypeOf<Members<'EffectUnknown'>>().toEqualTypeOf<EffectUnknown['cause']>()
  expectTypeOf<Members<'AnswerMalformed'>>().toEqualTypeOf<AnswerMalformed['what']>()
  expectTypeOf<Members<'TransportFailure'>>().toEqualTypeOf<TransportFailure['kind']>()
  expectTypeOf<Members<'DegradedReason'>>().toEqualTypeOf<DegradedReason>()
  expectTypeOf<Members<'LostReason'>>().toEqualTypeOf<LostReason>()
  expectTypeOf<Members<'EligibilityVerdict'>>().toEqualTypeOf<
    Extract<EligibilityVerdict, { kind: 'refused' }>['reason']
  >()
  expectTypeOf<Members<'WithheldReason'>>().toEqualTypeOf<WithheldReason>()
})

test('a finished task answer holds a result or an error, never no-answer (SPEC T6)', () => {
  expectTypeOf<Extract<TaskAnswer, { kind: 'finished' }>['answer']['kind']>().toEqualTypeOf<
    'result' | 'error'
  >()
  // @ts-expect-error `no-answer` is a failure of `getTaskResult`, not the answer of a finished task.
  const absent: TaskAnswer = { kind: 'finished', answer: { kind: 'no-answer', cause: 'abandoned' } }
  void absent
})
