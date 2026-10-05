import { describe, expect, it } from 'vitest'
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { certificate, content, fixture, input, policy, sse } from './support.ts'

describe('D6 diagnostic thenable isolation across real HTTPS', () => {
  it('keeps one complete response and exact upstream fee when a diagnostic record violates its sync port', async () => {
    const cert = certificate()
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(
        content('visible') +
          sse({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6, cost: 0.0000117 },
          }) +
          sse('[DONE]'),
      )
    })
    const failures: string[] = []
    let recordCalls = 0
    let closeCalls = 0
    const validEmitter = {
      record() {
        return { dropped: 'closed' as const }
      },
      close() {
        closeCalls++
      },
    }
    const violatingEmitter = new Proxy(validEmitter, {
      get(target, key, receiver) {
        if (key === 'record')
          return () => {
            recordCalls++
            return {
              then(_resolve: unknown, reject: (reason: unknown) => void) {
                queueMicrotask(() => reject(new Error('private diagnostic thenable failure')))
              },
            }
          }
        return Reflect.get(target, key, receiver)
      },
    })
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'private-credential',
        signal: new AbortController().signal,
        policy: {
          ...policy(),
          diagnostic(event) {
            failures.push(event.kind)
          },
        },
        diagnosticEmitterFactory: () => violatingEmitter,
      })
      const result = await handle.outcome
      if (!('outcome' in result)) throw new Error('public invocation did not send')
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toHaveLength(1)
      expect(result.cost.source).toBe('upstream_usage')
      if (result.cost.cost_usd === 'unknown') throw new Error('exact upstream fee unavailable')
      expect(jsonNumberSource(result.cost.cost_usd)).toBe('0.0000117')
      expect(host.requests).toHaveLength(1)
      expect(recordCalls).toBe(1)
      expect(closeCalls).toBe(1)
      expect(failures).toEqual([
        'model_invocation.diagnostic_contract_violation',
        'model_invocation.stopped',
      ])
      expect(JSON.stringify(result)).not.toContain('private diagnostic thenable failure')
      expect(JSON.stringify(failures)).not.toContain('private diagnostic thenable failure')
    } finally {
      await host.close()
      cert.dispose()
    }
  })
})
