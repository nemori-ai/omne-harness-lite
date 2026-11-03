import { afterEach, expect, it } from 'vitest'
import { calendarVersionIdSchema } from '@omne-harness/calendar-contract'
import { classifyDay } from '@omne-harness/calendar'
import { combinationManifest, type SqlStorage } from '@omne-harness/sql-contract'
import { calendarSqlMaterials, createCalendarSqlPersistence } from '@omne-harness/calendar-local'
import { command, openWorld } from './world.ts'

const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
async function world(wrap?: (storage: SqlStorage) => SqlStorage) {
  const opened = await openWorld(undefined, wrap)
  worlds.push(opened)
  return opened
}
afterEach(async () => {
  for (const opened of worlds.splice(0)) await opened.close()
})

it('retains immutable history and commits version, provenance, pointer, receipt and reaction together', async () => {
  const w = await world()
  const first = command()
  const r1 = await w.persistence.commitDisposition(first)
  expect(r1).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'published', current: { versionId: 'v1', publicationGeneration: 1 } },
  })
  const old = await w.repository.getSnapshot({
    calendarId: first.address.calendarId,
    version: { kind: 'pinned', versionId: calendarVersionIdSchema.parse('v1') },
  })
  const r2 = await w.persistence.commitDisposition(command('v2', 1))
  expect(r2).toMatchObject({
    kind: 'recorded',
    receipt: { current: { versionId: 'v2', publicationGeneration: 2 } },
  })
  expect(
    await w.repository.getSnapshot({
      calendarId: first.address.calendarId,
      version: { kind: 'pinned', versionId: calendarVersionIdSchema.parse('v1') },
    }),
  ).toEqual(old)
  if (old.kind !== 'ok' || old.value === null) throw new Error('Missing historical snapshot')
  expect(classifyDay({ snapshot: old.value, date: '2026-01-02' })).toMatchObject({
    kind: 'ok',
    classification: 'workingDay',
  })
  const candidates = await w.repository.listCandidates({
    calendarId: first.address.calendarId,
    after: null,
    limit: 10,
  })
  expect(candidates).toMatchObject({
    kind: 'ok',
    value: {
      items: [
        { command: { candidate: { sources: first.candidate.sources } } },
        { receipt: { disposition: 'published' } },
      ],
    },
  })
  const pending = await w.repository.listPendingReactions({ after: null, limit: 10 })
  expect(pending).toMatchObject({
    kind: 'ok',
    value: { items: [{ versionId: 'v1' }, { versionId: 'v2' }] },
  })
  const collision = command('v1', 2, 'same-version-different-bytes')
  if (collision.disposition.kind !== 'publish') throw new Error('Fixture')
  const snapshot = { ...collision.disposition.snapshot, contentHash: 'c'.repeat(64) }
  expect(
    await w.persistence.commitDisposition({
      ...collision,
      candidate: { ...collision.candidate, snapshot },
      disposition: { kind: 'publish', snapshot },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'versionConflict' })
})

