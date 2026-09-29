import { describe, expect, it, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import {
  invokeModel,
  type InvocationInput,
  type PlannedSemantics,
  type PlanFailure,
  type TransportFailure,
  type StreamEnd,
} from '@omne-harness-lite/model-request-runtime'
import { adapter, content, deferred, policy, request, result } from './invoke-policy-fixture.ts'
const headers = Object.freeze({ 'x-values': Object.freeze(['b', '', 'b', 'a']), 'x-empty': '' })
function invoke(
  port: ReturnType<typeof adapter>,
  credential = '503',
  extra: Partial<InvocationInput<PlannedSemantics, object>> = {},
) {
  return invokeModel({
    ...request(),
    transport: port.transport,
    credential,
    signal: new AbortController().signal,
    policy: policy(),
    ...extra,
  })
}
describe('D095 runtime CP policy wiring with actual public stream-assembly', () => {
  it('uses the stopped reader facts for usage and input observation, not an earlier account frame', async () => {
    const port = adapter({
      readFacts: {
        usage: {
          input_tokens: 37,
          output_tokens: 3,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          source: 'upstream',
        },
        cost: { cost_usd: 0.2, source: 'upstream_usage' },
        observedInput: {
          kind: 'from_usage',
          provenance: { adapterRevision: 'fixture', fieldPaths: ['usage.prompt_tokens'] },
        },
      },
    })
    const handle = invoke(port)
    const value = result(await handle.outcome)
    expect(value.usage.input_tokens).toBe(37)
    expect(value.cost.cost_usd).toBe(0.2)
    expect(value.inputCalibration.observedInput).toMatchObject({
      kind: 'from_usage',
      provenance: { adapterRevision: 'fixture' },
    })
    expect(handle.observedFacts()).toMatchObject({
      facts: { usage: { input_tokens: 37 }, cost: { cost_usd: 0.2 } },
    })
  })

  it('passes positive fractional Duration values to the supplied scheduler unchanged', async () => {
    const scheduled: number[] = []
    const port = adapter()
    const handle = invoke(port, '503', {
      policy: {
        ...policy(),
        firstContentTimeoutMs: 0.1,
        idleContentTimeoutMs: 0.25,
        schedule(milliseconds) {
          scheduled.push(milliseconds)
          return () => {}
        },
      },
    })
    expect(await handle.outcome).toHaveProperty('outcome')
    expect(scheduled).toEqual([0.1, 0.25])
    expect(port.sends()).toBe(1)
  })
  it.each([
    { rejected: 'invalidInput', reason: 'input_limit_missing', metrics: ['maxInputTokens'] },
    { rejected: 'invalidInput', reason: 'input_size_unavailable', metrics: ['maxRequestBytes'] },
    {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxImages',
      actual: 3,
      limit: 2,
    },
    {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
      estimatedTokens: new LosslessNumber('9007199254740993'),
      admissionTokens: new LosslessNumber('11258999068426243'),
      limit: new LosslessNumber('11258999068426242'),
    },
  ] satisfies PlanFailure[])(
    'preserves the complete plan refusal before send: $reason',
    async failure => {
      const port = adapter()
      const handle = invoke(port, '503', {
        transport: { ...port.transport, plan: () => failure },
      })
      expect(await handle.outcome).toEqual(failure)
      expect(port.sends()).toBe(0)
      expect(port.reads()).toBe(0)
    },
  )
  it('maps a missing current cap after earlier planning refusals without sending', async () => {
    const port = adapter()
    const { maxInputTokens: _missing, ...snapshot } = request().snapshot
    const raw = { ...request(), snapshot }
    const missing = Reflect.apply(invokeModel, undefined, [
      {
        ...raw,
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await missing.outcome).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxInputTokens'],
    })
    expect(port.sends()).toBe(0)
    const missingWithInvalidMargin = Reflect.apply(invokeModel, undefined, [
      {
        ...raw,
        tokenMargin: undefined,
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await missingWithInvalidMargin.outcome).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxInputTokens'],
    })
    expect(port.sends()).toBe(0)
    const sawOriginalCap: boolean[] = []
    const prior = Reflect.apply(invokeModel, undefined, [
      {
        ...raw,
        transport: {
          ...port.transport,
          plan(value: typeof raw) {
            sawOriginalCap.push(Object.hasOwn(value.snapshot, 'maxInputTokens'))
            return { rejected: 'modality_not_carried' }
          },
        },
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await prior.outcome).toEqual({ rejected: 'modality_not_carried' })
    expect(sawOriginalCap).toEqual([false])
    expect(port.sends()).toBe(0)
  })
  it('captures the explicit margin before asynchronous planning', async () => {
    const port = adapter()
    const margin = { multiplier: 1.25, reserveTokens: 2 }
    const input = request()
    const seen: unknown[] = []
    const handle = invokeModel({
      ...input,
      tokenMargin: margin,
      transport: {
        ...port.transport,
        plan(value) {
          seen.push(value.tokenMargin)
          return port.transport.plan(value)
        },
      },
      credential: '503',
      signal: new AbortController().signal,
      policy: policy(),
    })
    margin.multiplier = 99
    margin.reserveTokens = 99
    expect(await handle.outcome).toHaveProperty('outcome')
    expect(seen).toEqual([{ multiplier: 1.25, reserveTokens: 2 }])
  })
  it('maps a missing required upstream fact to its metric', async () => {
    const port = adapter()
    const base = request()
    const { maxRequestBytes: _missing, ...upstreamInputLimits } = base.snapshot.upstreamInputLimits
    const handle = Reflect.apply(invokeModel, undefined, [
      {
        ...base,
        snapshot: { ...base.snapshot, upstreamInputLimits },
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await handle.outcome).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxRequestBytes'],
    })
    expect(port.sends()).toBe(0)
  })
  it('does not invent a margin and does not hide unrelated malformed snapshot data', async () => {
    const port = adapter()
    const noMargin = Reflect.apply(invokeModel, undefined, [
      {
        ...request(),
        tokenMargin: undefined,
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await noMargin.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    const { maxInputTokens: _missing, ...snapshot } = request().snapshot
    const malformed = Reflect.apply(invokeModel, undefined, [
      {
        ...request(),
        snapshot: { ...snapshot, maxOutputTokens: null },
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: policy(),
      },
    ])
    expect(await malformed.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(port.sends()).toBe(0)
  })
  for (const credential of ['503', 'true', 'null'])
    it(`CP-V1 redacts raw scalar/key/error ${credential} but retains independent status`, async () => {
      const fact: TransportFailure = {
        source: 'http_status',
        statusCode: 503,
        upstreamError: {
          code: credential,
          message: `echo ${credential}`,
          raw: {
            [credential]:
              credential === '503'
                ? new LosslessNumber('503')
                : credential === 'true'
                  ? true
                  : null,
            statusCode: credential === '503' ? 503 : credential === 'true' ? true : null,
          },
        },
        localError: `local ${credential}`,
      }
      const port = adapter({ sent: { failed: fact, rawHeaders: headers } })
      const value = result(await invoke(port, credential).outcome)
      expect(value.failure?.statusCode).toBe(503)
      expect(value.failure?.cause).toBe('upstream_unavailable')
      expect(value.rawHeaders).toBe(headers)
      expect(value.failure?.upstreamError).toEqual({
        code: '█',
        message: 'echo █',
        raw: { '█': '█', statusCode: '█' },
      })
      expect(value.failure?.localError).toBe('local █')
      expect(port.sends()).toBe(1)
    })
  it('CP-V1 keeps in-band503 instead of HTTP200 and retains actual cost/usage/content', async () => {
    const port = adapter({
      sent: { response: {}, rawHeaders: headers },
      events: content('business503'),
      end: {
        failed: {
          source: 'in_band',
          inBand: true,
          httpStatus: 200,
          statusCode: new LosslessNumber('5.03e2'),
          upstreamError: { raw: { code: 503, id: '503', cost: 503 } },
        },
      },
    })
    const value = result(await invoke(port).outcome)
    expect(value.failure?.inBand).toBe(true)
    expect(writeJsonLossless(value.failure?.statusCode ?? null)).toBe('5.03e2')
    expect(value.failure?.cause).toBe('interrupted_mid_reply')
    expect(value.failure?.upstreamError).toEqual({ raw: { code: '█', id: '█', cost: '█' } })
    expect(writeJsonLossless(value.cost)).toContain('503.00')
    expect(value.usage.input_tokens).toBe(503)
    expect(value.blocks).toMatchObject([{ text: 'business503' }])
  })
  it.each([
    {},
    { credential_fragment_min_length: 0, credential_header_names: [], credential_patterns: [] },
  ])('CP-V2 rejects absent/invalid complete config with zero sends', async credentialRedaction => {
    const port = adapter()
    const input = {
      ...request(),
      transport: port.transport,
      credential: '503',
      signal: new AbortController().signal,
      policy: { ...policy(), credentialRedaction, redact: (text: string) => text },
    }
    const handle = Reflect.apply(invokeModel, undefined, [input])
    expect(await handle.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(port.sends()).toBe(0)
  })
  it('CP-V2 old redact-only policy is not a fallback', async () => {
    const port = adapter()
    const { credentialRedaction: _removed, ...remaining } = policy()
    const handle = Reflect.apply(invokeModel, undefined, [
      {
        ...request(),
        transport: port.transport,
        credential: '503',
        signal: new AbortController().signal,
        policy: { ...remaining, redact: (text: string) => text },
      },
    ])
    expect(await handle.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(port.sends()).toBe(0)
  })
  it('CP-V2 config is bound before asynchronous send waits', async () => {
    const wait = deferred()
    const config = {
      credential_fragment_min_length: 8,
      credential_header_names: [],
      credential_patterns: [
        { kind: 'prefix-token' as const, prefix: 'token-', alphabet: 'key' as const },
      ],
    }
    const port = adapter({
      pause: () => wait.promise,
      sent: { failed: { source: 'local', localError: 'token-secret credential' } },
    })
    const handle = invoke(port, 'credential', {
      policy: { ...policy(), credentialRedaction: config },
    })
    const pattern = config.credential_patterns[0]
    if (!pattern) throw new Error('pattern')
    pattern.prefix = 'different-'
    config.credential_patterns.length = 0
    config.credential_fragment_min_length = 64
    wait.resolve()
    expect(result(await handle.outcome).failure?.localError).toBe('█ █')
  })
  for (const ended of ['end', 'max_tokens'] as const)
    it(`CP-V3 ${ended} keeps the exact H reference`, async () => {
      const port = adapter({ sent: { response: {}, rawHeaders: headers }, end: { ended } })
      const value = result(await invoke(port).outcome)
      expect(value.outcome).toBe(ended === 'end' ? 'complete' : 'truncated')
      expect(value.rawHeaders).toBe(headers)
      expect(port.stopped()).toBe(1)
    })
  it('CP-V3 aborted send retains H without entering reader', async () => {
    const port = adapter({ sent: { aborted: true, rawHeaders: headers } })
    const value = result(await invoke(port).outcome)
    expect(value.outcome).toBe('interrupted')
    expect(value.rawHeaders).toBe(headers)
    expect(port.reads()).toBe(0)
  })
  it('CP-V3 gate failure and reader failure retain H', async () => {
    for (const gate of [true, false]) {
      const port = adapter({
        sent: { response: {}, rawHeaders: headers },
        end: { failed: { source: 'stream_broken' } },
      })
      const value = result(
        await invoke(
          port,
          'credential',
          gate
            ? {
                beforeFirstContent: async () => {
                  throw new Error('private original')
                },
              }
            : {},
        ).outcome,
      )
      expect(value.outcome).toBe('failed')
      expect(value.rawHeaders).toBe(headers)
      expect(port.stopped()).toBe(1)
      if (gate) expect(value.blocks).toEqual([])
    }
  })
  it('CP-V3 gate cancellation does not settle before actual reader finally stops', async () => {
    const gate = deferred(),
      stop = deferred()
    let gateEntered = false,
      settled = false
    const port = adapter({
      sent: { response: {}, rawHeaders: headers },
      stopped: () => stop.promise,
    })
    const handle = invoke(port, 'credential', {
      beforeFirstContent: async () => {
        gateEntered = true
        await gate.promise
      },
    })
    const observed = handle.outcome.then(value => {
      settled = true
      return value
    })
    await expect.poll(() => gateEntered).toBe(true)
    handle.abort()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(port.signal()?.aborted).toBe(true)
    stop.resolve()
    const value = result(await observed)
    expect(value.outcome).toBe('interrupted')
    expect(value.rawHeaders).toBe(headers)
    expect(value.blocks).toEqual([])
    expect(handle.observedFacts()).toEqual({ unavailable: true })
    gate.resolve()
    await expect.poll(() => 'facts' in handle.observedFacts()).toBe(true)
  })
  it('CP-V3 distinguishes absent headers and a frozen empty map', async () => {
    const absent = result(await invoke(adapter()).outcome)
    const empty = Object.freeze({})
    const present = result(
      await invoke(adapter({ sent: { response: {}, rawHeaders: empty } })).outcome,
    )
    expect(Object.hasOwn(absent, 'rawHeaders')).toBe(false)
    expect(present.rawHeaders).toBe(empty)
  })
  it('CP-V3 invalid/mutable H is an entire-port violation, closes reader, never filters values', async () => {
    for (const rawHeaders of [
      { x: ['valid'] },
      Object.freeze({ x: ['mutable'] }),
      Object.freeze({ x: Object.freeze([1]) }),
    ]) {
      const port = adapter()
      const badPort = {
        ...port.transport,
        async send() {
          return { response: {}, rawHeaders }
        },
      }
      // Exercise the unknown JavaScript boundary without weakening the typed adapter contract.
      const handle = Reflect.apply(invokeModel, undefined, [
        {
          ...request(),
          transport: badPort,
          credential: '503',
          signal: new AbortController().signal,
          policy: policy(),
        },
      ])
      const value = result(await handle.outcome)
      expect(value.outcome).toBe('failed')
      expect(value.failure?.cause).toBe('unrecognized')
      expect(value.rawHeaders).toBeUndefined()
      expect(port.stopped()).toBe(1)
    }
  })
  it('CP-V3 invalid H cannot erase an independent HTTP failure', async () => {
    const port = adapter({
      sent: { failed: { source: 'http_status', statusCode: 503 }, rawHeaders: { x: 'mutable' } },
    })
    const value = result(await invoke(port).outcome)
    expect(value.failure).toMatchObject({
      cause: 'upstream_unavailable',
      statusCode: 503,
      localError: 'response_headers_port',
    })
    expect(value.rawHeaders).toBeUndefined()
  })
  it('CP-V5 rejected JSON processing keeps H/status and omits unsafe payload', async () => {
    const raw = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        throw new Error('secret503')
      },
    })
    const diagnostics: string[] = []
    const port = adapter({
      sent: {
        failed: { source: 'http_status', statusCode: 503, upstreamError: { raw } },
        rawHeaders: headers,
      },
    })
    const value = result(
      await invoke(port, '503', { policy: policy(event => diagnostics.push(event.kind)) }).outcome,
    )
    expect(value.rawHeaders).toBe(headers)
    expect(value.failure).toMatchObject({
      statusCode: 503,
      cause: 'upstream_unavailable',
      localError: 'failure_json_policy',
    })
    expect(value.failure?.upstreamError).toBeUndefined()
    expect(diagnostics).toContain('model_invocation.failure_json_rejected')
    expect(writeJsonLossless(value)).not.toContain('secret503')
    expect(port.signal()?.aborted).toBe(true)
  })
  it('CP-V5 pure text/json processing defects remain controlled HTTP/in-band facts', async () => {
    const original = String.prototype.charCodeAt
    const spy = vi.spyOn(String.prototype, 'charCodeAt').mockImplementation(function (
      this: string,
      index,
    ) {
      if (String(this).startsWith('defect-raw503')) throw new Error('secret503')
      return original.call(this, index)
    })
    try {
      for (const source of ['http_status', 'in_band'] as const) {
        const failed: TransportFailure =
          source === 'in_band'
            ? { source, inBand: true, statusCode: 503, upstreamError: { message: 'defect-raw503' } }
            : { source, statusCode: 503, localError: 'defect-raw503' }
        const port = adapter({ sent: { failed, rawHeaders: headers } })
        const diagnostics: string[] = []
        const value = result(
          await invoke(port, '503', { policy: policy(event => diagnostics.push(event.kind)) })
            .outcome,
        )
        expect(value.rawHeaders).toBe(headers)
        expect(value.failure?.statusCode).toBe(503)
        expect(value.failure?.cause).toBe('upstream_unavailable')
        expect(value.failure?.upstreamError).toBeUndefined()
        expect(value.failure?.localError).toMatch(/^failure_(text|json)_policy$/)
        expect(diagnostics.some(kind => kind.endsWith('_defect'))).toBe(true)
        expect(writeJsonLossless(value)).not.toContain('secret503')
      }
    } finally {
      spy.mockRestore()
    }
  })
  it('CP-V5 processor defect without an independent upstream failure stays local', async () => {
    const raw = Object.defineProperty({}, 'bad', {
      enumerable: true,
      get() {
        throw new Error('raw secret')
      },
    })
    const value = result(
      await invoke(
        adapter({
          sent: { failed: { source: 'local', upstreamError: { raw } }, rawHeaders: headers },
        }),
      ).outcome,
    )
    expect(value.failure?.cause).toBe('unrecognized')
    expect(value.failure?.statusCode).toBeUndefined()
    expect(value.rawHeaders).toBe(headers)
  })
  it('CP-V2 bind processing defect rejects controlled before any plan/send', async () => {
    const original = String.prototype.slice
    const spy = vi.spyOn(String.prototype, 'slice').mockImplementation(function (
      this: string,
      start,
      end,
    ) {
      if (String(this) === 'bind-defect') throw new Error('secret-original')
      return original.call(this, start, end)
    })
    try {
      const port = adapter(),
        diagnostic: string[] = []
      const handle = invoke(port, 'bind-defect', {
        policy: policy(event => diagnostic.push(event.kind)),
      })
      await expect(handle.outcome).rejects.toThrow('model_invocation.policy_bind_defect')
      expect(port.sends()).toBe(0)
      expect(diagnostic).toEqual(['model_invocation.policy_bind_defect'])
    } finally {
      spy.mockRestore()
    }
  })
  it('CP-V3 retained H has no second policy processing/retention window', async () => {
    const original = String.prototype.charCodeAt
    const spy = vi.spyOn(String.prototype, 'charCodeAt').mockImplementation(function (
      this: string,
      index,
    ) {
      if (String(this) === 'header-only-defect') throw new Error('must not reprocess H')
      return original.call(this, index)
    })
    try {
      const retained = Object.freeze({ x: Object.freeze(['header-only-defect', '']) })
      const value = result(
        await invoke(adapter({ sent: { response: {}, rawHeaders: retained } }), 'credential')
          .outcome,
      )
      expect(value.outcome).toBe('complete')
      expect(value.rawHeaders).toBe(retained)
    } finally {
      spy.mockRestore()
    }
  })
  it('CP-V4 diagnostic sink failure leaves behavior unchanged', async () => {
    const port = adapter({
      sent: { failed: { source: 'local', localError: '503' }, rawHeaders: headers },
    })
    const value = result(
      await invoke(port, '503', {
        policy: policy(() => {
          throw new Error('secret503')
        }),
      }).outcome,
    )
    expect(value.failure).toEqual({ cause: 'unrecognized', localError: '█' })
    expect(value.rawHeaders).toBe(headers)
  })
})

describe('D105 original invocation facts', () => {
  it('requires a synchronous boolean send-admission decision at the final send boundary', async () => {
    const deniedPort = adapter()
    const denied = invoke(deniedPort, 'credential', { beforeSend: () => false })
    expect(await denied.outcome).toEqual({ cancelledBeforeSend: true })
    expect(deniedPort.sends()).toBe(0)
    expect(denied.observedFacts()).not.toHaveProperty('facts.sentAt')
    const malformedPort = adapter()
    const malformed = Reflect.apply(invoke, undefined, [
      malformedPort,
      'credential',
      {
        beforeSend: () => undefined,
      },
    ])
    expect(await malformed.outcome).toEqual({ rejected: 'unavailable' })
    expect(malformedPort.sends()).toBe(0)
    expect(malformed.observedFacts()).not.toHaveProperty('facts.sentAt')
    const port = adapter()
    const thrown = invoke(port, 'credential', {
      beforeSend() {
        throw new Error('admission source unavailable')
      },
    })
    expect(await thrown.outcome).toEqual({ rejected: 'unavailable' })
    expect(port.sends()).toBe(0)
    expect(thrown.observedFacts()).not.toHaveProperty('facts.sentAt')
  })
  it('records the actual send boundary after fallible scheduling and the final cancel check', async () => {
    const noSend = adapter()
    const unscheduled = invoke(noSend, 'credential', {
      policy: {
        ...policy(),
        schedule() {
          throw new Error('scheduler unavailable')
        },
      },
    })
    await expect(unscheduled.outcome).rejects.toThrow('scheduler unavailable')
    expect(noSend.sends()).toBe(0)
    expect(unscheduled.observedFacts()).toMatchObject({ facts: { usage: { source: 'none' } } })
    expect(unscheduled.observedFacts()).not.toHaveProperty('facts.sentAt')

    let sent = 0
    const port = adapter()
    const throwing = invoke(port, 'credential', {
      transport: {
        ...port.transport,
        send() {
          sent++
          throw new Error('send threw synchronously')
        },
      },
    })
    await expect(throwing.outcome).rejects.toThrow('send threw synchronously')
    expect(sent).toBe(1)
    expect(throwing.observedFacts()).toMatchObject({
      facts: { sentAt: '2026-09-28T00:00:00Z', usage: { source: 'none' } },
    })
  })

  it('keeps accepted partial account and exact frozen multi-value headers when result fails', async () => {
    const account = content().find(event => event.t === 'account')
    if (account === undefined) throw new Error('account fixture absent')
    let readerStopped = false
    const port = adapter({ sent: { response: {}, rawHeaders: headers } })
    const handle = invoke(port, 'credential', {
      transport: {
        ...port.transport,
        async *read(): AsyncGenerator<ArrivalEvent, StreamEnd> {
          try {
            yield account
            throw new Error('reader lost continuity')
          } finally {
            readerStopped = true
          }
        },
      },
    })
    expect(handle.observedFacts()).toEqual({ unavailable: true })
    await expect(handle.outcome).rejects.toThrow('reader lost continuity')
    expect(readerStopped).toBe(true)
    const observed = handle.observedFacts()
    if (!('facts' in observed)) throw new Error('stopped facts unavailable')
    expect(observed.facts.sentAt).toBe('2026-09-28T00:00:00Z')
    expect(observed.facts.usage).toMatchObject({
      input_tokens: 503,
      cache_read_tokens: 0,
      cache_write_tokens: 'unknown',
    })
    expect(observed.facts.cost.cost_usd).toEqual(new LosslessNumber('503.00'))
    expect(observed.facts.rawHeaders).toEqual(headers)
    expect(writeJsonLossless(observed.facts.rawHeaders)).toContain('["b","","b","a"]')
    expect(handle.observedFacts()).toEqual(observed)
  })

  it('retains a frame-too-long trim even when no frame was cut', async () => {
    const port = adapter({
      events: [...content(), { t: 'trim', reason: 'frame_too_long', omittedBytes: 3 }],
    })
    const handle = invoke(port)
    const value = result(await handle.outcome)
    if (value.trims === undefined) throw new Error('known trim disappeared')
    expect(writeJsonLossless(value.trims)).toContain('"cut":0')
    expect(writeJsonLossless(value.trims)).toContain('"frame_too_long":1')
    const observed = handle.observedFacts()
    if (!('facts' in observed) || observed.facts.trims === undefined)
      throw new Error('observed trim disappeared')
    expect(writeJsonLossless(observed.facts.trims)).toContain('"cut":0')
    expect(writeJsonLossless(observed.facts.trims)).toContain('"frame_too_long":1')
  })
})
