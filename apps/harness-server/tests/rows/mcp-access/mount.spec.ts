import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mcpAccessConfig, mcpAccessRow } from '../../../src/rows/mcp-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { savedTenant } from '../../r9/support.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { settled } from '../../support/tools-flow.ts'
import { testPeer } from '../mcp/peer.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })
const withoutAddress = (name: string): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'name', value: text(name) },
    { key: 'transport', value: text('streamable-http') },
    { key: 'auth', value: text('none') },
  ],
})

const OTHER_TENANT = JSON.stringify({
  organization: 'org_00000000000000000000000001',
  account: 'acc_00000000000000000000000001',
})

function mcpClient(tree: ReleaseTree) {
  return createClient(
    mcpProtocol,
    protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
  )
}

const owner = (name: string) => ({ kind: 'asset', category: 'mcp', name }) as const

async function registeredWithTarget(tree: ReleaseTree, name: string, target: string) {
  const tenant = tenantOf(savedTenant(tree.home))
  const { assets } = tree.clients
  const created = await assets['create-asset']({
    tenant,
    operation: `create-${name}`,
    category: 'mcp',
    name,
    body: withoutAddress(name) as never,
  })
  expect(created).toMatchObject({ outcome: 'succeeded' })
  const current = await settled(
    tree,
    `the target of ${name} to be read`,
    () => assets['describe-setting']({ tenant, owner: owner(name), item: 'target' }),
    value => value.outcome === 'succeeded',
  )
  if (current.outcome !== 'succeeded') throw new Error('unreachable')
  const written = await assets['set-setting']({
    tenant,
    owner: owner(name),
    item: 'target',
    operation: `target-${name}`,
    expectedRevision: current.body.item.revision,
    value: { kind: 'ordinary', value: text(target) as never },
  })
  expect(written).toMatchObject({ outcome: 'succeeded' })
}

describe('mcp-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(mcpAccessRow)
    expect(declared?.row).toBe('mcp-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it('takes the connect bound of the refresh alone, and refuses what is not a bound or a field it does not have', () => {
    expect(mcpAccessConfig.parse({ refresh: { connectBoundMs: 10000 } })).toEqual({
      refresh: { connectBoundMs: 10000 },
    })
    for (const config of [
      {},
      { refresh: {} },
      { refresh: { connectBoundMs: 0 } },
      { refresh: { connectBoundMs: 1.5 } },
      { refresh: { connectBoundMs: 10000, extra: 1 } },
      { refresh: { connectBoundMs: 10000 }, other: 1 },
    ])
      expect(mcpAccessConfig.safeParse(config).success).toBe(false)
  })

  it(
    'on the release tree an endpoint with no address says why through mcp/v1, and another tenant, a login that is not a member and an unknown name see none of it',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const tenant = tenantOf(savedTenant(tree.home))
        const mcp = mcpClient(tree)
        await tree.startSession('hello')
        const created = await tree.clients.assets['create-asset']({
          tenant,
          operation: 'create-docs',
          category: 'mcp',
          name: 'docs',
          body: withoutAddress('docs') as never,
        })
        expect(created).toMatchObject({ outcome: 'succeeded' })

        const listed = await settled(
          tree,
          'the endpoint to be listed',
          () => mcp['list-endpoints']({ tenant }),
          value => value.outcome === 'succeeded' && value.body.items.length === 1,
        )
        expect(listed).toMatchObject({
          outcome: 'succeeded',
          body: {
            items: [
              {
                name: 'docs',
                connection: { state: 'none', reason: null },
                credential: 'not-required',
                use: { kind: 'usable' },
                catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
              },
            ],
          },
        })

        const refreshed = await mcp['refresh-endpoint']({ tenant, name: 'docs' })
        expect(refreshed).toEqual({
          outcome: 'succeeded',
          body: { refreshed: 'failed', reason: 'the address of the endpoint is not set' },
        })

        const read = await mcp['read-endpoint']({ tenant, name: 'docs' })
        expect(read).toMatchObject({
          outcome: 'succeeded',
          body: {
            endpoint: {
              name: 'docs',
              catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
            },
            actions: null,
          },
        })

        const unknown = await mcp['read-endpoint']({ tenant, name: 'absent' })
        expect(unknown).toEqual({ outcome: 'not-visible', body: {} })

        const other = tenantOf(OTHER_TENANT)
        for (const answer of [
          await mcp['list-endpoints']({ tenant: other }),
          await mcp['read-endpoint']({ tenant: other, name: 'docs' }),
          await mcp['refresh-endpoint']({ tenant: other, name: 'docs' }),
        ])
          expect(answer).toMatchObject({ outcome: 'denied' })

        const forged = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home, { proof: 'forged' })),
        )
        expect(await forged['list-endpoints']({ tenant })).toMatchObject({ outcome: 'denied' })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'on the release tree an endpoint with an address gets its actions through a refresh, and mcp/v1 reads them with the summaries the agent sees',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const peer = await testPeer([
        { name: 'echo', description: 'Echoes the text. Use it to test.', answer: 'echo' },
        { name: 'fail', description: 'Always refuses.', answer: 'error' },
      ])
      try {
        const exitCode = await onReleaseTree(
          { script: toolCallsThenText(() => []) },
          async tree => {
            const tenant = tenantOf(savedTenant(tree.home))
            const mcp = mcpClient(tree)
            await tree.startSession('hello')
            await registeredWithTarget(tree, 'docs', peer.target)

            const refreshed = await settled(
              tree,
              'the refresh to publish',
              () => mcp['refresh-endpoint']({ tenant, name: 'docs' }),
              value => value.outcome === 'succeeded' && value.body.refreshed === 'published',
            )
            expect(refreshed).toEqual({
              outcome: 'succeeded',
              body: { refreshed: 'published', reason: null },
            })

            const read = await mcp['read-endpoint']({ tenant, name: 'docs' })
            expect(read).toMatchObject({
              outcome: 'succeeded',
              body: {
                endpoint: {
                  name: 'docs',
                  connection: { state: 'ready' },
                  use: { kind: 'usable' },
                  catalog: { kind: 'acquired', actions: 2 },
                },
                actions: [
                  {
                    name: 'echo',
                    summary: '[peer] Echoes the text.',
                    available: true,
                    reason: null,
                  },
                  {
                    name: 'fail',
                    summary: '[peer] Always refuses.',
                    available: true,
                    reason: null,
                  },
                ],
              },
            })
            const listed = await mcp['list-endpoints']({ tenant })
            expect(listed).toMatchObject({
              outcome: 'succeeded',
              body: { items: [{ name: 'docs', catalog: { kind: 'acquired', actions: 2 } }] },
            })
          },
        )
        expect(exitCode).toBe(0)
      } finally {
        await peer.close()
      }
    },
  )
})
