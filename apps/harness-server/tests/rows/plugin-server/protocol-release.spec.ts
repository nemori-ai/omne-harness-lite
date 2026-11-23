import { request } from 'node:http'
import { dirname, join } from 'node:path'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { originOf, protocolTransport, tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'Posts a note for the one who calls it.',
  server: {
    needs: ['notifications'],
    members: [{ point: 'access.protocols', key: 'tidy/v1', module: 'protocol.js', export: 'make' }],
  },
})

/** The plugin keeps the ports of one call in a variable of its own, and tries them in a later call. */
const PROTOCOL = `let kept
const post = (tenant, eventId) => ({
  identity: { tenant, source: 'owner.posts', eventId },
  event: {
    type: 'post', subject: null, at: new Date().toISOString(),
    content: { title: 'from tidy', body: '', locator: null },
    replaceKey: null, renotify: false, named: [{ kind: 'person' }], origin: null,
  },
})
const text = { kind: 'text' }
export function make() {
  return {
    contract: {
      name: 'tidy',
      major: 1,
      operations: {
        post: {
          effect: 'commit',
          limit: 'small',
          body: { kind: 'object', fields: { to: { rule: text }, event: { rule: text }, later: { rule: { kind: 'boolean' } } } },
          result: text,
        },
      },
    },
    handlers: {
      async post(input, { ports }) {
        const port = input.later ? kept : ports.notifications
        kept = ports.notifications
        return { outcome: 'succeeded', body: JSON.stringify(await port.send(post(input.to, input.event))) }
      },
    },
  }
}
`

type Reply = Readonly<{ status: number; text: string; type: string | undefined }>

/** One call as a client makes it, with the login and the tenant it acts for, or neither. */
function post(
  tree: ReleaseTree,
  path: string,
  body: unknown,
  as: Readonly<{ proof?: string; tenant?: string }>,
): Promise<Reply> {
  const text = JSON.stringify(body)
  const headers: Record<string, string> = {
    host: `127.0.0.1:${tree.port}`,
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
    'omne-message-id': `m-${Math.random()}`,
  }
  if (as.proof !== undefined) headers['authorization'] = `Bearer ${as.proof}`
  if (as.tenant !== undefined) headers['omne-acting-tenant'] = as.tenant
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: tree.port, method: 'POST', path, headers },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (reply += chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: reply, type: res.headers['content-type'] }),
        )
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

async function another(tree: ReleaseTree, name: string): Promise<string> {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = originOf(tree.port)
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-3b7e90d1` })
    expect(done.status, done.stderr).toBe(0)
  }
  return home
}

describe("a protocol a tenant's plugin mounts on the server, on the release tree", () => {
  it(
    'only its tenant reaches it, as the caller; another tenant and no login get what a protocol that is not there gets; its ports are judged by the domain and end with the call; disabled it is not there',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const alice = { proof: savedLoginProof(tree.home), tenant: savedTenant(tree.home) }
        const frankHome = await another(tree, 'frank')
        const frank = { proof: savedLoginProof(frankHome), tenant: savedTenant(frankHome) }
        const tenant = tenantOf(alice.tenant)
        const made = await uploadPlugin(tree.clients.assets, tenant, 'tidy', {
          'plugin.json': MANIFEST,
          'protocol.js': PROTOCOL,
        })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        const own = { to: alice.tenant, event: 'e-1', later: false }
        await until(
          async () => (await post(tree, '/api/tidy/v1/post', own, alice)).status === 200,
          'the protocol of the plugin to be mounted for its tenant',
          30_000,
        )

        const sent = await post(tree, '/api/tidy/v1/post', { ...own, event: 'e-2' }, alice)
        expect(JSON.parse(JSON.parse(sent.text).body)).toEqual({
          outcome: 'done',
          value: { recalled: false },
        })

        const elsewhere = { to: frank.tenant, event: 'e-3', later: false }
        const pointed = await post(tree, '/api/tidy/v1/post', elsewhere, alice)
        expect(JSON.parse(JSON.parse(pointed.text).body)).toEqual({
          outcome: 'refused',
          reason: 'not-permitted',
        })

        const stored = await post(
          tree,
          '/api/tidy/v1/post',
          { ...own, event: 'e-4', later: true },
          alice,
        )
        expect(JSON.parse(JSON.parse(stored.text).body)).toEqual({ outcome: 'closed' })

        const nothing = await post(tree, '/api/nothing/v1/post', own, frank)
        expect([nothing.status, nothing.text]).toEqual([
          404,
          '{"kind":"not-executed","reason":"not-mounted"}',
        ])
        for (const as of [
          frank,
          { proof: frank.proof, tenant: alice.tenant },
          {},
          { tenant: alice.tenant },
        ])
          expect(await post(tree, '/api/tidy/v1/post', own, as)).toEqual(nothing)

        const watching = new AbortController()
        const frames: unknown[] = []
        const access = createClient(accessProtocol, protocolTransport(originOf(tree.port)))
        const stream = access.observe['availability']({}, { signal: watching.signal })
        const first = await stream.next()
        frames.push(first.value)
        watching.abort()
        expect(JSON.stringify(frames)).toContain('"plugin"')
        expect(JSON.stringify(frames)).not.toContain('tidy')

        const off = await tree.clients.assets['set-asset-enabled']({
          tenant,
          operation: 'off-1',
          holding: made.body.holding,
          enabled: false,
        })
        expect(off.outcome).toBe('succeeded')
        await until(
          async () => (await post(tree, '/api/tidy/v1/post', own, alice)).status === 404,
          'the protocol to go with the plugin',
          30_000,
        )
        const gone = await post(tree, '/api/tidy/v1/post', own, alice)
        expect([gone.status, gone.text]).toEqual([nothing.status, nothing.text])
      })
      expect(exitCode).toBe(0)
    },
  )
})
