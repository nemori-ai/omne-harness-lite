// @module-tag slow
// An MCP endpoint on the release tree: registered, configured, found, asked for, called and withdrawn.
import { afterEach, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ActionDiscovery, EndpointRef, Millis } from '@omne-harness/mcp-contract'
import { mcpActionDiscoveryKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { loginAccess } from '../../model/public-stream-support.ts'
import { savedTenant } from '../../r9/support.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
  type ProtocolClients,
} from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  onReleaseTreeRuns,
  toolCallsByRequest,
  toolLedger,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  journey,
  lastMessageOf,
  lastResult,
  prefixOf,
  recoveryOf,
  settled,
  toolsCall,
} from '../../support/tools-flow.ts'
import {
  answerCard,
  endedRuns,
  holdStart,
  pendingCard,
  sendInput,
} from '../authorization/release-flow-support.ts'
import {
  modernPeer,
  testPeer,
  type ModernPeer,
  type PeerAction,
  type PeerOptions,
  type TestPeer,
} from './peer.ts'

type Assets = ProtocolClients['assets']

const LIMIT_MS = 420_000
const NOT_RELEASED = 'The tool call did not run: the person did not allow it this time.'
const ECHO: PeerAction = {
  name: 'echo',
  description: 'Echoes the text. Use it to test.',
  answer: 'echo',
}
const FAIL: PeerAction = { name: 'fail', description: 'Always refuses.', answer: 'error' }
const HANG: PeerAction = { name: 'hang', description: 'Never answers.', answer: 'hang' }
const COUNT: PeerAction = { name: 'count', description: 'Counts the text.', answer: 'length' }

// What the model writes for `start: code <label>`: each program calls one action of the endpoint shop.
const guarded = (call: string) =>
  [
    `try { return await ${call} }`,
    'catch (error) { return { refused: String(error), kind: error.kind ?? null } }',
  ].join('\n')
const SHOP = { category: 'mcp', name: 'shop' }
// What the model writes for `start: extensions <label>`: one call of OmneExtensions about the endpoint shop.
const EXTENSION_CALLS: Readonly<Record<string, readonly [string, object]>> = {
  settings: ['settings', SHOP],
  open: ['configure', { id: 'open-1', ...SHOP, item: 'program-calls', value: true }],
  'grab-gate': ['configure', { id: 'grab-1', ...SHOP, item: 'invoke', value: 'auto' }],
  'vault-settings': ['settings', { category: 'mcp', name: 'vault' }],
  'grab-secret': [
    'configure',
    {
      id: 'grab-2',
      category: 'mcp',
      name: 'vault',
      item: 'credential',
      value: 'sk-from-the-agent',
    },
  ],
}
const PROGRAMS: Readonly<Record<string, string>> = {
  count: guarded('mcp__shop.count({ text: "four" })'),
  plain: guarded('mcp__shop.echo({ text: "plain" })'),
}

const ownerOf = (name: string) => ({ kind: 'asset', category: 'mcp', name }) as const
const text = (value: string): JsonValue => ({ kind: 'string', value })
const bodyOf = (name: string, auth: 'none' | 'static' | 'oauth'): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'name', value: text(name) },
    { key: 'transport', value: text('streamable-http') },
    { key: 'auth', value: text(auth) },
  ],
})

const peers: (TestPeer | ModernPeer)[] = []
async function peerOf(actions: PeerAction[], options?: PeerOptions): Promise<TestPeer> {
  const peer = await testPeer(actions, options)
  peers.push(peer)
  return peer
}
const peerWith = (...actions: PeerAction[]) => peerOf(actions)
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

// Each new user message asks for one call of Tools; a pending answer is followed by its recovery call.
type Message = NonNullable<Parameters<typeof recoveryOf>[0]>

/** The last recovery call any pending answer of Tools named in the conversation. */
function pendingIn(body: string) {
  const messages = (JSON.parse(body) as { messages?: Message[] }).messages ?? []
  for (const message of messages.toReversed()) {
    const next = recoveryOf(message)
    if (next !== undefined) return next
  }
  return undefined
}

function scripted() {
  const bodies: string[] = []
  const script = toolCallsByRequest(body => {
    bodies.push(body)
    const last = lastMessageOf(body)
    const recovery = recoveryOf(last)
    if (recovery !== undefined)
      return [toolsCall(`read_${String(bodies.length)}`, recovery.command, recovery.params)]
    if (last?.role !== 'user') return []
    const said = JSON.stringify(last.content)
    // A person who answered a card asks the agent to read the call it left pending.
    if (said.includes('start: read again')) {
      const next = pendingIn(body)
      return next === undefined
        ? []
        : [toolsCall(`again_${String(bodies.length)}`, next.command, next.params)]
    }
    const call = /start: call ([a-z]+) ([a-z]+) ([a-z0-9-]+)/.exec(said)
    const inspect = /start: inspect ([a-z]+) ([a-z]+)/.exec(said)
    const code = PROGRAMS[/start: code ([a-z]+)/.exec(said)?.[1] ?? '']
    const extension = EXTENSION_CALLS[/start: extensions ([a-z-]+)/.exec(said)?.[1] ?? '']
    if (extension !== undefined) {
      const [command, params] = extension
      const id = `extensions_${String(bodies.length)}`
      return [{ id, tool: 'OmneExtensions', arguments: JSON.stringify({ command, params }) }]
    }
    if (code !== undefined) {
      const id = `code_${String(bodies.length)}`
      return [{ id, tool: 'Code', arguments: JSON.stringify({ command: 'execute', code }) }]
    }
    if (call !== null)
      return [
        toolsCall(`call_${call[3]}`, 'execute', {
          name: `mcp__${call[1]}`,
          command: call[2],
          arguments: { text: call[3] },
        }),
      ]
    if (inspect !== null)
      return [
        toolsCall(`inspect_${inspect[1]}`, 'inspect', {
          name: `mcp__${inspect[1]}`,
          command: inspect[2],
        }),
      ]
    if (said.includes('start: files a program calls'))
      return [
        toolsCall('files', 'search', {
          query: 'read files',
          after: null,
          limit: 10,
          programmable: true,
        }),
      ]
    if (said.includes('start: callable'))
      return [
        toolsCall('callable', 'search', {
          query: 'mcp',
          after: null,
          limit: 10,
          programmable: true,
        }),
      ]
    if (said.includes('start: search'))
      return [toolsCall('search', 'search', { query: 'mcp', after: null, limit: 10 })]
    return []
  })
  return { bodies, script }
}

const options = (script: ReturnType<typeof scripted>['script']) => ({
  script,
  permission: 'auto_permission',
})

const world = (tree: ReleaseTree) => ({
  tree,
  assets: tree.clients.assets,
  tenant: tenantOf(savedTenant(tree.home)),
})
type World = ReturnType<typeof world>

