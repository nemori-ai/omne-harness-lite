// @module-tag slow
// Starts the release tree with a Skill under .omne/skills of a workspace and lets a scripted model use it.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runOmne, savedTenant } from '../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../support/release-tree.ts'

type Call =
  | Readonly<{ tool: 'Skills'; command: string; params: Record<string, unknown> }>
  | Readonly<{ tool: 'Disk'; path: string; text: string }>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
type Reply = { outcome: string; body: Record<string, unknown> }

const search = (query: string): Call => ({ tool: 'Skills', command: 'search', params: { query } })
const read = (skill: string): Call => ({ tool: 'Skills', command: 'read', params: { skill } })
/** Not a tool call: the script writes the file itself before the calls of its step run. */
const disk = (path: string, text: string): Call => ({ tool: 'Disk', path, text })

const plan = (...steps: readonly (readonly Call[])[]) => `PLAN ${JSON.stringify(steps)} END`
const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

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
  const calls = steps[done] ?? []
  for (const call of calls) if (call.tool === 'Disk') writeFileSync(call.path, call.text)
  return calls.flatMap((call, index) =>
    call.tool === 'Disk'
      ? []
      : [
          {
            id: `call_${String(at)}_${String(done)}_${String(index)}`,
            tool: call.tool,
            arguments: JSON.stringify({ command: call.command, params: call.params }),
          },
        ],
  )
})

async function ok(tree: ReleaseTree, args: readonly string[]): Promise<Reply> {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as Reply
}

async function sessionIn(tree: ReleaseTree, at?: { workspace: string; instance: string }) {
  const where = at === undefined ? [] : ['--workspace', at.workspace, '--instance', at.instance]
  const created = await ok(tree, ['create-session', '--definition', 'coding', ...where])
  return String(created.body['session'])
}

async function ran(tree: ReleaseTree, session: string, runs: number, text: string) {
  await ok(tree, ['send-input', '--session', session, '--text', text])
  const entries = await pollUntil(
    `${String(runs)} runs of the session end`,
    () => historyOf(tree, session),
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return toolResults(entries)
}

/** Another account on the same tree, with its own home: the tree as that account drives it. */
async function another(tree: ReleaseTree, name: string) {
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

const skillText = (line: string) =>
  `---\nname: blog-notes\ndescription: How the blog project writes its notes.\n---\n${line}\n`

function project() {
  const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'workspace-skills-'))), 'blog')
  const file = join(root, '.omne', 'skills', 'blog-notes', 'SKILL.md')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(join(root, 'README.md'), '# blog\n')
  writeFileSync(file, skillText('FIRST TEXT of the notes'))
  return { root, file }
}

const options = { script: planned }

describe('a Skill kept in the workspace (C9)', () => {
  it(
    'is found and read in the next turn, kept as adopted for the rest of a turn, and not seen by a session without the workspace',
    { timeout: 600_000 },
    async () => {
      const { root, file } = project()
      const exit = await onReleaseTree(options, async tree => {
        const made = (await ok(tree, ['workspace', 'register', root])).body
        const at = { workspace: String(made['workspace']), instance: String(made['instance']) }
        const session = await sessionIn(tree, at)
        const first = await ran(
          tree,
          session,
          1,
          plan(
            [search('blog notes')],
            [read('blog-notes')],
            [disk(file, skillText('SECOND TEXT of the notes')), read('blog-notes')],
          ),
        )
        expect(first[0]).toContain('blog-notes')
        expect(first[1]).toContain('FIRST TEXT')
        expect(first[2]).not.toContain('SECOND TEXT')
        expect(first[2]).toMatch(/^ERROR: unavailable/mu)
        const second = await ran(tree, session, 2, plan([read('blog-notes')]))
        expect(second[3]).toContain('SECOND TEXT')

        const plain = await sessionIn(tree)
        const elsewhere = await ran(
          tree,
          plain,
          1,
          plan([search('blog notes')], [read('blog-notes')]),
        )
        expect(elsewhere[0]).not.toContain('blog-notes')
        expect(elsewhere[1]).toMatch(/^ERROR: not-found/mu)
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'is not read in the next turn of a tenant removed from the workspace',
    { timeout: 600_000 },
    async () => {
      const { root } = project()
      const exit = await onReleaseTree(options, async tree => {
        const made = (await ok(tree, ['workspace', 'register', root])).body
        const at = { workspace: String(made['workspace']), instance: String(made['instance']) }
        const frank = await another(tree, 'frank')
        await ok(tree, ['workspace', 'grant', at.workspace, frank.tenant])
        const session = await sessionIn(frank.tree, at)
        const first = await ran(frank.tree, session, 1, plan([read('blog-notes')]))
        expect(first[0]).toContain('FIRST TEXT')
        await ok(tree, ['workspace', 'remove', at.workspace, frank.tenant])
        const next = await ran(
          frank.tree,
          session,
          2,
          plan([search('blog notes')], [read('blog-notes')]),
        )
        expect(next[1]).not.toContain('blog-notes')
        expect(next[2]).not.toContain('FIRST TEXT')
      })
      expect(exit).toBe(0)
    },
  )
})
