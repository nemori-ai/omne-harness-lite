// @module-tag slow
// Opens a real SQLite storage with its worker threads.
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { goalReconcilingKey, goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { GoalPolicyError } from '@omne-harness/goal-local'
import { createGoalLocalPlugin } from '@omne-harness/goal-local/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import { fakePorts, optionsOf, OWNER, SESSION, SET, T1 } from './fixture.ts'
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

const KEYS = [goalsKey, goalReconcilingKey]

function configuration(world: SqlWorld) {
  const { sql, ...rest } = optionsOf(world, fakePorts()).options
  const { storage: _storage, ...withoutStorage } = sql
  return { ...rest, sql: withoutStorage }
}

it('starts when the storage is there, binds both faces, and withdraws them when it is unloaded', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  try {
    const local = ctx.plugin(createGoalLocalPlugin(), configuration(world))
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
    await ctx.plugin(FixtureStorage, world.storage).await()
    await local.await()
    for (const key of KEYS) expect(ctx.get(key)).toBeDefined()

    const goals = ctx.get(goalsKey)
    expect(await goals?.write(OWNER, SET)).toMatchObject({ kind: 'done', recalled: false })
    await expect(ctx.get(goalReconcilingKey)?.reconcile(T1)).resolves.toBeUndefined()

    await local.dispose()
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
    expect(await goals?.read(OWNER, SESSION)).toEqual({ kind: 'basis-unavailable' })
    expect(await world.store.latest(T1, SESSION)).toMatchObject({
      kind: 'read',
      value: { state: { status: 'active' } },
    })
  } finally {
    await world.close()
  }
})

it('does not start with an invalid policy', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  try {
    await ctx.plugin(FixtureStorage, world.storage).await()
    const config = { ...configuration(world), policy: { nothing: true } }
    const local = ctx.plugin(createGoalLocalPlugin(), config)
    await expect(local.await()).rejects.toBeInstanceOf(GoalPolicyError)
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
  } finally {
    await world.close()
  }
})