const settingOf = (assets: Assets, tenant: TenantId, name: string, item: string) =>
  assets['describe-setting']({ tenant, owner: ownerOf(name), item })

async function described({ tree, assets, tenant }: World, name: string, item: string) {
  const read = await settled(
    tree,
    `the setting ${item} of ${name} to be read`,
    () => settingOf(assets, tenant, name, item),
    value => value.outcome === 'succeeded',
  )
  if (read.outcome !== 'succeeded') throw new Error('unreachable')
  return read.body.item
}

// Registers an endpoint and returns its holding; its gate is a permission once this returns.
async function registered(
  w: World,
  name: string,
  auth: 'none' | 'static' = 'none',
): Promise<string> {
  const created = await w.assets['create-asset']({
    tenant: w.tenant,
    operation: `create-${name}`,
    category: 'mcp',
    name,
    body: bodyOf(name, auth) as never,
  })
  if (created.outcome !== 'succeeded') throw new Error(`create ${name}: ${JSON.stringify(created)}`)
  await settled(
    w.tree,
    `the gate of ${name} to be a permission`,
    () => settingOf(w.assets, w.tenant, name, 'invoke'),
    value => value.outcome === 'succeeded' && value.body.item.kind === 'permission',
  )
  const page = await w.assets['list-assets']({
    tenant: w.tenant,
    category: 'mcp',
    after: null,
    limit: 10,
  })
  if (page.outcome !== 'succeeded') throw new Error(`list: ${page.outcome}`)
  const holding = page.body.items.find(item => item.name === name)?.holding
  if (holding === undefined) throw new Error(`no holding of ${name}`)
  return holding
}

const treeOf = (value: unknown): JsonValue =>
  typeof value === 'boolean' ? { kind: 'boolean', value } : text(value as string)

async function configured(w: World, name: string, item: string, value: unknown, operation: string) {
  const current = await described(w, name, item)
  const written = await w.assets['set-setting']({
    tenant: w.tenant,
    owner: ownerOf(name),
    item,
    operation,
    expectedRevision: current.revision,
    value:
      item === 'invoke'
        ? { kind: 'permission', pick: value as string }
        : { kind: 'ordinary', value: treeOf(value) as never },
  })
  expect(written, `set ${item} of ${name}`).toMatchObject({ outcome: 'succeeded' })
}

type Found = Readonly<{
  tools: readonly Readonly<{
    name: string
    availability?: string
    resident?: boolean
    commands?: readonly Readonly<{ name: string; summary?: string }>[]
    program?: string
  }>[]
  withheld?: readonly Readonly<{ name: string; reason: string }>[]
}>

async function searched(tree: ReleaseTree, session: string, runs: number): Promise<Found> {
  return JSON.parse(await lastResult(tree, session, runs)) as Found
}

const mcpOf = (found: Found) => found.tools.filter(entry => entry.name.startsWith('mcp__'))

