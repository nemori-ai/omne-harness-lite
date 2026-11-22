import { Context } from '@deepseek-ai/cordis'
import type {
  AccessContribution,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import type { ToolCallFaces } from '@omne-harness/tool-access'
import { createToolAccessPlugin } from '@omne-harness/tool-access/cordis'
import type { ToolState } from '@omne-harness/tool-contract'
import { toolProtocol, type ToolProtocol } from '@omne-harness/tool-protocol'
import { expect, it } from 'vitest'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<ToolProtocol>[] = []
  readonly unmounted: AccessContribution<ToolProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => void this.unmounted.push(contribution)
    }, 'test.mount')
  }
}

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!parsed.ok) throw new Error('fixture tenant did not parse')
const tenant = parsed.value
const login = { login: 'a' } as unknown as LoginIdentity
const principal = { principal: 'a' } as unknown as Principal
const state = {
  phase: 'queued',
  relation: 'background',
  effect: { kind: 'not-started' },
  controls: [],
} as unknown as ToolState
const faces = {
  instances: { current: async () => succeed({ state, current: null }) },
} as unknown as ToolCallFaces

async function assemble() {
  let present = true
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createToolAccessPlugin({
      principals: () => ({ actingFor: async () => ({ ok: principal }) }),
      faces: () => (present ? faces : undefined),
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const contribution = registry.mounted[0]
  if (contribution === undefined) throw new Error('nothing was mounted')
  const read = () =>
    contribution.operations['read-call'](
      { principal: login, messageId: 'm-1', signal: new AbortController().signal },
      { tenant, reference: 'tool-invocation:v1:call:admission' },
    )
  return { plugin, registry, contribution, read, remove: () => (present = false) }
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/tool-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createToolAccessPlugin'])
})

it('mounts tool/v1 with its three reads and its one observation', async () => {
  const { registry, contribution } = await assemble()
  expect(registry.mounted).toHaveLength(1)
  expect(contribution.protocol).toBe(toolProtocol)
  expect(Object.keys(contribution.operations)).toEqual([
    'read-call',
    'read-call-result',
    'read-call-output',
  ])
  expect(Object.keys(contribution.observations)).toEqual(['observe-call'])
})

it('takes the faces at each call: basis-unavailable while Tool is off, and the protocol stays mounted', async () => {
  const { read, registry, remove } = await assemble()
  expect((await read()).outcome).toBe('succeeded')
  remove()
  expect(await read()).toEqual({ outcome: 'basis-unavailable' })
  expect(registry.unmounted).toHaveLength(0)
})

it('takes the contribution down with the plugin', async () => {
  const { plugin, registry, contribution } = await assemble()
  await plugin.dispose()
  expect(registry.unmounted).toEqual([contribution])
})
