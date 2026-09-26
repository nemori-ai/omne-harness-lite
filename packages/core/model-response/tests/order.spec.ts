import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import { complete, failed, interrupted, object, omit, openedFailure } from './fixtures.ts'

const reply = object(complete.reply)
const timing = object(complete.timing)
const delivered = object(openedFailure).delivered
const failure = { cause: 'unrecognized', localError: 'trace' }
const cases = [
  [
    'string cause_unknown before fractional dispatch and wrong outcome type',
    { ...complete, dispatch: new LosslessNumber('0.5'), outcome: false, failure: { cause: 'new' } },
    'cause_unknown',
  ],
  [
    'dispatch_zero before wrong outcome type',
    { ...complete, dispatch: 0, outcome: false },
    'dispatch_zero',
  ],
  [
    'outcome_unknown before dispatch/cause/other member errors',
    { ...complete, outcome: 'new', dispatch: 0, failure: { cause: 'new' }, cost: null },
    'outcome_unknown',
  ],
  [
    'dispatch_zero before cause/other member errors',
    { ...complete, dispatch: new LosslessNumber('-1e400'), failure: { cause: 'new' }, cost: null },
    'dispatch_zero',
  ],
  [
    'cause_unknown before malformed member/outcome conditions',
    { ...omit(complete, 'reply'), failure: { cause: 'new', statusCode: false }, cost: null },
    'cause_unknown',
  ],
  [
    'fractional dispatch is malformed, not dispatch_zero',
    { ...complete, dispatch: new LosslessNumber('-0.01') },
    'malformed',
  ],
  [
    'malformed foreign reply before reply_on_failure',
    { ...failed, reply: { ...reply, ending: 'new' } },
    'malformed',
  ],
  ['malformed cost before missing reply', { ...omit(complete, 'reply'), cost: {} }, 'malformed'],
  [
    'malformed failure member before failure_on_interrupted',
    { ...interrupted, failure: { cause: 'request_rejected', inBand: false } },
    'malformed',
  ],
  [
    'malformed failure extra member before failure_on_interrupted',
    { ...interrupted, failure: { cause: 'request_rejected', extra: true } },
    'malformed',
  ],
  [
    'reply_missing before failure_on_success/first_token/cross malformed',
    {
      ...omit(complete, 'reply'),
      failure: { cause: 'interrupted_mid_reply', inBand: true },
      timing: omit(timing, 'firstTokenAt'),
    },
    'reply_missing',
  ],
  [
    'reply_on_failure before reply_and_delivered/failure_missing/first_token',
    { ...omit(failed, 'failure'), reply, delivered },
    'reply_on_failure',
  ],
  [
    'reply_and_delivered before failure_on_interrupted/ending/first_token',
    { ...interrupted, reply, delivered, failure },
    'reply_and_delivered',
  ],
  [
    'failure_missing before first_token/cross malformed',
    { ...omit(openedFailure, 'failure', 'delivered'), replyDisposition: 'persisted' },
    'failure_missing',
  ],
  [
    'failure_on_interrupted before missing inBand status/first_token',
    { ...interrupted, failure: { cause: 'interrupted_mid_reply', inBand: true } },
    'failure_on_interrupted',
  ],
  [
    'failure_on_success before ending/first_token/cross malformed',
    {
      ...complete,
      failure: { cause: 'interrupted_mid_reply', inBand: true },
      reply: { ...reply, ending: 'truncated_at_limit' },
      timing: omit(timing, 'firstTokenAt'),
    },
    'failure_on_success',
  ],
  [
    'reply_ending_mismatch before first_token/cross malformed',
    {
      ...omit(complete, 'replyDisposition'),
      reply: { ...reply, ending: 'truncated_at_limit' },
      timing: omit(timing, 'firstTokenAt'),
    },
    'reply_ending_mismatch',
  ],
  [
    'first_token before disposition/cross malformed',
    { ...omit(complete, 'replyDisposition'), timing: omit(timing, 'firstTokenAt') },
    'first_token_inconsistent',
  ],
  [
    'first_token before inBand missing status',
    { ...failed, failure: { cause: 'interrupted_mid_reply', inBand: true } },
    'first_token_inconsistent',
  ],
  [
    'independent inBand missing status finally malformed',
    { ...openedFailure, failure: { cause: 'interrupted_mid_reply', inBand: true } },
    'malformed',
  ],
  [
    'failed opened without delivered fails first_token',
    omit(openedFailure, 'delivered'),
    'first_token_inconsistent',
  ],
  [
    'failed opened wrong cause before missing inBand status',
    { ...openedFailure, failure: { cause: 'request_rejected', inBand: true } },
    'first_token_inconsistent',
  ],
  [
    'delivered without first_token before interrupted initiator missing',
    { ...omit(interrupted, 'initiator'), delivered },
    'first_token_inconsistent',
  ],
] as const
describe('S-27 named and unnamed rejection precedence', () => {
  for (const [name, value, expected] of cases)
    it(name, () => expect(judgeModelResponse(value)).toEqual({ rejected: expected }))
})