it(
  'an endpoint registered while a session is open is found without reopening it, says why it cannot be used until it has an address, asks on a card for each endpoint, and keeps the prompt and the tool declarations as they were',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { bodies, script } = scripted()
    const peer = await peerWith(ECHO, FAIL)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        at('search before any endpoint')
        const session = await tree.startSession('start: search')
        const before = await searched(tree, session, 1)
        expect(mcpOf(before)).toEqual([])
        expect(before.withheld ?? []).toEqual([])
        const prefix = prefixOf(bodies[0] ?? '')

        at('register docs')
        await registered(w, 'docs')
        expect(await described(w, 'docs', 'invoke')).toMatchObject({
          kind: 'permission',
          effective: { kind: 'value', value: 'ask' },
        })
        expect(await described(w, 'docs', 'target')).toMatchObject({
          kind: 'ordinary',
          effective: { value: { kind: 'unset' } },
        })
        expect(await described(w, 'docs', 'connect-timeout')).toMatchObject({ kind: 'ordinary' })
        expect(await settingOf(w.assets, w.tenant, 'docs', 'credential')).not.toMatchObject({
          outcome: 'succeeded',
        })

        at('search while docs has no address')
        await sendInput(tree, session, 'start: search')
        const unset = await searched(tree, session, 2)
        expect(mcpOf(unset)).toEqual([])
        expect(unset.withheld).toEqual([
          { name: 'mcp__docs', reason: 'the address of the endpoint is not set' },
        ])

        at('give docs its address and search')
        await configured(w, 'docs', 'target', peer.target, 'docs-target')
        await sendInput(tree, session, 'start: search')
        const found = await searched(tree, session, 3)
        const [docs] = mcpOf(found)
        expect(docs, JSON.stringify(found.withheld)).toMatchObject({
          name: 'mcp__docs',
          resident: false,
          availability: 'available',
        })
        expect(docs?.commands?.map(command => command.name)).toEqual(['echo', 'fail'])
        expect(docs?.commands?.[0]?.summary).toBe('[peer] Echoes the text.')
        expect(found.withheld ?? []).toEqual([])

        at('inspect docs echo')
        await sendInput(tree, session, 'start: inspect docs echo')
        const usage = await lastResult(tree, session, 4)
        expect(usage).toContain('mcp__docs')
        expect(usage).toContain('Use it to test.')

        at('first call of docs: the card, then once')
        await sendInput(tree, session, 'start: call docs echo one')
        const first = await pendingCard(tree, session, 'the first call of docs')
        const question = JSON.stringify(first.question)
        expect(question).toContain('mcp__docs')
        expect(question).toContain('echo')
        expect(question).toContain('one')
        expect(peer.calls).toHaveLength(0)
        await answerCard(tree, first, ['--option', 'allow-once'], 'reply-one')
        const answer = await lastResult(tree, session, 5)
        expect(answer).toContain('done mcp__docs echo')
        expect(answer).toContain('echo answered one')
        expect(peer.calls).toEqual([{ action: 'echo', text: 'one' }])

        at('second call of docs: the card, then this session')
        await sendInput(tree, session, 'start: call docs echo two')
        const second = await pendingCard(tree, session, 'the second call of docs')
        await answerCard(tree, second, ['--option', 'allow-session'], 'reply-two')
        expect(await lastResult(tree, session, 6)).toContain('echo answered two')

        at('another action of docs runs without a card')
        await sendInput(tree, session, 'start: call docs fail three')
        const refused = await lastResult(tree, session, 7)
        expect(refused).toContain('the endpoint reported that the action failed')
        expect(refused).toContain('fail refused three')
        expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
        expect(peer.calls).toHaveLength(3)

        at('another endpoint still asks')
        await registered(w, 'wiki')
        await configured(w, 'wiki', 'target', peer.target, 'wiki-target')
        await sendInput(tree, session, 'start: call wiki echo four')
        const other = await pendingCard(tree, session, 'the first call of wiki')
        expect(JSON.stringify(other.question)).toContain('mcp__wiki')
        await answerCard(tree, other, ['--option', 'deny-once'], 'reply-four')
        expect(await lastResult(tree, session, 8)).toContain(NOT_RELEASED)
        expect(peer.calls).toHaveLength(3)

        expect(bodies.map(prefixOf).filter(body => body !== prefix)).toEqual([])
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'the gate of an endpoint decides each call, a disabled endpoint is named with its reason and not offered, a removed one is gone, and a call whose answer never came is not known and was sent once',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await peerWith(ECHO, HANG)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        at('register docs')
        const session = await tree.startSession('hello')
        await endedRuns(tree, session, 1)
        const docs = await registered(w, 'docs')
        await configured(w, 'docs', 'target', peer.target, 'docs-target')

        at('prohibited: refused without a card')
        await configured(w, 'docs', 'invoke', 'deny', 'docs-deny')
        await sendInput(tree, session, 'start: call docs echo denied')
        expect(await lastResult(tree, session, 2)).not.toContain('echo answered')
        expect(await tree.cards({ sessionRef: session })).toEqual([])
        expect(peer.calls).toHaveLength(0)

        at('automatic: a new session runs without a card')
        await configured(w, 'docs', 'invoke', 'auto', 'docs-auto')
        const fresh = await tree.startSession('start: call docs echo allowed')
        expect(await lastResult(tree, fresh, 1)).toContain('echo answered allowed')
        expect(await tree.cards({ sessionRef: fresh })).toEqual([])
        expect(peer.calls).toEqual([{ action: 'echo', text: 'allowed' }])

        at('the connection breaks after the call was sent')
        await sendInput(tree, fresh, 'start: call docs hang lost')
        await settled(
          tree,
          'the hanging call to reach the peer',
          async () => peer.calls.length,
          count => count === 2,
        )
        peer.drop()
        const lost = await lastResult(tree, fresh, 2)
        expect(lost).toContain('mcp__docs hang was sent')
        expect(lost).toContain('Whether the action took effect is not known')
        expect(peer.calls.filter(call => call.action === 'hang')).toHaveLength(1)

        at('disabled: named with its reason, not offered')
        const disabled = await w.assets['set-asset-enabled']({
          tenant: w.tenant,
          operation: 'docs-off',
          holding: docs,
          enabled: false,
        })
        expect(disabled).toMatchObject({ outcome: 'succeeded' })
        await sendInput(tree, fresh, 'start: search')
        const off = await searched(tree, fresh, 3)
        expect(mcpOf(off)).toEqual([])
        expect(off.withheld).toEqual([{ name: 'mcp__docs', reason: 'the endpoint is disabled' }])
        await sendInput(tree, fresh, 'start: call docs echo off')
        expect(await lastResult(tree, fresh, 4)).not.toContain('echo answered off')
        expect(peer.calls.filter(call => call.text === 'off')).toEqual([])

        at('removed: gone')
        const removed = await w.assets['remove-asset']({
          tenant: w.tenant,
          operation: 'docs-gone',
          holding: docs,
        })
        expect(removed).toMatchObject({ outcome: 'succeeded' })
        await sendInput(tree, fresh, 'start: search')
        const gone = await searched(tree, fresh, 5)
        expect(mcpOf(gone)).toEqual([])
        expect(gone.withheld ?? []).toEqual([])
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'a call accepted before the endpoint changed the action it calls does not start, and one whose action stayed as it was is sent',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await peerWith(ECHO, FAIL)
    const holds: ReturnType<typeof holdStart>[] = []
    const held = (tree: ReleaseTree) => {
      const hold = holdStart(tree, 'mcp__docs')
      holds.push(hold)
      return hold
    }
    // A held start that is not let go keeps the tree from stopping, so every way out lets them go.
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        at('register docs, automatic')
        const session = await tree.startSession('hello')
        await endedRuns(tree, session, 1)
        const holding = await registered(w, 'docs')
        await configured(w, 'docs', 'target', peer.target, 'docs-target')
        await configured(w, 'docs', 'invoke', 'auto', 'docs-auto')
        await sendInput(tree, session, 'start: call docs echo warm')
        expect(await lastResult(tree, session, 2)).toContain('echo answered warm')

        const login = await loginAccess(tree)
        const discovery = tree.scope.get(mcpActionDiscoveryKey) as ActionDiscovery<unknown>
        const ref = { name: 'docs', holding } as unknown as EndpointRef
        const refreshed = () =>
          settled(
            tree,
            'the changed actions to be published',
            () => discovery.refresh(login, { ref, connectBound: 10_000 as Millis }),
            answer => 'ok' in answer && answer.ok.kind === 'published',
          )

        at('another action changed while the call was held')
        const unrelated = held(tree)
        await sendInput(tree, session, 'start: call docs echo kept')
        await settled(
          tree,
          'the call to be held',
          async () => unrelated.held(),
          held => held === 1,
        )
        peer.offer([ECHO, { ...FAIL, description: 'Refuses, with a new description.' }])
        await refreshed()
        unrelated.go()
        expect(await lastResult(tree, session, 3)).toContain('echo answered kept')

        at('the called action changed while the call was held')
        const changed = held(tree)
        await sendInput(tree, session, 'start: call docs echo stale')
        await settled(
          tree,
          'the call to be held',
          async () => changed.held(),
          held => held === 1,
        )
        peer.offer([{ ...ECHO, description: 'Now it takes a count.', input: 'count' }, FAIL])
        await refreshed()
        changed.go()
        const stale = await lastResult(tree, session, 4)
        expect(stale).toContain('did not start: the definition of the action changed')
        expect(peer.calls.map(call => call.text)).toEqual(['warm', 'kept'])
      }).finally(() => {
        for (const hold of holds) hold.go()
      }),
    )
    expect(exit).toBe(0)
  },
)

// A value only this test writes; the journey looks for it in every answer and every model request.
const CREDENTIAL = 'sk-journey-credential-7c1d'

async function keyed(
  w: World,
  owner: ReturnType<typeof ownerOf> | Readonly<{ kind: 'asset'; category: string; name: string }>,
  item: string,
  secret: string,
) {
  const current = await settled(
    w.tree,
    `the secret ${item} of ${owner.name} to be read`,
    () => w.assets['describe-setting']({ tenant: w.tenant, owner, item }),
    value => value.outcome === 'succeeded',
  )
  if (current.outcome !== 'succeeded') throw new Error('unreachable')
  expect(current.body.item.kind).toBe('secret')
  return w.assets['set-setting']({
    tenant: w.tenant,
    owner,
    item,
    operation: `${owner.name}-${item}`,
    expectedRevision: current.body.item.revision,
    value: { kind: 'secret', secret },
  })
}

