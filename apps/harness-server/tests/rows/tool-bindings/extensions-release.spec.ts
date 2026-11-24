// @module-tag slow
// Starts the release tree: an agent writes a plugin in its workspace and manages it with OmneExtensions.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
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
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Call = Readonly<{ tool: string; command: string; params: Record<string, unknown> }>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>

const files = (command: string, params: Record<string, unknown>): Call => ({
  tool: 'Files',
  command,
  params,
})
const extensions = (command: string, params: Record<string, unknown>): Call => ({
  tool: 'OmneExtensions',
  command,
  params,
})

/** A user message that tells the scripted model which calls to make in each of its next steps. */
const plan = (...steps: readonly (readonly Call[])[]) => `PLAN ${JSON.stringify(steps)} END`

const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

// The model makes the calls of the step it is at: one step for each of its earlier turns with calls.
const planned = toolCallsByRequest(body => {
  const { messages } = JSON.parse(body) as { messages: readonly Message[] }
  const at = messages.findLastIndex(
    message => message.role === 'user' && /PLAN /u.test(textOf(message)),
  )
  const found = at < 0 ? null : /PLAN (.*) END/su.exec(textOf(messages[at]!))?.[1]
  if (found === null || found === undefined) return []
  const text =
    typeof messages[at]!.content === 'string' ? found : (JSON.parse(`"${found}"`) as string)
  const steps = JSON.parse(text) as readonly (readonly Call[])[]
  const done = messages
    .slice(at + 1)
    .filter(message => message.role === 'assistant' && (message.tool_calls?.length ?? 0) > 0).length
  return (steps[done] ?? []).map((call, index) => ({
    id: `call_${String(at)}_${String(done)}_${String(index)}`,
    tool: call.tool,
    arguments: JSON.stringify(
      call.tool === 'Files'
        ? { command: call.command, intent: 'test call', params: call.params }
        : { command: call.command, params: call.params },
    ),
  }))
})

const manifest = (accent: string) =>
  JSON.stringify({
    schema: 1,
    name: 'tidy',
    summary: 'A green accent.',
    client: {
      members: [{ point: 'shell.tokens', key: 'shell.app', data: { '--omne-accent': accent } }],
    },
  })

const TIDY = { category: 'plugin', name: 'tidy' } as const
const ACCENT = (value: string) => `"--omne-accent":"${value}"`
const TEAL = manifest('green').replace(ACCENT('green'), ACCENT('teal'))
const REPORT = {
  points: [{ name: 'shell.tokens', summary: 'The design tokens of the app or of one part.' }],
  parts: [],
}

async function ok(tree: ReleaseTree, args: readonly string[]) {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { outcome: string; body: Record<string, unknown> }
}

