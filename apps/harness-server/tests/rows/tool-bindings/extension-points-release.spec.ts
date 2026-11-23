// @module-tag slow
import type { Context } from '@deepseek-ai/cordis'
import { heldPoint } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolResults,
} from '../../support/release-tree.ts'

const call = (command: string, params: unknown) => JSON.stringify({ command, params })

const REPORT = {
  plugins: [],
  points: [{ name: 'session.tool-call', summary: 'How one tool call is drawn.' }],
  parts: [
    {
      name: 'session.composer',
      label: '输入区',
      summary: '对话页底部写消息的区域。',
      depths: ['tokens', 'style'],
      within: null,
    },
    {
      name: 'session.composer.send',
      label: '发送按钮',
      summary: '输入区右侧，发出当前输入。',
      depths: ['tokens', 'style', 'render'],
      within: 'session.composer',
    },
  ],
} as const

const STEPS: Readonly<Record<string, readonly [string, unknown]>> = {
  'points: help': ['help', {}],
  'points: server tree': ['tree', { side: 'server' }],
  'points: client tree': ['tree', { side: 'client' }],
  'points: find': ['find', { query: '发送按钮' }],
  'points: show part': ['show', { name: 'session.composer.send' }],
  'points: show point': ['show', { name: 'plugin.plugins' }],
  'points: show nothing': ['show', { name: 'session.composer.sned' }],
  'points: changes': ['changes', {}],
  'points: show late': ['show', { name: 'note.notes' }],
  'points: tree notes': ['tree', { side: 'server', under: 'note' }],
  'extensions: categories': ['categories', {}],
}

describe('OmneExtensionPoints on the release tree', () => {
  it(
    'an agent reads the two trees as its tenant: the points of the server, the parts a connected client told, what a name takes, and what changed',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = toolCallsThenText(body => {
        const step = Object.keys(STEPS).find(text => body.includes(text))
        if (step === undefined) return []
        const [command, params] = STEPS[step]!
        const tool = step.startsWith('extensions:') ? 'OmneExtensions' : 'OmneExtensionPoints'
        return [{ id: 'call_points', tool, arguments: call(command, params) }]
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const ask = async (text: string): Promise<string> => {
          const session = await tree.startSession(text)
          const entries = await pollUntil(
            `the Run of ${text} to end`,
            () => historyOf(tree, session),
            value => value.some(entry => entry.kind === 'run.terminal'),
          )
          return toolResults(entries).join('\n')
        }
        const help = await ask('points: help')
        expect(help).toContain('done OmneExtensionPoints help')
        expect(help).toMatch(/tree rev [0-9a-f]{4}\.\d+/u)

        const server = await ask('points: server tree')
        expect(server).toContain('done OmneExtensionPoints tree')
        for (const point of ['plugin.plugins', 'skill.skills', 'tool.tools', 'access.protocols'])
          expect(server, point).toContain(point)

        const none = await ask('points: client tree')
        expect(none).toContain('none connected')

        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)
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
        const told = await plugins['report-loaded']({ tenant, client: 'desktop-1', ...REPORT })
        expect(told.outcome).toBe('succeeded')

        const client = await ask('points: client tree')
        expect(client).toContain('session.composer.send')
        expect(client).toContain('发送按钮')
        expect(client).not.toContain('none connected')

        const found = await ask('points: find')
        expect(found).toContain('done OmneExtensionPoints find')
        expect(found).toMatch(/session\.composer\.send\s+part/u)

        const part = await ask('points: show part')
        expect(part).toContain('"point":"shell.part-style","key":"session.composer.send"')
        expect(part).toContain('"point":"shell.part-render","key":"session.composer.send"')
        expect(part).toContain('输入区')

        const before = await ask('points: show point')
        expect(before).toContain('plugin.plugins')
        expect(before).not.toContain('tidy')
        const revision = /tree rev ([0-9a-f]{4}\.\d+)/u.exec(before)?.[1]
        expect(revision).toBeDefined()

        const made = await uploadPlugin(tree.clients.assets, tenant, 'tidy', {
          'plugin.json': JSON.stringify({
            schema: 1,
            name: 'tidy',
            summary: 'Keeps things tidy.',
            client: { members: [] },
          }),
        })
        expect(made.outcome).toBe('succeeded')
        const after = await ask('points: show point')
        expect(after).toContain('tidy')
        expect(/tree rev ([0-9a-f]{4}\.\d+)/u.exec(after)?.[1]).not.toBe(revision)

        const missing = await ask('points: show nothing')
        expect(missing).not.toContain('done OmneExtensionPoints show')
        expect(missing).toContain('session.composer.send')

        // A category that comes while the tree runs brings its point: both tools read them at the next call.
        expect(await ask('points: show late')).not.toContain('done OmneExtensionPoints show')
        const late = tree.scope.plugin({
          name: 'late-notes',
          inject: [assetCategoriesKey],
          apply(ctx: Context) {
            ctx[assetCategoriesKey].contribute(
              {
                display: { title: 'Note', summary: 'A note that came later.' },
                contract: {
                  category: 'note',
                  schema: { kind: 'null' },
                  judge: () => ({ ok: true }),
                  deriveDeclarations: () => ({ entries: [] }),
                  references: () => [],
                },
              },
              heldPoint({
                name: 'note.notes',
                key: 'the name of a note',
                summary: 'The notes held.',
              }),
            )
          },
        })
        await late.await()
        const shown = await ask('points: show late')
        expect(shown).toContain('done OmneExtensionPoints show')
        expect(shown).toMatch(/note\.notes\s+point, server/u)
        expect(shown).toContain('key: the name of a note')
        expect(await ask('points: tree notes')).toContain('note.notes')
        const categories = await ask('extensions: categories')
        expect(categories).toMatch(/^note\s+from a body\s+Note — A note that came later\.$/mu)
        expect(categories).toContain('7 categories now.')
        await late.dispose()
        expect(await ask('points: show late')).not.toContain('done OmneExtensionPoints show')
        expect(await ask('extensions: categories')).toContain('6 categories now.')

        watching.abort()
        await until(
          async () => (await ask('points: client tree')).includes('none connected'),
          'the client to be gone',
          30_000,
        )

        expect(
          toolCalls(tree.storageRoot)
            .filter(row => row.tool === 'OmneExtensionPoints')
            .every(row => row.phase === 'settled'),
        ).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )
})