it(
  'a secured endpoint is named with its reason until its credential is set; a wrong one is rejected and says so; the right one is then called with, and the value shows in no answer and no model request',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { bodies, script } = scripted()
    const peer = await peerOf([ECHO], { bearer: CREDENTIAL })
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        at('register a secured endpoint')
        const session = await tree.startSession('hello')
        await endedRuns(tree, session, 1)
        await registered(w, 'secured', 'static')
        await configured(w, 'secured', 'target', peer.target, 'secured-target')
        await configured(w, 'secured', 'invoke', 'auto', 'secured-auto')

        at('no credential: named with its reason, not offered')
        await sendInput(tree, session, 'start: search')
        const before = await searched(tree, session, 2)
        expect(mcpOf(before)).toEqual([])
        expect(before.withheld).toEqual([
          { name: 'mcp__secured', reason: expect.stringContaining('credential') },
        ])

        at(
          'a wrong credential: the endpoint rejects it, the person and the agent are told so (C101)',
        )
        expect(await keyed(w, ownerOf('secured'), 'credential', 'not-the-key')).toMatchObject({
          outcome: 'succeeded',
        })
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        expect(await mcp['refresh-endpoint']({ tenant: w.tenant, name: 'secured' })).toMatchObject({
          outcome: 'succeeded',
          body: { refreshed: 'failed' },
        })
        const rejected = await settled(
          tree,
          'the endpoint to show its credential rejected',
          () => mcp['read-endpoint']({ tenant: w.tenant, name: 'secured' }),
          read => read.outcome === 'succeeded' && read.body.endpoint.credentialState === 'rejected',
        )
        expect(rejected).toMatchObject({
          outcome: 'succeeded',
          body: { endpoint: { credential: 'present', credentialState: 'rejected' } },
        })
        await sendInput(tree, session, 'start: search')
        expect((await searched(tree, session, 3)).withheld).toEqual([
          {
            name: 'mcp__secured',
            reason: expect.stringContaining('was rejected by the endpoint'),
          },
        ])
        expect(peer.calls).toEqual([])

        at('the credential is written as a secret')
        expect(await keyed(w, ownerOf('secured'), 'credential', CREDENTIAL)).toMatchObject({
          outcome: 'succeeded',
        })

        at('offered once the credential is set')
        await sendInput(tree, session, 'start: search')
        const after = await searched(tree, session, 4)
        expect(mcpOf(after).map(entry => entry.name)).toEqual(['mcp__secured'])
        expect(after.withheld ?? []).toEqual([])

        at('called with the credential')
        await sendInput(tree, session, 'start: call secured echo keyed')
        expect(await lastResult(tree, session, 5)).toContain('echo answered keyed')
        expect(peer.calls).toEqual([{ action: 'echo', text: 'keyed' }])

        at('the value shows in no answer and no model request')
        const shown = await w.assets['describe-setting']({
          tenant: w.tenant,
          owner: ownerOf('secured'),
          item: 'credential',
        })
        expect(shown).toMatchObject({ outcome: 'succeeded', body: { item: { own: 'available' } } })
        expect(JSON.stringify(shown)).not.toContain(CREDENTIAL)
        expect(bodies.filter(body => body.includes(CREDENTIAL))).toEqual([])

        at('a secret of the release is written where it was')
        const web = { kind: 'asset', category: 'tool', name: 'Web' } as const
        expect(await keyed(w, web, 'exa.apiKey', 'exa-journey-key')).toMatchObject({
          outcome: 'succeeded',
        })
        expect(
          await w.assets['describe-setting']({ tenant: w.tenant, owner: web, item: 'exa.apiKey' }),
        ).toMatchObject({ outcome: 'succeeded', body: { item: { own: 'available' } } })
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'MC-26 AS-28 a program calls the actions of an endpoint only once program calls are on; the agent turns them on through OmneExtensions after a person allows it, and cannot write a gate or a credential that way',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { bodies, script } = scripted()
    const peer = await peerWith(COUNT, ECHO)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        const session = await tree.startSession('start: search')
        await searched(tree, session, 1)
        await registered(w, 'shop')
        await configured(w, 'shop', 'target', peer.target, 'shop-target')
        expect(await described(w, 'shop', 'program-calls')).toMatchObject({ kind: 'ordinary' })

        at('a program names the endpoint while program calls are off')
        await sendInput(tree, session, 'start: code count')
        const closed = await lastResult(tree, session, 2)
        expect(closed).toContain('refused')
        expect(closed).toContain('"kind":null')
        expect(peer.calls).toEqual([])
        expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])

        at('the agent reads the settings of the endpoint: no secret value, no permission')
        await sendInput(tree, session, 'start: extensions settings')
        const read = await lastResult(tree, session, 3)
        expect(read).toContain('done OmneExtensions settings mcp shop')
        expect(read).toMatch(/program-calls\s+false\s+default\s+boolean/u)
        expect(read).toMatch(/invoke\s+permission\s+not read here/u)

        at('the agent asks to turn program calls on: a person is asked, then it is written')
        await sendInput(tree, session, 'start: extensions open')
        const asking = await pendingCard(tree, session, 'the write of the setting')
        const shown = JSON.stringify(asking.question)
        expect(asking.question).toMatchObject({
          kind: 'release',
          target: { tool: 'OmneExtensions' },
        })
        for (const said of ['改设置', 'mcp', 'shop', 'program-calls', 'true'])
          expect(shown).toContain(said)
        expect(await described(w, 'shop', 'program-calls')).toMatchObject({
          own: { kind: 'unset' },
        })
        await answerCard(tree, asking, ['--option', 'allow-once'], 'reply-open')
        const opened = await lastResult(tree, session, 4)
        expect(opened).toContain('"item":"program-calls","value":true,"changed":true}')
        expect(await described(w, 'shop', 'program-calls')).toMatchObject({
          own: { kind: 'set', value: { kind: 'boolean', value: true } },
        })

        at(
          'the agent asks to write the gate of the endpoint: allowed by a person, it is still not written',
        )
        await sendInput(tree, session, 'start: extensions grab-gate')
        const grabbing = await pendingCard(tree, session, 'the write of the gate')
        await answerCard(tree, grabbing, ['--option', 'allow-once'], 'reply-grab')
        const grabbed = await lastResult(tree, session, 5)
        expect(grabbed).toContain('invoke is a permission')
        expect(await described(w, 'shop', 'invoke')).toMatchObject({
          kind: 'permission',
          own: null,
          effective: { kind: 'value', value: 'ask' },
        })

        at(
          'a secured endpoint: the agent reads only whether its credential is set, and cannot write it',
        )
        await registered(w, 'vault', 'static')
        await sendInput(tree, session, 'start: extensions vault-settings')
        const vault = await lastResult(tree, session, 6)
        expect(vault).toMatch(/credential\s+secret\s+not set/u)
        await sendInput(tree, session, 'start: extensions grab-secret')
        const taking = await pendingCard(tree, session, 'the write of the credential')
        await answerCard(tree, taking, ['--option', 'allow-once'], 'reply-secret')
        expect(await lastResult(tree, session, 7)).toContain('credential is a secret')
        await sendInput(tree, session, 'start: extensions vault-settings')
        expect(await lastResult(tree, session, 8)).toBe(vault)

        at('program calls are on: the call of the program asks, then answers')
        await sendInput(tree, session, 'start: code count')
        const card = await pendingCard(tree, session, 'the call the program made')
        expect(card.question).toMatchObject({
          kind: 'release',
          target: { tool: 'mcp__shop', command: 'count' },
          origin: { program: true },
        })
        expect(peer.calls).toEqual([])
        await answerCard(tree, card, ['--option', 'allow-session'], 'reply-count')
        const counted = await lastResult(tree, session, 9)
        expect(counted).toContain('done Code execute')
        expect(counted).toContain('"length":4')
        expect(peer.calls).toEqual([{ action: 'count', text: 'four' }])

        at('a search for what a program can call finds the endpoint, with its functions')
        await sendInput(tree, session, 'start: callable')
        const callable = mcpOf(await searched(tree, session, 10))
        expect(callable.map(entry => entry.name)).toEqual(['mcp__shop'])
        expect(callable[0]?.program).toContain('declare const mcp__shop')
        expect(callable[0]?.program).toContain('count(')

        at('an action without an output schema gives the program its content items')
        await sendInput(tree, session, 'start: code plain')
        const plain = await lastResult(tree, session, 11)
        expect(plain).toContain('"type":"text"')
        expect(plain).toContain('echo answered plain')
        expect(plain).not.toContain('refused')

        at('the holder turns program calls off again')
        await configured(w, 'shop', 'program-calls', false, 'shop-closed')
        await sendInput(tree, session, 'start: code count')
        expect(await lastResult(tree, session, 12)).toContain('"kind":null')
        expect(peer.calls).toHaveLength(2)
        await sendInput(tree, session, 'start: callable')
        expect(mcpOf(await searched(tree, session, 13))).toEqual([])

        at(
          'TL-75 what a program can call is told by Tools alone: resident tools too, and no declaration',
        )
        await sendInput(tree, session, 'start: files a program calls')
        const files = (await searched(tree, session, 14)).tools.find(
          entry => entry.name === 'Files',
        )
        expect(files).toMatchObject({ resident: true })
        expect(files?.program).toContain('declare const Files')
        const declared = (
          JSON.parse(bodies.at(-1) ?? '{}') as {
            tools?: { function: { name: string; description: string } }[]
          }
        ).tools
        expect(declared?.map(tool => tool.function.name)).toContain('Code')
        for (const tool of declared ?? []) {
          expect(tool.function.description, tool.function.name).not.toContain('declare const')
          expect(tool.function.description, tool.function.name).not.toContain('Program data')
        }
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'C105 publishing a new body of an endpoint keeps the settings it had: the address, the gate and the credential',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await peerWith(ECHO)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        at('register docs and set its three settings')
        await registered(w, 'docs', 'static')
        await configured(w, 'docs', 'target', peer.target, 'docs-target')
        await configured(w, 'docs', 'invoke', 'auto', 'docs-auto')
        expect(await keyed(w, ownerOf('docs'), 'credential', CREDENTIAL)).toMatchObject({
          outcome: 'succeeded',
        })
        const effectiveOf = async (item: string) =>
          ((await described(w, 'docs', item)) as Readonly<{ effective?: unknown }>).effective
        const before = { target: await effectiveOf('target'), invoke: await effectiveOf('invoke') }
        expect(before.target).toMatchObject({
          value: { kind: 'set', value: { kind: 'string', value: peer.target } },
        })

        at('publish a new body under the same name')
        const replaced = await w.assets['create-asset']({
          tenant: w.tenant,
          operation: 'replace-docs',
          category: 'mcp',
          name: 'docs',
          body: bodyOf('docs', 'oauth') as never,
        })
        expect(replaced, JSON.stringify(replaced)).toMatchObject({ outcome: 'succeeded' })

        at('the three settings are as they were')
        await settled(
          tree,
          'the gate of docs to be a permission again',
          () => settingOf(w.assets, w.tenant, 'docs', 'invoke'),
          value => value.outcome === 'succeeded' && value.body.item.kind === 'permission',
        )
        expect(await effectiveOf('target')).toEqual(before.target)
        expect(await effectiveOf('invoke')).toEqual(before.invoke)
        expect(await described(w, 'docs', 'credential')).toMatchObject({ own: 'available' })
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'C106 MC-31 after a restart the catalog of an endpoint is read from storage with the freshness it was acquired with, not listed again; an endpoint disabled or removed before the restart is not usable after it',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await peerWith(ECHO, FAIL)
    const ref = (name: string, holding: string) => ({ name, holding }) as unknown as EndpointRef
    const holdings: Record<string, string> = {}
    let before: unknown
    const discoveryOf = (tree: ReleaseTree) =>
      tree.scope.get(mcpActionDiscoveryKey) as ActionDiscovery<unknown>
    const exits = await onReleaseTreeRuns(options(script), [
      async tree => {
        const w = world(tree)
        const login = await loginAccess(tree)
        for (const name of ['docs', 'off', 'gone']) {
          holdings[name] = await registered(w, name)
          await configured(w, name, 'target', peer.target, `${name}-target`)
          const published = await settled(
            tree,
            `the catalog of ${name} to be published`,
            () =>
              discoveryOf(tree).refresh(login, {
                ref: ref(name, holdings[name] ?? ''),
                connectBound: 10_000 as Millis,
              }),
            answer => 'ok' in answer && answer.ok.kind === 'published',
          )
          expect(published).toMatchObject({ ok: { kind: 'published' } })
        }
        before = await discoveryOf(tree).current(login, ref('docs', holdings['docs'] ?? ''))
        expect(before).toMatchObject({ ok: { kind: 'acquired' } })
        const disabled = await w.assets['set-asset-enabled']({
          tenant: w.tenant,
          operation: 'off-off',
          holding: holdings['off'] ?? '',
          enabled: false,
        })
        expect(disabled).toMatchObject({ outcome: 'succeeded' })
        const removed = await w.assets['remove-asset']({
          tenant: w.tenant,
          operation: 'gone-gone',
          holding: holdings['gone'] ?? '',
        })
        expect(removed).toMatchObject({ outcome: 'succeeded' })
      },
      async tree => {
        const login = await loginAccess(tree)
        const after = await settled(
          tree,
          'the stored catalog of docs to be read after the restart',
          () => discoveryOf(tree).current(login, ref('docs', holdings['docs'] ?? '')),
          answer => 'ok' in answer,
        )
        // The same revision and the same moment it was acquired: read from storage, not listed again;
        // there is no connection yet after the restart.
        const was = (before as { ok: Readonly<Record<string, unknown>> }).ok
        expect(after).toEqual({ ok: { ...was, basisCurrent: 'no-connection' } })
        expect(
          await discoveryOf(tree).current(login, ref('off', holdings['off'] ?? '')),
        ).toMatchObject({ failure: { kind: 'blocked' } })
        expect(
          await discoveryOf(tree).current(login, ref('gone', holdings['gone'] ?? '')),
        ).toMatchObject({ failure: { kind: 'not-available-to-you' } })
      },
    ])
    expect(exits).toEqual([0, 0])
  },
)