it('CAS admits one concurrent candidate and stable intent replay creates no extra effects', async () => {
  const w = await world()
  const a = command('v1')
  const b = command('v2')
  const raced = await Promise.all([
    w.persistence.commitDisposition(a),
    w.persistence.commitDisposition(b),
  ])
  expect(raced.filter(value => value.kind === 'recorded')).toHaveLength(1)
  expect(raced.filter(value => value.kind === 'rejected')).toMatchObject([
    { reason: 'generationConflict' },
  ])
  const winner = raced[0]?.kind === 'recorded' ? a : b
  expect(await w.persistence.commitDisposition(winner)).toMatchObject({
    kind: 'recorded',
    replayed: true,
  })
  expect(
    await w.persistence.commitDisposition({
      ...winner,
      candidate: { ...winner.candidate, reasons: ['changed intent using same fingerprint'] },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'operationKeyConflict' })
  expect(
    await w.persistence.observeOperation({
      address: winner.address,
      expectedFingerprint: 'f'.repeat(64),
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'operationKeyConflict' })
  expect(
    await w.repository.listVersions({ calendarId: a.address.calendarId, after: null, limit: 10 }),
  ).toMatchObject({ kind: 'ok', value: { items: [expect.anything()] } })
  expect(await w.repository.listPendingReactions({ after: null, limit: 10 })).toMatchObject({
    kind: 'ok',
    value: { items: [expect.anything()] },
  })
})

it('same-content and retained dispositions preserve evidence without publishing', async () => {
  const w = await world()
  const first = command()
  expect(await w.persistence.commitDisposition(first)).toMatchObject({ kind: 'recorded' })
  if (first.disposition.kind !== 'publish') throw new Error('Fixture')
  const same = {
    ...first.disposition.snapshot,
    versionId: calendarVersionIdSchema.parse('another-id'),
  }
  expect(
    await w.persistence.commitDisposition({
      ...command('same', 1),
      candidate: { ...first.candidate, snapshot: same },
      disposition: { kind: 'publish', snapshot: same },
    }),
  ).toMatchObject({
    kind: 'recorded',
    receipt: {
      disposition: 'noChange',
      current: { versionId: 'v1', publicationGeneration: 1 },
      outboxId: null,
    },
  })
  for (const kind of ['noChange', 'withheld', 'rejected'] as const) {
    const candidate = { ...first.candidate, snapshot: null }
    const result = await w.persistence.commitDisposition({
      ...command(kind, 1),
      candidate,
      disposition: { kind },
    })
    expect(result).toMatchObject({
      kind: 'recorded',
      receipt: { disposition: kind, outboxId: null },
    })
    if (result.kind !== 'recorded') throw new Error('Missing receipt')
    expect(
      await w.repository.getCandidate({ candidateRef: result.receipt.candidateRef }),
    ).toMatchObject({ kind: 'ok', value: { command: { candidate } } })
  }
  expect(
    await w.repository.listVersions({
      calendarId: first.address.calendarId,
      after: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'ok', value: { items: [expect.anything()] } })
  expect(await w.repository.listPendingReactions({ after: null, limit: 10 })).toMatchObject({
    kind: 'ok',
    value: { items: [expect.anything()] },
  })
})

it('reconstructs original identity after a lost receipt and keeps unknown separate from query exclusion', async () => {
  let drop = true
  let queryUnavailable = false
  const w = await world(storage => ({
    ...storage,
    async commit(input, options) {
      const result = await storage.commit(input, options)
      if (drop) {
        drop = false
        return { kind: 'unknown', identity: input.identity, diagnostic: 'fixture dropped response' }
      }
      return result
    },
    query(identity) {
      return queryUnavailable
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: null })
        : storage.query(identity)
    },
  }))
  const original = command()
  const lost = await w.persistence.commitDisposition(original)
  expect(lost).toMatchObject({ kind: 'unknown' })
  queryUnavailable = true
  expect(
    await w.persistence.observeOperation({
      address: original.address,
      expectedFingerprint: original.expectedFingerprint,
    }),
  ).toEqual(lost)
  queryUnavailable = false
  expect(
    await w.persistence.observeOperation({
      address: original.address,
      expectedFingerprint: original.expectedFingerprint,
    }),
  ).toMatchObject({ kind: 'recorded', receipt: { current: { publicationGeneration: 1 } } })
  expect(
    await w.persistence.observeOperation({
      address: command('absent').address,
      expectedFingerprint: command('absent').expectedFingerprint,
    }),
  ).toMatchObject({ kind: 'notCommitted' })
  expect(await w.persistence.commitDisposition(original)).toMatchObject({
    kind: 'recorded',
    replayed: true,
  })
})

it('requires the same-transaction authority fact and preserves bound denial but not unbound early stops', async () => {
  const own = calendarSqlMaterials()
  const incomplete = {
    catalogProtocol: 'sql-catalog/1',
    ...own,
    declaredCombinations: { tenant: null, system: null },
  } as const
  expect(
    combinationManifest({ catalog: incomplete, participants: ['calendar.persistence'] }),
  ).toMatchObject({ kind: 'combination_invalid', problems: [{ kind: 'fact_unprovided' }] })
  const w = await world()
  for (const mode of ['wrong-calendar', 'wrong-fingerprint', 'wrong-generation', 'wrong-refs']) {
    await w.configure(true, true, mode)
    expect(await w.persistence.commitDisposition(command(mode))).toMatchObject({
      kind: 'rejected',
      reason: 'authorityRejected',
    })
  }
  await w.configure(false, true)
  const denied = command('denied')
  expect(await w.persistence.commitDisposition(denied)).toMatchObject({
    kind: 'rejected',
    reason: 'authorityRejected',
  })
  expect(
    await w.persistence.observeOperation({
      address: denied.address,
      expectedFingerprint: denied.expectedFingerprint,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'authorityRejected' })
  expect(
    await w.persistence.observeOperation({
      address: denied.address,
      expectedFingerprint: 'f'.repeat(64),
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'operationKeyConflict' })
  await w.configure(true, true, 'early-stop')
  const stopped = command('early-stop')
  expect(await w.persistence.commitDisposition(stopped)).toMatchObject({ kind: 'rejected' })
  expect(
    await w.persistence.observeOperation({
      address: stopped.address,
      expectedFingerprint: stopped.expectedFingerprint,
    }),
  ).toMatchObject({ kind: 'unknown' })
  expect(await w.repository.listCalendars({ after: null, limit: 10 })).toEqual({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
})

it('rolls every Calendar write back when a later participant fails', async () => {
  const w = await world(storage => ({
    ...storage,
    commit(input, options) {
      return storage.commit(
        {
          ...input,
          commands: [
            ...input.commands,
            { participant: 'fixture.after-calendar-write', facts: { mode: 'fail' } },
          ],
        },
        options,
      )
    },
  }))
  expect(await w.persistence.commitDisposition(command())).toMatchObject({ kind: 'rejected' })
  expect(
    await w.persistence.observeOperation({
      address: command().address,
      expectedFingerprint: command().expectedFingerprint,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'providerUnavailable' })
  expect(await w.repository.listCalendars({ after: null, limit: 10 })).toEqual({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
  expect(
    await w.repository.listVersions({
      calendarId: command().address.calendarId,
      after: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'ok', value: { items: [] } })
  expect(
    await w.repository.listCandidates({
      calendarId: command().address.calendarId,
      after: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'ok', value: { items: [] } })
  expect(await w.repository.listPendingReactions({ after: null, limit: 10 })).toMatchObject({
    kind: 'ok',
    value: { items: [] },
  })
})

it('recovers pending reactions across reopen and only acknowledges the original handoff', async () => {
  const first = await openWorld()
  const published = await first.persistence.commitDisposition(command())
  if (published.kind !== 'recorded' || published.receipt.outboxId === null)
    throw new Error(JSON.stringify(published))
  const pending = await first.repository.listPendingReactions({ after: null, limit: 1 })
  await first.close()
  const w = await openWorld(first.root)
  worlds.push(w)
  expect(await w.repository.listPendingReactions({ after: null, limit: 1 })).toEqual(pending)
  await w.configure(false, true)
  const ack = {
    acknowledgementKey: 'ack-1',
    id: published.receipt.outboxId,
    operationRef: published.receipt.operationRef,
    handoffRef: 'consumer:accepted-1',
    authorityGuardRefs: ['fixture-ack-grant'],
  }
  expect(await w.persistence.acknowledgeReaction({ ...ack, operationRef: 'wrong' })).toEqual({
    kind: 'rejected',
    reason: 'notFound',
  })
  expect(await w.persistence.acknowledgeReaction(ack)).toEqual({ kind: 'acknowledged' })
  expect(await w.persistence.acknowledgeReaction(ack)).toEqual({ kind: 'acknowledged' })
  expect(await w.persistence.acknowledgeReaction({ ...ack, handoffRef: 'wrong-receipt' })).toEqual({
    kind: 'rejected',
    reason: 'invalid',
  })
  expect(await w.repository.listPendingReactions({ after: null, limit: 1 })).toEqual({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
  expect(
    await w.repository.getSnapshot({
      calendarId: command().address.calendarId,
      version: { kind: 'current' },
    }),
  ).toMatchObject({ kind: 'ok', value: { versionId: 'v1', publicationGeneration: 1 } })
})

it('preserves a denied acknowledgement while a newly authorized intent can finish the same reaction', async () => {
  const w = await world()
  const published = await w.persistence.commitDisposition(command())
  if (published.kind !== 'recorded' || published.receipt.outboxId === null)
    throw new Error(JSON.stringify(published))
  const ack = {
    acknowledgementKey: 'first-ack-intent',
    id: published.receipt.outboxId,
    operationRef: published.receipt.operationRef,
    handoffRef: 'accepted-by-consumer',
    authorityGuardRefs: ['fixture-current-ack-authority'],
  }
  await w.configure(false, false)
  const denied = { kind: 'rejected', reason: 'authorityRejected' }
  expect(await w.persistence.acknowledgeReaction(ack)).toEqual(denied)
  await w.configure(false, true)
  expect(await w.persistence.acknowledgeReaction(ack)).toEqual(denied)
  expect(await w.persistence.acknowledgeReaction({ ...ack, handoffRef: 'changed' })).toEqual({
    kind: 'rejected',
    reason: 'invalid',
  })
  const approved = { ...ack, acknowledgementKey: 'newly-approved-ack-intent' }
  expect(await w.persistence.acknowledgeReaction(approved)).toEqual({ kind: 'acknowledged' })
  expect(await w.persistence.acknowledgeReaction(approved)).toEqual({ kind: 'acknowledged' })
  expect(await w.repository.listPendingReactions({ after: null, limit: 10 })).toEqual({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
  expect(
    await w.repository.getSnapshot({
      calendarId: command().address.calendarId,
      version: { kind: 'current' },
    }),
  ).toMatchObject({
    kind: 'ok',
    value: { versionId: 'v1', publicationGeneration: 1 },
  })
})

it('never reports a failed repository read as an empty result', async () => {
  const w = await world(storage => ({
    ...storage,
    async read(input) {
      return {
        kind: 'unavailable',
        requestKey: input.requestKey,
        reason: 'read_failed',
        diagnostic: null,
      }
    },
  }))
  expect(await w.repository.listCalendars({ after: null, limit: 10 })).toEqual({
    kind: 'unavailable',
    reason: 'read_failed',
  })
  expect(() =>
    createCalendarSqlPersistence({
      storage: w.storage,
      combination: w.combination,
      authority: {
        participant: 'missing',
        command: binding => ({ participant: 'missing', facts: { binding } }),
      },
    }),
  ).toThrow(/authority participant/)
})
