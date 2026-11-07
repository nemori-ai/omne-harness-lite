import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  standaloneSettingsGuards,
} from '../src/index.ts'
import { sourceKey, sourceReservationKey } from '../src/source-retention-records.ts'
import {
  sourceCustodyReceiptSchema,
  type SourceCustodyRecord,
} from '../src/source-custody-schema.ts'
import {
  SOURCE_RETENTION_OWNER,
  SOURCE_SNAPSHOT_PARTICIPANT,
  sourceRequestSchema,
} from '../src/source-retention-schema.ts'
import { json } from '../src/encoding.ts'
import { allocation, openIntentWorld } from './intent-world.ts'
import { source, sourceSnapshot } from './source-retention-world.ts'
import { command, definition, openWorld } from './world.ts'
import { ownerSources } from './sources.ts'
const worlds: Awaited<ReturnType<typeof openIntentWorld>>[] = []
const providers: Awaited<ReturnType<typeof openWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
  for (const w of providers.splice(0)) await w.close()
})
function response(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses[0].reply.response
}
async function setup(sources = [source]) {
  const input = allocation()
  const w = await openIntentWorld()
  worlds.push(w)
  expect((await w.write(input)).kind).toBe('committed')
  const ref = { identity: input.identity, attemptId: input.attemptId }
  const plan = { ...ref, route: 'settings.destination', sources }
  return { w, input, ref, plan }
}
async function request(
  w: Awaited<ReturnType<typeof openIntentWorld>>,
  ref: { identity: ReturnType<typeof allocation>['identity']; attemptId: string },
  sourceRef = source,
) {
  return sourceRequestSchema.parse(
    z
      .object({ request: sourceRequestSchema })
      .parse(response(await w.source({ kind: 'request', input: { ...ref, source: sourceRef } })))
      .request,
  )
}
function held(
  request: ReturnType<typeof sourceRequestSchema.parse>,
): SourceCustodyRecord['receipt'] {
  return {
    kind: 'held',
    request,
    reservationId: sourceReservationKey(request),
    snapshot: {
      ...sourceSnapshot(),
      source: request.source,
      projection: { ...sourceSnapshot().projection, target: request.source.target },
    },
  }
}
it('freezes a complete set atomically, recognizes reordered input and refuses route or set changes', async () => {
  const other = { ...source, target: { ...source.target, targetRef: 'other' } }
  const { w, ref, plan } = await setup([source, other])
  const rolled = await w.source({ kind: 'plan', input: plan }, true)
  expect(rolled.kind).toBe('rolled_back')
  expect(await w.readSources({ ...ref, after: null, limit: 64 })).toMatchObject({
    kind: 'read',
    output: { kind: 'not_found' },
  })
  const original = response(await w.source({ kind: 'plan', input: plan }))
  expect(original).toMatchObject({ kind: 'planned', count: 2 })
  expect(
    response(await w.source({ kind: 'plan', input: { ...plan, sources: [other, source] } })),
  ).toEqual(original)
  for (const changed of [
    { ...plan, sources: [source] },
    { ...plan, route: 'different-route' },
  ])
    expect(response(await w.source({ kind: 'plan', input: changed }))).toEqual({
      kind: 'rejected',
      reason: 'operation_conflict',
    })
  expect(
    response(await w.source({ kind: 'plan', input: { ...plan, sources: [source, source] } })),
  ).toEqual({ kind: 'rejected', reason: 'invalid_input' })
  expect((await request(w, ref)).destination).toMatchObject({
    ownerRef: 'settings',
    attemptId: ref.attemptId,
    identity: ref.identity,
    route: plan.route,
  })
})
it('rejects unrequested, misbound and changed held receipts and never revives a settled member', async () => {
  const { w, ref, plan } = await setup()
  await w.source({ kind: 'plan', input: plan })
  const page = await w.readSources({ ...ref, after: null, limit: 64 })
  if (page.kind !== 'read') throw new Error(JSON.stringify(page))
  const planned = z
    .object({ items: z.array(z.object({ request: sourceRequestSchema })) })
    .parse(page.output).items[0]!.request
  const receipt = held(planned)
  expect(response(await w.source({ kind: 'record', input: { ...ref, receipt } }))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  await request(w, ref)
  const wrongRequest = { ...planned, destination: { ...planned.destination, route: 'other' } }
  expect(
    response(await w.source({ kind: 'record', input: { ...ref, receipt: held(wrongRequest) } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(response(await w.source({ kind: 'record', input: { ...ref, receipt } }))).toEqual(receipt)
  if (receipt.kind !== 'held') throw new Error('held fixture')
  expect(
    response(
      await w.source({
        kind: 'record',
        input: {
          ...ref,
          receipt: {
            ...receipt,
            snapshot: {
              ...receipt.snapshot,
              projection: { ...receipt.snapshot.projection, ownerRevision: 2 },
            },
          },
        },
      }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  const terminal = {
    kind: 'settled' as const,
    request: planned,
    reservationId: receipt.reservationId,
    outcome: 'aborted' as const,
  }
  expect(
    response(await w.source({ kind: 'record', input: { ...ref, receipt: terminal } })),
  ).toEqual(terminal)
  expect(response(await w.source({ kind: 'record', input: { ...ref, receipt } }))).toEqual(terminal)
  expect(
    response(
      await w.source({
        kind: 'record',
        input: { ...ref, receipt: { ...terminal, outcome: 'committed' } },
      }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
})
it('recognizes a lost reply from the actual source participant after destination reopen', async () => {
  const provider = await openWorld({
    sourceCapture: true,
    authority: { materials: settingsStandaloneMaterials(), guards: standaloneSettingsGuards },
  })
  providers.push(provider)
  const owner = createStandaloneSettingsOwner({
    storage: provider.storage,
    domain: provider.domain,
    ...provider.combination,
  })
  expect(
    await owner.mutate({
      kind: 'provision',
      operationId: 'source',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target: command().target,
        definition,
        sources: ownerSources('tenant'),
        grants: [],
      },
    }),
  ).toMatchObject({ kind: 'committed' })
  const sourceRef = { domain: provider.domain, target: command().target }
  const { w, ref, plan, input } = await setup([sourceRef])
  await w.source({ kind: 'plan', input: plan })
  const planned = await request(w, ref, sourceRef)
  async function reserve() {
    const result = await provider.storage.commit({
      identity: {
        ...provider.domain,
        operation: 'fixture.source-custody',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      combinationVersion: provider.combination.combinationVersion,
      manifestDigest: provider.combination.manifestDigest,
      commands: [
        { participant: SOURCE_RETENTION_OWNER, facts: { kind: 'reserve', request: json(planned) } },
        { participant: SOURCE_SNAPSHOT_PARTICIPANT, facts: { request: json(planned) } },
      ],
    })
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    return sourceCustodyReceiptSchema.parse(
      result.responses.find(r => r.participant === SOURCE_RETENTION_OWNER)?.reply.response,
    )
  }
  const first = await reserve()
  expect(first.kind).toBe('held')
  await w.close()
  const reopened = await openIntentWorld(w.root, input.identity.domain)
  worlds.push(reopened)
  expect(await reopened.readSource({ ...ref, source: sourceRef })).toMatchObject({
    kind: 'read',
    output: { kind: 'requested', request: planned },
  })
  expect(await reserve()).toEqual(first)
  expect(
    response(await reopened.source({ kind: 'record', input: { ...ref, receipt: first } })),
  ).toEqual(first)
  await owner.close()
})
it('records old-attempt replies without authorizing another request or changing its successor', async () => {
  const { w, input, ref, plan } = await setup()
  await w.source({ kind: 'plan', input: plan })
  const receipt = held(await request(w, ref))
  await w.close()
  const db = new DatabaseSync(
    join(w.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
  )
  try {
    db.prepare("UPDATE st_governance_attempt SET state = 'aborted' WHERE attempt_id = ?").run(
      input.attemptId,
    )
  } finally {
    db.close()
  }
  const reopened = await openIntentWorld(w.root, input.identity.domain)
  worlds.push(reopened)
  expect((await reopened.write({ ...input, attemptId: 'successor' })).kind).toBe('committed')
  const before = await reopened.read(ref.identity)
  expect(response(await reopened.source({ kind: 'record', input: { ...ref, receipt } }))).toEqual(
    receipt,
  )
  const after = await reopened.read(ref.identity)
  if (before.kind !== 'read' || after.kind !== 'read') throw new Error('read failed')
  expect(after.output).toEqual(before.output)
  expect(response(await reopened.source({ kind: 'request', input: { ...ref, source } }))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  expect(
    await reopened.readSource({
      ...ref,
      identity: { ...ref.identity, principalRef: 'other' },
      source,
    }),
  ).toMatchObject({ kind: 'read', output: { kind: 'not_found' } })
})
it('pages request metadata through the attempt primary key without loading snapshots', async () => {
  const sources = Array.from({ length: 65 }, (_, i) => ({
    ...source,
    target: { ...source.target, targetRef: `source-${i}` },
  }))
  const { w, ref, plan } = await setup(sources)
  await w.source({ kind: 'plan', input: plan })
  const first = await w.readSources({ ...ref, after: null, limit: 64 })
  if (first.kind !== 'read') throw new Error(JSON.stringify(first))
  const shape = z.object({
    items: z.array(
      z.object({ sourceKey: z.string(), request: sourceRequestSchema, state: z.string() }),
    ),
    after: z.string().nullable(),
  })
  const page = shape.parse(first.output)
  expect(page.items).toHaveLength(64)
  expect(JSON.stringify(first.output)).not.toContain('snapshot')
  const second = await w.readSources({ ...ref, after: page.after, limit: 64 })
  if (second.kind !== 'read') throw new Error(JSON.stringify(second))
  const next = shape.parse(second.output)
  expect(next.items).toHaveLength(1)
  expect(new Set([...page.items, ...next.items].map(item => item.sourceKey))).toEqual(
    new Set(sources.map(sourceKey)),
  )
  await w.close()
  const db = new DatabaseSync(
    join(w.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    { readOnly: true },
  )
  try {
    const plan = db
      .prepare(
        'EXPLAIN QUERY PLAN SELECT source_key, request_json, reservation_id, state FROM st_intent_source WHERE attempt_id = ? AND source_key > ? ORDER BY source_key LIMIT ?',
      )
      .all(ref.attemptId, '', 64)
    expect(JSON.stringify(plan)).toContain('PRIMARY KEY')
    expect(JSON.stringify(plan)).not.toContain('TEMP B-TREE')
  } finally {
    db.close()
  }
})
it('persists an explicit empty plan and keeps it distinct from an unplanned attempt', async () => {
  const { w, ref, plan } = await setup([])
  expect(response(await w.source({ kind: 'plan', input: plan }))).toMatchObject({
    kind: 'planned',
    count: 0,
  })
  expect(await w.readSources({ ...ref, after: null, limit: 64 })).toMatchObject({
    kind: 'read',
    output: { kind: 'page', plan: { count: 0 }, items: [], after: null },
  })
  expect(response(await w.source({ kind: 'plan', input: { ...plan, sources: [source] } }))).toEqual(
    { kind: 'rejected', reason: 'operation_conflict' },
  )
})
it('records terminal recognition directly after a lost held reply', async () => {
  const { w, ref, plan } = await setup()
  await w.source({ kind: 'plan', input: plan })
  const planned = await request(w, ref)
  const receipt = {
    kind: 'settled' as const,
    request: planned,
    reservationId: sourceReservationKey(planned),
    outcome: 'aborted' as const,
  }
  expect(response(await w.source({ kind: 'record', input: { ...ref, receipt } }))).toEqual(receipt)
  expect(
    response(await w.source({ kind: 'record', input: { ...ref, receipt: held(planned) } })),
  ).toEqual(receipt)
})
it('serializes competing manifests without publishing a mixed request set', async () => {
  const { w, ref, plan } = await setup()
  const other = { ...source, target: { ...source.target, targetRef: 'competing' } }
  const results = await Promise.all([
    w.source({ kind: 'plan', input: plan }),
    w.source({ kind: 'plan', input: { ...plan, sources: [other] } }),
  ])
  const replies = results.map(response)
  expect(
    replies.filter(reply => z.object({ kind: z.literal('planned') }).safeParse(reply).success),
  ).toHaveLength(1)
  expect(
    replies.filter(
      reply =>
        z
          .object({ kind: z.literal('rejected'), reason: z.literal('operation_conflict') })
          .safeParse(reply).success,
    ),
  ).toHaveLength(1)
  const page = await w.readSources({ ...ref, after: null, limit: 64 })
  if (page.kind !== 'read') throw new Error(JSON.stringify(page))
  const read = z
    .object({
      plan: z.object({ count: z.number() }),
      items: z.array(z.object({ request: sourceRequestSchema })),
    })
    .parse(page.output)
  expect(read.plan.count).toBe(1)
  expect(read.items).toHaveLength(1)
  expect([sourceKey(source), sourceKey(other)]).toContain(sourceKey(read.items[0]!.request.source))
})
