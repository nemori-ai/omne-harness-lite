import { expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import { createCalendarSqlSupplyStorage } from '@omne-harness/calendar-local'
import { openWorld, run, scope, instant } from './world.ts'
export function probeInput(
  operationKey = 'probe-1',
  kind: 'failed' | 'changed' | 'unchanged' = 'failed',
) {
  return {
    systemScopeRef: scope,
    calendarId: run().command.address.calendarId,
    operationKey,
    fingerprint: 'a'.repeat(64),
    policyVersion: 'policy-1',
    observation: {
      sourceId: 'fixture-source',
      observedAt: instant,
      kind,
      marker: null,
      authorityCoverageEnd: null,
      reason: null,
    },
    nextDue: instantSchema.parse('2026-01-03T00:00:00.000Z'),
  }
}
it('atomically retains probe identity, counters, due date and stable due key', async () => {
  const w = await openWorld(),
    p = probeInput()
  try {
    const first = await w.journal.recordProbe(p)
    expect(first).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 1, lastSuccess: null },
    })
    expect(
      await w.journal.recordProbe({ ...p, observation: { ...p.observation, kind: 'changed' } }),
    ).toEqual(first)
    expect(
      await w.journal.readProbe({
        systemScopeRef: scope,
        calendarId: p.calendarId,
        operationKey: p.operationKey,
        fingerprint: p.fingerprint,
      }),
    ).toEqual(first)
    expect(await w.journal.recordProbe({ ...p, fingerprint: 'b'.repeat(64) })).toMatchObject({
      kind: 'conflict',
    })
    expect(await w.journal.due({ systemScopeRef: scope, at: instant, limit: 10 })).toEqual({
      kind: 'ok',
      value: [],
    })
    const due = await w.journal.due({ systemScopeRef: scope, at: p.nextDue, limit: 10 })
    expect(due).toMatchObject({
      kind: 'ok',
      value: [{ sourceId: p.observation.sourceId, policyVersion: p.policyVersion }],
    })
    expect(await w.journal.due({ systemScopeRef: scope, at: p.nextDue, limit: 10 })).toEqual(due)
    const newer = {
      ...p,
      operationKey: 'probe-2',
      observation: { ...p.observation, observedAt: p.nextDue },
    }
    expect(await w.journal.recordProbe(newer)).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 2 },
    })
    const old = {
      ...p,
      operationKey: 'late-probe',
      observation: { ...p.observation, kind: 'changed' as const },
    }
    expect(await w.journal.recordProbe(old)).toMatchObject({ kind: 'ok' })
    expect(
      await w.journal.health({ systemScopeRef: scope, calendarId: p.calendarId }),
    ).toMatchObject({
      kind: 'ok',
      value: { sources: [{ consecutiveFailures: 2, observation: newer.observation }] },
    })
    const other = createCalendarSqlSupplyStorage({ ...w.options, systemScopeRef: 'other' })
    expect(await other.journal.due({ systemScopeRef: 'other', at: p.nextDue, limit: 10 })).toEqual({
      kind: 'ok',
      value: [],
    })
    expect(await other.journal.recordProbe({ ...p, systemScopeRef: 'other' })).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 1 },
    })
  } finally {
    await w.close()
  }
  const reopened = await openWorld(w.root)
  try {
    expect(
      await reopened.journal.readProbe({
        systemScopeRef: scope,
        calendarId: p.calendarId,
        operationKey: p.operationKey,
        fingerprint: p.fingerprint,
      }),
    ).toMatchObject({ kind: 'ok', value: { consecutiveFailures: 1 } })
  } finally {
    await reopened.close()
  }
})
it('does not leave source standing or a due entry after rollback', async () => {
  const w = await openWorld(undefined, s => ({
    ...s,
    commit: i =>
      s.commit({
        ...i,
        commands: [...i.commands, { participant: 'fixture.after-supply', facts: { mode: 'fail' } }],
      }),
  }))
  try {
    expect(await w.journal.recordProbe(probeInput())).toMatchObject({ kind: 'unavailable' })
    expect(
      await w.journal.due({ systemScopeRef: scope, at: probeInput().nextDue, limit: 1 }),
    ).toEqual({ kind: 'ok', value: [] })
  } finally {
    await w.close()
  }
})
it('counts distinct probe intents at the same clock instant', async () => {
  const w = await openWorld(),
    first = probeInput(),
    second = probeInput('same-time-second')
  try {
    expect(await w.journal.recordProbe(first)).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 1 },
    })
    expect(await w.journal.recordProbe(second)).toMatchObject({
      kind: 'ok',
      value: { consecutiveFailures: 2 },
    })
    expect(
      await w.journal.health({ systemScopeRef: scope, calendarId: first.calendarId }),
    ).toMatchObject({ kind: 'ok', value: { sources: [{ consecutiveFailures: 2 }] } })
  } finally {
    await w.close()
  }
})
