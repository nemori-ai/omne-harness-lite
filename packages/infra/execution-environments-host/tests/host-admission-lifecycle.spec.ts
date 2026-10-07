// @module-tag slow
// Real provider withdrawal must close admission while retaining original work.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { unwrap, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type {
  EnvironmentProvider,
  ResourceLifecycle,
} from '@omne-harness-lite/execution-environments'
import { createEnvironmentRegistry, createHostEnvironment } from '../dist/index.js'
import { hostProviderFixture } from './host-provider-fixture.ts'

type Host = Awaited<ReturnType<typeof hostProviderFixture>>
function request(
  host: Host,
  execution: string,
  resources: ResourceLifecycle,
): Parameters<EnvironmentProvider['acquire']>[0] {
  const call = {
    execution: unwrap(parseOpaqueIdentifier(execution, 'CallId')),
    tool: { name: 'lifetime-test', definition: 'v1' },
  }
  const requirement = {
    bindingLayer: 'host_machine' as const,
    facilities: ['command', 'files'] as const,
  }
  return {
    scope: host.scope,
    authorization: host.authorization,
    call,
    requirement,
    resources,
    placement: {
      scope: host.scope,
      ...call,
      requirement,
      permission: 'always-allow',
      revision: '1',
      evidence: null,
    },
  }
}
const resources = (overrides: Partial<ResourceLifecycle> = {}): ResourceLifecycle => ({
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
  ...overrides,
})

test.each(['command', 'terminal'] as const)(
  'retire retains a %s waiting for original plan and prevents late preparation',
  { tags: ['slow'] },
  async kind => {
    const host = await hostProviderFixture(),
      entered = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>()
    try {
      const { lease } = await host.acquire('pending-plan', true, host.scope, {
        plan: async () => {
          entered.resolve()
          await finish.promise
          return 'recorded'
        },
      })
      const port = lease.facilities.command!
      const work =
        kind === 'command'
          ? port.start({ executable: '/bin/true', args: [], cwd: host.directory, env: {} })
          : port.createTerminal({ cwd: host.directory, env: {} })
      await entered.promise
      expect((await host.provider.retire()).kind).toBe('pending')
      finish.resolve()
      expect(await work).toMatchObject({ kind: 'rejected', reason: 'closed' })
      expect(await host.provider.retire()).toEqual({ kind: 'drained' })
    } finally {
      finish.resolve()
      await host.close()
    }
  },
)

test(
  'registry withdrawal closes an already waiting permission writer before GO',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture(),
      entered = Promise.withResolvers<void>(),
      permit = Promise.withResolvers<'confirmed'>()
    const registry = createEnvironmentRegistry({
      access: host.access,
      recovery: { authorizeRecovery: async () => 'authorized' },
    })
    registry.placements.registerPlacementSource({
      name: 'test',
      generation: '1',
      read: async (scope, _access, call) => ({
        kind: 'placement',
        placement: {
          scope,
          ...call,
          requirement: { bindingLayer: 'host_machine', facilities: ['command', 'files'] },
          permission: 'always-allow',
          revision: '1',
          evidence: null,
        },
      }),
      authorizeOperation: async () => ({ kind: 'authorized' }),
      select: async (_basis, candidates) => ({
        kind: 'selected',
        reference: candidates[0]!.reference,
      }),
    })
    const remove = registry.registrations.registerProvider(host.provider)
    try {
      const acquired = await registry.operations.acquire(
        request(
          host,
          'withdraw-permit',
          resources({
            permit: async () => {
              entered.resolve()
              return permit.promise
            },
          }),
        ),
      )
      if (acquired.kind !== 'acquired') throw new Error(acquired.reason)
      const target = join(host.directory, 'forbidden-effect')
      const work = acquired.lease.facilities.command!.start({
        executable: '/bin/sh',
        args: ['-c', 'printf forbidden > "$1"', 'sh', target],
        cwd: host.directory,
        env: {},
      })
      await entered.promise
      const removal = remove().then(
        () => 'drained',
        () => 'retained',
      )
      expect(await removal).toBe('retained')
      permit.resolve('confirmed')
      expect(await work).toMatchObject({ kind: 'rejected' })
      await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
      await remove()
    } finally {
      permit.resolve('confirmed')
      await registry.close()
      await host.close()
    }
  },
)

