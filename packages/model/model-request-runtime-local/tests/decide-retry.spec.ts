import { describe, expect, it, vi } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  AfterModelCallFailureSubject,
  ModelRetryConclusion,
} from '@omne-harness-lite/loop-extension'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import { decideRetry } from '../src/decide-retry.ts'
import type { DecideRetryInput } from '../src/decide-retry-types.ts'

const adaptation = {
  implementation: { name: 'test-transport', revision: 'one' },
  definition: { modelId: 'test/model', revision: 'one' },
  configuration: { revision: 'one', values: {} },
}

function profile(providers: string[], allowFallback = true): ModelProfileSnapshot {
  return {
    adaptation,
    providers,
    allowFallback,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 100,
    maxOutputTokens: 20,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    updatedAt: '2026-09-28T00:00:00Z',
  }
}

function dispatch(
  snapshot: ModelProfileSnapshot,
  provider: string,
  ordinal: number,
): ModelCallDispatchedRecord {
  return {
    kind: 'model_call_dispatched',
    call: 'call',
    dispatch: ordinal,
    response: `response-${ordinal}`,
    provider,
    adaptation,
    profile: { origin: 'official', routeName: 'test/model' },
    profileSnapshot: snapshot,
    parameters: {},
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
  }
}

function input(
  providers: string[],
  sent: string[],
  options: {
    allowFallback?: boolean
    failure?: AfterModelCallFailureSubject['failure']
    retryConclusions?: readonly ModelRetryConclusion[]
  } = {},
): DecideRetryInput {
  const snapshot = profile(providers, options.allowFallback ?? true)
  const dispatches = sent.map((provider, index) => dispatch(snapshot, provider, index + 1))
  const first = dispatches[0]
  if (first === undefined) throw new Error('test needs a dispatch')
  const subject: AfterModelCallFailureSubject = {
    failure: options.failure ?? 'upstream_unavailable',
    profile: snapshot,
    dispatches: [first, ...dispatches.slice(1)],
    retryConclusions: options.retryConclusions ?? [],
  }
  return {
    subject: { known: subject },
    policy: { kind: 'linear', base: 'PT1S', factor: 2, max: 'PT10S', jitter: 'none' },
    uniformSample: 0.25,
  }
}

function retryConclusion(
  extension = 'omne-official:default-retry',
  provider = 'A',
): ModelRetryConclusion {
  return {
    extension,
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    power: 'rewrite',
    modelCallId: 'call',
    output: { kind: 'retry', plan: { provider } },
    at: '2026-09-28T00:00:00Z',
  }
}

function raw(value: unknown) {
  return Reflect.apply(decideRetry, undefined, [value])
}

