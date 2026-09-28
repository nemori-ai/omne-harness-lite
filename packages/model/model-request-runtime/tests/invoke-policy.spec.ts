import { describe, expect, it, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  type InvocationInput,
  type PlannedSemantics,
  type TransportFailure,
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
    expect(await handle.outcome).toEqual({ rejected: 'invalidInput' })
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
    expect(await handle.outcome).toEqual({ rejected: 'invalidInput' })
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
    gate.resolve()
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
