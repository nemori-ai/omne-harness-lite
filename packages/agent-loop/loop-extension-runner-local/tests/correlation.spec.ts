import { describe, expect, it } from 'vitest'
import { LosslessNumber, jsonNumberSource, isJsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, type Conclusion } from '@omne-harness-lite/loop-extension'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
} from '@omne-harness-lite/loop-extension-runner'

const tenant = { organization: 'org', account: 'account' } as TenantId
const at = '2026-09-28T10:00:00Z'
const reminderResult = judgeMessage({
  id: 'reminder-1',
  type: 'system_reminder',
  blocks: [],
  createdAt: at,
  nature: 'event',
  source: { kind: 'extension', extension: 'extension-a' },
})
if (!('ok' in reminderResult) || reminderResult.ok.type !== 'system_reminder')
  throw new Error('invalid fixture')
const reminder = reminderResult.ok
const injected = {
  extension: 'extension-a',
  position: 'before_persist_message',
  power: 'rewrite',
  at,
  output: { kind: 'inject', message: reminder },
} as Conclusion

describe('runner correlation and exact values', () => {
  it('reuses the shared reminder message and rejects changed copies', () => {
    const base = {
      session: 'session-a',
      tenant,
      execution: { kind: 'noRun' } as const,
      anchor: 'anchor-a',
      occurrence: { kind: 'final' } as const,
      value: injected,
    }
    const good = prepareRunnerConclusion({ ...base, reminders: [reminder] })
    expect('entry' in good).toBe(true)
    if (!('entry' in good)) return
    const entry: LogEntry = { ...good.entry, session: 'session-a', position: 1 } as LogEntry
    expect(inspectRunnerConclusion({ session: 'session-a', tenant, entry })).toMatchObject({
      reminders: [reminder],
    })
    expect(prepareRunnerConclusion({ ...base, reminders: [] })).toEqual({ invalidInput: true })
    const changed = judgeMessage({ ...reminder, id: 'other-id' })
    if (!('ok' in changed) || changed.ok.type !== 'system_reminder')
      throw new Error('changed fixture rejected')
    expect(prepareRunnerConclusion({ ...base, reminders: [changed.ok] })).toEqual({
      invalidInput: true,
    })
    expect(
      inspectRunnerConclusion({
        session: 'session-a',
        tenant,
        entry: { ...entry, payload: { ...(entry.payload as object), reminders: [] } },
      }),
    ).toEqual({ invalid: true })
  })

  it('normalizes exact ask ordinals without losing high digits', () => {
    const huge = new LosslessNumber('900719925474099312345')
    const key = passKeys({
      position: 'before_persist_message',
      anchor: 'a',
      extension: 'extension-a',
      occurrence: { kind: 'ask', ordinal: huge },
    })
    expect('ask' in key && key.ask).toContain('900719925474099312345')
    expect(
      passKeys({
        position: 'before_persist_message',
        anchor: 'a',
        extension: 'extension-a',
        occurrence: { kind: 'ask', ordinal: 1000 },
      }),
    ).toEqual(
      passKeys({
        position: 'before_persist_message',
        anchor: 'a',
        extension: 'extension-a',
        occurrence: { kind: 'ask', ordinal: new LosslessNumber('1e3') },
      }),
    )
  })

  it('reports unknown runner markers as corrupt and rejects prefix gaps', () => {
    const good = prepareRunnerConclusion({
      session: 'session-a',
      tenant,
      execution: { kind: 'noRun' },
      anchor: 'a',
      occurrence: { kind: 'final' },
      value: {
        extension: 'extension-a',
        position: 'before_persist_message',
        power: 'observe',
        at,
        output: { kind: 'observed' },
      } as Conclusion,
      reminders: [],
    })
    if (!('entry' in good)) throw new Error('fixture rejected')
    const entry: LogEntry = { ...good.entry, session: 'session-a', position: 1 } as LogEntry
    expect(
      inspectRunnerConclusion({
        session: 'session-a',
        tenant,
        entry: { ...entry, dedupeKey: 'runner/6/["future"]' },
      }),
    ).toEqual({ invalid: true })
    expect(
      inspectRunnerConclusion({ session: 'session-a', tenant, entry: { ...entry, attempt: 1 } }),
    ).toEqual({ invalid: true })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'call-a',
        entries: [entry],
        tail: 1,
      }),
    ).toEqual({ conclusions: [] })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'call-a',
        entries: [{ ...entry, position: 2 }],
        tail: 1,
      }),
    ).toEqual({ unavailable: true })
    expect(
      readRunnerRetryConclusions({
        session: 'session-a',
        tenant,
        callId: 'call-a',
        entries: [entry],
        tail: 2,
      }),
    ).toEqual({ unavailable: true })
  })

  it('applies a rewrite followed by model selection to a fresh subject', () => {
    const input = judgePositionedSubject({
      position: 'before_model_call',
      subject: {
        request: { target: 'vendor-a/chat-large', parameters: {}, messages: [], tools: [] },
      },
    })
    if (!('ok' in input)) throw new Error('fixture rejected')
    const initial = input.ok
    if (initial.position !== 'before_model_call') throw new Error('wrong position fixture')
    const rewrite = {
      extension: 'extension-a',
      position: 'before_model_call',
      power: 'rewrite',
      at,
      output: {
        kind: 'rewrite',
        subject: { request: { ...initial.subject.request, parameters: { temperature: 0.2 } } },
      },
    } as Conclusion
    const select = {
      extension: 'extension-b',
      position: 'before_model_call',
      power: 'rewrite',
      at,
      output: { kind: 'select_model', profile: 'vendor-b/chat-large' },
    } as Conclusion
    const result = composeEffect(initial, [rewrite, select])
    expect(result).toMatchObject({
      effect: {
        kind: 'proceed',
        subject: { request: { target: 'vendor-b/chat-large' } },
      },
    })
    if (
      !('effect' in result) ||
      result.effect.kind !== 'proceed' ||
      !('request' in result.effect.subject)
    )
      throw new Error('wrong effect')
    const temperature = result.effect.subject.request.parameters.temperature
    expect(isJsonNumber(temperature) && jsonNumberSource(temperature)).toBe('0.2')
    expect(initial.subject.request.target).toBe('vendor-a/chat-large')
  })

  it('composes a failed model-call retry from a pure subject with no execution shell', () => {
    const adaptation = {
      implementation: { name: 'vendor-a.family', revision: '1' },
      definition: { modelId: 'vendor-a/chat-large', revision: '1' },
      configuration: { revision: '1', values: {} },
    }
    const profile = {
      providers: ['provider-a'],
      allowFallback: true,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 200000,
      maxOutputTokens: 64000,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      adaptation,
      updatedAt: at,
    }
    const dispatch = {
      adaptation,
      kind: 'model_call_dispatched',
      call: 'model-call-1',
      dispatch: 1,
      provider: 'provider-a',
      response: 'response-1',
      profile: { origin: 'official', routeName: 'vendor-a/chat-large' },
      profileSnapshot: profile,
      parameters: {},
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
    }
    const admitted = judgePositionedSubject({
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      subject: {
        failure: 'upstream_unavailable',
        profile,
        dispatches: [dispatch],
        retryConclusions: [],
      },
    })
    if (!('ok' in admitted)) throw new Error(`failure fixture rejected: ${admitted.rejected}`)
    const retry = {
      extension: 'extension-a',
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      modelCallId: 'model-call-1',
      power: 'rewrite',
      at,
      output: { kind: 'retry', plan: { provider: 'provider-a' } },
    } as Conclusion
    expect(composeEffect(admitted.ok, [retry])).toEqual({
      effect: { kind: 'retry', plan: { provider: 'provider-a' } },
    })
    const wrongCall = { ...retry, modelCallId: 'another' } as Conclusion
    expect(composeEffect(admitted.ok, [wrongCall])).toEqual({
      invalidInput: true,
    })
  })
})