describe('RT5 S-35/S-60 finite default retry decision', () => {
  it('uses the snapshot order and one retry per provider, counting a resumed same-provider send once', () => {
    expect(decideRetry(input(['A', 'B', 'C'], ['A']))).toEqual({
      kind: 'retry',
      plan: { provider: 'B', after: 'PT1S' },
    })
    expect(decideRetry(input(['A', 'B', 'C'], ['A', 'A']))).toEqual({
      kind: 'retry',
      plan: { provider: 'B', after: 'PT1S' },
    })
    expect(
      decideRetry(
        input(['A', 'B', 'C'], ['A', 'B'], {
          retryConclusions: [retryConclusion()],
        }),
      ),
    ).toEqual({
      kind: 'retry',
      plan: { provider: 'C', after: 'PT2S' },
    })
    expect(decideRetry(input(['A', 'B', 'C'], ['A', 'B', 'C']))).toEqual({ kind: 'observed' })
  })

  it('offers the first same-provider retry when fallback is forbidden', () => {
    expect(decideRetry(input(['A', 'B'], ['A'], { allowFallback: false }))).toEqual({
      kind: 'retry',
      plan: { provider: 'A', after: 'PT1S' },
    })
  })

  it('does not skip an already tried immediate successor after a custom retry changed the order', () => {
    // A custom piece may legally dispatch A -> B -> A. After the latest A,
    // S-35 names B as the immediate next provider. B has already been tried;
    // skipping it to C would invent a different default fallback rule.
    expect(decideRetry(input(['A', 'B', 'C'], ['A', 'B', 'A']))).toEqual({
      kind: 'observed',
    })
  })

  it('distinguishes a resumed dispatch from a consumed same-provider retry', () => {
    const resumedThenFailed = input(['A'], ['A', 'A'], { allowFallback: false })
    const retriedThenFailed = input(['A'], ['A', 'A'], {
      allowFallback: false,
      retryConclusions: [retryConclusion()],
    })
    expect(writeJsonLossless(resumedThenFailed)).not.toBe(writeJsonLossless(retriedThenFailed))
    expect(decideRetry(resumedThenFailed)).toEqual({
      kind: 'retry',
      plan: { provider: 'A', after: 'PT1S' },
    })
    expect(decideRetry(retriedThenFailed)).toEqual({ kind: 'observed' })
  })

  it('counts only this default extension, preserving custom conclusions', () => {
    const withCustom = input(['A', 'B', 'C'], ['A', 'B'], {
      retryConclusions: [retryConclusion('tenant:custom', 'B')],
    })
    expect(decideRetry(withCustom)).toEqual({
      kind: 'retry',
      plan: { provider: 'C', after: 'PT1S' },
    })
    const withDefault = input(['A', 'B', 'C'], ['A', 'B'], {
      retryConclusions: [retryConclusion('tenant:custom', 'B'), retryConclusion()],
    })
    expect(decideRetry(withDefault)).toEqual({
      kind: 'retry',
      plan: { provider: 'C', after: 'PT2S' },
    })
  })

  it.each([
    'withdrawn',
    'scope_disallowed',
    'modality_mismatch',
    'credential_unavailable',
    'request_rejected',
    'interrupted_mid_reply',
  ] as const)('does not retry failure cause %s', failure => {
    expect(decideRetry(input(['A', 'B'], ['A'], { failure }))).toEqual({ kind: 'observed' })
  })

  it('treats unrecognized as retryable and uses exact delay jitter from the shared function', () => {
    const ordinary = input(['A', 'B'], ['A'], { failure: 'unrecognized' })
    const result = decideRetry({
      subject: ordinary.subject,
      policy: { kind: 'constant', base: 'PT2S', factor: 1, max: 'PT5S', jitter: 'half' },
      uniformSample: 0.25,
    })
    expect(result).toEqual({ kind: 'retry', plan: { provider: 'B', after: 'PT1.25S' } })
  })

  it('distinguishes genuinely unavailable subject from malformed input', () => {
    expect(decideRetry({ ...input(['A'], ['A']), subject: { unknown: true } })).toEqual({
      rejected: 'unavailable',
    })
    expect(raw({ ...input(['A'], ['A']), subject: { known: null } })).toEqual({
      rejected: 'invalidInput',
    })
    expect(raw({ ...input(['A'], ['A']), subject: { unknown: false } })).toEqual({
      rejected: 'invalidInput',
    })
    expect(raw({ ...input(['A'], ['A']), uniformSample: 1 })).toEqual({
      rejected: 'invalidInput',
    })
    const ordinary = input(['A'], ['A'])
    if (!('known' in ordinary.subject)) throw new Error('known subject')
    const { retryConclusions: _history, ...withoutHistory } = ordinary.subject.known
    expect(raw({ ...ordinary, subject: { known: withoutHistory } })).toEqual({
      rejected: 'invalidInput',
    })
    expect(
      raw({
        ...ordinary,
        subject: {
          known: {
            ...ordinary.subject.known,
            retryConclusions: [{ ...retryConclusion(), modelCallId: 'another-call' }],
          },
        },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      raw({
        ...input(['A'], ['A']),
        policy: { kind: 'mystery', base: 'PT1S', factor: 2, max: 'PT2S', jitter: 'none' },
      }),
    ).toEqual({
      rejected: 'invalidInput',
    })
    expect(
      raw({
        ...input(['A', 'B'], ['A']),
        policy: { kind: 'constant', base: 'PT1S', factor: 2, max: 'PT2S', jitter: 'decorrelated' },
        previousDelay: 'PT2S',
      }),
    ).toEqual({
      rejected: 'invalidInput',
    })
  })

  it('rejects inconsistent or malformed dispatch evidence before selecting a provider', () => {
    const ordinary = input(['A', 'B'], ['A'])
    if (!('known' in ordinary.subject)) throw new Error('test fact')
    const first = ordinary.subject.known.dispatches[0]
    expect(
      raw({ ...ordinary, subject: { known: { ...ordinary.subject.known, dispatches: [] } } }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      raw({
        ...ordinary,
        subject: {
          known: { ...ordinary.subject.known, dispatches: [{ ...first, provider: 'X' }] },
        },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      raw({
        ...ordinary,
        subject: { known: { ...ordinary.subject.known, dispatches: [{ ...first, dispatch: 2 }] } },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      raw({
        ...ordinary,
        subject: {
          known: {
            ...ordinary.subject.known,
            dispatches: [
              {
                ...first,
                adaptation: { ...adaptation, configuration: { revision: 'other', values: {} } },
              },
            ],
          },
        },
      }),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it('does not mutate the input or consult random, timers, network, or current model', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('random')
    })
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('time')
    })
    const ordinary = input(['A', 'B'], ['A'])
    const before = writeJsonLossless(ordinary)
    try {
      expect(decideRetry(ordinary)).toEqual({
        kind: 'retry',
        plan: { provider: 'B', after: 'PT1S' },
      })
      expect(writeJsonLossless(ordinary)).toBe(before)
      expect(random).not.toHaveBeenCalled()
      expect(now).not.toHaveBeenCalled()
    } finally {
      random.mockRestore()
      now.mockRestore()
    }
  })
})
