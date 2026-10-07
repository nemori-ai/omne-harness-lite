// @module-tag slow
// The real host contribution retires its original OS resources before Storage closes.
import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { composePluginTree, type AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { preparePluginTree, loadPluginTree } from '@omne-harness-lite/cordis-plugin-tree/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { StorageService } from '@omne-harness-lite/storage/cordis'
import { ResourceRecoveryAuthorityService } from '@omne-harness-lite/execution-environments/cordis'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { narrow, type Storage } from '@omne-harness-lite/storage'
import { hostEnvironment, managedEnvironmentRegistry } from '../dist/cordis.js'
import { hostProviderFixture } from './host-provider-fixture.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'

class Access extends SessionAccessService {
  constructor(
    ctx: Context,
    readonly operations: SessionAccessOperations,
  ) {
    super(ctx)
  }
  authorize: SessionAccessOperations['authorize'] = (...args) => this.operations.authorize(...args)
}
class Recovery extends ResourceRecoveryAuthorityService {
  async authorizeRecovery() {
    return 'notAuthorized' as const
  }
}
class Backing extends StorageService {
  constructor(
    ctx: Context,
    readonly backing: Storage,
  ) {
    super(ctx)
  }
  read: Storage['read'] = operation => this.backing.read(operation)
  write: Storage['write'] = operation => this.backing.write(operation)
}
test(
  'managed host/plugin-tree composition stops an adopted terminal before releasing the original Storage dependency',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture(),
      events: string[] = []
    const dependencies = {
      name: 'host-assembly-dependencies',
      assemblyLifecycle: 1 as const,
      inject: ['assemblyLifetime'],
      Config: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (value: unknown) => ({ value }),
        },
      },
      describeAssembly: (): AssemblyDeclaration => ({
        provides: ['storage', 'sessionAccess', 'resourceRecoveryAuthority'],
        requires: [],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }),
      apply(ctx: Context) {
        startAssemblyWork(
          ctx,
          async () => {
            new Access(ctx, host.access)
            new Recovery(ctx)
            new Backing(ctx, host.storage)
          },
          async () => {
            const rows = await host.storage.read(tx =>
              narrow<{ host_environment_resources: { provider: string; data: string } }>(tx)
                .selectFrom('host_environment_resources')
                .select('data')
                .where('provider', '=', 'managed-real-host')
                .execute(),
            )
            expect(rows).toHaveLength(1)
            expect(JSON.parse(rows[0]!.data)).toMatchObject({
              kind: 'terminal',
              adopted: true,
              stopped: true,
              cleanupPending: false,
            })
            events.push('storage-closed')
            await host.close()
          },
        )
      },
    }
    const plugins = { dependencies, registry: managedEnvironmentRegistry, host: hostEnvironment }
    const prepared = await preparePluginTree(
      composePluginTree([
        { id: 'dependencies', plugin: { package: 'test', export: 'dependencies' }, config: {} },
        { id: 'registry', plugin: { package: 'test', export: 'registry' }, config: {} },
        {
          id: 'host',
          plugin: { package: 'test', export: 'host' },
          config: { provider: 'managed-real-host' },
        },
      ]),
      { externalServices: [], resolveModule: async () => plugins },
    )
    const ctx = new Context(),
      lifetime = createAssemblyLifetime(prepared.ids, () => events.push('stopping'))
    const tree = loadPluginTree(ctx, prepared, lifetime)
    try {
      await tree.ready
      const requirement = { bindingLayer: 'host_machine' as const, facilities: ['command'] }
      const removeSource = ctx.executionEnvironments.registerPlacementSource({
        name: 'assembly-policy',
        generation: 'one',
        read: async (scope, _authorization, call) => ({
          kind: 'placement',
          placement: {
            scope,
            ...call,
            requirement,
            permission: 'always-allow',
            revision: 'one',
            evidence: null,
          },
        }),
        authorizeOperation: async () => ({ kind: 'authorized' }),
        select: async () => ({ kind: 'rejected', reason: 'ambiguousEnvironment' }),
      })
      const acquisition = await ctx.executionEnvironments.acquire({
        scope: host.scope,
        authorization: host.authorization,
        call: {
          execution: unwrap(parseOpaqueIdentifier('assembly-call', 'CallId')),
          tool: { name: 'fixture', definition: 'host-v1' },
        },
        requirement,
        resources: {
          closed: new AbortController().signal,
          plan: async () => 'recorded',
          permit: async () => 'confirmed',
          adopt: async () => 'confirmed',
          stopped: async () => 'recorded',
        },
      })
      if (acquisition.kind !== 'acquired') throw new Error(`Managed acquire ${acquisition.reason}`)
      const created = await acquisition.lease.facilities.command!.createTerminal({
        cwd: '/tmp',
        env: {},
      })
      expect(created.kind, JSON.stringify(created)).toBe('created')
      await acquisition.lease.release()
      await removeSource()
      expect((await tree.dispose()).complete).toBe(true)
      expect(events).toEqual(['stopping', 'storage-closed'])
      expect(await acquisition.lease.invalidated).toEqual({ reason: 'ownerStopped' })
    } finally {
      await tree.dispose()
      await ctx.fiber.dispose()
    }
  },
)
