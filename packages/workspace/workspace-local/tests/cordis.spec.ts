// @module-tag slow
// Opens a real SQLite storage with its worker threads and registers a real directory.
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import { operationId } from '@omne-harness/workspace-contract'
import {
  workspaceCatalogKey,
  workspaceGovernanceKey,
  workspaceInstancesKey,
  workspaceTypesKey,
} from '@omne-harness/workspace-cordis-contract/cordis'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { createWorkspaceLocalPlugin } from '@omne-harness/workspace-local/cordis'
import { fakeAccess, fakeAuthority } from '@omne-harness/workspace/testing'
import { openSqlWorld } from './storage/world.ts'

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

const KEYS = [workspaceGovernanceKey, workspaceInstancesKey, workspaceCatalogKey, workspaceTypesKey]
const ALICE = fakeAccess(1)

function project(): string {
  const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'workspace-local-'))), 'blog')
  mkdirSync(root)
  writeFileSync(join(root, 'README.md'), '# blog\n')
  return root
}

it('starts when the storage is there, binds every face, and a contributed type is withdrawn with its contributor', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  try {
    const local = ctx.plugin(createWorkspaceLocalPlugin(), {
      sql: { bind: world.bind },
      authority: fakeAuthority(),
      node: 'node-1',
    })
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
    await ctx.plugin(FixtureStorage, world.storage).await()
    await local.await()
    for (const key of KEYS) expect(ctx.get(key)).toBeDefined()

    const governance = ctx.get(workspaceGovernanceKey)!
    const address = project()
    const input = { operation: operationId('r1')!, address }
    expect(await governance.register(ALICE, input)).toEqual({
      kind: 'not-performed',
      reason: 'type-unknown',
    })

    const contributor = ctx.inject([workspaceTypesKey], child => {
      child.workspaceTypes.contribute(new DirectoryType())
    })
    await contributor.await()
    const made = await governance.register(ALICE, input)
    expect(made).toMatchObject({ kind: 'done', changed: true, value: { type: 'directory' } })
    if (made.kind !== 'done') return
    expect(await ctx.get(workspaceInstancesKey)!.verify(ALICE, made.value)).toMatchObject({
      kind: 'attachable',
      directory: address,
      attachment: { basis: 'unpinned' },
    })
    expect(readdirSync(address)).toEqual(['README.md'])

    await contributor.dispose()
    expect(await ctx.get(workspaceInstancesKey)!.verify(ALICE, made.value)).toEqual({
      kind: 'unavailable',
      diagnostic: 'type-not-contributed',
    })
    expect(await ctx.get(workspaceCatalogKey)!.list(ALICE)).toMatchObject({
      kind: 'read',
      value: [{ type: 'directory', standing: 'owner' }],
    })

    await local.dispose()
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
  } finally {
    await world.close()
  }
})

it('refuses an empty node name', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  try {
    await ctx.plugin(FixtureStorage, world.storage).await()
    const local = ctx.plugin(createWorkspaceLocalPlugin(), {
      sql: { bind: world.bind },
      authority: fakeAuthority(),
      node: '',
    })
    await expect(local.await()).rejects.toThrow(/node name/)
  } finally {
    await world.close()
  }
})
