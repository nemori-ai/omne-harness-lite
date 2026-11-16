import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CloseLeasePort, StorageControl } from '@omne-harness/sql-contract'
import { StorageHostService, StorageService } from '@omne-harness/sql-contract/cordis'
import { SqliteStoragePlugin } from '../src/cordis.ts'
import { advance, deadlines, gate, openGates, stillPending, tick, until } from './gate.ts'
import {
  buildMaterials,
  command,
  commitRequest,
  defaultConfig,
  heldCommit,
  identity,
  kindOf,
  leases,
  makeWorkspace,
  recordingLeases,
  registration,
  type Built,
  type Workspace,
} from './support.ts'

const FAILED = 3

let workspace: Workspace
let built: Built
let attached: StorageControl[]
let hostLeases: CloseLeasePort

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace)
  attached = []
  hostLeases = leases
})

afterEach(async () => {
  openGates()
  for (const control of attached)
    await control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

class TestHost extends StorageHostService {
  readonly materials = built.catalog
  readonly closeLeases = hostLeases
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
    const fiber = ctx.plugin(SqliteStoragePlugin, {
      ...defaultConfig(workspace.storageRoot),
      lockWaitMs: 0,
    })
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
    expect(kindOf(await storage.commit(commitRequest(built)))).toBe(
      'rejected_before_accept/closing',
    )
  })

  it('waits for control.close({ initiator: disposal }) when the fiber is disposed', async () => {
    const recorded = recordingLeases()
    hostLeases = recorded
    const ctx = await hostContext()
    const fiber = await ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    const storage = ctx.get('storage') as StorageService
    await storage.registerCombination(registration(built))
    const running = await heldCommit(storage, workspace, built, 'slow')
    const disposing = fiber.dispose()
    await stillPending(disposing)
    running.gate.open()
    await disposing
    expect(recorded.released).toEqual(recorded.admitted)
    const state = await Promise.race([running.result, Promise.resolve('pending' as const)])
    expect(state).not.toBe('pending')
    expect(kindOf(await running.result)).toBe('committed')
  })

  it('keeps StorageControl out of the service and the Context', async () => {
    const ctx = await hostContext()
    await ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    const service = ctx.get('storage') as StorageService
    const names = new Set<string>()
    for (
      let target: object | null = service;
      target !== null;
      target = Object.getPrototypeOf(target)
    )
      for (const name of Object.getOwnPropertyNames(target)) names.add(name)
    for (const name of names) expect(name).not.toMatch(/control|close|lease|worker/i)
    for (const name of Object.getOwnPropertyNames(ctx)) expect(name).not.toMatch(/control|worker/i)
    expect(attached).toHaveLength(1)
  })

  it('does not tie the provider to the caller: disposing a caller keeps the operation and recognition', async () => {
    const ctx = await hostContext()
    await ctx.plugin(SqliteStoragePlugin, defaultConfig(workspace.storageRoot))
    await (ctx.get('storage') as StorageService).registerCombination(registration(built))
    let pending: Promise<unknown> = Promise.resolve()
    const held = gate(workspace.root)
    const caller = ctx.plugin({
      name: 'caller',
      inject: ['storage'],
      apply(inner: Context) {
        pending = inner.storage.commit(
          commitRequest(built, {
            identity: identity({ operationKey: 'by-caller' }),
            commands: [command('ledger', { mode: 'hold', gate: held.path, note: 'by-caller' })],
          }),
        )
      },
    })
    await caller
    await held.entered()
    await caller.dispose()
    held.open()
    expect(kindOf((await pending) as { kind: string })).toBe('committed')
    const storage = ctx.get('storage') as StorageService
    expect(kindOf(await storage.query(identity({ operationKey: 'by-caller' })))).toBe('committed')
    expect(
      kindOf(
        await storage.commit(
          commitRequest(built, { identity: identity({ operationKey: 'next' }) }),
        ),
      ),
    ).toBe('committed')
  })

  it('does not start a second writer when the plugin reruns on a new host', async () => {
    const recorded = recordingLeases()
    hostLeases = recorded
    const ctx = new Context()
    const host = await ctx.plugin(TestHost)
    await ctx.plugin(SqliteStoragePlugin, {
      ...defaultConfig(workspace.storageRoot),
      closeDeadlineMs: 200,
    })
    const oldStorage = ctx.get('storage') as StorageService
    await oldStorage.registerCombination(registration(built))
    const running = await heldCommit(oldStorage, workspace, built, 'slow')
    const before = deadlines()
    const disposing = host.dispose()
    await until(() => deadlines() > before)
    advance(200)
    await disposing
    expect(ctx.get('storage')).toBeUndefined()
    await ctx.plugin(TestHost)
    await until(() => ctx.get('storage') !== undefined)
    const fresh = ctx.get('storage') as StorageService
    expect(fresh).not.toBe(oldStorage)
    expect(
      kindOf(
        await oldStorage.commit(
          commitRequest(built, { identity: identity({ operationKey: 'old' }) }),
        ),
      ),
    ).toBe('rejected_before_accept/closing')
    expect(
      kindOf(
        await fresh.commit(commitRequest(built, { identity: identity({ operationKey: 'fresh' }) })),
      ),
    ).toBe('rejected_before_accept/domain_unavailable')
    expect(recorded.admitted).toHaveLength(1)
    running.gate.open()
    const retried = (): ReturnType<StorageService['commit']> =>
      fresh.commit(commitRequest(built, { identity: identity({ operationKey: 'fresh' }) }))
    let again = await retried()
    while (kindOf(again) !== 'committed') {
      await tick()
      again = await retried()
    }
    expect(recorded.admitted).toHaveLength(2)
    expect(kindOf(await running.result)).toBe('unknown')
  })
})
