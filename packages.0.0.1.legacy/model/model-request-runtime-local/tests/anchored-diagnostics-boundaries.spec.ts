import { describe, expect, it } from 'vitest'
import type { DiagnosticEmitter } from '@omne-harness-lite/model-request-runtime'
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import { harness, payload, transport } from './anchored-invocation-fixture.ts'
import { modelCategory } from './log-codec-fixture.ts'

interface AnswerCase {
  readonly name: string
  readonly answer: () => unknown
  readonly failure?: 'contract_violation' | 'sink_failed'
  readonly report?: 'throw' | 'reject'
}

const cases: readonly AnswerCase[] = [
  {
    name: 'recorded reference',
    answer: () => ({ recorded: { collectorId: 'test', sequence: '1' } }),
  },
  ...(['invalid', 'unsupported', 'oversize', 'queue_full', 'closed'] as const).map(dropped => ({
    name: `allowed drop ${dropped}`,
    answer: () => ({ dropped }),
  })),
  { name: 'null result', answer: () => null, failure: 'contract_violation' },
  { name: 'primitive result', answer: () => 7, failure: 'contract_violation' },
  { name: 'null reference', answer: () => ({ recorded: null }), failure: 'contract_violation' },
  {
    name: 'missing collector',
    answer: () => ({ recorded: { sequence: '1' } }),
    failure: 'contract_violation',
  },
  {
    name: 'missing sequence',
    answer: () => ({ recorded: { collectorId: 'test' } }),
    failure: 'contract_violation',
  },
  {
    name: 'nonstring collector',
    answer: () => ({ recorded: { collectorId: 7, sequence: '1' } }),
    failure: 'contract_violation',
  },
  {
    name: 'nonstring sequence',
    answer: () => ({ recorded: { collectorId: 'test', sequence: 1 } }),
    failure: 'contract_violation',
  },
  {
    name: 'invalid recorded wins over valid dropped',
    answer: () => ({ recorded: null, dropped: 'closed' }),
    failure: 'contract_violation',
  },
  { name: 'unlisted drop', answer: () => ({ dropped: 'invented' }), failure: 'contract_violation' },
  {
    name: 'throwing recorded getter',
    answer: () =>
      Object.defineProperty({}, 'recorded', {
        get() {
          throw new Error('recorded getter')
        },
      }),
    failure: 'sink_failed',
  },
  {
    name: 'throwing dropped getter',
    answer: () =>
      Object.defineProperty({}, 'dropped', {
        get() {
          throw new Error('dropped getter')
        },
      }),
    failure: 'sink_failed',
  },
  {
    name: 'throwing record',
    answer() {
      throw new Error('record failed')
    },
    failure: 'sink_failed',
  },
  {
    name: 'report throws while invalid record stays isolated',
    answer: () => null,
    failure: 'contract_violation',
    report: 'throw',
  },
  {
    name: 'report rejects while invalid record stays isolated',
    answer: () => null,
    failure: 'contract_violation',
    report: 'reject',
  },
  {
    name: 'rejected thenable',
    answer: () => Promise.reject(new Error('async record')),
    failure: 'contract_violation',
  },
]

describe('anchored diagnostic replies remain separate from durable business facts', () => {
  for (const scenario of cases) {
    it(scenario.name, async () => {
      await harness(async h => {
        const base = transport()
        const reports: string[] = []
        let factories = 0
        let records = 0
        let closes = 0
        const emitter: DiagnosticEmitter = {
          record: () => ({ dropped: 'closed' }),
          close() {
            closes++
          },
        }
        // A provider may violate its typed boundary. Retain an unknown runtime answer.
        Object.defineProperty(emitter, 'record', {
          value(this: DiagnosticEmitter) {
            expect(this).toBe(emitter)
            records++
            return scenario.answer()
          },
        })
        const handle = createAnchoredModelInvocation({
          ...h.input,
          transport: base.adapter,
          policy: {
            ...h.input.policy,
            diagnostic(event) {
              reports.push(event.kind)
              if (scenario.report === 'throw') throw new Error('report failed')
              if (scenario.report === 'reject')
                return Promise.reject(new Error('async report failed'))
            },
          },
          diagnosticEmitterFactory() {
            factories++
            return emitter
          },
        })
        expect(await handle.outcome).toHaveProperty('replyPending')
        const settled = await handle.settleReply('persisted')
        expect(settled).toHaveProperty('settled')
        const read = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in read)) throw new Error('actual SQL prefix unavailable')
        expect(
          read.entries
            .slice(0, 2)
            .map(payload)
            .map(value => value.kind),
        ).toEqual(['model_call_dispatched', 'model_call_opened'])
        expect(read.entries.map(entry => modelCategory(entry.payload))).toEqual([
          'record',
          'record',
          'message',
          'response',
        ])
        const failures = reports.filter(kind => kind.startsWith('model_anchor.diagnostic_'))
        expect(failures).toEqual(
          scenario.failure ? [`model_anchor.diagnostic_${scenario.failure}`] : [],
        )
        if (scenario.failure) expect(records).toBe(1)
        else expect(records).toBeGreaterThan(1)
        expect(factories).toBe(1)
        expect(closes).toBe(1)
        expect(base.plans()).toBe(1)
        expect(base.sends()).toBe(1)
        expect(base.stopped()).toBe(1)
        expect(await handle.close()).toEqual({ released: true })
        expect(await handle.close()).toEqual({ released: true })
        expect(h.released()).toBe(1)
        expect(closes).toBe(1)
      })
    })
  }
})
