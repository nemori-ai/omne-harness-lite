// @module-tag slow
// Starts the release tree: a held plugin a client could not load is a standing item of its tenant.
import { request } from 'node:http'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { runtimeContextTenantScopeKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { tenantScopeIssuerOf } from '../../../src/entry/principals.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; json: any }>

function call(tree: ReleaseTree, path: string, body: unknown) {
  const text = JSON.stringify(body)
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-${Math.random()}`,
        },
      },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          reply += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(reply) }))
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

/** Reads Notification's need through the tenant-level scope: the standing items of the extensions open now. */
async function extensionItems(tree: ReleaseTree): Promise<readonly any[]> {
  const { tenant } = tree.registrar()
  const principal = tenantScopeIssuerOf(tree.env)(tenant)
  const scope = tree.scope.get(runtimeContextTenantScopeKey)
  if (principal === undefined || scope === undefined) return []
  const read: any = await scope.read(principal, tenant, {
    consumer: 'coordinator',
    blocks: [],
    needs: ['notification.standing-items'],
  })
  if ('failure' in read) return []
  return read.ok.entries
    .filter((entry: any) => entry.kind === 'value')
    .flatMap((entry: any) => entry.value)
    .filter((item: any) => item.source === 'extensions.changes')
}

const manifest = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'A theme with a name that is no token.',
  client: { members: [{ point: 'shell.tokens', key: 'shell.app', data: { '--accent': 'green' } }] },
})

describe('the plugin-notification row', () => {
  it(
    'makes the extensions a notification source: a held plugin a client could not load stands until it loads or is disabled',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await tree.startSession('hello')
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)
        const sources = await call(tree, '/api/notification/v2/list-sources', {
          tenant: tenantText,
        })
        const extensions = sources.json.body.sources.find(
          (source: any) => source.name === 'extensions.changes',
        )
        expect(extensions?.types.map((type: any) => [type.name, type.kind])).toEqual([
          ['load-failed', 'standing'],
          ['point-added', 'event'],
          ['category-added', 'event'],
        ])
        expect(await extensionItems(tree)).toEqual([])

        const made = await uploadPlugin(tree.clients.assets, tenant, 'tidy', {
          'plugin.json': manifest,
        })
        expect(made.outcome).toBe('succeeded')
        const plugins = createClient(
          pluginProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const watching = new AbortController()
        const frames = plugins.observe['observe-wanted'](
          { tenant, side: 'client', client: 'desktop-1' },
          { signal: watching.signal },
        )
        await frames.next()
        const wanted = await plugins['list-wanted']({ tenant, side: 'client' })
        if (wanted.outcome !== 'succeeded') throw new Error(JSON.stringify(wanted))
        const [tidy] = wanted.body.plugins
        expect(await extensionItems(tree)).toEqual([])

        const report = (state: 'loaded' | 'failed', reason: string | null) =>
          plugins['report-loaded']({
            tenant,
            client: 'desktop-1',
            plugins: [{ name: 'tidy', version: tidy!.version, state, reason }],
            points: [],
            parts: [],
          })
        const why = 'shell.tokens shell.app: --accent is not a token of the interface'
        expect((await report('failed', why)).outcome).toBe('succeeded')
        const [item] = await extensionItems(tree)
        expect(item).toMatchObject({
          id: 'extensions.changes/plugin/tidy/load-failed',
          type: 'load-failed',
          subject: 'plugin:tidy',
          title: `plugin tidy 装不上：${why}`,
          locator: { kind: 'extension', ref: 'plugin:tidy' },
        })
        expect(Number.isNaN(Date.parse(item.since))).toBe(false)

        expect((await report('loaded', null)).outcome).toBe('succeeded')
        expect(await extensionItems(tree)).toEqual([])
        expect((await report('failed', why)).outcome).toBe('succeeded')
        expect(await extensionItems(tree)).toHaveLength(1)

        watching.abort()
        await until(
          async () => (await extensionItems(tree)).length === 0,
          'the item to go when the client that could not load it is gone',
          30_000,
        )
      })
      expect(exitCode).toBe(0)
    },
  )
})
