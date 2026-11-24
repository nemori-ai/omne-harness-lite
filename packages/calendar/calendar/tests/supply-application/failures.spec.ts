import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calendarIdSchema, instantSchema } from '@omne-harness/calendar-contract'
import {
  createCalendarSupplyApplication,
  CALENDAR_SUPPLY_POLICY_VERSION,
} from '../../src/supply-application/index.ts'
import { shippedCalendarSupplyPolicies } from '../../src/supply/index.ts'
import { context, intent, world } from './fixture.ts'

describe('supply failure and interleaving boundaries', () => {
  it('concurrent identical callers reuse the first prepared candidate and publication winner', async () => {
    const w = world()
    let minted = 0
    const app = () =>
      createCalendarSupplyApplication({ ...w.deps, ids: { versionId: () => `v-${++minted}` } })
    const results = await Promise.all([
      app().refresh(context, intent),
      app().refresh(context, intent),
    ])
    expect(results.every(result => result.kind === 'ok' && result.value.kind === 'recorded')).toBe(
      true,
    )
    const refs = results.flatMap(result =>
      result.kind === 'ok' && result.value.kind === 'recorded'
        ? [result.value.receipt.operationRef]
        : [],
    )
    expect(new Set(refs).size).toBe(1)
    expect(w.runs.size).toBe(1)
    expect(w.receipts.size).toBe(1)
  })
  it('detects a different fingerprint at the original operation address', async () => {
    const w = world()
    await w.app().refresh(context, intent)
    const run = [...w.runs.values()][0]
    if (!run) throw new Error('missing run')
    expect(
      await w.app().queryPublication(context, {
        address: run.command.address,
        expectedFingerprint: 'f'.repeat(64),
      }),
    ).toMatchObject({ kind: 'ok', value: { kind: 'rejected', reason: 'operationKeyConflict' } })
  })
  it('rechecks authority after acquisition and retains the prepared run after revocation', async () => {
    const w = world()
    const original = w.deps.sourceAdapters
    const app = createCalendarSupplyApplication({
      ...w.deps,
      sourceAdapters: original.map(adapter => ({
        ...adapter,
        async acquire(input, options) {
          const value = await adapter.acquire(input, options)
          w.flags.deny = true
          return value
        },
      })),
    })
    expect(await app.refresh(context, intent)).toMatchObject({
      kind: 'error',
      error: { code: 'forbidden' },
    })
    expect(w.calls.commit).toBe(0)
    expect(w.runs.size).toBe(1)
    expect(w.raw.size).toBe(3)
  })
  it('cancellation during acquisition prevents commit while retaining acquired material', async () => {
    const w = world()
    const controller = new AbortController()
    const app = createCalendarSupplyApplication({
      ...w.deps,
      sourceAdapters: w.deps.sourceAdapters.map(adapter => ({
        ...adapter,
        async acquire(input, options) {
          const result = await adapter.acquire(input, options)
          controller.abort()
          return result
        },
      })),
    })
    expect(await app.refresh(context, intent, { signal: controller.signal })).toMatchObject({
      kind: 'ok',
      value: { kind: 'cancelled' },
    })
    expect(w.calls.acquire).toBe(1)
    expect(w.raw.size).toBe(1)
    expect(w.calls.commit).toBe(0)
  })
  it('cancellation racing a completed commit cannot reverse the publication', async () => {
    const w = world()
    const controller = new AbortController()
    const app = createCalendarSupplyApplication({
      ...w.deps,
      persistence: {
        ...w.deps.persistence,
        async commitDisposition(input) {
          const result = await w.deps.persistence.commitDisposition(input)
          controller.abort()
          return result
        },
      },
    })
    expect(await app.refresh(context, intent, { signal: controller.signal })).toMatchObject({
      kind: 'ok',
      value: { kind: 'recorded', receipt: { disposition: 'published' } },
    })
    expect(w.current()).not.toBeNull()
  })
  it('prepared cancellation remains an original-operation unknown and may recover later', async () => {
    const w = world()
    const controller = new AbortController()
    const app = createCalendarSupplyApplication({
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async prepareRun(run) {
          const result = await w.deps.journal.prepareRun(run)
          controller.abort()
          return result
        },
      },
    })
    expect(await app.refresh(context, intent, { signal: controller.signal })).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown' },
    })
    expect(w.calls.commit).toBe(0)
    const acquired = w.calls.acquire
    expect(await w.app().recover(context, { limit: 10 })).toMatchObject({
      kind: 'ok',
      value: [{ kind: 'ok', value: { kind: 'recorded' } }],
    })
    expect(w.calls.acquire).toBe(acquired)
  })
  it('retains CN unknown in-lieu blocker and raw reference without publishing', async () => {
    const w = world()
    const policy = shippedCalendarSupplyPolicies.find(
      item => item.calendarId === 'cn-legal-holidays',
    )
    if (!policy) throw new Error('missing CN policy')
    w.setTime('2026-11-06T12:00:00.000Z')
    const app = createCalendarSupplyApplication({
      ...w.deps,
      sourceAdapters: policy.sources
        .filter(source => source.role === 'truth')
        .map(source => ({
          sourceId: source.sourceId,
          async probe() {
            throw new Error('not used')
          },
          async acquire({ acquiredAt }) {
            return {
              kind: 'acquired',
              material: {
                sourceId: source.sourceId,
                acquiredAt,
                knowledgeAsOf: instantSchema.parse('2026-11-05T09:00:00.000Z'),
                content: readFileSync(
                  new URL(
                    source.sourceId === 'gov-cn-annual-notice'
                      ? '../../../calendar-local/data/seeds/raw/gov-cn-2027-bundle.json'
                      : '../supply/fixtures/holiday_api_capture_20260821.json',
                    import.meta.url,
                  ),
                ),
                mediaType: 'application/json',
                lineageRef: source.lineage,
                authorityRef: 'controlled-gov-cn-reference',
              },
            }
          },
        })),
    })
    const result = await app.refresh(context, {
      ...intent,
      calendarId: calendarIdSchema.parse('cn-legal-holidays'),
    })
    expect(result).toMatchObject({
      kind: 'ok',
      value: { kind: 'recorded', receipt: { disposition: 'withheld' } },
    })
    expect(w.current()).toBeNull()
    expect(w.raw.size).toBe(2)
    const command = [...w.runs.values()][0]?.command
    expect(
      command?.candidate.reasons.some(reason =>
        reason.startsWith('cn.in_lieu_subset_of_holidays:unknown:blocker:'),
      ),
    ).toBe(true)
    expect(command?.candidate.sources[0]?.rawReference).toMatch(/^material:/)
  })
  it('unknown acknowledgement retries the saved payload without another handoff', async () => {
    const w = world()
    await w.app().refresh(context, intent)
    w.flags.handoffFails = false
    const seen: unknown[] = []
    let guard = 0
    const app = createCalendarSupplyApplication({
      ...w.deps,
      authority: {
        async check() {
          return { kind: 'allowed', authorityGuardRefs: [`renewed-${++guard}`] }
        },
      },
      persistence: {
        ...w.deps.persistence,
        async acknowledgeReaction(input) {
          seen.push(structuredClone(input))
          return { kind: 'unknown' }
        },
      },
    })
    const input = { limit: 10, acknowledgementKey: 'ack-unknown' }
    expect(await app.deliverReactions(context, input)).toMatchObject({
      kind: 'ok',
      value: [{ outcome: { kind: 'unknown' } }],
    })
    expect(await app.deliverReactions(context, input)).toMatchObject({
      kind: 'ok',
      value: [{ outcome: { kind: 'unknown' } }],
    })
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(w.calls.handoff).toBe(1)
    expect(w.pending.size).toBe(1)
  })
  describe('a definite persistence rejection settles the run, a missing provider does not', () => {
    const rejecting = (
      w: ReturnType<typeof world>,
      reason: 'generationConflict' | 'providerUnavailable',
    ) =>
      createCalendarSupplyApplication({
        ...w.deps,
        persistence: {
          ...w.deps.persistence,
          async commitDisposition() {
            w.calls.commit++
            return { kind: 'rejected', reason, message: 'injected' }
          },
        },
      })
    it('completes a run refused with generationConflict and never resends it', async () => {
      const w = world()
      expect(await rejecting(w, 'generationConflict').refresh(context, intent)).toMatchObject({
        kind: 'ok',
        value: { kind: 'rejected', reason: 'generationConflict' },
      })
      const completions = [...w.completions.values()]
      expect(completions).toMatchObject([{ kind: 'refused', reason: 'generationConflict' }])
      expect(await w.deps.journal.pending({ systemScopeRef: 'test-scope', limit: 10 })).toEqual({
        kind: 'ok',
        value: [],
      })
      expect(
        await w.app().health(context, {
          calendarId: intent.calendarId,
          policyVersion: intent.policyVersion,
        }),
      ).toMatchObject({
        kind: 'ok',
        value: { pendingRuns: 0, consecutiveFailures: 1 },
      })
      expect(await rejecting(w, 'generationConflict').recover(context, { limit: 10 })).toEqual({
        kind: 'ok',
        value: [],
      })
      expect(w.calls.commit).toBe(1)
    })
    it('keeps a run pending when the provider is unavailable and resends it on recovery', async () => {
      const w = world()
      const app = rejecting(w, 'providerUnavailable')
      expect(await app.refresh(context, intent)).toMatchObject({
        kind: 'ok',
        value: { kind: 'rejected', reason: 'providerUnavailable' },
      })
      expect(w.completions.size).toBe(0)
      expect(await app.recover(context, { limit: 10 })).toMatchObject({
        kind: 'ok',
        value: [{ kind: 'ok', value: { kind: 'rejected', reason: 'providerUnavailable' } }],
      })
      expect(w.calls.commit).toBe(2)
      expect(w.completions.size).toBe(0)
    })
    it('follows the winner recorded under the same key instead of refusing the run', async () => {
      const w = world()
      const app = createCalendarSupplyApplication({
        ...w.deps,
        persistence: {
          ...w.deps.persistence,
          async commitDisposition(command) {
            await w.deps.persistence.commitDisposition(command)
            return { kind: 'rejected', reason: 'operationKeyConflict', message: 'lost the race' }
          },
        },
      })
      expect(await app.refresh(context, intent)).toMatchObject({
        kind: 'ok',
        value: { kind: 'recorded', receipt: { disposition: 'published' } },
      })
      expect([...w.completions.values()]).toMatchObject([
        { kind: 'recorded', disposition: 'published' },
      ])
    })
  })
  it('unknown fixed policy never appears as healthy', async () => {
    const w = world()
    expect(
      await w.app().health(context, { calendarId: intent.calendarId, policyVersion: 'unknown' }),
    ).toMatchObject({ kind: 'ok', value: { supply: 'unknown', horizon: 'unknown' } })
  })
  it('uses JP seasonal six-hour cadence even for an unavailable source', async () => {
    const w = world()
    w.setTime('2026-02-01T00:00:00.000Z')
    expect(
      await w.app().probe(context, {
        calendarId: calendarIdSchema.parse('jp-legal-holidays'),
        policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
        sourceId: 'cao-syukujitsu-csv',
        operationKey: 'seasonal',
      }),
    ).toMatchObject({
      kind: 'ok',
      value: { observation: { kind: 'failed' }, nextDue: '2026-02-01T06:00:00.000Z' },
    })
  })
})
