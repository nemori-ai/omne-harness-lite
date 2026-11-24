// @module-tag slow
// Starts the release tree: an agent writes a skin with an image in its workspace and manages it with OmneExtensions.
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import {
  askerIn,
  extensionPoints,
  extensions,
  files,
  plannedModel,
} from '../../support/planned-calls.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCalls, type ReleaseTree } from '../../support/release-tree.ts'

const SEA = { category: 'skin', name: 'sea' } as const
const MARK =
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#4d6bfe"/></svg>\n'
const DRAWING =
  "export const send = ({ React, files }) => ({ subject }) =>\n  React.createElement('img', { src: files.url('art/mark.svg'), width: subject.size, height: subject.size, alt: '' })\n"
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'sea',
  summary: 'A sea of blue, with a mark of its own.',
  kind: 'skin',
  client: {
    members: [
      {
        point: 'shell.tokens',
        key: 'shell.app',
        data: { '--omne-accent': 'light-dark(#4d6bfe, #8fa3ff)' },
      },
      {
        point: 'shell.part-style',
        key: 'shell.sidebar',
        data: { base: { 'background-image': 'file(art/mark.svg)' } },
      },
      { point: 'shell.icon', key: 'send', module: 'skin.js', export: 'send' },
    ],
  },
})

/** The rules of shell.icon as the desktop client tells them: a drawing on a key, the names of its keys told beside. */
const ICON_RULES = {
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of the icon: OmneExtensionPoints show shell.icon lists the names',
  gives: 'a drawing of the icon, given its name, size and classes',
  item: { kind: 'pure', fields: [{ name: 'render', kind: 'function' }] },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'a drawing that throws falls back to the icon of the set',
  version: 1,
  revision: 1,
  example: null,
} as const

async function ok(tree: ReleaseTree, args: readonly string[]) {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { outcome: string; body: Record<string, unknown> }
}

describe('a skin with an image, made by an agent on the release tree', () => {
  it(
    'the agent reads how a skin is written, publishes one with an image, a client is told of it and reads the image, a false image is refused, and disabling takes it away',
    { tags: ['slow'], timeout: 420_000 },
    async () => {
      const project = realpathSync(mkdtempSync(join(tmpdir(), 'skin-release-')))
      writeFileSync(join(project, 'README.md'), '# project\n')
      const options = { script: plannedModel, permission: 'bypass-permissions' }
      const exitCode = await onReleaseTree(options, async tree => {
        const { workspace, instance } = (await ok(tree, ['workspace', 'register', project])).body
        const at = ['--workspace', String(workspace), '--instance', String(instance)]
        const created = await ok(tree, ['create-session', '--definition', 'coding', ...at])
        const inSession = askerIn(tree)
        const ask = inSession.bind(null, String(created.body['session']))
        const tenant = tenantOf(savedTenant(tree.home))
        const plugins = createClient(
          pluginProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const wanted = async () => {
          const listed = await plugins['list-wanted']({ tenant, side: 'client' })
          if (listed.outcome !== 'succeeded') throw new Error(JSON.stringify(listed))
          return listed.body.plugins
        }

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
        const told = await plugins['report-loaded']({
          tenant,
          client: 'desktop-1',
          plugins: [],
          points: [
            { name: 'shell.tokens', summary: 'The design tokens of the app or of one part.' },
            { name: 'shell.part-style', summary: 'The style of one part.' },
            {
              name: 'shell.icon',
              summary: 'An icon of the set, drawn by name.',
              contract: ICON_RULES,
              dataKeys: [
                { name: 'send', now: null },
                { name: 'settings', now: null },
              ],
            },
          ],
          parts: [],
        })
        expect(told.outcome).toBe('succeeded')
        const names = await ask([extensionPoints('show', { name: 'shell.icon' })])
        expect(names).toContain('done OmneExtensionPoints show')
        expect(names).toMatch(/\bsend\b/u)

        const guide = await ask([extensions('help', { name: 'publish', category: 'skin' })])
        expect(guide).toContain('done OmneExtensions help publish')
        for (const words of ['shell.icon', 'light-dark(', 'file(path)', 'files.url(path)'])
          expect(guide, words).toContain(words)
        expect(guide).toMatch(/^Before you finish: /mu)

        const published = await ask(
          [
            files('write', {
              path: 'ext/sea/plugin.json',
              text: MANIFEST,
              mode: 'create',
              parents: true,
            }),
            files('write', { path: 'ext/sea/skin.js', text: DRAWING, mode: 'create' }),
            files('write', {
              path: 'ext/sea/art/mark.svg',
              text: MARK,
              mode: 'create',
              parents: true,
            }),
          ],
          [extensions('impact', { category: 'skin', dir: 'ext/sea' })],
          [extensions('publish', { id: 'op-skin-1', ...SEA, dir: 'ext/sea' })],
        )
        expect(published).toContain('+ shell.part-style / shell.sidebar')
        expect(published).toContain('+ shell.icon / send')
        expect(published).toContain('done OmneExtensions publish')
        expect(published).toMatch(/"id":"op-skin-1".*"changed":true,"enabled":true/u)

        await until(async () => (await wanted()).length === 1, 'the client to be told', 15_000)
        const [held] = await wanted()
        expect(held?.name).toBe('sea')
        expect(JSON.parse(held!.manifest)).toMatchObject({ kind: 'skin', name: 'sea' })
        const read = await plugins['read-file']({
          tenant,
          name: 'sea',
          version: held!.version,
          path: 'art/mark.svg',
          offset: 0,
          limit: 65_536,
        })
        if (read.outcome !== 'succeeded') throw new Error(JSON.stringify(read))
        expect(new TextDecoder().decode(read.body.part)).toBe(MARK)
        expect(read.body.next).toBeNull()

        const forged = await ask(
          [
            files('write', {
              path: 'ext/sea/art/forged.png',
              text: '<html><script>1</script></html>',
              mode: 'create',
            }),
          ],
          [extensions('publish', { id: 'op-skin-2', ...SEA, dir: 'ext/sea' })],
        )
        expect(forged).toContain('the file art/forged.png is not the image its name says')
        expect(forged).not.toMatch(/"id":"op-skin-2".*"changed":true/u)
        expect((await wanted())[0]?.version).toBe(held!.version)

        const off = await ask([extensions('disable', { id: 'op-skin-3', ...SEA })])
        expect(off).toContain('done OmneExtensions disable')
        await until(async () => (await wanted()).length === 0, 'the skin to be taken away', 15_000)
        const on = await ask([extensions('enable', { id: 'op-skin-4', ...SEA })])
        expect(on).toContain('done OmneExtensions enable')
        await until(async () => (await wanted()).length === 1, 'the skin to come back', 15_000)

        watching.abort()
        await pumping.catch(() => undefined)
        const calls = toolCalls(tree.storageRoot).filter(row => row.tool === 'OmneExtensions')
        expect(calls.length).toBe(6)
        expect(calls.every(row => row.phase === 'settled')).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )
})
