import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createWorkspaceAccessPlugin } from '@omne-harness/workspace-access/cordis'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { expect, it } from 'vitest'
import { world } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<WorkspaceProtocol>[] = []
  protected attach(contribution: never) {
    this.mounted.push(contribution)
    return async () => {}
  }
}

async function mount(present: boolean) {
  const w = world()
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const seen: Context[] = []
  const plugin = root.plugin(
    createWorkspaceAccessPlugin({
      principals: ctx => {
        seen.push(ctx)
        return { actingFor: async () => ({ ok: {} as never }) }
      },
      faces: () => (present ? w.real : undefined),
    }),
  )
  await plugin
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { registry, seen }
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/workspace-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createWorkspaceAccessPlugin'])
})

it('mounts workspace/v1 with every operation, taking the faces at each call', async () => {
  const { registry, seen } = await mount(false)
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]!
  expect(contribution.protocol).toBe(workspaceProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(
    Object.keys(workspaceProtocol.operations).sort(),
  )
  expect(Object.keys(contribution.observations)).toEqual([])
  expect(seen).toHaveLength(1)
})
