import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runOmne, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadAsset, uploadPlugin } from '../../support/plugin-packages.ts'
import { savedClients, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  pluginServerKey,
  type PluginServerService,
} from '../../../src/rows/plugin-server/service.ts'

type Call = Readonly<{ command: string; params: Record<string, unknown> }>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>

const SKILL = '---\nname: notes\ndescription: How notes are kept.\n---\nKeep each note short.\n'
const GUIDE = '# Guide\n\nOne line a note.\n'
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'Carries the notes skill.',
  server: { members: [{ point: 'skill.skills', key: 'notes', directory: 'skills/notes' }] },
})

const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

/** The steps written in the last user message are the model's tool calls, one step a request. */
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
    tool: 'Skills',
    arguments: JSON.stringify(call),
  }))
})
const plan = (...steps: readonly (readonly Call[])[]) => `PLAN ${JSON.stringify(steps)} END`
const READS = plan(
  [{ command: 'search', params: { query: 'notes' } }],
  [{ command: 'read', params: { skill: 'notes' } }],
  [{ command: 'list', params: { skill: 'notes' } }],
  [{ command: 'read_file', params: { skill: 'notes', path: 'guide.md' } }],
)

type As = Readonly<{ tree: ReleaseTree; tenant: string }>

async function ok(at: As, args: readonly string[]) {
  const ran = await at.tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { body: Record<string, unknown> }
}

async function ran(at: As, session: string, runs: number, text: string): Promise<string[]> {
  await ok(at, ['send-input', '--session', session, '--text', text])
  const entries = await pollUntil(
    `${String(runs)} runs of the session end`,
    () => historyOf(at.tree, session),
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return toolResults(entries)
}

async function another(tree: ReleaseTree, name: string): Promise<As> {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = `http://127.0.0.1:${String(tree.port)}`
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-5d0a31c7` })
    expect(done.status, done.stderr).toBe(0)
  }
  const cli = (args: readonly string[]) => runOmne({ args, home, server, cwd: base })
  return { tree: { ...tree, home, cli } as ReleaseTree, tenant: savedTenant(home) }
}

/** Where the package is on this machine and which holding it is read from are what differ: the two are kept and versioned apart. */
const withoutPlace = (results: readonly string[]) =>
  results.map(text =>
    text
      .replace(/^directory=.*$/gmu, 'directory=<place>')
      .replace(/^source=\S+ version=\S+$/gmu, 'source=<holding>'),
  )

describe('a skill a plugin carries, on the release tree', () => {
  it(
    'is found and read by Skills exactly as the same skill held on its own, and goes when the plugin is disabled',
    { tags: ['slow'], timeout: 600_000 },
    async () => {
      const exit = await onReleaseTree({ script: planned }, async tree => {
        const alice: As = { tree, tenant: savedTenant(tree.home) }
        const aliceSession = String(
          (await ok(alice, ['create-session', '--definition', 'coding'])).body['session'],
        )
        const held = await uploadAsset(
          tree.clients.assets,
          tenantOf(alice.tenant),
          'skill',
          'notes',
          {
            'SKILL.md': SKILL,
            'guide.md': GUIDE,
          },
        )
        expect(held.outcome).toBe('succeeded')
        const direct = await ran(alice, aliceSession, 1, READS)

        const bob = await another(tree, 'bob')
        const bobSession = String(
          (await ok(bob, ['create-session', '--definition', 'coding'])).body['session'],
        )
        const bobAssets = savedClients(tree.port, bob.tree.home).assets
        const made = await uploadPlugin(bobAssets, tenantOf(bob.tenant), 'tidy', {
          'plugin.json': MANIFEST,
          'skills/notes/SKILL.md': SKILL,
          'skills/notes/guide.md': GUIDE,
        })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        const states = () =>
          (tree.scope.get(pluginServerKey) as PluginServerService).states(bob.tenant)
        await until(
          () => states()?.get('tidy')?.kind === 'loaded',
          'the plugin to be loaded',
          30_000,
        )
        const carried = await ran(bob, bobSession, 1, READS)
        expect(carried[0]).toContain('1. notes - How notes are kept.')
        expect(carried[1]).toMatch(
          /^directory=.*\/plugins\/tidy\/sha256-[0-9a-f]{64}\/skills\/notes$/mu,
        )
        expect(withoutPlace(carried)).toEqual(withoutPlace(direct))

        const off = await bobAssets['set-asset-enabled']({
          tenant: tenantOf(bob.tenant),
          operation: 'off-1',
          holding: made.body.holding,
          enabled: false,
        })
        expect(off.outcome).toBe('succeeded')
        await until(() => states()?.has('tidy') !== true, 'the plugin to go', 30_000)
        const gone = await ran(
          bob,
          bobSession,
          2,
          plan([{ command: 'search', params: { query: 'notes' } }]),
        )
        expect(gone.at(-1)).toContain('results=0')
        expect(gone.at(-1)).not.toContain('1. notes')
      })
      expect(exit).toBe(0)
    },
  )
})
