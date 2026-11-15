import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import type { CalendarPreparedRun } from '@omne-harness/calendar'
import { createCalendarSqlSupplyStorage } from '@omne-harness/calendar-local'
import { openWorld, run, scope, instant } from './world.ts'
export function ref(prepared: CalendarPreparedRun) {
  return `calendar-operation:${createHash('sha256')
    .update(canonicalize(prepared.command.address) ?? '')
    .digest('hex')}`
}
function completion(
  prepared: CalendarPreparedRun,
  disposition: 'published' | 'noChange' | 'withheld' | 'rejected',
) {
  return {
    address: prepared.command.address,
    expectedFingerprint: prepared.command.expectedFingerprint,
    operationRef: ref(prepared),
    completedAt: instant,
    disposition,
  }
}
it('keeps the first prepared command through contention and restart', async () => {
  const world = await openWorld()
  const first = run()
  const changed = run('v2', 'v1')
  try {
    const results = await Promise.all([
      world.journal.prepareRun(first),
      world.journal.prepareRun(changed),
    ])
    expect(results[0]).toEqual({ kind: 'ok', value: first })
    expect(results[1]?.kind).toMatch(/^(ok|unknown)$/)
    expect(await world.journal.prepareRun(changed)).toEqual({ kind: 'ok', value: first })
  } finally {
    await world.close()
  }
  const reopened = await openWorld(world.root)
  try {
    expect(await reopened.journal.prepareRun(changed)).toEqual({ kind: 'ok', value: first })
    expect(
      await reopened.journal.prepareRun({
        ...changed,
        command: { ...changed.command, expectedFingerprint: '0'.repeat(64) },
      }),
    ).toMatchObject({ kind: 'conflict' })
    expect(
      await reopened.journal.readRun({
        address: first.command.address,
        expectedFingerprint: first.command.expectedFingerprint,
      }),
    ).toEqual({ kind: 'ok', value: first })
    expect(
      await reopened.journal.findRun({ systemScopeRef: scope, operationRef: ref(first) }),
    ).toEqual({ kind: 'ok', value: first })
    expect(await reopened.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
      kind: 'ok',
      value: [first],
    })
  } finally {
    await reopened.close()
  }
})
it('retains unknown and recovers the original intent after lost observation', async () => {
  let hide = false,
    commits = 0
  const world = await openWorld(undefined, s => ({
    ...s,
    query: async id =>
      hide ? { kind: 'unknown', identity: id, diagnostic: 'injected query loss' } : s.query(id),
    commit: async input => {
      commits++
      const result = await s.commit(input)
      hide = true
      throw new Error(JSON.stringify(result))
    },
  }))
  try {
    expect(await world.journal.prepareRun(run())).toMatchObject({ kind: 'unknown' })
    expect(await world.journal.prepareRun(run('v2', 'v1'))).toMatchObject({ kind: 'unknown' })
    expect(
      await world.journal.readRun({
        address: run().command.address,
        expectedFingerprint: run().command.expectedFingerprint,
      }),
    ).toMatchObject({ kind: 'unknown' })
    expect(
      await world.journal.findRun({ systemScopeRef: scope, operationRef: ref(run()) }),
    ).toMatchObject({ kind: 'unknown' })
    expect(commits).toBe(1)
    hide = false
    expect(await world.journal.prepareRun(run('v2', 'v1'))).toEqual({ kind: 'ok', value: run() })
    expect(commits).toBe(1)
  } finally {
    await world.close()
  }
})
it('counts completion once and does not move newer health backwards for a late run', async () => {
  const world = await openWorld()
  const old = {
      ...run('old'),
      command: { ...run('old').command, disposition: { kind: 'withheld' as const } },
    },
    current = run('new')
  const healthScope = { systemScopeRef: scope, calendarId: old.command.address.calendarId }
  try {
    expect(await world.journal.prepareRun(old)).toMatchObject({ kind: 'ok' })
    expect(await world.journal.completeRun(completion(old, 'withheld'))).toEqual({
      kind: 'ok',
      value: null,
    })
    expect(
      await world.journal.completeRun({
        ...completion(old, 'withheld'),
        completedAt: instantSchema.parse('2026-01-03T00:00:00.000Z'),
      }),
    ).toEqual({ kind: 'ok', value: null })
    expect(await world.journal.health(healthScope)).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 1, lastSuccess: null, pendingRuns: [] },
    })
    expect(await world.journal.completeRun(completion(old, 'rejected'))).toMatchObject({
      kind: 'conflict',
    })
    const late = {
      ...old,
      command: { ...old.command, address: { ...old.command.address, operationKey: 'late' } },
    }
    expect(await world.journal.prepareRun(late)).toMatchObject({ kind: 'ok' })
    expect(await world.journal.prepareRun(current)).toMatchObject({ kind: 'ok' })
    expect(await world.journal.completeRun(completion(current, 'published'))).toEqual({
      kind: 'ok',
      value: null,
    })
    expect(await world.journal.completeRun(completion(late, 'withheld'))).toEqual({
      kind: 'ok',
      value: null,
    })
    expect(await world.journal.health(healthScope)).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 0, lastSuccess: instant, pendingRuns: [] },
    })
    expect(
      await world.journal.completeRun({
        ...completion(current, 'published'),
        operationRef: 'wrong',
      }),
    ).toMatchObject({ kind: 'conflict' })
  } finally {
    await world.close()
  }
})
it.each(['denied', 'wrong-scope', 'wrong-digest', 'early-stop'])(
  'requires a current bound authority fact: %s',
  async mode => {
    const world = await openWorld()
    try {
      await world.configure(mode)
      expect((await world.journal.prepareRun(run())).kind).toBe(
        mode === 'early-stop' ? 'unknown' : 'unavailable',
      )
      expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
        kind: 'ok',
        value: [],
      })
    } finally {
      await world.close()
    }
  },
)
it('isolates two scopes with the same intent keys and rejects mismatched scope and invalid keys', async () => {
  const world = await openWorld()
  const other = createCalendarSqlSupplyStorage({ ...world.options, systemScopeRef: 'other' })
  const r = run(),
    otherRun = {
      ...run('v2', 'v1'),
      command: {
        ...run('v2', 'v1').command,
        address: { ...r.command.address, systemScopeRef: 'other' },
      },
    }
  try {
    expect(await world.journal.prepareRun(r)).toMatchObject({ kind: 'ok' })
    expect(await other.journal.prepareRun(otherRun)).toEqual({ kind: 'ok', value: otherRun })
    expect(
      await other.journal.readRun({
        address: r.command.address,
        expectedFingerprint: r.command.expectedFingerprint,
      }),
    ).toMatchObject({ kind: 'conflict' })
    expect(await other.journal.pending({ systemScopeRef: 'other', limit: 10 })).toEqual({
      kind: 'ok',
      value: [otherRun],
    })
    for (const operationKey of ['', 'x'.repeat(129), '\ud800'])
      expect(
        await world.journal.prepareRun({
          ...r,
          command: { ...r.command, address: { ...r.command.address, operationKey } },
        }),
      ).toMatchObject({ kind: 'conflict' })
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 101 })).toMatchObject({
      kind: 'conflict',
    })
  } finally {
    await world.close()
  }
})
it('rolls back every journal write when a later participant fails', async () => {
  const world = await openWorld(undefined, s => ({
    ...s,
    commit: input =>
      s.commit({
        ...input,
        commands: [
          ...input.commands,
          { participant: 'fixture.after-supply', facts: { mode: 'fail' } },
        ],
      }),
  }))
  try {
    expect(await world.journal.prepareRun(run())).toMatchObject({ kind: 'unavailable' })
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
      kind: 'ok',
      value: [],
    })
  } finally {
    await world.close()
  }
})
it('reports read failure instead of an empty pending or health result', async () => {
  const world = await openWorld(undefined, s => ({
    ...s,
    read: async () => {
      throw new Error('read failed')
    },
  }))
  try {
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toMatchObject({
      kind: 'unavailable',
    })
    expect(
      await world.journal.health({
        systemScopeRef: scope,
        calendarId: run().command.address.calendarId,
      }),
    ).toMatchObject({ kind: 'unavailable' })
  } finally {
    await world.close()
  }
})
it('preserves the first acknowledgement payload and recovers it across instances', async () => {
  const world = await openWorld(),
    ack = {
      id: 'outbox',
      acknowledgementKey: 'ack-1',
      operationRef: 'publication',
      handoffRef: 'handoff-first',
      authorityGuardRefs: ['guard-first'],
    }
  try {
    expect(await world.journal.prepareAcknowledgement(ack)).toEqual({ kind: 'ok', value: ack })
    expect(await world.journal.prepareAcknowledgement({ ...ack, handoffRef: 'new' })).toMatchObject(
      { kind: 'conflict' },
    )
  } finally {
    await world.close()
  }
  const restored = await openWorld(world.root)
  try {
    expect(
      await restored.journal.readAcknowledgement({
        id: ack.id,
        acknowledgementKey: ack.acknowledgementKey,
      }),
    ).toEqual({ kind: 'ok', value: ack })
    expect(await restored.journal.prepareAcknowledgement(ack)).toEqual({ kind: 'ok', value: ack })
    const unknown = createCalendarSqlSupplyStorage({
      ...restored.options,
      storage: {
        ...restored.storage,
        query: async id => ({ kind: 'unknown', identity: id, diagnostic: 'injected query loss' }),
      },
    })
    expect(
      await unknown.journal.readAcknowledgement({
        id: ack.id,
        acknowledgementKey: ack.acknowledgementKey,
      }),
    ).toMatchObject({ kind: 'unknown' })
  } finally {
    await restored.close()
  }
})
it('returns explicit capacity failure for incomplete health and keeps all pending runs', async () => {
  const world = await openWorld()
  try {
    for (let i = 0; i < 101; i++)
      expect(await world.journal.prepareRun(run(`v${i}`))).toMatchObject({ kind: 'ok' })
    expect(
      await world.journal.health({
        systemScopeRef: scope,
        calendarId: run().command.address.calendarId,
      }),
    ).toMatchObject({ kind: 'unavailable' })
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 2 })).toEqual({
      kind: 'ok',
      value: [run('v0'), run('v1')],
    })
    expect(
      await world.journal.findRun({ systemScopeRef: scope, operationRef: ref(run('v100')) }),
    ).toEqual({ kind: 'ok', value: run('v100') })
  } finally {
    await world.close()
  }
}, 15000)
