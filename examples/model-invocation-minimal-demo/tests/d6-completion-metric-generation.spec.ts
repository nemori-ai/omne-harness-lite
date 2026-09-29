import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDiagnosticCollector } from '@omne-harness-lite/model-request-runtime'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 bounded metric generation at the actual JSONL assembly boundary', () => {
  it('does not turn high-cardinality call, model or tenant strings into labels and starts a new collector at zero', async () => {
    const parent = resolve('tmp/d6-completion')
    await fs.mkdir(parent, { recursive: true, mode: 0o700 })
    const directory = await fs.mkdtemp(join(parent, 'metrics-'))
    const rootDir = join(directory, 'journals')
    const firstTenant = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-tenant-a' }))
    const secondTenant = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-tenant-b' }))
    const base = createDemoDiagnosticConfig(directory, firstTenant, demoRetirement())
    const make = async (collectorId: string, tenant: typeof firstTenant) => {
      const scope = { kind: 'tenant' as const, tenant }
      const store = await createDiagnosticJournal({
        ...base.collector,
        rootDir,
        collectorId,
        scope,
      })
      return {
        scope,
        store,
        collector: createDiagnosticCollector({ ...base.collector, collectorId, scope, store }),
      }
    }
    const first = await make('d6-metrics-first', firstTenant)
    for (let index = 0; index < 128; index++) {
      expect(
        first.collector.record(
          {
            source: 'runtime',
            stage: 'settlement',
            outcome: 'completed',
            binding: { modelId: `dynamic-model-${index}` },
            facts: { kind: 'progress', settlement: 'committed' },
          },
          first.scope,
          { executionId: `execution-${index}`, call: `call-${index}` },
        ),
      ).toHaveProperty('recorded')
    }
    const firstMetrics = first.collector.metrics(first.scope)
    if ('rejected' in firstMetrics) throw new Error('first metrics unavailable')
    expect(firstMetrics.stageEvents).toEqual([
      {
        source: 'runtime',
        stage: 'settlement',
        outcome: 'completed',
        count: 128,
      },
    ])
    expect(firstMetrics.stageDurations).toEqual([])
    expect(JSON.stringify(firstMetrics)).not.toContain('dynamic-model')
    expect(JSON.stringify(firstMetrics)).not.toContain('call-')
    expect(JSON.stringify(firstMetrics)).not.toContain('d6-tenant-a')
    expect(await first.collector.close()).toHaveProperty('complete', true)
    const oldRows = await first.store.query({ scope: first.scope, limit: 128, maxBytes: 1_048_576 })
    if (!('page' in oldRows)) throw new Error('first generation journal unreadable')
    expect(oldRows.page.records).toHaveLength(128)
    expect(oldRows.page.records[0]?.binding?.modelId).toBe('dynamic-model-0')
    const second = await make('d6-metrics-second', secondTenant)
    const secondBefore = second.collector.metrics(second.scope)
    if ('rejected' in secondBefore) throw new Error('second metrics unavailable')
    expect(secondBefore.collectorId).toBe('d6-metrics-second')
    expect(secondBefore.stageEvents).toEqual([])
    expect(secondBefore.stageDurations).toEqual([])
    expect(
      second.collector.record(
        {
          source: 'runtime',
          stage: 'settlement',
          outcome: 'unknown',
          facts: { kind: 'progress', settlement: 'unknown' },
        },
        second.scope,
        { executionId: 'new-execution', call: 'new-call' },
      ),
    ).toHaveProperty('recorded')
    const secondAfter = second.collector.metrics(second.scope)
    if ('rejected' in secondAfter) throw new Error('second metrics unavailable')
    expect(secondAfter.stageEvents).toEqual([
      {
        source: 'runtime',
        stage: 'settlement',
        outcome: 'unknown',
        count: 1,
      },
    ])
    expect(secondAfter.stageDurations).toEqual([])
    expect(await second.collector.close()).toHaveProperty('complete', true)
    const secondRows = await second.store.query({ scope: second.scope, limit: 2, maxBytes: 65_536 })
    if (!('page' in secondRows)) throw new Error('second generation journal unreadable')
    expect(secondRows.page.records).toHaveLength(1)
    expect(secondRows.page.records[0]?.facts).toEqual({ kind: 'progress', settlement: 'unknown' })
    expect(secondRows.page.records[0]?.facts).not.toHaveProperty('costUsd')
    expect(await second.store.query({ scope: first.scope, limit: 2, maxBytes: 65_536 })).toEqual({
      rejected: 'forbidden',
    })
  })
})
