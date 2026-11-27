import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createMcpAccessPlugin } from '@omne-harness/mcp-access/cordis'
import { millisOf } from '@omne-harness/mcp-contract/testing'
import { mcpProtocol, type McpProtocol } from '@omne-harness/mcp-protocol'
import { expect, it } from 'vitest'
import {
  acquired,
  createWorld,
  fixtureLogin,
  knownAction,
  loginIdentity,
  readyStatus,
  ref,
} from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<McpProtocol>[] = []
  readonly unmounted: AccessContribution<McpProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => void this.unmounted.push(contribution)
    }, 'test.mount')
  }
}

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal

async function assemble() {
  const world = createWorld()
  world.define(ALICE, 'docs', {
    status: readyStatus(ref('docs')),
    current: acquired([knownAction('search')]),
  })
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createMcpAccessPlugin({ principals: () => world.principals, faces: () => world.faces() }),
    { refresh: { connectBoundMs: millisOf(2500) } },
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const contribution = registry.mounted[0]
  if (contribution === undefined) throw new Error('nothing was mounted')
  return { world, plugin, registry, contribution }
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/mcp-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createMcpAccessPlugin'])
})

it('mounts mcp/v1 with its six operations and the observation of changes', async () => {
  const { registry, contribution } = await assemble()
  expect(registry.mounted).toHaveLength(1)
  expect(contribution.protocol).toBe(mcpProtocol)
  expect(Object.keys(contribution.operations)).toEqual([
    'list-endpoints',
    'read-endpoint',
    'refresh-endpoint',
    'begin-connect',
    'disconnect',
    'list-event-types',
  ])
  expect(Object.keys(contribution.observations)).toEqual(['observe-endpoints'])
})

it('hands the settings to the handler: the refresh runs with the connect bound given', async () => {
  const { contribution, world } = await assemble()
  const answer = await contribution.operations['refresh-endpoint'](
    { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
    { tenant: ALICE.tenant, name: 'docs' },
  )
  expect(answer.outcome).toBe('succeeded')
  expect(world.seen.find(call => call.op === 'refresh')?.bound).toBe(2500)
})

it('answers basis-unavailable while MCP is off, and the protocol stays mounted', async () => {
  const { contribution, world, registry } = await assemble()
  world.removeFaces()
  const answer = await contribution.operations['list-endpoints'](
    { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
    { tenant: ALICE.tenant },
  )
  expect(answer).toEqual({ outcome: 'basis-unavailable' })
  expect(registry.unmounted).toHaveLength(0)
})

it('takes the contribution down with the plugin', async () => {
  const { plugin, registry, contribution } = await assemble()
  await plugin.dispose()
  expect(registry.unmounted).toEqual([contribution])
})
