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
import { onReleaseTree, toolCallsByRequest, type ReleaseTree } from '../../support/release-tree.ts'
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
import { testPeer, type PeerAction, type PeerOptions, type TestPeer } from './peer.ts'

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
const bodyOf = (name: string, auth: 'none' | 'static'): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'name', value: text(name) },
    { key: 'transport', value: text('streamable-http') },
    { key: 'auth', value: text(auth) },
  ],
})

const peers: TestPeer[] = []
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
