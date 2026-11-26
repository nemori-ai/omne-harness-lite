// @module-tag slow
// Starts the release tree: a resident MCP endpoint the definition names is registered after the session began; the next run has it.
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { savedTenant } from '../r9/support.ts'
import { cliOk, extensions, plan } from '../support/planned-model.ts'
import { tenantOf } from '../support/protocol-clients.ts'
import { historyOf, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { settled } from '../support/tools-flow.ts'
import { testPeer, type TestPeer } from '../rows/mcp/peer.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const AGENT_MD = `---
name: librarian
summary: Looks things up.
references:
  - { category: tool, name: Tools, resident: true }
  - { category: mcp, name: docs, resident: true }
  - { category: mcp, name: later, resident: true }
---
You look things up. MARK-LIBRARIAN
`

const text = (value: string): JsonValue => ({ kind: 'string', value })

const peers: TestPeer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

/** Registers an endpoint for the tenant of the tree, gives it the address of the peer, and lets every call go. */
async function endpoint(tree: ReleaseTree, name: string, target: string): Promise<void> {
  const { assets } = tree.clients
  const tenant = tenantOf(savedTenant(tree.home))
  const created = await assets['create-asset']({
    tenant,
    operation: `create-${name}`,
    category: 'mcp',
    name,
    body: {
      kind: 'object',
      entries: [
        { key: 'name', value: text(name) },
        { key: 'transport', value: text('streamable-http') },
        { key: 'auth', value: text('none') },
      ],
    } as never,
  })
  expect(created).toMatchObject({ outcome: 'succeeded' })
  const owner = { kind: 'asset', category: 'mcp', name } as const
  for (const [item, value] of [
    ['target', { kind: 'ordinary', value: text(target) }],
    ['invoke', { kind: 'permission', pick: 'auto' }],
  ] as const) {
    const read = await settled(
      tree,
      `the setting ${item} of ${name} to be read`,
      () => assets['describe-setting']({ tenant, owner, item }),
      answer => answer.outcome === 'succeeded',
    )
    if (read.outcome !== 'succeeded') throw new Error('unreachable')
    const written = await assets['set-setting']({
      tenant,
      owner,
      item,
      operation: `${name}-${item}`,
      expectedRevision: read.body.item.revision,
      value: value as never,
    })
    expect(written, `set ${item} of ${name}`).toMatchObject({ outcome: 'succeeded' })
  }
}

const toolNamesOf = (body: string): string[] =>
  ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
    tool => tool.function?.name ?? '',
  )

describe('a resident MCP endpoint registered after the session began, on the release tree', () => {
  it(
    'is judged at the next run with the definition unchanged: the run after it was registered declares it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      const docs = await testPeer([
        { name: 'echo', description: 'Echoes the text.', answer: 'echo' },
      ])
      const later = await testPeer([{ name: 'look', description: 'Looks it up.', answer: 'echo' }])
      peers.push(docs, later)
      await inWorkspace(
        async (ask, tree) => {
          await endpoint(tree, 'docs', docs.target)
          await ask(
            [write('work/librarian/AGENT.md', AGENT_MD)],
            [
              extensions('publish', {
                id: 'op-1',
                category: 'AgentDefinition',
                name: 'librarian',
                dir: 'work/librarian',
              }),
            ],
          )
          const created = await cliOk(tree, ['create-session', '--definition', 'librarian'])
          const session = String(created.body['session'])
          const runs = (wanted: number) =>
            pollUntil(
              `run ${String(wanted)} of the librarian session to end`,
              () => historyOf(tree, session),
              all => all.filter(entry => entry.kind === 'run.terminal').length >= wanted,
            )
          const own = () =>
            model.bodies.filter((_, at) => model.systems[at]?.includes('MARK-LIBRARIAN'))
          await cliOk(tree, ['send-input', '--session', session, '--text', plan()])
          await runs(1)
          expect(toolNamesOf(own().at(-1) ?? '{}').sort()).toEqual(['Tools', 'mcp__docs'])

          await endpoint(tree, 'later', later.target)
          await cliOk(tree, ['send-input', '--session', session, '--text', 'and now'])
          await runs(2)
          expect(toolNamesOf(own().at(-1) ?? '{}').sort()).toEqual([
            'Tools',
            'mcp__docs',
            'mcp__later',
          ])
        },
        { script: model.script },
      )
    },
  )
})
