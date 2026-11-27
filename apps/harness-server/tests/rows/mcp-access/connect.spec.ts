// @module-tag slow — every case starts the release tree and a local authorization server.
import { afterEach, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { mcpHoldingRowsKey } from '@omne-harness/mcp-cordis-contract/cordis'
import type { EndpointHolding } from '@omne-harness/mcp-contract'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { savedTenant } from '../../r9/support.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { settled } from '../../support/tools-flow.ts'
import { freePort, testAuthServer } from '../mcp/auth-server.ts'
import { testPeer, type BearerVerdict } from '../mcp/peer.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })
const body = (name: string, auth: string): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'name', value: text(name) },
    { key: 'transport', value: text('streamable-http') },
    { key: 'auth', value: text(auth) },
  ],
})
const owner = (name: string) => ({ kind: 'asset', category: 'mcp', name }) as const

const servers: { close(): Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function registered(tree: ReleaseTree, name: string, auth: string, target: string) {
  const tenant = tenantOf(savedTenant(tree.home))
  const { assets } = tree.clients
  const created = await assets['create-asset']({
    tenant,
    operation: `create-${name}`,
    category: 'mcp',
    name,
    body: body(name, auth) as never,
  })
  if (created.outcome !== 'succeeded') throw new Error(JSON.stringify(created))
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
  return { tenant, holding: created.body.holding as EndpointHolding }
}

const oauthConfig = (callbackPort: number, refreshLeadMs = 60_000) => ({
  mcp: {
    oauth: {
      callbackPort,
      pendingMs: 600_000,
      refreshLeadMs,
      requestMs: 10_000,
      metadataDocument: null,
    },
  },
})

const reachable = (url: string) =>
  fetch(url, { redirect: 'manual' }).then(
    () => true,
    () => false,
  )

it(
  'C201 C206 a person connects an OAuth endpoint: begin answers the address, the browser comes back once to a receiver that then closes, the endpoint is connected, and disconnecting ends it',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const server = await testAuthServer()
    servers.push(server)
    const port = await freePort()
    const callback = `http://127.0.0.1:${String(port)}/callback`
    const exit = await onReleaseTree(
      { script: toolCallsThenText(() => []), rowConfig: oauthConfig(port) },
      async tree => {
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const { tenant } = await registered(tree, 'desk', 'oauth', server.target)
        expect(await reachable(callback)).toBe(false)

        const begun = await mcp['begin-connect']({ tenant, name: 'desk' })
        if (begun.outcome !== 'succeeded') throw new Error(JSON.stringify(begun))
        const url = new URL(begun.body.url)
        expect(url.origin + url.pathname).toBe(`${server.base}/authorize`)
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          response_type: 'code',
          code_challenge_method: 'S256',
          redirect_uri: callback,
          resource: server.target,
        })
        const connecting = await mcp['read-endpoint']({ tenant, name: 'desk' })
        expect(connecting).toMatchObject({
          outcome: 'succeeded',
          body: { endpoint: { credentialState: 'absent', connect: 'connecting' } },
        })

        const bad = await fetch(
          `${callback}?state=forged&code=x&iss=${encodeURIComponent(server.base)}`,
        )
        expect(await bad.text()).toContain('没有连上')
        const consent = await fetch(url, { redirect: 'manual' })
        const back = consent.headers.get('location') ?? ''
        const page = await fetch(back)
        const said = await page.text()
        expect(said).toContain('连上了')
        expect(said).not.toContain('code-')
        expect(server.counts).toMatchObject({ registrations: 1, authorizations: 1, exchanges: 1 })
        expect(await reachable(callback)).toBe(false)

        const connected = await mcp['read-endpoint']({ tenant, name: 'desk' })
        expect(connected).toMatchObject({
          outcome: 'succeeded',
          body: { endpoint: { credentialState: 'present', connect: 'available' } },
        })
        expect(JSON.stringify(connected)).not.toContain('at-1')

        expect(await mcp.disconnect({ tenant, name: 'desk' })).toEqual({
          outcome: 'succeeded',
          body: { disconnected: 'disconnected' },
        })
        expect(await mcp['read-endpoint']({ tenant, name: 'desk' })).toMatchObject({
          outcome: 'succeeded',
          body: { endpoint: { credentialState: 'absent' } },
        })
      },
    )
    expect(exit).toBe(0)
  },
)

it(
  'C201 an endpoint with a static credential cannot be connected, and one whose server does not describe itself says why',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const port = await freePort()
    const exit = await onReleaseTree(
      { script: toolCallsThenText(() => []), rowConfig: oauthConfig(port) },
      async tree => {
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const { tenant } = await registered(tree, 'plain', 'static', 'http://127.0.0.1:9/mcp')
        expect(await mcp['begin-connect']({ tenant, name: 'plain' })).toEqual({
          outcome: 'unsupported',
          body: { reason: 'not-oauth' },
        })
        await registered(tree, 'mute', 'oauth', `http://127.0.0.1:${String(port)}/mcp`)
        expect(await mcp['begin-connect']({ tenant, name: 'mute' })).toMatchObject({
          outcome: 'not-committed',
          body: { reason: 'no-resource-metadata' },
        })
      },
    )
    expect(exit).toBe(0)
  },
)

