import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDiagnosticCollector } from '@omne-harness-lite/model-request-runtime-local'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 source-bounded engineering journal content', () => {
  it('preserves a trusted 503 while rejecting raw, tool, reasoning, header, configuration and getter content before SQL journal/export/stderr', async () => {
    const parent = resolve('tmp/d6-completion')
    await fs.mkdir(parent, { recursive: true, mode: 0o700 })
    const directory = await fs.mkdtemp(join(parent, 'redaction-'))
    const tenant = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-tenant' }))
    const base = createDemoDiagnosticConfig(directory, tenant, demoRetirement())
    const scope = { kind: 'tenant' as const, tenant }
    const store = await createDiagnosticJournal({
      ...base.collector,
      rootDir: join(directory, 'journal'),
      collectorId: 'd6-redaction',
      scope,
    })
    const reports: unknown[] = []
    const collector = createDiagnosticCollector({
      ...base.collector,
      collectorId: 'd6-redaction',
      scope,
      store,
      stderr(category, count) {
        reports.push({ category, count })
      },
    })
    const trusted = {
      source: 'transport' as const,
      stage: 'send' as const,
      outcome: 'completed' as const,
      facts: { kind: 'transport' as const, httpStatus: 503 },
    }
    for (const field of [
      'raw',
      'error',
      'message',
      'toolInput',
      'toolResult',
      'reasoning',
      'headers',
      'configuration',
    ]) {
      const hostile: unknown = { ...trusted, [field]: 'private-content-503' }
      expect(Reflect.apply(collector.record, undefined, [hostile, scope])).toEqual({
        dropped: 'invalid',
      })
    }
    let getterCalls = 0
    const getter: unknown = {
      ...trusted,
      facts: {
        kind: 'transport',
        get httpStatus() {
          getterCalls++
          throw new Error('private-getter-503')
        },
      },
    }
    expect(Reflect.apply(collector.record, undefined, [getter, scope])).toEqual({
      dropped: 'invalid',
    })
    expect(getterCalls).toBe(0)
    expect(collector.record(trusted, scope)).toHaveProperty('recorded')
    expect(await collector.close()).toHaveProperty('complete', true)
    const queried = await collector.query({ scope, limit: 2, maxBytes: 65_536 })
    if (!('page' in queried)) throw new Error('private journal query unavailable')
    expect(queried.page.records).toHaveLength(1)
    expect(queried.page.records[0]?.facts).toEqual({ kind: 'transport', httpStatus: 503 })
    const exported = await collector.exportPage(
      { scope, limit: 2, maxBytes: 65_536 },
      { maxRecords: 2, maxBytes: 65_536 },
    )
    if (!('page' in exported)) throw new Error('private journal export unavailable')
    expect(exported.page.jsonl).toContain('"httpStatus":503')
    for (const rendered of [
      JSON.stringify(queried.page.records),
      exported.page.jsonl,
      JSON.stringify(reports),
    ]) {
      expect(rendered).not.toContain('private-content-503')
      expect(rendered).not.toContain('private-getter-503')
      expect(rendered).not.toContain('toolInput')
      expect(rendered).not.toContain('reasoning')
      expect(rendered).not.toContain('configuration')
    }
    expect(reports.every(report => typeof report === 'object' && report !== null)).toBe(true)
  })
})
