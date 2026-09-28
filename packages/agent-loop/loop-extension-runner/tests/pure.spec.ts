import { describe, expect, it } from 'vitest'
import { LosslessNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, type Conclusion } from '@omne-harness-lite/loop-extension'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
} from '../src/index.ts'

const tenant = { organization: 'org', account: 'account' } as TenantId
const otherTenant = { organization: 'other', account: 'account' } as TenantId
const at = '2026-09-28T10:00:00Z'
const initialJudgment = judgePositionedSubject({
  position: 'before_persist_message',
  subject: {
    message: { id: 'msg1', type: 'user', blocks: [], createdAt: at },
    producer: 'user',
  },
})
if (!('ok' in initialJudgment)) throw new Error('initial fixture rejected')
const initial = initialJudgment.ok
const observed = {
  extension: 'runner-a',
  position: 'before_persist_message',
  power: 'observe',
  at,
  output: { kind: 'observed' },
} as Conclusion
const retry = {
  extension: 'runner-retry',
  position: 'after_model_call',
  dimension: { ending: 'failure' },
  modelCallId: 'model-call-1',
  power: 'rewrite',
  at,
  output: { kind: 'retry', plan: { provider: 'provider-a' } },
} as Conclusion

function logged(value: Conclusion, anchor: string, position: number): LogEntry {
  const prepared = prepareRunnerConclusion({
    session: 'session-a',
    tenant,
    execution: { kind: 'withRun', run: 'run-a', attempt: 1 },
    anchor,
    occurrence: { kind: 'final' },
    value,
    reminders: [],
  })
  if (!('entry' in prepared)) throw new Error('fixture rejected')
  return { ...prepared.entry, session: 'session-a', position } as LogEntry
}

describe('runner pure keys and Conclusion codec', () => {
  it('uses distinct escaped keys and exact ask ordinals', () => {
    const a = passKeys({
      position: 'before_persist_message',
      anchor: 'a,b',
      extension: 'x',
      occurrence: { kind: 'final' },
    })
    const b = passKeys({
      position: 'before_persist_message',
      anchor: 'a',
      extension: 'b,x',
      occurrence: { kind: 'final' },
    })
    expect(a).not.toEqual(b)
    const ask = passKeys({
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      anchor: 'a',
      extension: 'x',
      occurrence: { kind: 'ask', ordinal: new LosslessNumber('900719925474099312345') },
      modelCallId: 'call-1',
    })
    expect('ask' in ask && ask.ask).toContain('900719925474099312345')
    expect(passKeys({ position: 'after_model_call', anchor: 'a' })).toEqual({ invalidInput: true })
    expect(
      passKeys({ position: 'before_persist_message', anchor: 'a', modelCallId: 'call-1' }),
    ).toEqual({ invalidInput: true })
    expect(
      passKeys({
        position: 'after_model_call',
        dimension: { ending: 'complete_reply' },
        anchor: 'a',
        modelCallId: 'call-1',
      }),
    ).toEqual({ invalidInput: true })
  })

  it('round trips the full value and rejects wrong scope and domain corruption', () => {
    const prepared = prepareRunnerConclusion({
      session: 'session-a',
      tenant,
      execution: { kind: 'noRun' },
      anchor: 'anchor-a',
      occurrence: { kind: 'final' },
      value: observed,
      reminders: [],
    })
    expect('entry' in prepared).toBe(true)
    if (!('entry' in prepared)) return
    const entry = { ...prepared.entry, session: 'session-a', position: 1 } as LogEntry
    expect(inspectRunnerConclusion({ session: 'session-a', tenant, entry })).toMatchObject({
      conclusion: observed,
      anchor: 'anchor-a',
      execution: { kind: 'noRun' },
    })
    expect(inspectRunnerConclusion({ session: 'session-a', tenant: otherTenant, entry })).toEqual({
      invalid: true,
    })
    expect(inspectRunnerConclusion({ session: 'another-session', tenant, entry })).toEqual({
      invalid: true,
    })
    expect(
      inspectRunnerConclusion({
        session: 'session-a',
        tenant,
        entry: { ...entry, readKeys: ['runner/5/["unknown"]'] },
      }),
    ).toEqual({ invalid: true })
    expect(
      inspectRunnerConclusion({
        session: 'session-a',
        tenant,
        entry: { ...entry, payload: { ...(entry.payload as object), extra: true } },
      }),
    ).toEqual({ invalid: true })
    expect(
      prepareRunnerConclusion({
        session: 'session-a',
        tenant,
        execution: { kind: 'noRun' },
        anchor: 'a',
        occurrence: { kind: 'final' },
        value: retry,
        reminders: [],
      }),
    ).toEqual({ invalidInput: true })
  })

  it('keeps two same-value retries from distinct anchored entries in log order', () => {
    const first = logged(retry, 'first', 1)
    const second = logged(retry, 'second', 2)
    const read = readRunnerRetryConclusions({
      session: 'session-a',
      tenant,
      callId: 'model-call-1',
      entries: [first, second],
      tail: 2,
    })
    expect('conclusions' in read && read.conclusions).toHaveLength(2)
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'model-call-2',
        entries: [first, second],
        tail: 2,
      }),
    ).toEqual({ conclusions: [] })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'model-call-1',
        entries: [first, second],
        tail: 3,
      }),
    ).toEqual({ unavailable: true })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'model-call-1',
        entries: [first, { ...second, position: 3 }],
        tail: 2,
      }),
    ).toEqual({ unavailable: true })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant: otherTenant,
        callId: 'model-call-1',
        entries: [first, second],
        tail: 2,
      }),
    ).toEqual({ unavailable: true })
  })
})

describe('effect from original subject', () => {
  it('preserves the initial subject for an empty or observed chain', () => {
    expect(composeEffect(initial, [])).toEqual({
      effect: { kind: 'proceed', subject: initial.subject },
    })
    expect(composeEffect(initial, [observed])).toEqual({
      effect: { kind: 'proceed', subject: initial.subject },
    })
  })
  it('rejects invalid rewrite and stops at the first terminal result', () => {
    const veto = {
      ...observed,
      power: 'veto',
      output: { kind: 'veto', reason: 'blocked' },
    } as Conclusion
    expect(composeEffect(initial, [veto])).toEqual({ effect: { kind: 'vetoed', by: 'runner-a' } })
    expect(composeEffect(initial, [veto, observed])).toEqual({ invalidInput: true })
    const badRewrite = {
      ...observed,
      power: 'rewrite',
      output: { kind: 'rewrite', subject: { ...initial.subject, producer: 'model' } },
    } as Conclusion
    expect(composeEffect(initial, [badRewrite])).toEqual({ invalidInput: true })
  })
})
