import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { calendarSeedPackSchema, instantSchema } from '@omne-harness/calendar-contract'
import { createCalendarSupplyApplication } from '../../src/supply-application/index.ts'
import { supplyDigest } from '../../src/supply-application/encoding.ts'
import { shippedCalendarSupplyPolicies } from '../../src/supply/index.ts'
import { context, intent, world } from './fixture.ts'

const healthInput = { calendarId: intent.calendarId, policyVersion: intent.policyVersion }

async function seededWorld() {
  const source = world()
  await source.app().refresh(context, intent)
  const pack = calendarSeedPackSchema.parse({
    format: 'omne.calendar-seed/1',
    releaseRef: 'quality-release',
    releaseDate: '2026-01-01',
    calendars: [
      {
        snapshot: source.current(),
        policyVersion: intent.policyVersion,
        policyHash: supplyDigest(
          shippedCalendarSupplyPolicies.find(policy => policy.calendarId === intent.calendarId),
        ),
        authorityCoverageEnd: '2026-12-31',
        materials: [...source.raw.values()].map(
          ({ rawHash, material: { content, ...metadata } }) => ({
            ...metadata,
            rawHash,
            contentBase64: Buffer.from(content).toString('base64'),
          }),
        ),
      },
    ],
  })
  const target = world()
  target.setSeed(pack)
  const input = {
    packRef: 'quality-pack',
    packHash: supplyDigest(pack),
    releaseRef: pack.releaseRef,
    operationKey: 'quality-seed',
  }
  return { target, pack, input }
}

describe('supply health evidence', () => {
  it('keeps journal failure separate from readable published coverage', async () => {
    const w = world()
    await w.app().refresh(context, intent)
    const app = createCalendarSupplyApplication({
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async health() {
          return { kind: 'unavailable', reason: 'offline' }
        },
      },
    })
    expect(await app.health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: {
        queryAvailability: 'available',
        supply: 'unknown',
        horizon: 'warning',
        coverageEnd: '2026-12-31',
        reasons: ['Supply journal unavailable', 'Some source observations are unknown'],
      },
    })
  })
  it('requires every declared observation and a successful run before reporting healthy supply', async () => {
    const w = world()
    await w.app().refresh(context, intent)
    for (const adapter of w.deps.sourceAdapters) {
      expect(await w.app().health(context, healthInput)).toMatchObject({
        kind: 'ok',
        value: { supply: 'unknown' },
      })
      await w
        .app()
        .probe(context, { ...intent, sourceId: adapter.sourceId, operationKey: adapter.sourceId })
    }
    expect(await w.app().health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: { supply: 'ok', reasons: [] },
    })
    const standing = await w.deps.journal.health({
      systemScopeRef: 'test-scope',
      calendarId: intent.calendarId,
    })
    if (standing.kind !== 'ok') throw new Error('Missing health fixture')
    const app = createCalendarSupplyApplication({
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async health() {
          return { kind: 'ok', value: { ...standing.value, lastSuccess: null } }
        },
      },
    })
    expect(await app.health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: { supply: 'unknown' },
    })
  })
  it('reports failed source ahead of pending work without erasing available old data', async () => {
    const w = world()
    w.flags.journalFails = true
    await w.app().refresh(context, intent)
    expect(await w.app().health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: { supply: 'pending', pendingRuns: 1 },
    })
    w.flags.adapterFails = true
    await w.app().probe(context, {
      ...intent,
      sourceId: 'federal-register-eo-feed',
      operationKey: 'failed-probe',
    })
    expect(await w.app().health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: {
        supply: 'failed',
        pendingRuns: 1,
        consecutiveFailures: 0,
        queryAvailability: 'available',
      },
    })
  })
})