describe('OmneExtensions on the release tree', () => {
  it(
    'an agent publishes a plugin from its workspace, sees it reach a client, disables it, and recalls what it did',
    { tags: ['slow'], timeout: 420_000 },
    async () => {
      const project = realpathSync(mkdtempSync(join(tmpdir(), 'extensions-release-')))
      mkdirSync(join(project, 'notes'))
      writeFileSync(join(project, 'README.md'), '# project\n')
      const options = { script: planned, permission: 'bypass-permissions' }
      const exitCode = await onReleaseTree(options, async tree => {
        const { workspace, instance } = (await ok(tree, ['workspace', 'register', project])).body
        const at = ['--workspace', String(workspace), '--instance', String(instance)]
        const created = await ok(tree, ['create-session', '--definition', 'coding', ...at])
        const session = String(created.body['session'])
        const progress = new Map<string, { runs: number; results: number }>()
        const inSession = async (
          session: string,
          ...steps: readonly (readonly Call[])[]
        ): Promise<string> => {
          const at = progress.get(session) ?? { runs: 0, results: 0 }
          progress.set(session, at)
          at.runs += 1
          await ok(tree, ['send-input', '--session', session, '--text', plan(...steps)])
          const wanted = at.runs
          const entries = await pollUntil(
            `run ${String(wanted)} to end`,
            () => historyOf(tree, session),
            seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
          )
          const results = toolResults(entries)
          const fresh = results.slice(at.results)
          at.results = results.length
          return fresh.join('\n')
        }
        const ask = (...steps: readonly (readonly Call[])[]) => inSession(session, ...steps)

        const tenant = tenantOf(savedTenant(tree.home))
        const plugins = createClient(
          pluginProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
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
        const wantedNames = async () => {
          const listed = await plugins['list-wanted']({ tenant, side: 'client' })
          if (listed.outcome !== 'succeeded') throw new Error(JSON.stringify(listed))
          return listed.body.plugins
        }
        const told = await plugins['report-loaded']({
          tenant,
          client: 'desktop-1',
          plugins: [],
          ...REPORT,
        })
        expect(told.outcome).toBe('succeeded')

        const first = await ask(
          [
            files('write', {
              path: 'ext/tidy/plugin.json',
              text: manifest('green'),
              mode: 'create',
              parents: true,
            }),
          ],
          [extensions('categories', {})],
          [extensions('impact', { category: 'plugin', dir: 'ext/tidy' })],
          [extensions('publish', { id: 'op-publish-1', ...TIDY, dir: 'ext/tidy' })],
        )
        expect(first).toContain('done OmneExtensions categories')
        expect(first).toMatch(/plugin\s/u)
        expect(first).toContain('done OmneExtensions impact')
        expect(first).toContain('+ shell.tokens / shell.app')
        expect(first).toContain('→ in effect')
        expect(first).toContain('loads on: client. Server: nothing to load.')
        expect(first).toContain('done OmneExtensions publish')
        expect(first).toMatch(
          /"id":"op-publish-1".*"changed":true,"enabled":true,"recalled":false/u,
        )
        expect(first).toContain('Clients: 1 connected.')

        await until(() => frames.length >= 2, 'a frame after the agent published', 15_000)
        const [held] = await wantedNames()
        expect(held?.name).toBe('tidy')
        expect(JSON.parse(held!.manifest)).toEqual(JSON.parse(manifest('green')))

        const before = await ask([extensions('show', TIDY)])
        expect(before).toContain('done OmneExtensions show')
        expect(before).toMatch(/plugin tidy\s+sha256:[0-9a-f]{64}\s+enabled\s+held by this tenant/u)
        expect(before).toMatch(/shell\.tokens \/ shell\.app\s+\[not known\]/u)
        expect(before).toMatch(/desktop-1, connected\s+not loaded yet/u)

        const loaded = await plugins['report-loaded']({
          tenant,
          client: 'desktop-1',
          plugins: [{ name: 'tidy', version: held!.version, state: 'loaded', reason: null }],
          ...REPORT,
        })
        expect(loaded.outcome).toBe('succeeded')
        const shown = await ask(
          [extensions('show', TIDY)],
          [extensions('list', { category: 'plugin' })],
        )
        expect(shown).toMatch(/shell\.tokens \/ shell\.app\s+\[in effect\]/u)
        expect(shown).toMatch(/desktop-1, connected\s+loaded/u)
        expect(shown).toContain('done OmneExtensions list')

        const again = await ask(
          [extensions('publish', { id: 'op-publish-1', ...TIDY, dir: 'ext/tidy' })],
          [extensions('result', { id: 'op-publish-1' })],
        )
        expect(again).toMatch(/"id":"op-publish-1".*"recalled":true/u)
        expect(again).toContain('done OmneExtensions result')

        // Another workspace, another session: the files are not there, so the agent takes them from the holding.
        const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'extensions-elsewhere-')))
        writeFileSync(join(elsewhere, 'README.md'), '# elsewhere\n')
        const second = (await ok(tree, ['workspace', 'register', elsewhere])).body
        const there = [
          '--workspace',
          String(second['workspace']),
          '--instance',
          String(second['instance']),
        ]
        const later = String(
          (await ok(tree, ['create-session', '--definition', 'coding', ...there])).body['session'],
        )
        const edited = await inSession(
          later,
          [extensions('show', TIDY)],
          [extensions('export', { ...TIDY, dir: 'work/tidy' })],
          [extensions('export', { ...TIDY, dir: 'work/tidy' })],
          [
            files('edit', {
              path: 'work/tidy/plugin.json',
              old_text: ACCENT('green'),
              new_text: ACCENT('teal'),
            }),
          ],
          [extensions('export', { ...TIDY, dir: 'work/tidy' })],
          [extensions('impact', { category: 'plugin', dir: 'work/tidy' })],
          [extensions('publish', { id: 'op-publish-2', ...TIDY, dir: 'work/tidy' })],
        )
        expect(edited).toContain('source: this held version, 1 file (')
        expect(edited).toContain('to change it: export it to a directory')
        expect(edited).toMatch(
          /done OmneExtensions export plugin tidy\nsha256:[0-9a-f]{64} {3}wrote 1 file \(\d+ bytes\) to work\/tidy/u,
        )
        expect(edited).toContain(`work/tidy already holds exactly version sha256:${held!.version};`)
        expect(edited).toContain(
          'work/tidy is not empty and differs from the held version in: plugin.json.',
        )
        expect(readFileSync(join(elsewhere, 'work/tidy/plugin.json'), 'utf8')).toBe(TEAL)
        expect(edited).toMatch(/"id":"op-publish-2".*"changed":true/u)
        await until(
          async () => {
            const [now] = await wantedNames()
            return now !== undefined && now.version !== held!.version
          },
          'the client to be told of the new version',
          15_000,
        )
        expect(JSON.parse((await wantedNames())[0]!.manifest)).toEqual(JSON.parse(TEAL))

        // Every category of the release answers list, and one held in each of two of them answers show.
        const every = await ask(
          ['AgentDefinition', 'converter', 'model-provider', 'plugin', 'skill', 'tool'].map(
            category => extensions('list', { category }),
          ),
          [extensions('show', { category: 'converter', name: 'voice' })],
          [extensions('show', { category: 'tool', name: 'Files' })],
          [extensions('publish', { id: 'op-tool-1', category: 'tool', name: 'mine', data: {} })],
        )
        expect(every.match(/done OmneExtensions list/gu)).toHaveLength(6)
        // What the deployment installed and the tenant does not hold is on the tree of points, not here.
        expect(every).toContain('converter voice is not held by this tenant.')
        expect(every).toMatch(/tool Files\s+\S+\s+enabled\s+installed with the deployment/u)
        expect(every).toContain(
          'it is installed with the deployment and cannot be changed in place.',
        )
        expect(every).toContain(
          'category tool is made from a directory: write it in the workspace and give dir.',
        )
        expect(every).not.toContain('to change it: publish a new body as data.')

        const off = await ask(
          [extensions('impact', { ...TIDY, change: 'disable' })],
          [extensions('disable', { id: 'op-disable-1', ...TIDY })],
          [extensions('show', TIDY)],
        )
        expect(off).toContain('- shell.tokens / shell.app')
        expect(off).toContain('done OmneExtensions disable')
        expect(off).toMatch(/plugin tidy\s+sha256:[0-9a-f]{64}\s+disabled/u)
        expect(off).toMatch(/\[not in effect\]\s+it is disabled/u)
        await until(async () => (await wantedNames()).length === 0, 'the client to be told', 15_000)

        const back = await ask(
          [extensions('enable', { id: 'op-enable-1', ...TIDY })],
          [extensions('remove', { id: 'op-remove-1', ...TIDY })],
          [extensions('show', TIDY)],
          [extensions('show', { category: 'plugins', name: 'tidy' })],
        )
        expect(back).toContain('done OmneExtensions enable')
        expect(back).toContain('done OmneExtensions remove')
        expect(back).not.toContain('done OmneExtensions show')
        expect(back).toMatch(/holds no|not held/u)
        expect(back).toContain('plugin')
        await until(async () => (await wantedNames()).length === 0, 'nothing wanted', 15_000)

        const outside = await ask([extensions('impact', { category: 'plugin', dir: '../outside' })])
        expect(outside).not.toContain('done OmneExtensions impact')

        watching.abort()
        await pumping.catch(() => undefined)
        const calls = toolCalls(tree.storageRoot).filter(row => row.tool === 'OmneExtensions')
        expect(calls.length).toBeGreaterThanOrEqual(21)
        expect(calls.every(row => row.phase === 'settled')).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )
})
