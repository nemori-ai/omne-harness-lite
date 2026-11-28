import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createWorkspaceAccessPlugin } from '@omne-harness/workspace-access/cordis'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { TENANT, world } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<WorkspaceProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => undefined
    }, 'test.mount')
  }
}

async function mount(present: boolean) {
  const w = world()
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const seen: Context[] = []
  const plugin = createWorkspaceAccessPlugin({
    principals: ctx => {
      seen.push(ctx)
      return { actingFor: async () => ({ ok: {} as never }) }
    },
    faces: () => (present ? w.real : undefined),
  })
  await root.plugin(plugin)
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { registry, seen, plugin }
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/workspace-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createWorkspaceAccessPlugin'])
})

it('mounts workspace/v1 with every operation under its own name', async () => {
  const { registry, seen, plugin } = await mount(false)
  expect(plugin.name).toBe('workspace-access')
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]!
  expect(contribution.protocol).toBe(workspaceProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(
    Object.keys(workspaceProtocol.operations).sort(),
  )
  expect(Object.keys(contribution.observations)).toEqual([])
  expect(seen).toHaveLength(1)
})

it('takes the faces at each call: absent they are an unavailable basis, present they answer', async () => {
  const call = { principal: {}, messageId: 'm-1', signal: new AbortController().signal } as never
  const absent = (await mount(false)).registry.mounted[0]!
  const tenant = tenantCodec.parse(TENANT)
  if (!tenant.ok) throw new Error('fixture tenant did not parse')
  expect(await absent.operations.list(call, { tenant: tenant.value })).toEqual({
    outcome: 'basis-unavailable',
  })
  const present = (await mount(true)).registry.mounted[0]!
  expect(await present.operations.list(call, { tenant: tenant.value })).toEqual({
    outcome: 'succeeded',
    body: { workspaces: [] },
  })
})

it('waits for the access registry before it mounts anything', async () => {
  const root = new Context()
  const w = world()
  const plugin = createWorkspaceAccessPlugin({
    principals: () => ({ actingFor: async () => ({ ok: {} as never }) }),
    faces: () => w.real,
  })
  expect(plugin.inject).toEqual(['accessRegistry'])
  root.plugin(plugin)
  await root.plugin(RecordingRegistry)
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  await new Promise(resolve => setImmediate(resolve))
  expect(registry.mounted).toHaveLength(1)
})