describe('supply material and observation boundaries', () => {
  it('replays a recorded probe without consulting a changed adapter or advancing its due date', async () => {
    const w = world()
    const input = {
      ...intent,
      sourceId: 'federal-register-eo-feed',
      operationKey: 'recorded-probe',
    }
    const first = await w.app().probe(context, input)
    w.flags.adapterFails = true
    w.setTime('2026-02-01T00:00:00.000Z')
    expect(await w.app().probe(context, input)).toEqual(first)
    expect(w.calls.probe).toBe(1)
    expect(await w.app().health(context, healthInput)).toMatchObject({
      kind: 'ok',
      value: {
        sources: [
          {
            consecutiveFailures: 0,
            lastSuccess: '2026-01-01T00:00:00.000Z',
            nextDue: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    })
  })
  it.each(['sourceId', 'observedAt'] as const)(
    'records an incoherent probe %s as failed at the requested identity',
    async field => {
      const w = world()
      const adapter = w.deps.sourceAdapters[0]
      if (!adapter) throw new Error('Missing adapter')
      const app = createCalendarSupplyApplication({
        ...w.deps,
        sourceAdapters: [
          {
            ...adapter,
            async probe(input) {
              return {
                ...(await adapter.probe(input)),
                [field]:
                  field === 'sourceId'
                    ? 'another-source'
                    : instantSchema.parse('2025-01-01T00:00:00.000Z'),
              }
            },
          },
        ],
      })
      expect(await app.probe(context, { ...intent, sourceId: adapter.sourceId })).toMatchObject({
        kind: 'ok',
        value: {
          sourceId: adapter.sourceId,
          consecutiveFailures: 1,
          lastSuccess: null,
          observation: {
            sourceId: adapter.sourceId,
            observedAt: '2026-01-01T00:00:00.000Z',
            kind: 'failed',
            reason: 'Error: Probe source/time mismatch',
          },
        },
      })
      expect(w.calls.commit).toBe(0)
    },
  )
  it.each([
    'rawHash',
    'sourceId',
    'lineageRef',
    'acquiredAt',
    'authorityRef',
    'knowledgeAsOf',
  ] as const)(
    'refuses mismatched current material %s before acquiring a replacement',
    async field => {
      const w = world()
      await w.app().refresh(context, intent)
      const previous = w.current()
      const reads = w.deps.materials.read
      w.deps.materials.read = async input => {
        const result = await reads(input)
        if (result.kind !== 'ok' || !result.value) return result
        return {
          kind: 'ok',
          value:
            field === 'rawHash'
              ? { ...result.value, rawHash: '0'.repeat(64) }
              : {
                  ...result.value,
                  material: {
                    ...result.value.material,
                    [field]:
                      field.endsWith('At') || field === 'knowledgeAsOf'
                        ? instantSchema.parse('2024-01-01T00:00:00.000Z')
                        : 'different',
                  },
                },
        }
      }
      expect(
        await w.app().refresh(context, { ...intent, operationKey: 'after-corruption' }),
      ).toMatchObject({
        kind: 'error',
        error: {
          code: 'provider_failure',
          message: 'Error: Current provenance unavailable or inconsistent',
        },
      })
      expect(w.calls.acquire).toBe(3)
      expect(w.calls.commit).toBe(1)
      expect(w.current()).toEqual(previous)
    },
  )
  it('rejects material that cannot be read back with its original bytes', async () => {
    const w = world()
    const read = w.deps.materials.read
    w.deps.materials.read = async input => {
      const result = await read(input)
      return result.kind === 'ok' && result.value
        ? {
            kind: 'ok',
            value: {
              ...result.value,
              material: { ...result.value.material, content: new TextEncoder().encode('{}') },
            },
          }
        : result
    }
    expect(await w.app().refresh(context, intent)).toMatchObject({
      kind: 'ok',
      value: { kind: 'recorded', receipt: { disposition: 'rejected' } },
    })
    expect([...w.runs.values()][0]?.command.candidate.sources).toEqual([])
    expect([...w.runs.values()][0]?.command.candidate.reasons).toContain(
      'source.unavailable:unknown:blocker:usc-6103-computed-rules: Error: Preserved source cannot be read back',
    )
    expect(w.current()).toBeNull()
  })
})

describe('seed validation and original intent', () => {
  it('withholds a valid seed when the known authority horizon cannot be read', async () => {
    const { target, input } = await seededWorld()
    await target.app().refresh(context, intent)
    const before = target.current()
    target.deps.journal.health = async () => ({ kind: 'unknown', reason: 'lost journal response' })
    expect(await target.app().importSeed(context, input)).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'withheld' } } }] },
    })
    expect([...target.runs.values()].at(-1)?.command.candidate.reasons).toContain(
      'seed.authorityHorizon:unknown:blocker:Cannot inspect known authority horizon',
    )
    expect(target.current()).toEqual(before)
    expect(target.calls.acquire).toBe(3)
  })
  it('rejects invalid seed content ahead of unknown authority evidence', async () => {
    const { target, pack, input } = await seededWorld()
    target.setSeed(
      calendarSeedPackSchema.parse({
        ...pack,
        calendars: pack.calendars.map(entry => ({
          ...entry,
          snapshot: { ...entry.snapshot, knowledgeAsOf: '2025-12-02T00:00:00.000Z' },
        })),
      }),
    )
    target.deps.journal.health = async () => ({ kind: 'unknown', reason: 'lost response' })
    expect(await target.app().importSeed(context, input)).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'rejected' } } }] },
    })
    const reasons = [...target.runs.values()][0]?.command.candidate.reasons
    expect(reasons).toContain(
      'seed.authorityHorizon:unknown:blocker:Cannot inspect known authority horizon',
    )
    expect(reasons).toContain(
      'seed.contentMismatch:failed:blocker:Seed snapshot does not match its raw source material and knowledge metadata',
    )
    expect(target.current()).toBeNull()
  })
  it.each([
    {
      reason: 'same content',
      start: '2025-01-01',
      end: '2026-12-31',
      knowledge: '2025-12-01T00:00:00.000Z',
    },
    {
      reason: 'newer knowledge',
      start: '2026-01-01',
      end: '2026-12-31',
      knowledge: '2025-12-02T00:00:00.000Z',
    },
    {
      reason: 'earlier coverage start',
      start: '2024-01-01',
      end: '2026-12-31',
      knowledge: '2025-12-01T00:00:00.000Z',
    },
    {
      reason: 'later coverage end',
      start: '2025-01-01',
      end: '2027-12-31',
      knowledge: '2025-12-01T00:00:00.000Z',
    },
  ])(
    'keeps the current publication for $reason independently',
    async ({ start, end, knowledge }) => {
      const { target, input } = await seededWorld()
      target.deps.materials.preserve = async material => {
        const rawHash = createHash('sha256').update(material.content).digest('hex')
        const reference = `material:${supplyDigest({ rawHash, knowledgeAsOf: material.knowledgeAsOf })}`
        const value = { material, rawHash, reference }
        target.raw.set(reference, value)
        return { kind: 'ok', value }
      }
      const app = createCalendarSupplyApplication({
        ...target.deps,
        ids: { versionId: () => 'existing-current' },
        sourceAdapters: target.deps.sourceAdapters.map(adapter => ({
          ...adapter,
          async acquire(request, options) {
            const result = await adapter.acquire(request, options)
            if (result.kind !== 'acquired') return result
            return {
              ...result,
              material: {
                ...result.material,
                knowledgeAsOf: instantSchema.parse(knowledge),
                content:
                  adapter.sourceId === 'usc-6103-computed-rules'
                    ? new TextEncoder().encode(JSON.stringify({ start, end }))
                    : result.material.content,
              },
            }
          },
        })),
      })
      expect(await app.refresh(context, intent)).toMatchObject({
        kind: 'ok',
        value: { kind: 'recorded', receipt: { disposition: 'published' } },
      })
      const before = target.current()
      expect(await target.app().importSeed(context, input)).toMatchObject({
        kind: 'ok',
        value: {
          results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'noChange' } } }],
        },
      })
      expect(target.current()).toEqual(before)
      expect(target.calls.acquire).toBe(3)
    },
  )
  it('rejects recutting an existing seed version even with unchanged date content', async () => {
    const { target, pack, input } = await seededWorld()
    await target.app().importSeed(context, input)
    const previous = target.current()
    const altered = calendarSeedPackSchema.parse({
      ...pack,
      calendars: pack.calendars.map(entry => ({
        ...entry,
        snapshot: { ...entry.snapshot, synthesizedAt: '2026-01-02T00:00:00.000Z' },
      })),
    })
    target.setSeed(altered)
    expect(
      await target
        .app()
        .importSeed(context, { ...input, operationKey: 'recut', packHash: supplyDigest(altered) }),
    ).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'rejected' } } }] },
    })
    expect([...target.runs.values()].at(-1)?.command.candidate.reasons).toContain(
      'seed.versionConflict:failed:blocker:Existing seed version cannot be recut',
    )
    expect(target.current()).toEqual(previous)
  })
  it('rejects a seed whose snapshot knowledge does not match its raw material', async () => {
    const { target, pack, input } = await seededWorld()
    target.setSeed(
      calendarSeedPackSchema.parse({
        ...pack,
        calendars: pack.calendars.map(entry => ({
          ...entry,
          snapshot: { ...entry.snapshot, knowledgeAsOf: '2025-12-02T00:00:00.000Z' },
        })),
      }),
    )
    expect(await target.app().importSeed(context, input)).toMatchObject({
      kind: 'ok',
      value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'rejected' } } }] },
    })
    expect([...target.runs.values()][0]?.command.candidate.reasons).toContain(
      'seed.contentMismatch:failed:blocker:Seed snapshot does not match its raw source material and knowledge metadata',
    )
    expect(target.current()).toBeNull()
  })
  it('rejects changed seed bytes before preparing a durable intent', async () => {
    const { target, pack, input } = await seededWorld()
    target.setSeed(
      calendarSeedPackSchema.parse({
        ...pack,
        calendars: pack.calendars.map(entry => ({
          ...entry,
          materials: entry.materials.map(material => ({ ...material, rawHash: '0'.repeat(64) })),
        })),
      }),
    )
    expect(await target.app().importSeed(context, input)).toMatchObject({
      kind: 'ok',
      value: {
        results: [
          {
            outcome: {
              kind: 'rejected',
              reason: 'invalid',
              message: 'Seed raw material digest mismatch',
            },
          },
        ],
      },
    })
    expect(target.runs.size).toBe(0)
    expect(target.raw.size).toBe(0)
    expect(target.calls.commit).toBe(0)
  })
})

