// @module-tag slow
// A tool entry source on the release tree: its entries are found, described and called through Tools.
import { expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  releaseDistribution,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  lastMessageOf,
  lastResult,
  prefixOf,
  recoveryOf,
  settled,
  toolsCall as tools,
} from '../../support/tools-flow.ts'
import {
  answerCard,
  endedRuns,
  pendingCard,
  sendInput,
} from '../authorization/release-flow-support.ts'
import { PROBE, PROBE_ROW, PROBE_TEMPLATE, probeBody } from '../governance/gated-fixture.ts'
import { bringing, probeEntry, probeSource } from './probe-source-fixture.ts'

type Assets = ProtocolClients['assets']

const NOT_RELEASED = 'The tool call did not run: the person did not allow it this time.'
const ownerOf = (name: string) => ({ kind: 'asset', category: PROBE, name }) as const

// Each new user message asks for one call of Tools; a pending answer is followed by its recovery call.
function scripted() {
  const bodies: string[] = []
  const script = toolCallsByRequest(body => {
    bodies.push(body)
    const last = lastMessageOf(body)
    const recovery = recoveryOf(last)
    if (recovery !== undefined)
      return [tools(`read_${String(bodies.length)}`, recovery.command, recovery.params)]
    if (last?.role !== 'user') return []
    const text = JSON.stringify(last.content)
    const call = /start: call ([a-z]+) ([a-z0-9-]+)/.exec(text)
    const inspect = /start: inspect ([a-z]+)/.exec(text)?.[1]
    if (call !== null)
      return [
        tools(`call_${call[2]}`, 'execute', {
          name: `probe__${call[1]}`,
          command: 'run',
          arguments: { text: call[2] },
        }),
      ]
    if (inspect !== undefined)
      return [tools(`inspect_${inspect}`, 'inspect', { name: `probe__${inspect}`, command: 'run' })]
    if (text.includes('start: search'))
      return [tools('search', 'search', { query: 'probe', after: null, limit: 10 })]
    return []
  })
  return { bodies, script }
}

// The action rules of the release, plus one that lets the deployment use the entries of the probe source.
function withProbeRule() {
  const { rows } = releaseDistribution() as {
    rows: { id: string; config: { actionRules?: { revision: string; rules: unknown[] } } }[]
  }
  const released = rows.find(row => row.id === 'authorization')?.config.actionRules
  if (released === undefined) throw new Error('the release has no action rules')
  return {
    ...released,
    rules: [...released.rules, { id: 'probe', effect: 'allow', source: { category: PROBE } }],
  }
}

const options = (script: ReturnType<typeof scripted>['script']) => ({
  script,
  permission: 'auto_permission',
  addedRows: [PROBE_ROW],
  rowConfig: {
    governance: { categoryGates: [PROBE_TEMPLATE] },
    authorization: { actionRules: withProbeRule() },
  },
})

const world = (tree: ReleaseTree) => ({
  tree,
  assets: tree.clients.assets,
  tenant: tenantOf(savedTenant(tree.home)),
})
type World = ReturnType<typeof world>

const gateOf = (assets: Assets, tenant: TenantId, name: string) =>
  assets['describe-setting']({ tenant, owner: ownerOf(name), item: 'invoke' })

// Holds a probe of this name and waits until its gate is a permission of the tenant.
async function held({ tree, assets, tenant }: World, name: string) {
  const created = await assets['create-asset']({
    tenant,
    operation: `create-${name}`,
    category: PROBE,
    name,
    body: probeBody(`https://${name}.example`) as never,
  })
  if (created.outcome !== 'succeeded') throw new Error(`create ${name}: ${JSON.stringify(created)}`)
  await settled(
    tree,
    `the gate of ${name} to be a permission`,
    () => gateOf(assets, tenant, name),
    value => value.outcome === 'succeeded' && value.body.item.kind === 'permission',
  )
}

async function pick({ assets, tenant }: World, name: string, value: 'deny' | 'ask' | 'auto') {
  const described = await gateOf(assets, tenant, name)
  if (described.outcome !== 'succeeded') throw new Error(`describe ${name}`)
  const written = await assets['set-setting']({
    tenant,
    owner: ownerOf(name),
    item: 'invoke',
    operation: `${name}-${value}`,
    expectedRevision: described.body.item.revision,
    value: { kind: 'permission', pick: value },
  })
  expect(written).toMatchObject({ outcome: 'succeeded' })
}

