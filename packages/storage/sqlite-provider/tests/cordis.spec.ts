// The Cordis binding (SQL contract SPEC 2.2, 14): a function plugin that only injects storageHost,
// builds a StorageService subclass instance, fails the fiber on a bad configuration, and closes the
// provider when the fiber is disposed. The FiberState values are mirrored as in kernel-basis.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloseLeasePort, StorageControl } from '@omne-harness/sql-contract'
import { StorageHostService, StorageService } from '@omne-harness/sql-contract/cordis'
import { SqliteStoragePlugin } from '../src/cordis.ts'
import {
  buildMaterials,
  command,
  commitRequest,
  defaultConfig,
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

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const spinning = (key: string, ms: number): ReturnType<typeof commitRequest> =>
  commitRequest(built, {
    identity: identity({ operationKey: key }),
    commands: [command('ledger', { mode: 'spin', ms: String(ms), note: key })],
  })

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
    const running = storage.commit(spinning('slow', 600))
    await sleep(150)
    await fiber.dispose()
    // The disposal ran the close and waited for it: the running write ended and its lease is back.
    expect(recorded.released).toEqual(recorded.admitted)
    const state = await Promise.race([running, Promise.resolve('pending' as const)])
    expect(state).not.toBe('pending')
    expect(kindOf(await running)).toBe('committed')
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
    const caller = ctx.plugin({
      name: 'caller',
      inject: ['storage'],
      apply(inner: Context) {
        pending = inner.storage.commit(spinning('by-caller', 300))
      },
    })
    await caller
    await caller.dispose()
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
    const running = oldStorage.commit(spinning('slow', 900))
    await sleep(150)
    await host.dispose()
    expect(ctx.get('storage')).toBeUndefined()
    await ctx.plugin(TestHost)
    await vi.waitFor(() => expect(ctx.get('storage')).toBeDefined())
    const fresh = ctx.get('storage') as StorageService
    expect(fresh).not.toBe(oldStorage)
    expect(
      kindOf(
        await oldStorage.commit(
          commitRequest(built, { identity: identity({ operationKey: 'old' }) }),
        ),
      ),
    ).toBe('rejected_before_accept/closing')
    // The old Worker still runs: the new generation gets no second writer.
    expect(
      kindOf(
        await fresh.commit(commitRequest(built, { identity: identity({ operationKey: 'fresh' }) })),
      ),
    ).toBe('rejected_before_accept/domain_unavailable')
    expect(recorded.admitted).toHaveLength(1)
    await vi.waitFor(
      async () =>
        expect(
          kindOf(
            await fresh.commit(
              commitRequest(built, { identity: identity({ operationKey: 'fresh' }) }),
            ),
          ),
        ).toBe('committed'),
      { timeout: 5000, interval: 100 },
    )
    expect(recorded.admitted).toHaveLength(2)
    expect(kindOf(await running)).toBe('unknown')
  })
})