describe('reaction ownership and incomplete handoff', () => {
  it.each(['systemScopeRef', 'calendarId'] as const)(
    'refuses a reaction whose prepared owner has a different %s',
    async field => {
      const w = world()
      await w.app().refresh(context, intent)
      const find = w.deps.journal.findRun
      w.deps.journal.findRun = async input => {
        const run = await find(input)
        if (run.kind !== 'ok' || !run.value) return run
        return {
          kind: 'ok',
          value: {
            ...run.value,
            command: {
              ...run.value.command,
              address: { ...run.value.command.address, [field]: 'other-owner' },
            },
          },
        }
      }
      expect(
        await w.app().deliverReactions(context, { limit: 10, acknowledgementKey: 'mismatch' }),
      ).toMatchObject({
        kind: 'error',
        error: { code: 'provider_failure', message: 'Reaction ownership mismatch' },
      })
      expect(w.calls).toMatchObject({ handoff: 0, ack: 0, commit: 1 })
      expect(w.pending.size).toBe(1)
    },
  )
  it.each(['throw', 'blank', 'journal'] as const)(
    'keeps a reaction pending after %s prevents durable acknowledgement',
    async failure => {
      const w = world()
      await w.app().refresh(context, intent)
      const app = createCalendarSupplyApplication({
        ...w.deps,
        reactionSink: {
          async handoff() {
            if (failure === 'throw') throw new Error('sink offline')
            return { kind: 'accepted', handoffRef: failure === 'blank' ? ' ' : 'accepted-handoff' }
          },
        },
        journal: {
          ...w.deps.journal,
          async prepareAcknowledgement() {
            return { kind: 'unknown', reason: 'lost response' }
          },
        },
      })
      const reasons = {
        throw: 'Error: sink offline',
        blank: 'Missing handoff receipt',
        journal: 'Acknowledgement unknown',
      }
      expect(
        await app.deliverReactions(context, { limit: 10, acknowledgementKey: 'incomplete' }),
      ).toMatchObject({
        kind: 'ok',
        value: [{ outcome: { kind: 'pending', reason: reasons[failure] } }],
      })
      expect(w.calls).toMatchObject({ ack: 0, commit: 1 })
      expect(w.pending.size).toBe(1)
    },
  )
})
