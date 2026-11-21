// @module-tag slow
// Opens a real SQLite storage with its worker threads.
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  dispatchReconcilingKey,
  dispatchingKey,
} from '@omne-harness/dispatch-cordis-contract/cordis'
import { DispatchPolicyError } from '@omne-harness/dispatch-local'
import { createDispatchLocalPlugin } from '@omne-harness/dispatch-local/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import { ASK, T1, ctx, fakePorts, optionsOf } from './fixture.ts'
import { openSqlWorld, type SqlWorld } from './storage/world.ts'

class FixtureStorage extends StorageService {
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']
  readonly database: SqlStorage['database']
  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.database = storage.database
    this.registerCombination = storage.registerCombination
    this.commit = storage.commit
    this.query = storage.query
    this.read = storage.read
  }
}

const KEYS = [dispatchingKey, dispatchReconcilingKey]

function configuration(world: SqlWorld, ports = fakePorts()) {
  const { manual: _manual, sql, ...rest } = optionsOf(world, ports)
  const { storage: _storage, ...withoutStorage } = sql
  return { ...rest, sql: withoutStorage }
}

it('starts when the storage is there, binds both faces, and withdraws them when it is unloaded', async () => {
  const world = await openSqlWorld()
  const ctx_ = new Context()
  try {
    const ports = fakePorts()
    const local = ctx_.plugin(createDispatchLocalPlugin(), configuration(world, ports))
    for (const key of KEYS) expect(ctx_.get(key)).toBeUndefined()
    await ctx_.plugin(FixtureStorage, world.storage).await()
    await local.await()
    for (const key of KEYS) expect(ctx_.get(key)).toBeDefined()

    const dispatching = ctx_.get(dispatchingKey)
    const outcome = await dispatching?.dispatch(ctx(), ASK)
    expect(outcome).toMatchObject({ kind: 'done', value: { state: 'started' } })
    expect(await ctx_.get(dispatchReconcilingKey)?.reconcile(T1)).toBe('done')

    await local.dispose()
    for (const key of KEYS) expect(ctx_.get(key)).toBeUndefined()
    expect(await dispatching?.dispatch(ctx(), { ...ASK, call: 'call-2' })).toEqual({
      kind: 'basis-unavailable',
    })
    expect(ports.sessions.cancelled).toEqual([])
    expect(await world.store.unfinished(T1)).toMatchObject({
      kind: 'read',
      value: [{ state: 'started' }],
    })
  } finally {
    await world.close()
  }
})

it('does not start with an invalid policy', async () => {
  const world = await openSqlWorld()
  const ctx_ = new Context()
  try {
    await ctx_.plugin(FixtureStorage, world.storage).await()
    const config = { ...configuration(world), policy: { nothing: true } }
    const local = ctx_.plugin(createDispatchLocalPlugin(), config)
    await expect(local.await()).rejects.toBeInstanceOf(DispatchPolicyError)
    for (const key of KEYS) expect(ctx_.get(key)).toBeUndefined()
  } finally {
    await world.close()
  }
})
