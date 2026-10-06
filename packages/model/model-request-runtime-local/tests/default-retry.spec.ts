import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type {
  AfterModelCallFailureSubject,
  ExtensionInput,
  ModelRetryConclusion,
} from '@omne-harness-lite/loop-extension'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createDefaultRetryImplementation, DEFAULT_RETRY_BUILTIN } from '../src/default-retry.ts'
import { EffectImplementations, loadDefaultRetry } from './retry-assembly.ts'

const adaptation = {
  implementation: { name: 'test-transport', revision: 'one' },
  definition: { modelId: 'test/model', revision: 'one' },
  configuration: { revision: 'one', values: {} },
}
const profile: ModelProfileSnapshot = {
  adaptation,
  providers: ['A', 'B', 'C'],
  allowFallback: true,
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
function dispatched(provider: string, dispatch: number): ModelCallDispatchedRecord {
  return {
    kind: 'model_call_dispatched',
    call: 'call',
    dispatch,
    response: `response-${dispatch}`,
    provider,
    adaptation,
    profile: { origin: 'official', routeName: 'test/model' },
    profileSnapshot: profile,
    parameters: {},
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
  }
}
function conclusion(extension: string, after: string): ModelRetryConclusion {
  return {
    extension,
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    power: 'rewrite',
    modelCallId: 'call',
    output: { kind: 'retry', plan: { provider: 'B', after } },
    at: '2026-09-28T00:00:00Z',
  }
}
function input(
  retryConclusions: readonly ModelRetryConclusion[] = [],
  subject: AfterModelCallFailureSubject = {
    failure: 'upstream_unavailable',
    profile,
    dispatches: [dispatched('A', 1), dispatched('B', 2)],
    retryConclusions,
  },
): ExtensionInput {
  const log = parseOpaqueIdentifier('log', 'LogHandle')
  const environment = parseOpaqueIdentifier('environment', 'EnvironmentHandle')
  if (!('ok' in log) || !('ok' in environment)) throw new Error('invalid test handles')
  return {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    subject,
    run: 'run',
    attempt: 1,
    earlier: [],
    log: log.ok,
    environment: environment.ok,
  }
}
const policy = {
  kind: 'linear',
  base: 'PT1S',
  factor: 2,
  max: 'PT10S',
  jitter: 'decorrelated',
} as const

function sameProviderInput(
  [first, ...rest]: readonly [ModelCallDispatchedRecord, ...ModelCallDispatchedRecord[]],
  retryConclusions: readonly ModelRetryConclusion[],
): ExtensionInput {
  const single: ModelProfileSnapshot = { ...profile, providers: ['A'], allowFallback: false }
  const own = (item: ModelCallDispatchedRecord) => ({ ...item, profileSnapshot: single })
  return input(retryConclusions, {
    failure: 'upstream_unavailable',
    profile: single,
    dispatches: [own(first), ...rest.map(own)],
    retryConclusions,
  })
}

describe('M17-V9 the P-5 contribution derives n and previousDelay from the same subject only', () => {
  const signal = new AbortController().signal
  function after(result: unknown): unknown {
    return typeof result === 'object' && result !== null && 'value' in result
      ? (result as { readonly value: { readonly plan?: { readonly after?: unknown } } }).value.plan
          ?.after
      : result
  }

  it('decorrelated uses the last default retry plan.after, never a custom one, and base first', async () => {
    const implementation = createDefaultRetryImplementation({ policy, sample: () => 0.5 })
    // lo=1s; hi=min(previous*2,10s); result=lo+0.5*(hi-lo)
    expect(after(await implementation(input(), signal))).toBe('PT1.5S')
    expect(
      after(
        await implementation(
          input([
            conclusion(DEFAULT_RETRY_BUILTIN, 'PT2S'),
            conclusion(DEFAULT_RETRY_BUILTIN, 'PT3S'),
            conclusion('tenant:custom', 'PT9S'),
          ]),
          signal,
        ),
      ),
    ).toBe('PT3.5S')
    expect(
      after(
        await implementation(
          input([conclusion('tenant:custom', 'PT4S'), conclusion(DEFAULT_RETRY_BUILTIN, 'PT2S')]),
          signal,
        ),
      ),
    ).toBe('PT2.5S')
    // Only a custom conclusion: the default contribution has not spent a delay yet.
    expect(after(await implementation(input([conclusion('tenant:custom', 'PT4S')]), signal))).toBe(
      'PT1.5S',
    )
  })

  it('counts recorded default retries, including duplicates, not dispatches or continuations', async () => {
    const exponential = createDefaultRetryImplementation({
      policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT30S', jitter: 'none' },
      sample: () => 0,
    })
    // Two dispatches with zero default retries is n=1; one recorded retry is n=2.
    expect(after(await exponential(input(), signal))).toBe('PT1S')
    expect(
      after(await exponential(input([conclusion(DEFAULT_RETRY_BUILTIN, 'PT1S')]), signal)),
    ).toBe('PT2S')
    expect(
      after(
        await exponential(
          input([
            conclusion(DEFAULT_RETRY_BUILTIN, 'PT1S'),
            conclusion(DEFAULT_RETRY_BUILTIN, 'PT1S'),
          ]),
          signal,
        ),
      ),
    ).toBe('PT4S')
    expect(after(await exponential(input([conclusion('tenant:custom', 'PT1S')]), signal))).toBe(
      'PT1S',
    )
    // A same-provider resumable continuation is a dispatch, not a spent default retry.
    const continued = [dispatched('A', 1), dispatched('A', 2)] as const
    expect(await exponential(sameProviderInput(continued, []), signal)).toEqual({
      kind: 'output',
      value: { kind: 'retry', plan: { provider: 'A', after: 'PT1S' } },
    })
    expect(
      await exponential(
        sameProviderInput(continued, [
          {
            ...conclusion(DEFAULT_RETRY_BUILTIN, 'PT1S'),
            output: { kind: 'retry', plan: { provider: 'A', after: 'PT1S' } },
          },
        ]),
        signal,
      ),
    ).toEqual({ kind: 'output', value: { kind: 'observed' } })
  })

  it('uses only the injected sample source and never the process random source', async () => {
    const full = {
      kind: 'exponential',
      base: 'PT4S',
      factor: 2,
      max: 'PT30S',
      jitter: 'full',
    } as const
    const random = Math.random
    let randomCalls = 0
    Math.random = () => {
      randomCalls++
      return 0.75
    }
    try {
      const quarter = createDefaultRetryImplementation({ policy: full, sample: () => 0.25 })
      const half = createDefaultRetryImplementation({ policy: full, sample: () => 0.5 })
      expect(after(await quarter(input(), signal))).toBe('PT1S')
      expect(after(await half(input(), signal))).toBe('PT2S')
    } finally {
      Math.random = random
    }
    expect(randomCalls).toBe(0)
  })

  it('fails construction without a complete policy or sample and does not start when cancelled', async () => {
    for (const config of [
      { sample: () => 0 },
      { policy },
      { policy: { ...policy, jitter: 'unknown' }, sample: () => 0 },
      { policy: { ...policy, extra: true }, sample: () => 0 },
      null,
    ])
      expect(() => createDefaultRetryImplementation(config as never)).toThrow(TypeError)
    const controller = new AbortController()
    controller.abort()
    let sampled = 0
    const implementation = createDefaultRetryImplementation({
      policy,
      sample: () => {
        sampled++
        return 0
      },
    })
    expect(await implementation(input(), controller.signal)).toEqual({
      kind: 'notStartedUnavailable',
    })
    expect(sampled).toBe(0)
    expect(
      await implementation(
        { ...input(), position: 'after_model_call', dimension: { ending: 'success' } } as never,
        signal,
      ),
    ).toMatchObject({ kind: 'errored' })
  })
})

describe('P-5 default retry contribution', () => {
  it('uses the last same-subject default retry delay, including duplicates, and keeps custom conclusions', async () => {
    const implementation = createDefaultRetryImplementation({ policy, sample: () => 0 })
    const signal = new AbortController().signal
    expect(await implementation(input(), signal)).toEqual({
      kind: 'output',
      value: {
        kind: 'retry',
        plan: { provider: 'C', after: 'PT1S' },
      },
    })
    expect(
      await implementation(
        input([
          conclusion('tenant:custom', 'PT9S'),
          conclusion(DEFAULT_RETRY_BUILTIN, 'PT2S'),
          conclusion(DEFAULT_RETRY_BUILTIN, 'PT3S'),
        ]),
        signal,
      ),
    ).toEqual({
      kind: 'output',
      value: {
        kind: 'retry',
        plan: { provider: 'C', after: 'PT1S' },
      },
    })
  })

  it('rejects invalid configuration and distinguishes unavailable sample from started errors', async () => {
    expect(() =>
      createDefaultRetryImplementation({ policy: { ...policy, base: 'bad' }, sample: () => 0 }),
    ).toThrow(TypeError)
    const unavailable = createDefaultRetryImplementation({
      policy,
      sample: () => ({ unavailable: true }),
    })
    expect(await unavailable(input(), new AbortController().signal)).toEqual({
      kind: 'notStartedUnavailable',
    })
    const invalid = createDefaultRetryImplementation({ policy, sample: () => 2 })
    expect(await invalid(input(), new AbortController().signal)).toEqual({
      kind: 'errored',
      error: 'default_retry_invalidInput',
    })
  })

  it('registers only its Cordis generation and unregisters it on provider removal', async () => {
    const ctx = new Context()
    const registry = new Map<string, unknown>()
    const consumer = await loadDefaultRetry(ctx, { policy, sample: () => 0 })
    expect(registry.size).toBe(0)
    const provider = await ctx.plugin(
      definePlugin({
        name: 'retry-registry-test',
        Config: z.object({}).strict(),
        apply(inner) {
          new EffectImplementations(inner, {
            registerAdmission() {
              throw new Error('Retry contributor must not register admission')
            },
            registerBuiltin(name: string, implementation: unknown) {
              if (registry.has(name)) throw new Error('duplicate')
              registry.set(name, implementation)
              return () => {
                if (registry.get(name) === implementation) registry.delete(name)
              }
            },
          })
        },
      }),
      {},
    )
    await consumer.await()
    expect(registry.has(DEFAULT_RETRY_BUILTIN)).toBe(true)
    await provider.dispose()
    expect(registry.size).toBe(0)
    await consumer.dispose()
  })
})