test(
  'creator release during confirmed adoption index write retains the terminal instead of stopping it',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture(),
      entered = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>()
    let blockNext = false
    const storage = new Proxy(host.storage, {
      get(target, key) {
        if (key === 'write')
          return async (work: Parameters<typeof target.write>[0]) => {
            if (blockNext) {
              blockNext = false
              entered.resolve()
              await finish.promise
            }
            return target.write(work)
          }
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const provider = createHostEnvironment({ name: 'adoption-gap', access: host.access, storage })
    try {
      const acquired = await provider.acquire(
        request(
          host,
          'adoption-birth',
          resources({
            adopt: async () => {
              blockNext = true
              return 'confirmed'
            },
          }),
        ),
      )
      if (acquired.kind !== 'acquired') throw new Error(acquired.reason)
      const birth = acquired.lease.facilities.command!.createTerminal({
        cwd: host.directory,
        env: {},
      })
      await entered.promise
      expect((await acquired.lease.release()).kind).toBe('pending')
      finish.resolve()
      const created = await birth
      if (created.kind !== 'created') throw new Error(created.reason)
      expect(await acquired.lease.release()).toEqual({ kind: 'released' })
      const later = await provider.acquire(request(host, 'adoption-next', resources()))
      if (later.kind !== 'acquired') throw new Error(later.reason)
      const leg = await later.lease.facilities.command!.executeTerminal({
        terminal: created.terminal,
        script: 'printf retained',
      })
      if (leg.kind !== 'started') throw new Error(leg.reason)
      expect((await leg.process.result).kind).toBe('completed')
      let bytes = ''
      for await (const part of leg.process.output) bytes += Buffer.from(part.data).toString()
      expect(bytes).toBe('retained')
      expect(await later.lease.release()).toEqual({ kind: 'released' })
    } finally {
      finish.resolve()
      expect(await provider.retire()).toEqual({ kind: 'drained' })
      await host.close()
    }
  },
)

test(
  'confirmed file publication survives a failed cleanup index receipt',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture()
    let failCleanup = false,
      failures = 0
    const storage = new Proxy(host.storage, {
      get(target, key) {
        if (key === 'write')
          return async (work: Parameters<typeof target.write>[0]) => {
            if (failCleanup) {
              failCleanup = false
              failures++
              throw new Error('Cleanup index receipt unavailable')
            }
            const result = await target.write(work)
            const record = result as
              { receipts?: { complete?: boolean }; stopped?: boolean } | undefined
            if (record?.receipts?.complete && !record.stopped) failCleanup = true
            return result
          }
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const provider = createHostEnvironment({
      name: 'publication-cleanup',
      storage,
      access: host.access,
    })
    try {
      const acquired = await provider.acquire(request(host, 'file-cleanup', resources()))
      if (acquired.kind !== 'acquired') throw new Error(acquired.reason)
      const path = join(host.directory, 'published')
      const result = await acquired.lease.facilities.files!.write({
        path,
        mode: 'create',
        data: Buffer.from('confirmed'),
      })
      expect(result).toMatchObject({ kind: 'written', path })
      expect(failures).toBe(1)
      expect(await readFile(path, 'utf8')).toBe('confirmed')
      expect(await acquired.lease.release()).toEqual({ kind: 'released' })
      expect(await provider.retire()).toEqual({ kind: 'drained' })
    } finally {
      failCleanup = false
      await provider.retire()
      await host.close()
    }
  },
)
