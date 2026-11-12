import { expect, it } from 'vitest'
import { openWorld, run, scope } from './world.ts'

it('recovers the original receipt when a competing commit returns identity conflict', async () => {
  let commits = 0
  const world = await openWorld(undefined, storage => ({
    ...storage,
    commit: async input => {
      commits++
      const existing = await storage.commit(input)
      if (existing.kind !== 'committed') throw new Error(JSON.stringify(existing))
      return { kind: 'identity_conflict', identity: input.identity, existing }
    },
  }))
  const prepared = run()
  try {
    expect(await world.journal.prepareRun(prepared)).toEqual({ kind: 'ok', value: prepared })
    expect(await world.journal.prepareRun(run('v2', 'v1'))).toEqual({
      kind: 'ok',
      value: prepared,
    })
    expect(commits).toBe(1)
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
      kind: 'ok',
      value: [prepared],
    })
  } finally {
    await world.close()
  }
})

it('retains an unknown commit result and recovers without submitting a second write', async () => {
  let commits = 0
  const world = await openWorld(undefined, storage => ({
    ...storage,
    commit: async input => {
      commits++
      await storage.commit(input)
      return { kind: 'unknown', identity: input.identity, diagnostic: 'lost commit response' }
    },
  }))
  const prepared = run()
  try {
    expect(await world.journal.prepareRun(prepared)).toEqual({
      kind: 'unknown',
      reason: 'operationUnknown',
    })
    expect(await world.journal.prepareRun(run('v2', 'v1'))).toEqual({
      kind: 'ok',
      value: prepared,
    })
    expect(commits).toBe(1)
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
      kind: 'ok',
      value: [prepared],
    })
  } finally {
    await world.close()
  }
})

it('preserves rejection before acceptance without creating a pending run', async () => {
  const world = await openWorld(undefined, storage => ({
    ...storage,
    commit: async input => ({
      kind: 'rejected_before_accept',
      identity: input.identity,
      reason: 'queue_full',
      diagnostic: null,
    }),
  }))
  const prepared = run()
  try {
    expect(await world.journal.prepareRun(prepared)).toEqual({
      kind: 'unavailable',
      reason: 'queue_full',
    })
    expect(
      await world.journal.readRun({
        address: prepared.command.address,
        expectedFingerprint: prepared.command.expectedFingerprint,
      }),
    ).toEqual({ kind: 'ok', value: null })
    expect(await world.journal.pending({ systemScopeRef: scope, limit: 10 })).toEqual({
      kind: 'ok',
      value: [],
    })
  } finally {
    await world.close()
  }
})