it(
  'C107 C112 a peer that adds an action and says so: the catalog follows without a refresh, and mcp/v1 tells the page',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await modernPeer([ECHO])
    peers.push(peer)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const names = async () => {
          const read = await mcp['read-endpoint']({ tenant: w.tenant, name: 'live' })
          return read.outcome === 'succeeded' ? (read.body.actions?.map(a => a.name) ?? null) : null
        }
        at('register live, point it at the peer and fetch its actions once')
        await registered(w, 'live')
        await configured(w, 'live', 'target', peer.target, 'live-target')
        expect(await mcp['refresh-endpoint']({ tenant: w.tenant, name: 'live' })).toMatchObject({
          outcome: 'succeeded',
          body: { refreshed: 'published' },
        })
        expect(await names()).toEqual(['book', 'echo', 'report'])

        at('observe the endpoints: the first frame comes at once')
        const controller = new AbortController()
        const frames = mcp.observe['observe-endpoints'](
          { tenant: w.tenant },
          { signal: controller.signal },
        )
        expect(await frames.next()).toEqual({
          done: false,
          value: { kind: 'changed', about: 'endpoints' },
        })
        await settled(
          tree,
          'the long request to be open',
          async () => peer.asked.get('subscriptions/listen') ?? 0,
          count => count === 1,
        )
        const listed = peer.asked.get('tools/list') ?? 0

        at('the peer adds an action and says so; nobody refreshes')
        peer.offer([ECHO, { name: 'write', description: 'Writes the text.', answer: 'echo' }])
        await settled(
          tree,
          'the peer to be listed once more',
          async () => Object.fromEntries(peer.asked),
          asked => asked['tools/list'] === listed + 1,
        )
        expect(await frames.next()).toEqual({
          done: false,
          value: { kind: 'changed', about: 'endpoints' },
        })
        expect(await names()).toEqual(['book', 'echo', 'report', 'write'])
        expect(peer.asked.get('tools/list')).toBe(listed + 1)
        expect(peer.asked.get('subscriptions/listen')).toBe(1)
        expect(peer.asked.get('tools/call') ?? 0).toBe(0)
        controller.abort()
      }),
    )
    expect(exit).toBe(0)
  },
)

