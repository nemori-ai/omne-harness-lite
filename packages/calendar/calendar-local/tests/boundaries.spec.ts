import { expect, it } from 'vitest'
import { calendarSnapshotSchema, instantSchema } from '@omne-harness/calendar-contract'
import { command, openWorld } from './world.ts'

it('rejects a contradictory candidate, content hash collision and stale seed without changing current', async () => {
  const w = await openWorld()
  try {
    const first = command()
    expect(await w.persistence.commitDisposition(first)).toMatchObject({ kind: 'recorded' })
    const next = command('v2', 1)
    expect(
      await w.persistence.commitDisposition({ ...next, candidate: first.candidate }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalid' })
    if (next.disposition.kind !== 'publish' || first.disposition.kind !== 'publish')
      throw new Error('Fixture')
    const colliding = {
      ...next.disposition.snapshot,
      contentHash: first.disposition.snapshot.contentHash,
    }
    expect(
      await w.persistence.commitDisposition({
        ...command('collision', 1),
        candidate: { ...next.candidate, snapshot: colliding },
        disposition: { kind: 'publish', snapshot: colliding },
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'contentHashConflict' })
    const olderSeed = {
      ...next.disposition.snapshot,
      knowledgeAsOf: instantSchema.parse('2025-01-01T00:00:00.000Z'),
    }
    expect(
      await w.persistence.commitDisposition({
        ...command('seed', 1),
        address: { ...command('seed', 1).address, operation: 'importSeed' },
        candidate: { ...next.candidate, snapshot: olderSeed },
        disposition: { kind: 'publish', snapshot: olderSeed },
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'staleSeed' })
    expect(
      await w.repository.getSnapshot({
        calendarId: first.address.calendarId,
        version: { kind: 'current' },
      }),
    ).toMatchObject({ kind: 'ok', value: { versionId: 'v1', publicationGeneration: 1 } })
  } finally {
    await w.close()
  }
})

it('uses bounded stable cursors and never loads full candidate history into a page', async () => {
  const w = await openWorld()
  try {
    for (let index = 0; index < 7; index++) {
      expect(
        await w.persistence.commitDisposition({
          ...command(`candidate-${index}`),
          candidate: { ...command().candidate, snapshot: null },
          disposition: { kind: 'withheld' },
        }),
      ).toMatchObject({ kind: 'recorded' })
    }
    const refs: string[] = []
    let after: string | null = null
    do {
      const result = await w.repository.listCandidates({
        calendarId: command().address.calendarId,
        after,
        limit: 2,
      })
      if (result.kind !== 'ok') throw new Error(JSON.stringify(result))
      expect(result.value.items.length).toBeLessThanOrEqual(2)
      refs.push(...result.value.items.map(item => item.candidateRef))
      after = result.value.nextCursor
    } while (after !== null)
    expect(refs).toHaveLength(7)
    expect(new Set(refs).size).toBe(7)
    expect(
      await w.repository.listCandidates({
        calendarId: command().address.calendarId,
        after: null,
        limit: 101,
      }),
    ).toMatchObject({ kind: 'invalid' })
    expect(
      await w.repository.getSnapshot({
        calendarId: command().address.calendarId,
        version: {
          kind: 'pinned',
          versionId: calendarSnapshotSchema.parse({
            ...command().candidate.snapshot,
            publicationGeneration: 0,
          }).versionId,
        },
      }),
    ).toEqual({ kind: 'ok', value: null })
  } finally {
    await w.close()
  }
})

it('uses the RFC 8785 operation address golden for non-ASCII scopes and rejects malformed Unicode', async () => {
  const w = await openWorld()
  try {
    const original = command()
    const address = { ...original.address, systemScopeRef: '中文😀/路径', operationKey: '稳定' }
    const result = await w.persistence.commitDisposition({ ...original, address })
    expect(result).toMatchObject({
      kind: 'recorded',
      receipt: {
        operationRef:
          'calendar-operation:5df917287b898bc038b44aa224cf3c30adb355010255b225b353cb9171843ae8',
      },
    })
    expect(
      await w.persistence.observeOperation({
        expectedFingerprint: original.expectedFingerprint,
        address: {
          operationKey: '稳定',
          calendarId: address.calendarId,
          operation: 'refresh',
          systemScopeRef: '中文😀/路径',
          protocol: 'omne.calendar-schedule/1',
        },
      }),
    ).toMatchObject({ kind: 'recorded' })
    expect(
      await w.persistence.commitDisposition({
        ...original,
        address: { ...address, systemScopeRef: '\ud800' },
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalid' })
  } finally {
    await w.close()
  }
})
