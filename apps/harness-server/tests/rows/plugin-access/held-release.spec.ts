import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { pluginAccessRow } from '../../../src/rows/plugin-access/index.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { runOmne, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolTransport,
  savedClients,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

const manifest = (name: string, accent: string): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: `The ${name} plugin.`,
    client: {
      members: [
        { point: 'shell.tokens', key: name, data: { '--omne-accent': accent } },
        { point: 'notes.card', key: name, module: 'card.js', export: 'card' },
      ],
    },
  })
const CARD = 'export const card = () => () => null\n'.repeat(30)

function devDirectory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-held-')))
  mkdirSync(join(root, 'notes'))
  writeFileSync(join(root, 'notes', 'plugin.json'), manifest('notes', '#111111'))
  writeFileSync(join(root, 'notes', 'card.js'), CARD)
  return root
}

/** Another account on the same tree, with its own home. */
async function another(tree: ReleaseTree, name: string): Promise<string> {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = originOf(tree.port)
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-3b7e90d1` })
    expect(done.status, done.stderr).toBe(0)
  }
  const made = await runOmne({
    args: ['create-session', '--definition', 'coding'],
    home,
    server,
    cwd: base,
  })
  expect(made.status, made.stderr).toBe(0)
  return home
}

const pluginsOf = (tree: ReleaseTree, home: string) =>
  createClient(pluginProtocol, protocolTransport(originOf(tree.port), savedCredentials(home)))

describe('plugin/v1 gives what a tenant holds, on the release tree', () => {
  it(
    'a plugin a login publishes is among what its client is to load, beside the dev directory; disabled it is not; another tenant never has it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const root = devDirectory()
      try {
        const options = {
          script: toolCallsThenText(() => []),
          withoutRows: ['plugin-access'],
          addedRows: [
            {
              id: 'plugin-access',
              plugin: 'pluginAccessRow',
              config: { devDirectory: root },
              definition: pluginAccessRow,
            },
          ],
        }
        const exitCode = await onReleaseTree(options, async tree => {
          await settledSession(tree, 'hello')
          const assets = tree.clients.assets
          const tenantText = savedTenant(tree.home)
          const tenant = tenantOf(tenantText)
          const plugins = pluginsOf(tree, tree.home)
          const wanted = async (client = plugins, of = tenant) => {
            const listed = await client['list-wanted']({ tenant: of, side: 'client' })
            if (listed.outcome !== 'succeeded') throw new Error(JSON.stringify(listed))
            return listed.body.plugins
          }
          expect((await wanted()).map(each => each.name)).toEqual(['notes'])

          const watching = new AbortController()
          const frames: unknown[] = []
          const stream = plugins.observe['observe-wanted'](
            { tenant, side: 'client', client: 'desktop-1' },
            { signal: watching.signal },
          )
          const pumping = (async () => {
            for (;;) {
              const next = await stream.next()
              if (next.done === true) return
              frames.push(next.value)
            }
          })()
          await until(() => frames.length >= 1, 'the first frame', 10_000)

          const files = { 'plugin.json': manifest('tidy', '#0a7a4a'), 'card.js': CARD }
          const made = await uploadPlugin(assets, tenant, 'tidy', files)
          if (made.outcome !== 'succeeded') throw new Error(`commit: ${JSON.stringify(made)}`)
          await until(() => frames.length >= 2, 'a frame after the plugin is published', 10_000)

          const both = await wanted()
          expect(both.map(each => each.name)).toEqual(['notes', 'tidy'])
          const tidy = both[1]!
          expect(tidy.version).toMatch(/^[0-9a-f]{64}$/u)
          expect(JSON.parse(tidy.manifest)).toEqual(JSON.parse(files['plugin.json']))
          expect(tidy.files.map(file => file.path).sort()).toEqual(['card.js', 'plugin.json'])
          expect(await plugins['list-wanted']({ tenant, side: 'server' })).toEqual({
            outcome: 'succeeded',
            body: { plugins: [] },
          })

          const parts: Uint8Array[] = []
          for (let offset: number | null = 0; offset !== null;) {
            const read = await plugins['read-file']({
              tenant,
              name: 'tidy',
              version: tidy.version,
              path: 'card.js',
              offset,
              limit: 400,
            })
            if (read.outcome !== 'succeeded') throw new Error(JSON.stringify(read))
            parts.push(read.body.part)
            offset = read.body.next
          }
          expect(parts.length).toBeGreaterThan(1)
          expect(Buffer.concat(parts).toString()).toBe(CARD)

          const otherHome = await another(tree, 'frank')
          const others = pluginsOf(tree, otherHome)
          const otherTenant = tenantOf(savedTenant(otherHome))
          expect((await wanted(others, otherTenant)).map(each => each.name)).toEqual(['notes'])
          expect(await others['list-wanted']({ tenant, side: 'client' })).toEqual({
            outcome: 'denied',
          })
          expect(
            await others['read-file']({
              tenant: otherTenant,
              name: 'tidy',
              version: tidy.version,
              path: 'card.js',
              offset: 0,
              limit: 10,
            }),
          ).toEqual({ outcome: 'not-found', body: { reason: 'plugin' } })
          const foreign = savedClients(tree.port, otherHome).assets
          await until(
            async () =>
              (
                await foreign['list-assets']({
                  tenant: otherTenant,
                  category: 'plugin',
                  after: null,
                  limit: 1,
                })
              ).outcome === 'succeeded',
            'the assets of the other tenant to open',
            20_000,
          )
          expect(
            (
              await uploadPlugin(foreign, otherTenant, 'tidy', {
                'plugin.json': manifest('tidy', '#990000'),
                'card.js': CARD,
              })
            ).outcome,
          ).toBe('succeeded')
          expect((await wanted()).find(each => each.name === 'tidy')?.version).toBe(tidy.version)
          expect(
            (await wanted(others, otherTenant)).find(each => each.name === 'tidy')?.version,
          ).not.toBe(tidy.version)

          const seen = frames.length
          const off = await assets['set-asset-enabled']({
            tenant,
            operation: 'off-1',
            holding: made.body.holding,
            enabled: false,
          })
          expect(off.outcome).toBe('succeeded')
          await until(() => frames.length > seen, 'a frame after the plugin is disabled', 10_000)
          expect((await wanted()).map(each => each.name)).toEqual(['notes'])
          expect(
            await plugins['read-file']({
              tenant,
              name: 'tidy',
              version: tidy.version,
              path: 'card.js',
              offset: 0,
              limit: 10,
            }),
          ).toEqual({ outcome: 'not-found', body: { reason: 'plugin' } })

          const on = await assets['set-asset-enabled']({
            tenant,
            operation: 'on-1',
            holding: made.body.holding,
            enabled: true,
          })
          expect(on.outcome).toBe('succeeded')
          expect((await wanted()).map(each => each.name)).toEqual(['notes', 'tidy'])

          const again = await uploadPlugin(
            assets,
            tenant,
            'tidy',
            { 'plugin.json': manifest('tidy', '#123456'), 'card.js': CARD },
            'up-tidy-2',
          )
          if (again.outcome !== 'succeeded') throw new Error(`again: ${JSON.stringify(again)}`)
          const next = (await wanted()).find(each => each.name === 'tidy')
          expect(next?.version).not.toBe(tidy.version)
          expect(JSON.parse(next!.manifest).client.members[0].data).toEqual({
            '--omne-accent': '#123456',
          })

          watching.abort()
          await pumping
        })
        expect(exitCode).toBe(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
