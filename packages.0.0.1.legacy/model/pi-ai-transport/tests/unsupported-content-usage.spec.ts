import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import { certificate, fixture, finish, input, invocation, policy, sse } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

const fields = ['images', 'audio'] as const
const marker = 'PRIVATE-UNSUPPORTED-CONTENT-MUST-NOT-BE-LOGGED'
const values = {
  images: [{ url: marker }],
  audio: { data: marker },
  refusal: marker,
}
const usage = {
  prompt_tokens: 123,
  completion_tokens: 7,
  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 3 },
  cost: new LosslessNumber('0.000123456789123456789'),
}

describe('unsupported content field diagnostics through actual TLS and public invocation', () => {
  for (const field of fields) {
    it(`${field}: names only the fixed field, preserves same-frame usage/cost and stops a hanging upstream`, async () => {
      const closed = Promise.withResolvers<void>()
      const events: ArrivalEvent[] = []
      const diagnostics: unknown[] = []
      const host = await fixture(
        cert.tls,
        res => {
          res.once('close', () => closed.resolve())
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.write(sse({ choices: [{ delta: { [field]: values[field] } }], usage }))
          // No finish, DONE or EOF: the client must stop without awaiting future facts.
        },
        {},
        diagnostic => {
          diagnostics.push(diagnostic)
        },
      )
      try {
        const signal = new AbortController().signal
        const result = invocation(
          await invokeModel({
            ...input(),
            transport: host.transport,
            credential: 'synthetic-test-credential',
            signal,
            policy: policy(),
            onAccepted: event => {
              events.push(event)
            },
          }).outcome,
        )
        expect(result.outcome).toBe('failed')
        expect(result.failure).toMatchObject({
          cause: 'unrecognized',
          localError: `unsupported content member: ${field}`,
        })
        expect(result.blocks).toEqual([])
        expect(result.usage.input_tokens).not.toBe('unknown')
        if (result.usage.input_tokens === 'unknown') throw Error('missing input usage')
        expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(100))).toBe(0)
        expect(result.usage).toMatchObject({
          output_tokens: 7,
          cache_read_tokens: 20,
          cache_write_tokens: 3,
          source: 'upstream',
        })
        expect(writeJsonLossless(result.cost)).toContain('"cost_usd":0.000123456789123456789')
        expect(result.inputCalibration.observedInput).toMatchObject({
          kind: 'from_usage',
          provenance: {
            fieldPaths: [
              'usage.prompt_tokens',
              'usage.prompt_tokens_details.cached_tokens',
              'usage.prompt_tokens_details.cache_write_tokens',
            ],
          },
        })
        const accounts = events.filter(event => event.t === 'account')
        expect(accounts).toHaveLength(1)
        expect(accounts[0]).toMatchObject({ usage: result.usage, cost: result.cost })
        expect(events.filter(event => event.t === 'finish')).toHaveLength(1)
        expect(writeJsonLossless(result)).not.toContain(marker)
        expect(JSON.stringify(diagnostics)).not.toContain(marker)
        expect(signal.aborted).toBe(false)
        await closed.promise
        expect(host.requests).toHaveLength(1)
      } finally {
        await host.close()
      }
    })

    it(`${field}: does not turn a subsequent unread usage frame into known accounting`, async () => {
      const events: ArrivalEvent[] = []
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(
          sse({ choices: [{ delta: { [field]: values[field] } }] }) +
            sse({ choices: [], usage }) +
            finish(),
        )
      })
      try {
        const result = invocation(
          await invokeModel({
            ...input(),
            transport: host.transport,
            credential: 'synthetic-test-credential',
            signal: new AbortController().signal,
            policy: policy(),
            onAccepted: event => {
              events.push(event)
            },
          }).outcome,
        )
        expect(result.failure?.localError).toBe(`unsupported content member: ${field}`)
        expect(result.usage).toEqual({
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
          source: 'none',
        })
        expect(result.cost).toEqual({ cost_usd: 'unknown', source: 'none' })
        expect(result.inputCalibration.observedInput).toEqual({
          kind: 'unavailable',
          reason: 'missing_usage',
        })
        expect(events.filter(event => event.t === 'account')).toHaveLength(0)
        expect(writeJsonLossless(result)).not.toContain(marker)
        expect(host.requests).toHaveLength(1)
      } finally {
        await host.close()
      }
    })

    for (const [label, empty] of [
      ['null', null],
      ['empty string', ''],
      ['empty array', []],
    ] as const) {
      it(`${field}: ignores ${label} and completes normally`, async () => {
        const host = await fixture(cert.tls, res => {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(sse({ choices: [{ delta: { [field]: empty, content: 'accepted' } }] }) + finish())
        })
        try {
          const result = invocation(
            await invokeModel({
              ...input(),
              transport: host.transport,
              credential: 'synthetic-test-credential',
              signal: new AbortController().signal,
              policy: policy(),
            }).outcome,
          )
          expect(result.outcome).toBe('complete')
          expect(result.failure).toBeUndefined()
          expect(result.blocks).toMatchObject([{ kind: 'text', text: 'accepted' }])
          expect(host.requests).toHaveLength(1)
        } finally {
          await host.close()
        }
      })
    }
  }

  it('retains existing source redaction even when a credential equals the fixed field name', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(sse({ choices: [{ delta: { images: values.images } }] })),
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'images',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.failure?.cause).toBe('unrecognized')
      expect(result.failure?.localError).toContain('unsupported content member:')
      expect(result.failure?.localError).not.toContain('images')
      expect(writeJsonLossless(result)).not.toContain(marker)
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })
})