it(
  'a source put on the running tree is found by a session that was already open, described and called through Tools, asked by its own capability, with the prompt and the tool declarations unchanged',
  { timeout: 300_000 },
  async () => {
    const { bodies, script } = scripted()
    const source = probeSource({
      entries: [probeEntry('alpha'), probeEntry('beta')],
      withheld: [{ name: 'probe__gamma', reason: 'its actions were never listed' }],
    })
    const exit = await onReleaseTree(options(script), async tree => {
      const w = world(tree)
      const session = await tree.startSession('start: search')
      const before = JSON.parse(await lastResult(tree, session, 1)) as { tools: { name: string }[] }
      expect(
        before.tools.map(entry => entry.name).filter(name => name.startsWith('probe__')),
      ).toEqual([])
      const prefix = prefixOf(bodies[0] ?? '')
      await held(w, 'alpha')
      await held(w, 'beta')

      const fiber = tree.scope.plugin(bringing(source))
      await fiber.await()

      await sendInput(tree, session, 'start: search')
      const found = JSON.parse(await lastResult(tree, session, 2)) as {
        tools: { name: string; resident: boolean; commands: { name: string }[] }[]
        withheld?: unknown
      }
      const alpha = found.tools.find(entry => entry.name === 'probe__alpha')
      expect(alpha).toMatchObject({ resident: false, availability: 'available' })
      expect(alpha?.commands.map(command => command.name)).toEqual(['run', 'stop'])
      expect(found.tools.map(entry => entry.name)).toContain('probe__beta')
      expect(found.withheld).toEqual([
        { name: 'probe__gamma', reason: 'its actions were never listed' },
      ])

      await sendInput(tree, session, 'start: inspect alpha')
      const usage = await lastResult(tree, session, 3)
      expect(usage).toContain('probe__alpha')
      expect(usage).toContain('text')

      await sendInput(tree, session, 'start: call alpha one')
      const card = await pendingCard(tree, session, 'the first call of alpha')
      expect(JSON.stringify(card.question)).toContain('probe__alpha')
      expect(source.calls).toHaveLength(0)
      await answerCard(tree, card, ['--option', 'allow-session'], 'reply-one')
      expect(await lastResult(tree, session, 4)).toContain('probe__alpha run')
      expect(source.calls).toHaveLength(1)
      expect(source.calls[0]).toMatchObject({
        tenant: w.tenant,
        name: 'probe__alpha',
        command: 'run',
        declared: { name: 'run' },
      })

      await sendInput(tree, session, 'start: call alpha two')
      expect(await lastResult(tree, session, 5)).toContain('"two"')
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
      expect(source.calls).toHaveLength(2)

      await sendInput(tree, session, 'start: call beta three')
      const other = await pendingCard(tree, session, 'the first call of beta')
      expect(JSON.stringify(other.question)).toContain('probe__beta')
      await answerCard(tree, other, ['--option', 'deny-once'], 'reply-three')
      expect(await lastResult(tree, session, 6)).toContain(NOT_RELEASED)
      expect(source.calls).toHaveLength(2)

      expect(bodies.map(prefixOf).filter(text => text !== prefix)).toEqual([])
      await fiber.dispose()
    })
    expect(exit).toBe(0)
  },
)

it(
  'the gate of the capability behind an entry decides each call: prohibited refuses without asking, automatic runs without asking, and the entries leave with their source',
  { timeout: 300_000 },
  async () => {
    const { script } = scripted()
    const source = probeSource({ entries: [probeEntry('alpha')], withheld: [] })
    const exit = await onReleaseTree(options(script), async tree => {
      const w = world(tree)
      const session = await tree.startSession('hello')
      await endedRuns(tree, session, 1)
      await held(w, 'alpha')
      const fiber = tree.scope.plugin(bringing(source))
      await fiber.await()

      await pick(w, 'alpha', 'deny')
      await sendInput(tree, session, 'start: call alpha denied')
      const refused = await lastResult(tree, session, 2)
      expect(refused).not.toContain('probe__alpha run')
      expect(await tree.cards({ sessionRef: session })).toEqual([])
      expect(source.calls).toHaveLength(0)

      await pick(w, 'alpha', 'auto')
      await sendInput(tree, session, 'start: call alpha allowed')
      expect(await lastResult(tree, session, 3)).toContain('"allowed"')
      expect(await tree.cards({ sessionRef: session })).toEqual([])
      expect(source.calls).toHaveLength(1)

      await fiber.dispose()
      await sendInput(tree, session, 'start: call alpha gone')
      expect(await lastResult(tree, session, 4)).not.toContain('"gone"')
      expect(source.calls).toHaveLength(1)
    })
    expect(exit).toBe(0)
  },
)