it(
  'C206 a removed holding loses its OAuth grant with its rows: the rows go only once its grant is disconnected, tokens included',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const server = await testAuthServer()
    servers.push(server)
    const port = await freePort()
    const exit = await onReleaseTree(
      { script: toolCallsThenText(() => []), rowConfig: oauthConfig(port) },
      async tree => {
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const { tenant, holding } = await registered(tree, 'desk', 'oauth', server.target)
        const begun = await mcp['begin-connect']({ tenant, name: 'desk' })
        if (begun.outcome !== 'succeeded') throw new Error(JSON.stringify(begun))
        const consent = await fetch(new URL(begun.body.url), { redirect: 'manual' })
        expect(await (await fetch(consent.headers.get('location') ?? '')).text()).toContain(
          '连上了',
        )

        const rows = tree.scope.get(mcpHoldingRowsKey)
        if (rows === undefined) throw new Error('the rows of MCP are not mounted')
        expect(await rows.kept(tenant)).toEqual({ ok: [{ holding, grants: ['desk'] }] })

        const removed = await tree.clients.assets['remove-asset']({
          tenant,
          operation: 'remove-desk',
          holding,
        })
        expect(removed).toMatchObject({ outcome: 'succeeded' })
        await settled(
          tree,
          'the rows of the removed holding to go',
          async () => (await mcp['list-endpoints']({ tenant }), rows.kept(tenant)),
          value => 'ok' in value && value.ok.length === 0,
        )
      },
    )
    expect(exit).toBe(0)
  },
)

const TOKENS = /\b(?:at|rt|code)-\d+\b/u

it(
  'C204 C205 a connected endpoint is used with its token: refreshed when due, once after a 401; refused again or wanting scopes asks to connect again; no token is ever shown',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const server = await testAuthServer({ expiresIn: 4 })
    servers.push(server)
    let verdict: BearerVerdict | 'check' = 'check'
    const peer = await testPeer([{ name: 'echo', description: 'echoes', answer: 'echo' }], {
      oauth: {
        authorizationServer: server.base,
        check: header => {
          if (verdict !== 'check') return verdict
          const token = header?.replace(/^Bearer /u, '')
          return token === server.latest() ? 'ok' : 'unauthorized'
        },
      },
    })
    servers.push(peer)
    const port = await freePort()
    const said: unknown[] = []
    const exit = await onReleaseTree(
      { script: toolCallsThenText(() => []), rowConfig: oauthConfig(port, 500) },
      async tree => {
        const mcp = createClient(
          mcpProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const { tenant } = await registered(tree, 'desk', 'oauth', peer.target)
        const connect = async () => {
          const begun = await mcp['begin-connect']({ tenant, name: 'desk' })
          if (begun.outcome !== 'succeeded') throw new Error(begun.outcome)
          said.push(begun.body.url)
          const consent = await fetch(new URL(begun.body.url), { redirect: 'manual' })
          const page = await (await fetch(consent.headers.get('location') ?? '')).text()
          expect(page).toContain('连上了')
          return new URL(begun.body.url)
        }
        const refresh = async () => {
          const answer = await mcp['refresh-endpoint']({ tenant, name: 'desk' })
          said.push(answer)
          return answer
        }
        const stateOf = async () => {
          const read = await mcp['read-endpoint']({ tenant, name: 'desk' })
          said.push(read)
          return read.outcome === 'succeeded' ? read.body.endpoint.credentialState : read.outcome
        }
        const published = { outcome: 'succeeded', body: { refreshed: 'published' } }

        await connect()
        expect(await refresh()).toMatchObject(published)
        expect(peer.authorizations.at(-1)?.header).toBe('Bearer at-1')
        // Only what omne sends to the endpoint counts: the peer's port is random and other processes on the machine may probe it.
        const sent = peer.authorizations.filter(({ request }) => / \/mcp(?:\?|$)/u.test(request))
        expect(sent.length).toBeGreaterThan(0)
        expect(sent.filter(({ header }) => !header?.startsWith('Bearer at-'))).toEqual([])

        await new Promise(resolve => setTimeout(resolve, 4_000))
        expect(await refresh()).toMatchObject(published)
        expect(server.counts.refreshes).toBe(1)
        expect(peer.authorizations.at(-1)?.header).toBe('Bearer at-2')

        verdict = 'unauthorized'
        expect(await refresh()).not.toMatchObject(published)
        verdict = 'check'
        await settled(tree, 'a use after the 401 to go through', refresh, answer =>
          JSON.stringify(answer).includes('published'),
        )
        expect(server.counts.refreshes).toBe(2)
        expect(await stateOf()).toBe('present')

        verdict = 'unauthorized'
        expect(await refresh()).not.toMatchObject(published)
        await settled(
          tree,
          'the grant to want a new connection',
          stateOf,
          state => state === 'reconnect-required',
        )
        expect(server.counts.refreshes).toBe(2)

        verdict = 'check'
        await connect()
        expect(await refresh()).toMatchObject(published)
        verdict = 'insufficient-scope'
        expect(await refresh()).not.toMatchObject(published)
        await settled(
          tree,
          'the grant to want the scope',
          stateOf,
          state => state === 'reconnect-required',
        )
        verdict = 'check'
        const asked = await connect()
        expect(asked.searchParams.get('scope')).toBe('read write')

        expect(said.filter(answer => TOKENS.test(JSON.stringify(answer)))).toEqual([])
        expect(tree.serverOutput().filter(line => TOKENS.test(line))).toEqual([])
      },
    )
    expect(exit).toBe(0)
  },
)