// An endpoint `desk` on a 2026-07-28 peer whose `book` asks a person which day; calls run without a release card.
async function asking(tree: ReleaseTree, peer: ModernPeer) {
  const w = world(tree)
  await registered(w, 'desk')
  await configured(w, 'desk', 'target', peer.target, 'desk-target')
  await configured(w, 'desk', 'invoke', 'auto', 'desk-auto')
}

const DAY_CARD = 'the question of desk'

it(
  'C109 MC-30 a peer that asks for input: the person gets a card that names the endpoint and marks its words, the answer goes back once, and the call ends with what the peer answers',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await modernPeer([ECHO])
    peers.push(peer)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        await asking(tree, peer)
        at('the agent calls book: a card asks which day, and nothing more goes to the peer')
        const session = await tree.startSession('start: call desk book a')
        const card = await pendingCard(tree, session, DAY_CARD)
        const question = JSON.stringify(card.question)
        expect(question).toContain('desk')
        expect(question).toContain('Which day for room a?')
        expect(question).toContain('[external data begins')
        expect(peer.answers).toEqual([])
        expect(peer.asked.get('tools/call')).toBe(1)
        expect(await lastResult(tree, session, 1)).toContain('"reason":"waiting"')

        at(
          'the person answers after the turn ended: the call goes on once and ends with the booking',
        )
        await answerCard(tree, card, ['--text', 'Tuesday'], 'reply-day')
        await settled(
          tree,
          'the answer to reach the peer',
          async () => peer.answers.length,
          n => n === 1,
        )
        await sendInput(tree, session, 'start: read again')
        expect(await lastResult(tree, session, 2)).toContain('booked room a on Tuesday')
        expect(peer.answers).toHaveLength(1)
        expect(peer.asked.get('tools/call')).toBe(2)
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'C110 a call parked on its question across a restart: the card is still there, and after the answer the call ends with what the peer answers, sent once',
  { tags: ['slow'], timeout: 900_000 },
  async () => {
    const { script } = scripted()
    const peer = await modernPeer([ECHO])
    peers.push(peer)
    let parked = ''
    const exits = await onReleaseTreeRuns(options(script), [
      async tree => {
        await asking(tree, peer)
        parked = await tree.startSession('start: call desk book a')
        await pendingCard(tree, parked, DAY_CARD)
        await endedRuns(tree, parked, 1)
      },
      async tree => {
        const card = await pendingCard(tree, parked, `${DAY_CARD} after the restart`)
        expect(JSON.stringify(card.question)).toContain('Which day for room a?')
        expect(peer.answers).toEqual([])
        await answerCard(tree, card, ['--text', 'Tuesday'], 'reply-a')
        await settled(
          tree,
          'the answer for a to reach the peer',
          async () => peer.answers.length,
          n => n === 1,
        )
        await sendInput(tree, parked, 'start: read again')
        expect(await lastResult(tree, parked, 2)).toContain('booked room a on Tuesday')
        expect(peer.asked.get('tools/call')).toBe(2)
      },
    ])
    expect(exits).toEqual([0, 0])
  },
)

// The call of `report` on desk, as the Tool ledger has it.
const reportCall = (tree: ReleaseTree) =>
  toolLedger(tree.storageRoot).find(row => row.tool === 'mcp__desk')

async function reportSettled(tree: ReleaseTree, what: string) {
  return settled(
    tree,
    what,
    async () => reportCall(tree),
    row => row?.phase === 'settled',
  )
}

