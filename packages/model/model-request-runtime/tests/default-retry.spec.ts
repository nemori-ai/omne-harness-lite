import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
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
import { createModelDefaultRetryPlugin } from '../src/default-retry-plugin.ts'

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
function input(retryConclusions: readonly ModelRetryConclusion[] = []): ExtensionInput {
  const log = parseOpaqueIdentifier('log', 'LogHandle')
  const environment = parseOpaqueIdentifier('environment', 'EnvironmentHandle')
  if (!('ok' in log) || !('ok' in environment)) throw new Error('invalid test handles')
  const subject: AfterModelCallFailureSubject = {
    failure: 'upstream_unavailable',
    profile,
    dispatches: [dispatched('A', 1), dispatched('B', 2)],
    retryConclusions,
  }
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
    const consumer = await ctx.plugin(
      createModelDefaultRetryPlugin({ policy, sample: () => 0 }),
      {},
    )
    expect(registry.size).toBe(0)
    const provider = await ctx.plugin(
      definePlugin({
        name: 'retry-registry-test',
        Config: z.object({}).strict(),
        apply(inner) {
          inner.provide('loopExtensionImplementations', {
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
