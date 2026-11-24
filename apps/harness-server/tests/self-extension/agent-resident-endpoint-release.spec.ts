// @module-tag slow
// Starts the release tree: a definition a tenant published keeps an MCP endpoint resident.
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { ActionDiscovery, EndpointRef, Millis } from '@omne-harness/mcp-contract'
import { mcpActionDiscoveryKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { loginAccess } from '../model/public-stream-support.ts'
import { savedTenant } from '../r9/support.ts'
import { cliOk, direct, extensions, plan, tools } from '../support/planned-model.ts'
import { tenantOf } from '../support/protocol-clients.ts'
import { historyOf, pollUntil, toolResults, type ReleaseTree } from '../support/release-tree.ts'
import { settled } from '../support/tools-flow.ts'
import { prefixOf } from '../support/tools-flow.ts'
import { testPeer, type PeerAction, type TestPeer } from '../rows/mcp/peer.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const AGENT_MD = `---
name: librarian
summary: Looks things up. MARK-LIBRARIAN-SUMMARY
references:
  - { category: tool, name: Tools, resident: true }
  - { category: mcp, name: docs, resident: true }
  - { category: mcp, name: nowhere, resident: true }
---
You look things up. MARK-LIBRARIAN
`

const action = (name: string, description: string, input?: 'count'): PeerAction => ({
  name,
  description,
  answer: 'echo',
  ...(input === undefined ? {} : { input }),
})
const ECHO = action('echo', 'Echoes the text.')
const GONE = action('gone', 'Will be taken away.')
const WORDS = action('words', 'Says it one way.')
const PARAMS = action('params', 'Takes a text for now.')

const text = (value: string): JsonValue => ({ kind: 'string', value })
const ownerOf = (name: string) => ({ kind: 'asset', category: 'mcp', name }) as const

const peers: TestPeer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

/** Registers an endpoint for the tenant of the tree, gives it the address of the peer, and lets every call go. */
async function endpoint(tree: ReleaseTree, name: string, target: string) {
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
  const setting = (item: string) =>
    assets['describe-setting']({ tenant, owner: ownerOf(name), item })
  for (const [item, value] of [
    ['target', { kind: 'ordinary', value: text(target) }],
    ['invoke', { kind: 'permission', pick: 'auto' }],
  ] as const) {
    const read = await settled(
      tree,
      `the setting ${item} of ${name} to be read`,
      () => setting(item),
      answer => answer.outcome === 'succeeded',
    )
    if (read.outcome !== 'succeeded') throw new Error('unreachable')
    const written = await assets['set-setting']({
      tenant,
      owner: ownerOf(name),
      item,
      operation: `${name}-${item}`,
      expectedRevision: read.body.item.revision,
      value: value as never,
    })
    expect(written, `set ${item} of ${name}`).toMatchObject({ outcome: 'succeeded' })
  }
  const page = await assets['list-assets']({ tenant, category: 'mcp', after: null, limit: 10 })
  if (page.outcome !== 'succeeded') throw new Error(`list: ${page.outcome}`)
  const holding = page.body.items.find(item => item.name === name)?.holding
  if (holding === undefined) throw new Error(`no holding of ${name}`)
  const discovery = tree.scope.get(mcpActionDiscoveryKey) as ActionDiscovery<unknown>
  const ref = { name, holding } as unknown as EndpointRef
  // What the peer offers is known once it is acquired again, as a refresh does.
  return async () => {
    const login = await loginAccess(tree)
    await settled(
      tree,
      `the changed actions of ${name} to be published`,
      () => discovery.refresh(login, { ref, connectBound: 10_000 as Millis }),
      answer => 'ok' in answer && answer.ok.kind === 'published',
    )
  }
}

const docs = (command: string, params: Record<string, unknown>) =>
  direct('mcp__docs', { command, params })

const toolNamesOf = (body: string): string[] =>
  ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
    tool => tool.function?.name ?? '',
  )

describe('a definition that keeps an MCP endpoint resident, on the release tree', () => {
  it(
    'declares the endpoint as one tool from the first request and keeps the same bytes while the peer changes; each command is checked against the peer at the call; the endpoint is not reached through Tools',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      const peer = await testPeer([ECHO, GONE, WORDS, PARAMS])
      peers.push(peer)
      await inWorkspace(
        async (ask, tree) => {
          const refreshed = await endpoint(tree, 'docs', peer.target)
          const made = await ask(
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
          expect(made).toContain('done OmneExtensions publish')

          const created = await cliOk(tree, ['create-session', '--definition', 'librarian'])
          expect(created.outcome).toBe('succeeded')
          const session = String(created.body['session'])
          const before = model.bodies.length
          let seen = 0
          const turn = async (text: string) => {
            await cliOk(tree, ['send-input', '--session', session, '--text', text])
            seen += 1
            const entries = await pollUntil(
              `run ${String(seen)} of the librarian session to end`,
              () => historyOf(tree, session),
              all => all.filter(entry => entry.kind === 'run.terminal').length >= seen,
            )
            return toolResults(entries)
          }

          // Called directly from the first run: the endpoint is a tool of the session, not found by a search.
          const first = await turn(plan([docs('echo', { text: 'one' })]))
          expect(first.join('\n')).toContain('echo answered one')
          expect(peer.calls).toEqual([{ action: 'echo', text: 'one' }])

          // The peer changes: one action taken away, one reworded, one with other parameters, one added.
          peer.offer([
            ECHO,
            action('words', 'Says it quite another way now. With more words.'),
            action('params', 'Takes a count now.', 'count'),
            action('extra', 'Was not there before.'),
          ])
          await refreshed()
          const changed = (
            await turn(
              plan(
                [docs('gone', { text: 'g' })],
                [docs('words', { text: 'w' })],
                [docs('params', { text: 'p' })],
                [docs('extra', { text: 'e' })],
                [docs('echo', { text: 'two' })],
              ),
            )
          ).slice(first.length)
          const [gone, words, params, extra, echo] = changed
          expect(gone).toMatch(/did not start: the endpoint does not offer this action now/u)
          expect(words).toContain('words answered w')
          expect(params).toMatch(/did not start: the definition of the action changed/u)
          expect(extra).toMatch(/unknown|command/iu)
          expect(echo).toContain('echo answered two')
          expect(peer.calls.map(call => call.action)).toEqual(['echo', 'words', 'echo'])

          // Through Tools it is refused, and a search does not list it in this session.
          const asked = (
            await turn(
              plan(
                [
                  tools('execute', {
                    name: 'mcp__docs',
                    command: 'echo',
                    arguments: { text: 'three' },
                  }),
                ],
                [tools('search', { query: 'docs', after: null, limit: 10 })],
              ),
            )
          ).slice(first.length + changed.length)
          expect(asked[0]).toBe('ERROR: denied')
          expect(asked[1]).not.toContain('mcp__docs')
          expect(peer.calls.map(call => call.action)).toEqual(['echo', 'words', 'echo'])

          // Switched off: the call is answered as unavailable with its reason; the declaration stays.
          const off = await ask([
            extensions('disable', { id: 'op-2', category: 'mcp', name: 'docs' }),
          ])
          expect(off).toContain('done OmneExtensions disable')
          const disabled = (await turn(plan([docs('echo', { text: 'four' })]))).at(-1) ?? ''
          expect(disabled).toMatch(/not available|disabled|unavailable/iu)
          expect(peer.calls.map(call => call.action)).toEqual(['echo', 'words', 'echo'])

          // Every request of the session declares the endpoint, and its prompt and tools are the same bytes.
          const own = model.bodies
            .slice(before)
            .filter((_, at) =>
              model.systems[before + at]?.includes('You look things up. MARK-LIBRARIAN'),
            )
          expect(own.length).toBeGreaterThanOrEqual(3)
          for (const body of own) {
            expect(toolNamesOf(body).sort()).toEqual(['Tools', 'mcp__docs'].sort())
            expect(body).not.toContain('mcp__nowhere')
            expect(body).not.toContain('Was not there before')
          }
          expect(new Set(own.map(prefixOf)).size).toBe(1)
        },
        { script: model.script },
      )
    },
  )
})