it(
  'C111 MC-28 MC-29 a peer that makes the call a task: the call waits for it, a question of the task goes to a person and back by tasks/update, and the call ends with the result; tools/call is sent once',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const peer = await modernPeer([ECHO])
    peers.push(peer)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        await asking(tree, peer)
        at('the agent calls report: the peer makes a task, and the call waits for it')
        const session = await tree.startSession('start: call desk report a')
        await settled(
          tree,
          'the task to be made',
          async () => peer.tasks.list().length,
          n => n === 1,
        )
        expect(await lastResult(tree, session, 1)).toContain('"reason":"waiting"')
        expect(reportCall(tree)?.phase).not.toBe('settled')

        at('the task asks which format: a card names the endpoint, the answer goes back once')
        peer.tasks.ask()
        const card = await pendingCard(tree, session, 'the question of the task')
        expect(JSON.stringify(card.question)).toContain('Which format should the report have?')
        await answerCard(tree, card, ['--text', 'pdf'], 'reply-format')
        await settled(
          tree,
          'the answer to reach the task',
          async () => peer.tasks.list()[0]?.updates.length,
          n => n === 1,
        )

        at('the task finishes: the call ends with its result, and nothing was sent twice')
        peer.tasks.finish()
        await reportSettled(tree, 'the call of report to end')
        await sendInput(tree, session, 'start: read again')
        expect(await lastResult(tree, session, 2)).toContain('report on a as pdf')
        expect(peer.asked.get('tools/call')).toBe(1)
        expect(peer.asked.get('tasks/update')).toBe(1)
        expect(peer.asked.get('tasks/cancel')).toBeUndefined()
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'C111 a call waiting for its task across a restart goes on waiting, and ends with the result; tools/call is sent once',
  { tags: ['slow'], timeout: 900_000 },
  async () => {
    const { script } = scripted()
    const peer = await modernPeer([ECHO])
    peers.push(peer)
    let waiting = ''
    const exits = await onReleaseTreeRuns(options(script), [
      async tree => {
        await asking(tree, peer)
        waiting = await tree.startSession('start: call desk report a')
        await settled(
          tree,
          'the task to be made',
          async () => peer.tasks.list().length,
          n => n === 1,
        )
        await endedRuns(tree, waiting, 1)
      },
      async tree => {
        const before = peer.asked.get('tasks/get') ?? 0
        await settled(
          tree,
          'the watcher to look at the working task again after the restart',
          async () => (peer.asked.get('tasks/get') ?? 0) - before,
          n => n >= 2,
        )
        peer.tasks.finish()
        await reportSettled(tree, 'the call of report to end after the restart')
        expect(peer.asked.get('tasks/get') ?? 0).toBeGreaterThan(before)
        await sendInput(tree, waiting, 'start: read again')
        expect(await lastResult(tree, waiting, 2)).toContain('report on a')
        expect(peer.asked.get('tools/call')).toBe(1)
      },
    ])
    expect(exits).toEqual([0, 0])
  },
)

it(
  'C301 a peer that offers events has its kinds of events listed with their delivery, in mcp/v1 and the command line; one that offers none is said so',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const incident = {
      name: 'incident.created',
      description: 'An incident was opened.',
      delivery: ['poll', 'push'],
      inputSchema: { type: 'object', properties: { service: { type: 'string' } } },
      payloadSchema: { type: 'object' },
    }
    const deploy = {
      ...incident,
      name: 'deploy.done',
      description: 'A deploy finished.',
      delivery: ['webhook'],
    }
    const peer = await modernPeer([ECHO], { events: [incident, deploy] })
    const plain = await modernPeer([ECHO])
    peers.push(peer, plain)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        at('register one endpoint at each peer and fetch their actions')
        for (const [name, target] of [
          ['live', peer.target],
          ['plain', plain.target],
        ] as const) {
          await registered(w, name)
          await configured(w, name, 'target', target, `${name}-target`)
          expect(await mcp['refresh-endpoint']({ tenant: w.tenant, name })).toMatchObject({
            outcome: 'succeeded',
            body: { refreshed: 'published' },
          })
        }
        at('list the kinds of events of each')
        expect(await mcp['list-event-types']({ tenant: w.tenant, name: 'live' })).toEqual({
          outcome: 'succeeded',
          body: {
            events: {
              kind: 'acquired',
              types: [
                {
                  name: 'incident.created',
                  description: 'An incident was opened.',
                  delivery: ['poll', 'push'],
                },
                { name: 'deploy.done', description: 'A deploy finished.', delivery: ['webhook'] },
              ],
            },
          },
        })
        expect(await mcp['list-event-types']({ tenant: w.tenant, name: 'plain' })).toEqual({
          outcome: 'succeeded',
          body: { events: { kind: 'not-declared' } },
        })
        expect(plain.asked.get('events/list') ?? 0).toBe(0)
        at('the command line prints them')
        const printed = await tree.cli(['mcp', 'events', 'live'])
        expect(printed.status).toBe(0)
        expect(printed.stdout).toMatch(/incident\.created\s+poll,push\s+An incident was opened\./u)
        expect((await tree.cli(['mcp', 'events', 'plain'])).stdout).toBe(
          'The endpoint offers no events.\n',
        )
      }),
    )
    expect(exit).toBe(0)
  },
)

