import { describe, expect, it } from 'vitest'
import {
  calendarCallContextSchema,
  calendarSeedPackSchema,
  calendarSupplyResultSchema,
  calendarHealthResultSchema,
  calendarImportSeedResultSchema,
  type CalendarSupplyResult,
} from '@omne-harness/calendar-contract'
import { createCalendarSupplyApplication } from '../../src/supply-application/index.ts'
import { supplyDigest, supplyFingerprint } from '../../src/supply-application/encoding.ts'
import { shippedCalendarSupplyPolicies } from '../../src/supply/index.ts'
import { context, intent, world } from './fixture.ts'

function published(result: CalendarSupplyResult): void {
  expect(result).toMatchObject({
    kind: 'ok',
    value: { kind: 'recorded', receipt: { disposition: 'published' } },
  })
}
function packFrom(w: ReturnType<typeof world>) {
  const snapshot = w.current()
  if (!snapshot) throw new Error('Expected published snapshot')
  const policy = shippedCalendarSupplyPolicies.find(item => item.calendarId === intent.calendarId)
  return calendarSeedPackSchema.parse({
    format: 'omne.calendar-seed/1',
    releaseRef: 'release-1',
    releaseDate: '2026-01-01',
    calendars: [
      {
        snapshot,
        policyVersion: intent.policyVersion,
        policyHash: supplyDigest(policy),
        authorityCoverageEnd: '2026-12-31',
        materials: [...w.raw.values()].map(stored => {
          const { content, ...metadata } = stored.material
          return {
            ...metadata,
            rawHash: stored.rawHash,
            contentBase64: Buffer.from(content).toString('base64'),
          }
        }),
      },
    ],
  })
}
describe('supply application against controlled ports', () => {
  it('denies ordinary callers before any source or publication access', async () => {
    const w = world()
    w.flags.deny = true
    expect(await w.app().refresh(context, intent)).toMatchObject({
      kind: 'error',
      error: { code: 'forbidden' },
    })
    expect(w.calls).toMatchObject({ acquire: 0, observe: 0, commit: 0 })
    const tenant = calendarCallContextSchema.parse({
      ...context,
      owner: { kind: 'tenant', tenantId: 't', ownerId: 'o' },
    })
    w.flags.deny = false
    expect(await w.app().refresh(tenant, intent)).toMatchObject({
      kind: 'error',
      error: { code: 'forbidden' },
    })
    expect(w.calls.observe).toBe(0)
  })
  it('publishes real parsed material once and replays without acquiring or minting', async () => {
    const w = world()
    const first = await w.app().refresh(context, intent)
    published(first)
    expect(calendarSupplyResultSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first)
    const acquired = w.calls.acquire
    const version = w.current()?.versionId
    const repeated = await w.app().refresh({ ...context, requestId: 'new-observation' }, intent)
    expect(repeated).toMatchObject({ kind: 'ok', value: { kind: 'recorded', replayed: true } })
    expect(w.calls.acquire).toBe(acquired)
    expect(w.current()?.versionId).toBe(version)
    expect(w.calls.commit).toBe(1)
  })
  it('records unchanged content under a new intent without moving the current version', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const before = w.current()
    expect(
      await w.app().refresh(context, { ...intent, operationKey: 'next-refresh' }),
    ).toMatchObject({
      kind: 'ok',
      value: { kind: 'recorded', receipt: { disposition: 'noChange' } },
    })
    expect(w.current()).toEqual(before)
  })
  it('never acquires or prepares when the original operation is unknown', async () => {
    const w = world()
    w.flags.unknown = true
    const app = w.app()
    expect(await app.refresh(context, intent)).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown' },
    })
    expect(await app.refresh(context, intent)).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown' },
    })
    expect(w.calls).toMatchObject({ acquire: 0, commit: 0, observe: 2 })
    expect(w.runs.size).toBe(0)
  })
  it('retains a prepared command after a lost commit reply and recovers across instances', async () => {
    const w = world()
    w.flags.loseCommitReply = true
    expect(await w.app().refresh(context, intent)).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown' },
    })
    const version = w.current()?.versionId
    const acquired = w.calls.acquire
    w.flags.loseCommitReply = false
    const recovered = await w.app().recover(context, { limit: 10 })
    expect(recovered).toMatchObject({
      kind: 'ok',
      value: [{ kind: 'ok', value: { kind: 'recorded' } }],
    })
    expect(w.calls.acquire).toBe(acquired)
    expect(w.calls.commit).toBe(1)
    expect(w.current()?.versionId).toBe(version)
  })
  it('keeps publication authoritative when health projection persistence fails', async () => {
    const w = world()
    w.flags.journalFails = true
    published(await w.app().refresh(context, intent))
    expect(await w.app().health(context, intent)).toMatchObject({
      kind: 'error',
      error: { code: 'invalid_input' },
    })
    const input = { calendarId: intent.calendarId, policyVersion: intent.policyVersion }
    expect(await w.app().health(context, input)).toMatchObject({
      kind: 'ok',
      value: { queryAvailability: 'available', supply: 'pending', pendingRuns: 1 },
    })
    w.flags.journalFails = false
    await w.app().recover(context, { limit: 10 })
    expect(await w.app().health(context, input)).toMatchObject({
      kind: 'ok',
      value: { pendingRuns: 0 },
    })
  })
  it('keeps the old current and failure standing after refresh failure', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const previous = w.current()
    w.flags.adapterFails = true
    expect(
      await w.app().refresh(context, { ...intent, operationKey: 'failed-refresh' }),
    ).toMatchObject({
      kind: 'ok',
      value: { kind: 'recorded', receipt: { disposition: 'rejected' } },
    })
    expect(w.current()).toEqual(previous)
    const result = await w
      .app()
      .health(context, { calendarId: intent.calendarId, policyVersion: intent.policyVersion })
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        queryAvailability: 'available',
        supply: 'failed',
        consecutiveFailures: 1,
        lastSuccess: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(calendarHealthResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result)
    await w.app().refresh(context, { ...intent, operationKey: 'failed-refresh' })
    expect(
      await w
        .app()
        .health(context, { calendarId: intent.calendarId, policyVersion: intent.policyVersion }),
    ).toMatchObject({ kind: 'ok', value: { consecutiveFailures: 1 } })
  })
  it('persists probe failures and due cadence independently from publications', async () => {
    const w = world()
    w.flags.adapterFails = true
    const input = { ...intent, operationKey: 'probe-1', sourceId: 'federal-register-eo-feed' }
    const result = await w.app().probe(context, input)
    expect(result).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 1, nextDue: '2026-01-02T00:00:00.000Z', lastSuccess: null },
    })
    expect(await w.app().probe(context, input)).toEqual(result)
    expect(w.calls).toMatchObject({ probe: 1, commit: 0, acquire: 0 })
  })
  it('cancels before acquisition and stops old-instance admission without erasing durable runs', async () => {
    const w = world()
    const controller = new AbortController()
    controller.abort()
    expect(await w.app().refresh(context, intent, { signal: controller.signal })).toMatchObject({
      kind: 'ok',
      value: { kind: 'cancelled', phase: 'beforeCommit' },
    })
    expect(w.calls.acquire).toBe(0)
    const app = w.app()
    expect(app.stop()).toEqual({ kind: 'admissionStopped', durableRuns: 'retained' })
    expect(await app.refresh(context, intent)).toMatchObject({
      kind: 'ok',
      value: { kind: 'cancelled' },
    })
    expect(w.calls.commit).toBe(0)
  })
  it('does not acknowledge until reaction handoff is accepted and never republishes', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const input = { limit: 10, acknowledgementKey: 'reaction-attempt-1' }
    expect(await w.app().deliverReactions(context, input)).toMatchObject({
      kind: 'ok',
      value: [{ outcome: { kind: 'pending' } }],
    })
    expect(w.calls.ack).toBe(0)
    expect(w.pending.size).toBe(1)
    w.flags.handoffFails = false
    expect(await w.app().deliverReactions(context, input)).toMatchObject({
      kind: 'ok',
      value: [{ outcome: { kind: 'acknowledged' } }],
    })
    await w.app().deliverReactions(context, input)
    expect(w.calls.ack).toBe(1)
    expect(w.calls.commit).toBe(1)
    expect(w.pending.size).toBe(0)
  })
  it('does not reveal another publication scope', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const run = [...w.runs.values()][0]
    if (!run) throw new Error('Missing run')
    const before = w.calls.observe
    expect(
      await w.app().queryPublication(context, {
        address: { ...run.command.address, systemScopeRef: 'other-scope' },
        expectedFingerprint: run.command.expectedFingerprint,
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'forbidden' } })
    expect(w.calls.observe).toBe(before)
  })
  it('uses caller intent for fingerprints, independently of request ID and object ordering', () => {
    const a = supplyFingerprint({
      context,
      operation: 'refresh',
      aggregateRef: intent.calendarId,
      payload: { z: '中文😀/', a: [-1, 1e30, null, []] },
    })
    const b = supplyFingerprint({
      context: { ...context, requestId: 'r2' },
      operation: 'refresh',
      aggregateRef: intent.calendarId,
      payload: { a: [-1, 1e30, null, []], z: '中文😀/' },
    })
    expect(a).toBe(b)
    expect(a).toBe('31ef847c72e1feef20ed46e5a12e0ae95fe27fc6e40c760034d6a837b82201f5')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(
      supplyFingerprint({
        context,
        operation: 'refresh',
        aggregateRef: intent.calendarId,
        payload: { policyVersion: 'different' },
      }),
    ).not.toBe(a)
  })
  it('admits a validated local seed without network and preserves source knowledge', async () => {
    const source = world()
    published(await source.app().refresh(context, intent))
    const pack = packFrom(source)
    const target = world()
    target.setSeed(pack)
    target.setTime('2026-11-03T00:00:00.000Z')
    target.flags.adapterFails = true
    const input = {
      packRef: 'pack-1',
      packHash: supplyDigest(pack),
      releaseRef: 'release-1',
      operationKey: 'seed-1',
    }
    const result = await target.app().importSeed(context, input)
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'published' } } }],
      },
    })
    expect(calendarImportSeedResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result)
    expect(target.current()?.knowledgeAsOf).toBe('2025-12-01T00:00:00.000Z')
    expect(target.calls.acquire).toBe(0)
    const repeated = await target.app().importSeed(context, input)
    expect(repeated.kind === 'ok' ? repeated.value.results[0]?.warnings : null).toEqual(
      result.kind === 'ok' ? result.value.results[0]?.warnings : null,
    )
    expect(target.calls.commit).toBe(1)
  })
  it('rejects release-year or known-authority coverage gaps even when an old version is readable', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const pack = packFrom(w)
    const entry = pack.calendars[0]
    if (!entry) throw new Error('Missing seed entry')
    w.setSeed(
      calendarSeedPackSchema.parse({
        ...pack,
        calendars: [{ ...entry, authorityCoverageEnd: '2030-12-31' }],
      }),
    )
    const before = w.current()
    const result = await w.app().importSeed(context, {
      packRef: 'pack',
      packHash: supplyDigest(pack),
      releaseRef: 'release-1',
      operationKey: 'seed-bad',
    })
    expect(result).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'rejected' } } }] },
    })
    expect(w.current()).toEqual(before)
  })
  it('rejects incomplete release years and critical coverage without erasing the old version', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const original = packFrom(w)
    const before = w.current()
    for (const releaseDate of ['2027-01-01', '2026-12-31']) {
      const pack = calendarSeedPackSchema.parse({ ...original, releaseDate })
      w.setSeed(pack)
      expect(
        await w.app().importSeed(context, {
          packRef: 'pack',
          packHash: supplyDigest(pack),
          releaseRef: 'release-1',
          operationKey: `seed-${releaseDate}`,
        }),
      ).toMatchObject({
        kind: 'ok',
        value: {
          results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'rejected' } } }],
        },
      })
      expect(w.current()).toEqual(before)
    }
  })
  it('a valid older seed cannot replace a later wider publication', async () => {
    const w = world()
    published(await w.app().refresh(context, intent))
    const pack = packFrom(w)
    const app = createCalendarSupplyApplication({
      ...w.deps,
      sourceAdapters: w.deps.sourceAdapters.map(adapter => ({
        ...adapter,
        async acquire(input, options) {
          const result = await adapter.acquire(input, options)
          return result.kind === 'acquired' && adapter.sourceId === 'usc-6103-computed-rules'
            ? {
                ...result,
                material: {
                  ...result.material,
                  content: new TextEncoder().encode(
                    JSON.stringify({ start: '2025-01-01', end: '2027-12-31' }),
                  ),
                },
              }
            : result
        },
      })),
    })
    published(await app.refresh(context, { ...intent, operationKey: 'extended' }))
    const extended = w.current()
    expect(extended?.coverageEnd).toBe('2027-12-31')
    w.setSeed(pack)
    expect(
      await w.app().importSeed(context, {
        packRef: 'old-pack',
        packHash: supplyDigest(pack),
        releaseRef: 'release-1',
        operationKey: 'older-seed',
      }),
    ).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'noChange' } } }] },
    })
    expect(w.current()).toEqual(extended)
  })
  it('rejects duplicate adapter registration at construction', () => {
    const w = world()
    const adapter = w.deps.sourceAdapters[0]
    if (!adapter) throw new Error('No adapter')
    expect(() =>
      createCalendarSupplyApplication({ ...w.deps, sourceAdapters: [adapter, adapter] }),
    ).toThrow('Duplicate')
  })
})
