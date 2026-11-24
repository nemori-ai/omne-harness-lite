import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createCanvasAccessPlugin } from '@omne-harness/canvas-access/cordis'
import { canvasProtocol, type CanvasProtocol } from '@omne-harness/canvas-protocol'
import { expect, it } from 'vitest'
import { TENANT, bodyOf, world } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<CanvasProtocol>[] = []
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
  const faces: Context[] = []
  await root.plugin(
    createCanvasAccessPlugin({
      principals: ctx => {
        seen.push(ctx)
        return {
          actingFor: async () => ({ ok: w.principal }),
          contextOf: () => ({ tenant: TENANT, subject: w.principal }) as never,
        }
      },
      face: ctx => {
        faces.push(ctx)
        return present ? (w.state.face ?? undefined) : undefined
      },
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { registry, seen, faces }
}

const call = { principal: {}, messageId: 'm-1', signal: new AbortController().signal } as never
const look = () => bodyOf('look', { tenant: TENANT, canvas: 'main' })

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/canvas-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createCanvasAccessPlugin'])
})

it('mounts canvas/v1 with every operation, and takes the canvas at each call', async () => {
  const { registry, seen, faces } = await mount(true)
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]!
  expect(contribution.protocol).toBe(canvasProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(['kinds', 'look'])
  expect(contribution.observations).toEqual({})
  expect(seen).toHaveLength(1)
  expect(faces).toHaveLength(0)
  expect(await contribution.operations.look(call, look())).toMatchObject({ outcome: 'succeeded' })
  expect(await contribution.operations.look(call, look())).toMatchObject({ outcome: 'succeeded' })
  expect(faces).toHaveLength(2)
})

it('answers an unavailable basis while the canvas is absent, with the protocol still mounted', async () => {
  const { registry } = await mount(false)
  expect(await registry.mounted[0]!.operations.look(call, look())).toEqual({
    outcome: 'basis-unavailable',
  })
})
