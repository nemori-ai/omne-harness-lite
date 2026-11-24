// @module-tag slow
// A capability outside the tool release has a gate once its category names a gate template.
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { PROBE, PROBE_ROW, PROBE_TEMPLATE, probeBody } from './gated-fixture.ts'

type Assets = ProtocolClients['assets']

const options = {
  script: toolCallsThenText(() => []),
  addedRows: [PROBE_ROW],
  rowConfig: { governance: { categoryGates: [PROBE_TEMPLATE] } },
}
const ownerOf = (name: string) => ({ kind: 'asset', category: PROBE, name }) as const

const context = (tree: ReleaseTree) => ({
  tree,
  assets: tree.clients.assets,
  tenant: tenantOf(savedTenant(tree.home)),
})
type World = ReturnType<typeof context>

const warningsOf = (tree: ReleaseTree) =>
  tree.records
    .filter(record => record['signal'] === 'log' && record['level'] !== 'info')
    .map(record => `${String(record['component'])}: ${JSON.stringify(record['fields'])}`)
    .slice(-20)
    .join('\n')

// A read that does not settle within the bound fails with what it last saw and what the server warned.
async function settled<T>(
  tree: ReleaseTree,
  what: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > deadline)
      throw new Error(`${what} did not happen: ${JSON.stringify(value)}\n${warningsOf(tree)}`)
    await sleep(200)
  }
}

async function holdingOf(assets: Assets, tenant: TenantId, name: string): Promise<string> {
  const page = await assets['list-assets']({ tenant, category: PROBE, after: null, limit: 10 })
  if (page.outcome !== 'succeeded') throw new Error(`list: ${page.outcome}`)
  const holding = page.body.items.find(item => item.name === name)?.holding
  if (holding === undefined) throw new Error(`no holding of ${name}`)
  return holding
}

async function held(
  assets: Assets,
  tenant: TenantId,
  name: string,
  operation = `create-${name}`,
): Promise<string> {
  const created = await assets['create-asset']({
    tenant,
    operation,
    category: PROBE,
    name,
    body: probeBody(`https://${name}.example`) as never,
  })
  if (created.outcome !== 'succeeded') throw new Error(`create ${name}: ${JSON.stringify(created)}`)
  return holdingOf(assets, tenant, name)
}

const gateOf = (assets: Assets, tenant: TenantId, name: string) =>
  assets['describe-setting']({ tenant, owner: ownerOf(name), item: 'invoke' })

async function gate({ tree, assets, tenant }: World, name: string) {
  const described = await settled(
    tree,
    `the gate of ${name} to be a permission`,
    () => gateOf(assets, tenant, name),
    value => value.outcome === 'succeeded' && value.body.item.kind === 'permission',
  )
  if (described.outcome !== 'succeeded' || described.body.item.kind !== 'permission')
    throw new Error('unreachable')
  return described.body.item
}

async function withoutGate({ tree, assets, tenant }: World, name: string) {
  return settled(
    tree,
    `the gate of ${name} to be no permission`,
    () => gateOf(assets, tenant, name),
    value => !(value.outcome === 'succeeded' && value.body.item.kind === 'permission'),
  )
}

it(
  'a held capability of a gated category has its own gate: asking by default, picked for each capability, withdrawn with the holding, and adopted again after a restart',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const exitCodes = await onReleaseTreeRuns(options, [
      async tree => {
        await settledSession(tree, 'hello')
        const world = context(tree)
        const { assets, tenant } = world
        const alphaHolding = await held(assets, tenant, 'alpha')
        await held(assets, tenant, 'beta')

        const alpha = await gate(world, 'alpha')
        expect(alpha).toMatchObject({
          default: 'ask',
          own: null,
          effective: { kind: 'value', value: 'ask' },
          editable: { kind: 'yes' },
        })
        expect(alpha.choices.map(choice => choice.value)).toEqual(['deny', 'ask', 'auto'])

        const denied = await assets['set-setting']({
          tenant,
          owner: ownerOf('alpha'),
          item: 'invoke',
          operation: 'alpha-deny',
          expectedRevision: alpha.revision,
          value: { kind: 'permission', pick: 'deny' },
        })
        expect(denied).toMatchObject({ outcome: 'succeeded' })
        expect(await gate(world, 'alpha')).toMatchObject({
          own: 'deny',
          effective: { kind: 'prohibited', by: 'tenant' },
        })
        expect(await gate(world, 'beta')).toMatchObject({
          own: null,
          effective: { kind: 'value', value: 'ask' },
        })

        const disabled = await assets['set-asset-enabled']({
          tenant,
          operation: 'alpha-off',
          holding: alphaHolding,
          enabled: false,
        })
        expect(disabled).toMatchObject({ outcome: 'succeeded' })
        await withoutGate(world, 'alpha')
        expect(await gate(world, 'beta')).toMatchObject({ own: null })

        const enabled = await assets['set-asset-enabled']({
          tenant,
          operation: 'alpha-on',
          holding: alphaHolding,
          enabled: true,
        })
        expect(enabled).toMatchObject({ outcome: 'succeeded' })
        expect(await gate(world, 'alpha')).toMatchObject({ own: 'deny' })
      },
      async tree => {
        const world = context(tree)
        const { assets, tenant } = world
        expect(await gate(world, 'alpha')).toMatchObject({
          own: 'deny',
          effective: { kind: 'prohibited', by: 'tenant' },
        })
        expect(
          await assets['remove-asset']({
            tenant,
            operation: 'beta-rm',
            holding: await holdingOf(assets, tenant, 'beta'),
          }),
        ).toMatchObject({ outcome: 'succeeded' })
        const gone = await withoutGate(world, 'beta')
        expect(gone.outcome).not.toBe('succeeded')
        expect(await gate(world, 'alpha')).toMatchObject({ own: 'deny' })
        await held(assets, tenant, 'beta', 'create-beta-again')
        expect(await gate(world, 'beta')).toMatchObject({
          own: null,
          effective: { kind: 'value', value: 'ask' },
        })
      },
    ])
    expect(exitCodes).toEqual([0, 0])
  },
)