it(
  'C302 C303 C305 subscribed events come in by push and by poll, are stored once, carry on from where they stood across a restart, and stop when the peer ends them or the last subscriber leaves',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const type = (name: string, delivery: readonly string[]) => ({
      name,
      description: `${name} happened`,
      delivery,
      inputSchema: { type: 'object', properties: { service: { type: 'string' } } },
      payloadSchema: { type: 'object' },
    })
    const peer = await modernPeer([ECHO], {
      events: [
        type('incident.created', ['poll', 'push']),
        type('watch.tick', ['poll']),
        type('deploy.done', ['webhook']),
      ],
    })
    peers.push(peer)
    const named = (tenant: TenantId, event: string) => ({
      tenant,
      name: 'live',
      event,
      arguments: { kind: 'object', entries: [] } as never,
    })
    const clientOf = (tree: ReleaseTree) =>
      createClient(mcpProtocol, protocolTransport(originOf(tree.port), savedCredentials(tree.home)))
    const idsOf = (read: unknown) =>
      (read as { body: { items: { kind: string; eventId?: string }[] } }).body.items.map(item =>
        item.kind === 'event' ? item.eventId : `gap`,
      )
    const received = (tree: ReleaseTree, tenant: TenantId, event: string, count: number) =>
      settled(
        tree,
        `${String(count)} ${event} events to be stored`,
        () => clientOf(tree)['read-events']({ ...named(tenant, event), after: 0, limit: 50 }),
        read => read.outcome === 'succeeded' && read.body.items.length >= count,
      )
    const exits = await onReleaseTreeRuns(
      {
        ...options(script),
        beforeRun: async run => {
          if (run !== 1) return
          peer.log.replay(true)
          for (const id of [2, 3, 4]) peer.log.emit('incident.created', { id })
        },
      },
      [
        tree =>
          journey(tree, LIMIT_MS, async at => {
            const w = world(tree)
            const mcp = clientOf(tree)
            at('register the endpoint and take its actions and its kinds of events')
            await registered(w, 'live')
            await configured(w, 'live', 'target', peer.target, 'live-target')
            expect(await mcp['refresh-endpoint']({ tenant: w.tenant, name: 'live' })).toMatchObject(
              {
                body: { refreshed: 'published' },
              },
            )
            at(
              'subscribe: push where the peer pushes, poll where it only polls, none where it only calls back',
            )
            const subscribed = await tree.cli(['mcp', 'subscribe', 'live', 'incident.created'])
            expect(subscribed.stdout).toBe('subscribed to incident.created: push, receiving\n')
            expect(await mcp['subscribe-events'](named(w.tenant, 'watch.tick'))).toMatchObject({
              outcome: 'succeeded',
              body: { subscription: { delivery: 'poll', state: 'receiving' } },
            })
            expect(await mcp['subscribe-events'](named(w.tenant, 'deploy.done'))).toEqual({
              outcome: 'unsupported',
              body: { reason: 'webhook-only' },
            })
            await settled(
              tree,
              'the stream to be open',
              async () => peer.log.open(),
              open => open === 1,
            )
            at('what happens at the peer comes in, by both')
            peer.log.emit('incident.created', { id: 1 })
            peer.log.emit('watch.tick', { at: 1 })
            expect(idsOf(await received(tree, w.tenant, 'incident.created', 1))).toEqual(['ev-1'])
            expect(idsOf(await received(tree, w.tenant, 'watch.tick', 1))).toEqual(['ev-2'])
            const tail = await tree.cli(['mcp', 'tail', 'live', 'incident.created'])
            expect(tail.status).toBe(0)
            expect(tail.stdout).toMatch(
              /^Subscription: incident\.created, push, receiving\n1 {2}\S+ {2}ev-1 {2}\{"id":1\}\n$/u,
            )
          }),
        tree =>
          journey(tree, LIMIT_MS, async at => {
            const w = world(tree)
            const mcp = clientOf(tree)
            at(
              'after the restart it carries on from where it stood: the three that came meanwhile, the one sent again kept once',
            )
            const after = await received(tree, w.tenant, 'incident.created', 4)
            expect(idsOf(after)).toEqual(['ev-1', 'ev-3', 'ev-4', 'ev-5'])
            expect(peer.log.sent().filter(id => id === 'ev-1')).toEqual(['ev-1', 'ev-1'])
            await settled(
              tree,
              'the stream to be open again',
              async () => peer.log.open(),
              open => open === 1,
            )
            at('the peer ends it: it is ended, and not asked for again')
            peer.log.terminate(-32024)
            const ended = await settled(
              tree,
              'the subscription to be ended',
              () =>
                mcp['read-events']({ ...named(w.tenant, 'incident.created'), after: 0, limit: 50 }),
              read => read.outcome === 'succeeded' && read.body.subscription.state === 'terminated',
            )
            expect(ended).toMatchObject({ body: { subscription: { reason: 'refused' } } })
            const tail = (await tree.cli(['mcp', 'tail', 'live', 'incident.created'])).stdout
            expect(tail).toMatch(
              /^Subscription: incident\.created, push, terminated \(refused\)\n/u,
            )
            expect(tail).toMatch(/\n\d+ {2}-- ended: refused\n$/u)
            at('the person logs in again and leaves as the same subscriber: the subscription goes')
            await tree.relogin()
            const again = clientOf(tree)
            for (const event of ['incident.created', 'watch.tick'])
              expect(await again['unsubscribe-events'](named(w.tenant, event))).toEqual({
                outcome: 'succeeded',
                body: { unsubscribed: 'unsubscribed' },
              })
            expect(
              await again['read-events']({ ...named(w.tenant, 'watch.tick'), after: 0, limit: 50 }),
            ).toEqual({ outcome: 'not-found', body: {} })
            expect(peer.log.open()).toBe(0)
          }),
      ],
    )
    expect(exits).toEqual([0, 0])
  },
)

it(
  'C304 C305 a subscription ends when its endpoint is disabled, keeping nothing the peer sends after; a peer that ends one because the type is gone has its kinds of events listed again',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const { script } = scripted()
    const type = (name: string) => ({
      name,
      description: `${name} happened`,
      delivery: ['push'],
      inputSchema: { type: 'object' },
      payloadSchema: { type: 'object' },
    })
    const peer = await modernPeer([ECHO], {
      events: [type('incident.created'), type('deploy.done')],
    })
    peers.push(peer)
    const exit = await onReleaseTree(options(script), tree =>
      journey(tree, LIMIT_MS, async at => {
        const w = world(tree)
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const named = (event: string) => ({
          tenant: w.tenant,
          name: 'live',
          event,
          arguments: { kind: 'object', entries: [] } as never,
        })
        const read = (event: string) => mcp['read-events']({ ...named(event), after: 0, limit: 50 })
        at('register, subscribe, and take one event in')
        const holding = await registered(w, 'live')
        await configured(w, 'live', 'target', peer.target, 'live-target')
        await mcp['refresh-endpoint']({ tenant: w.tenant, name: 'live' })
        expect(await mcp['subscribe-events'](named('incident.created'))).toMatchObject({
          outcome: 'succeeded',
        })
        await settled(
          tree,
          'the stream to be open',
          async () => peer.log.open(),
          open => open === 1,
        )
        peer.log.emit('incident.created', { id: 1 })
        await settled(
          tree,
          'the first event to be stored',
          () => read('incident.created'),
          answer => answer.outcome === 'succeeded' && answer.body.items.length === 1,
        )
        at('disable the endpoint: what the peer sends after is not kept, and the stream closes')
        const off = await w.assets['set-asset-enabled']({
          tenant: w.tenant,
          operation: 'live-off',
          holding,
          enabled: false,
        })
        expect(off).toMatchObject({ outcome: 'succeeded' })
        peer.log.emit('incident.created', { id: 2 })
        await settled(
          tree,
          'the stream to close',
          async () => peer.log.open(),
          open => open === 0,
        )
        const on = await w.assets['set-asset-enabled']({
          tenant: w.tenant,
          operation: 'live-on',
          holding,
          enabled: true,
        })
        expect(on).toMatchObject({ outcome: 'succeeded' })
        const ended = await read('incident.created')
        expect(ended).toMatchObject({
          outcome: 'succeeded',
          body: { subscription: { state: 'terminated', reason: 'unavailable' } },
        })
        expect(ended.outcome === 'succeeded' && ended.body.items.map(item => item.kind)).toEqual([
          'event',
          'ended',
        ])
        at(
          'the peer ends another because its type is gone: ended, and the kinds of events are listed again',
        )
        expect(await mcp['subscribe-events'](named('deploy.done'))).toMatchObject({
          outcome: 'succeeded',
        })
        await settled(
          tree,
          'the stream to be open',
          async () => peer.log.open(),
          open => open === 1,
        )
        const listed = peer.asked.get('events/list') ?? 0
        peer.log.terminate(-32023)
        const gone = await settled(
          tree,
          'the subscription to be ended',
          () => read('deploy.done'),
          answer =>
            answer.outcome === 'succeeded' && answer.body.subscription.state === 'terminated',
        )
        expect(gone).toMatchObject({ body: { subscription: { reason: 'type-gone' } } })
        await settled(
          tree,
          'the kinds of events to be listed again',
          async () => peer.asked.get('events/list') ?? 0,
          count => count > listed,
        )
      }),
    )
    expect(exit).toBe(0)
  },
)
