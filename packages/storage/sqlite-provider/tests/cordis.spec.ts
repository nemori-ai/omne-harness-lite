// The Cordis binding (SQL contract SPEC 2.2, 14): a function plugin that only injects storageHost,
// builds a StorageService subclass instance, fails the fiber on a bad configuration, and closes the
// provider when the fiber is disposed. The FiberState values are mirrored as in kernel-basis.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StorageControl } from '@omne-harness/sql-contract'
import { StorageHostService, StorageService } from '@omne-harness/sql-contract/cordis'
import { SqliteStoragePlugin } from '../src/cordis.ts'
import {
  buildMaterials,
  commitRequest,
  defaultConfig,
  kindOf,
  leases,
  makeWorkspace,
  registration,
  type Built,
  type Workspace,
} from './support.ts'

const FAILED = 3

let workspace: Workspace
let built: Built
let attached: StorageControl[]

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace)
  attached = []
})

afterEach(async () => {
  for (const control of attached) await control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

class TestHost extends StorageHostService {
  readonly materials = built.catalog
  readonly closeLeases = leases
  readonly attachControl = (control: StorageControl): void => {
    attached.push(control)
  }
}

async function hostContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(TestHost)
  return ctx
}

describe('SqliteStoragePlugin', () => {
  it('injects only storageHost', () => {
    expect(SqliteStoragePlugin.inject).toEqual(['storageHost'])
  })

  it('provides storage as a StorageService, and a commit works through it', async () => {
    const ctx = await hostContext()
    await ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    const service = ctx.get('storage')
    expect(service).toBeInstanceOf(StorageService)
    const storage = service as StorageService
    expect((await storage.registerCombination(registration(built))).kind).toBe('registered')
    expect(kindOf(await storage.commit(commitRequest(built)))).toBe('committed')
    expect(attached).toHaveLength(1)
  })

  it('fails the fiber on an invalid configuration, and provides nothing', async () => {
    const ctx = await hostContext()
    const fiber = ctx.plugin(SqliteStoragePlugin, { ...defaultConfig(workspace.storageRoot), lockWaitMs: 0 })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get('storage')).toBeUndefined()
    expect(attached).toHaveLength(0)
  })

  it('fails the fiber when a module file does not match its digest', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(built.files['participant-ledger'] as string, '// changed\n', 'utf8')
    const ctx = await hostContext()
    const fiber = ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
  })

  it('closes the provider when the fiber is disposed, and gives closing to an old reference', async () => {
    const ctx = await hostContext()
    const fiber = await ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    const storage = ctx.get('storage') as StorageService
    await storage.registerCombination(registration(built))
    await fiber.dispose()
    expect(ctx.get('storage')).toBeUndefined()
    expect(kindOf(await storage.commit(commitRequest(built)))).toBe('rejected_before_accept/closing')
  })
})
