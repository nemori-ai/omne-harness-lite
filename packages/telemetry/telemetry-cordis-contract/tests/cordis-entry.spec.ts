import { Context } from '@deepseek-ai/cordis'
import type { Admission, Binding, Emitter } from '@omne-harness/telemetry-contract'
import { describe, expect, it } from 'vitest'
import { TelemetryService, telemetryKey } from '../src/cordis.ts'

const admitted: Admission = { kind: 'admitted' }

/** An emitter that admits everything. The seam under test is the service key, not admission. */
const emitter: Emitter = Object.freeze({
  event: () => admitted,
  record: () => admitted,
  startSegment: () => ({ kind: 'dropped', reason: 'invalid' }) as const,
  bind: () => emitter,
})

const bound: Binding[] = []

class ProbeTelemetry extends TelemetryService {
  bind(binding: Binding): Emitter {
    bound.push(binding)
    return emitter
  }
}

const binding: Binding = {
  // The service does not read the scope; the contract validates it in a real provider.
  scope: {} as Binding['scope'],
  component: 'probe',
  instance: { owner: 'packages/telemetry/telemetry-cordis-contract', ref: 'probe' },
}

describe('TelemetryService', () => {
  it('derives the key from its one static field', () => {
    expect(TelemetryService.provide).toBe('telemetry')
    expect(telemetryKey).toBe(TelemetryService.provide)
  })

  it('lets a subclass provide the key and a consumer inject it by the key constant', async () => {
    const ctx = new Context()
    const seen: unknown[] = []
    await ctx.plugin(ProbeTelemetry)
    await ctx.plugin({
      inject: [telemetryKey],
      apply(c) {
        seen.push(c.telemetry)
        seen.push(c.telemetry.bind(binding).event({} as never, {} as never))
      },
    })

    expect(seen).toEqual([expect.any(ProbeTelemetry), admitted])
    expect(bound).toEqual([binding])
  })

  it('leaves the key absent once the provider is disposed', async () => {
    const ctx = new Context()
    const provider = await ctx.plugin(ProbeTelemetry)

    expect(ctx.get(telemetryKey)).toBeInstanceOf(ProbeTelemetry)
    await provider.dispose()
    expect(ctx.get(telemetryKey)).toBeUndefined()
  })
})
