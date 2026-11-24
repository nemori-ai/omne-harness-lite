// @module-tag slow
// Opens a real SQLite storage with its worker threads.
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { context, fakeAuthority, fakeMovers } from '@omne-harness/canvas/testing'
import { canvasAppKind } from '@omne-harness/canvas-contract'
import {
  canvasChangesKey,
  canvasKey,
  kindsOn,
  putKind,
} from '@omne-harness/canvas-cordis-contract/cordis'
import { CanvasPolicyError } from '@omne-harness/canvas-local'
import { createCanvasLocalPlugin } from '@omne-harness/canvas-local/cordis'
import { DynamisService, dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import { POLICY } from './fixture.ts'
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

function configuration(world: SqlWorld, policy: unknown) {
  return {
    policy,
    sql: { bind: world.bind },
    ports: { authority: fakeAuthority(), movers: fakeMovers() },
  }
}

it('starts when the storage and the registry are there, reads the canvas over SQL and the kinds off the registry, and tells its changes', async () => {
  const world = await openSqlWorld()
  const root = new Context()
  try {
    await root.plugin(DynamisService)
    const local = root.plugin(createCanvasLocalPlugin(), configuration(world, POLICY))
    expect(root.get(canvasKey)).toBeUndefined()
    await root.plugin(FixtureStorage, world.storage).await()
    await local.await()
    const canvas = root.get(canvasKey)!
    expect(await canvas.look(context(), { canvas: 'main' })).toEqual({
      kind: 'done',
      value: { sheet: POLICY.sheet, items: [], piles: [], revision: 0 },
    })
    await root.plugin({
      name: 'canvas-row',
      inject: [dynamisKey],
      apply: ctx => void putKind(ctx, canvasAppKind),
    })
    expect(await canvas.kinds(context())).toEqual({
      kind: 'done',
      value: [
        {
          kind: 'declared',
          name: 'canvas.app',
          label: canvasAppKind.label,
          summary: canvasAppKind.summary,
          reference: canvasAppKind.reference,
        },
      ],
    })

    const heard: string[] = []
    root.get(canvasChangesKey)!.subscribe(context().tenant, {
      changed: change => heard.push(`changed ${change.canvas}`),
      closed: () => heard.push('closed'),
    })
    const placed = { canvas: 'main', reference: { kind: 'canvas.app', ref: 'clock' } }
    expect(await canvas.place(context(), placed)).toMatchObject({ kind: 'done' })
    expect(await canvas.place(context(), placed)).toMatchObject({ kind: 'no-change' })
    expect(heard).toEqual(['changed main'])

    await local.dispose()
    expect(heard).toEqual(['changed main', 'closed'])
    expect(root.get(canvasKey)).toBeUndefined()
    expect(root.get(canvasChangesKey)).toBeUndefined()
    expect(kindsOn(root.get(dynamisKey) as DynamisService).read()).toEqual({ kind: 'unavailable' })
  } finally {
    await world.close()
  }
})

it.each([
  ['a missing policy', undefined],
  ['an invalid policy', { ...POLICY, sheet: { width: 0, height: 10, grid: 1 } }],
])('does not start with %s', async (_label, policy) => {
  const world = await openSqlWorld()
  const root = new Context()
  try {
    await root.plugin(DynamisService)
    await root.plugin(FixtureStorage, world.storage).await()
    const local = root.plugin(createCanvasLocalPlugin(), configuration(world, policy))
    await expect(local.await()).rejects.toBeInstanceOf(CanvasPolicyError)
    expect(root.get(canvasKey)).toBeUndefined()
  } finally {
    await world.close()
  }
})
