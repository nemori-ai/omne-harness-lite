import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { composePluginTree, type AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { preparePluginTree, loadPluginTree } from '@omne-harness-lite/cordis-plugin-tree/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { ResourceRecoveryAuthorityService } from '@omne-harness-lite/execution-environments/cordis'
import { managedEnvironmentRegistry } from '../src/cordis.ts'

class Access extends SessionAccessService {
  async authorize() {
    return { kind: 'rejected' as const, reason: 'notAuthorized' as const }
  }
}
class Recovery extends ResourceRecoveryAuthorityService {
  async authorizeRecovery() {
    return 'notAuthorized' as const
  }
}

test.each(['pending', 'rejected'] as const)(
  'the bare managed registry retains dependencies after %s retirement until the original retry succeeds',
  async failure => {
    const events: string[] = []
    const dependency = {
      name: 'retirement-test-dependency',
      assemblyLifecycle: 1 as const,
      Config: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (value: unknown) => ({ value }),
        },
      },
      inject: ['assemblyLifetime'],
      describeAssembly: (): AssemblyDeclaration => ({
        provides: ['sessionAccess', 'resourceRecoveryAuthority'],
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
            new Access(ctx)
            new Recovery(ctx)
          },
          async () => {
            events.push('dependency-closed')
          },
        )
      },
    }
    const prepared = await preparePluginTree(
      composePluginTree([
        { id: 'dependency', plugin: { package: 'test-dependency', export: 'managed' }, config: {} },
        {
          id: 'environment',
          plugin: { package: 'test-environment', export: 'managed' },
          config: {},
        },
      ]),
      {
        externalServices: [],
        resolveModule: async ref => ({
          managed: ref.package === 'test-dependency' ? dependency : managedEnvironmentRegistry,
        }),
      },
    )
    const ctx = new Context()
    const lifetime = createAssemblyLifetime(prepared.ids, () => {
      events.push('stopping')
    })
    const tree = loadPluginTree(ctx, prepared, lifetime)
    await tree.ready
    const control = lifetime.closeControl('environment')
    if (!control) throw new Error('Original registry control was not retained')
    let confirmed = false
    let calls = 0
    ctx.executionEnvironments.registerProvider({
      name: 'original-provider',
      generation: 'original',
      async describe() {
        return { kind: 'descriptions', values: [] }
      },
      async acquire() {
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      },
      async recover() {
        return 'pending'
      },
      async retire() {
        calls++
        if (!confirmed) {
          events.push('retire-unconfirmed')
          if (failure === 'rejected') throw new Error('Stop response unavailable')
          return { kind: 'pending', resources: [] }
        }
        events.push('retire-confirmed')
        return { kind: 'drained' }
      },
    })
    let completed = false
    const closing = tree.dispose().then(report => {
      completed = true
      return report
    })
    try {
      expect(await control.closeAttempt()).toBe('retained')
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(completed).toBe(false)
      expect(events).toEqual(['stopping', 'retire-unconfirmed'])
      expect(calls).toBe(1)
      expect(lifetime.closeControl('environment')).toBe(control)
      confirmed = true
      expect(await control.retryClose()).toBe('closed')
      expect((await closing).complete).toBe(true)
      expect(events).toEqual([
        'stopping',
        'retire-unconfirmed',
        'retire-confirmed',
        'dependency-closed',
      ])
      expect(calls).toBe(2)
      expect(lifetime.closeControl('environment')).toBe(control)
    } finally {
      confirmed = true
      await control.retryClose()
      await closing
      await ctx.fiber.dispose()
    }
  },
)
