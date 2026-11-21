// @module-tag slow
// Starts the release tree and lets the agent of a session move the session with SwitchWorkspace.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runOmne } from '../r9/support.ts'
import { answerCard, pendingCard } from './authorization/release-flow-support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../support/release-tree.ts'

type Call =
  | Readonly<{ tool: 'Files' | 'Shell'; command: string; params: Record<string, unknown> }>
  | Readonly<{ tool: 'SwitchWorkspace'; target: Record<string, unknown> }>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
type Reply = { outcome: string; body: Record<string, unknown> }

const write = (path: string, text: string): Call => ({
  tool: 'Files',
  command: 'write',
  params: { path, text, mode: 'create' },
})
const shell = (script: string): Call => ({ tool: 'Shell', command: 'execute', params: { script } })
const switchTo = (target: Record<string, unknown>): Call => ({ tool: 'SwitchWorkspace', target })

/** A user message that tells the scripted model which calls to make in each of its next steps. */
const plan = (...steps: readonly (readonly Call[])[]) => `PLAN ${JSON.stringify(steps)} END`
const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

// A function tool takes its fields directly; a command tool names its command and intent.
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
      call.tool === 'SwitchWorkspace'
        ? call.target
        : { command: call.command, intent: 'test call', params: call.params },
    ),
  }))
})

const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid']
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' }).trim()

/** A repository that the real git made, with one commit on `main`. */
function repository(base: string, name: string): string {
  const root = join(base, name)
  mkdirSync(root)
  git(root, 'init', '-q', '-b', 'main')
  writeFileSync(join(root, 'README.md'), `# ${name}\n`)
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'first')
  return root
}

async function ok(tree: ReleaseTree, args: readonly string[]): Promise<Reply> {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as Reply
}

async function registered(tree: ReleaseTree, directory: string) {
  const { workspace, instance } = (await ok(tree, ['workspace', 'register', directory])).body
  return { workspace: String(workspace), instance: String(instance) }
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
  return { answers: toolResults(entries), entries }
}

/** Another account on the same tree, with its own home: the tree as that account drives it. */
async function another(tree: ReleaseTree, name: string) {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = `http://127.0.0.1:${String(tree.port)}`
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-9c1e77a2` })
    expect(done.status, done.stderr).toBe(0)
  }
  const cli = (args: readonly string[]) => runOmne({ args, home, server, cwd: base })
  return { ...tree, home, cli } as ReleaseTree
}

const read = (path: string) => readFileSync(path, 'utf8').trim()
const instancesOf = async (tree: ReleaseTree, workspace: string) =>
  (await ok(tree, ['workspace', 'show', workspace])).body['instances'] as readonly {
    instance: string
    address: string
  }[]
const reminders = (entries: readonly { kind: string }[]) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => JSON.stringify(entry))
    .filter(
      text => text.includes('session.working-directory') && text.includes('these values changed'),
    )
const options = {
  script: planned,
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder'],
} as const

describe('the agent of a session moves the session with SwitchWorkspace', () => {
  it(
    'makes a working copy, switches into it, and works there from the next step; the step of the switch still works in the old directory',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'switch-workspace-')))
      const blog = repository(base, 'blog')
      const feature = join(base, 'feature')
      const exitCode = await onReleaseTree(options, async tree => {
        const at = await registered(tree, blog)
        const session = await sessionIn(tree, at)
        // The working copy is made beside the workspace, outside it: the tenant allows that first.
        const allow = ['setting', 'set', '--independent', 'workspace/outside-files', 'access']
        await ok(tree, [...allow, '--value', '"read-write"'])
        const { answers, entries } = await ran(
          tree,
          session,
          1,
          plan(
            [shell(`git worktree add -q -b feature ${feature}`)],
            [switchTo({ directory: feature }), write('same-step.txt', 'old')],
            [write('next-step.txt', 'new'), shell('pwd')],
          ),
        )
        expect(answers.join('\n')).toContain(
          `done SwitchWorkspace directory=${feature} associated=yes\nThis takes effect from your next step.`,
        )
        expect(read(join(blog, 'same-step.txt'))).toBe('old')
        expect(read(join(feature, 'next-step.txt'))).toBe('new')
        expect(existsSync(join(blog, 'next-step.txt'))).toBe(false)
        expect(answers.at(-1)).toContain(feature)
        const changed = reminders(entries)
        expect(changed).toHaveLength(1)
        expect(changed[0]).toContain(feature)
        const instances = await instancesOf(tree, at.workspace)
        expect(instances.map(instance => instance.address).sort()).toEqual([blog, feature])

        // Back to the first instance by its directory, then out of the workspace: nothing is associated again.
        const back = await ran(
          tree,
          session,
          2,
          plan(
            [switchTo({ directory: blog })],
            [write('back.txt', 'b'), switchTo({ none: true })],
            [write('nowhere.txt', 'n')],
          ),
        )
        expect(back.answers.join('\n')).toContain(
          `done SwitchWorkspace directory=${blog} associated=no`,
        )
        expect(back.answers.join('\n')).toContain(
          'done SwitchWorkspace directory=none associated=no',
        )
        expect(read(join(blog, 'back.txt'))).toBe('b')
        expect(read(join(dirname(tree.storageRoot), 'workspace', 'nowhere.txt'))).toBe('n')
        expect(await instancesOf(tree, at.workspace)).toHaveLength(2)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'is refused a workspace its tenant has no relation with, by its identity and by its directory, and a directory that is no working copy of its own',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'switch-workspace-')))
      const [blog, shop, plain] = [
        repository(base, 'blog'),
        repository(base, 'shop'),
        join(base, 'plain'),
      ]
      mkdirSync(plain)
      const exitCode = await onReleaseTree(options, async tree => {
        const other = await another(tree, 'bob')
        const theirs = await registered(other, shop)
        const at = await registered(tree, blog)
        const session = await sessionIn(tree, at)
        const { answers, entries } = await ran(
          tree,
          session,
          1,
          plan(
            [
              switchTo({ workspace: theirs.workspace }),
              switchTo({ directory: shop }),
              switchTo({ directory: plain }),
              switchTo({ directory: blog, none: true }),
            ],
            [write('still-here.txt', 's')],
          ),
        )
        const text = answers.join('\n')
        expect(text.match(/refused reason=not-permitted\nNothing changed\./gu)).toHaveLength(1)
        expect(text.match(/refused reason=[a-z-]+\nNothing changed\./gu)).toHaveLength(3)
        expect(text).toContain('give exactly one of directory, workspace, none')
        expect(text).not.toContain('done SwitchWorkspace')
        expect(read(join(blog, 'still-here.txt'))).toBe('s')
        expect(reminders(entries)).toEqual([])
        expect(await instancesOf(tree, at.workspace)).toHaveLength(1)
        expect(await instancesOf(other, theirs.workspace)).toHaveLength(1)
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('the switch stands under the gate of its tool', () => {
  it(
    'waits for a person where the session asks: nothing is switched until the card is answered, then it is',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'switch-asking-')))
      const blog = repository(base, 'blog')
      const asking = { ...options, permission: 'auto_permission' } as const
      const exitCode = await onReleaseTree(asking, async tree => {
        const session = await sessionIn(tree, await registered(tree, blog))
        await ok(tree, [
          'send-input',
          '--session',
          session,
          '--text',
          plan([switchTo({ none: true })]),
        ])
        const card = await pendingCard(tree, session, 'the switch of the step')
        expect(toolResults(await historyOf(tree, session)).join('\n')).not.toContain(
          'SwitchWorkspace',
        )
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-switch')
        const entries = await pollUntil(
          'the run ends after the answer',
          () => historyOf(tree, session),
          seen => seen.some(entry => entry.kind === 'run.terminal'),
        )
        expect(toolResults(entries).join('\n')).toContain(
          'done SwitchWorkspace directory=none associated=no',
        )
        expect(reminders(entries)).toHaveLength(1)
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('a person adds and takes away an instance from the command line', () => {
  it(
    'associates another working copy, works in it, and dissociates it: the directory and what is in it stay',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'associate-')))
      const [blog, feature, plain] = [
        repository(base, 'blog'),
        join(base, 'feature'),
        join(base, 'plain'),
      ]
      git(blog, 'worktree', 'add', '-q', '-b', 'feature', feature)
      mkdirSync(plain)
      const exitCode = await onReleaseTree(options, async tree => {
        const at = await registered(tree, blog)
        const refused = await tree.cli(['workspace', 'associate', at.workspace, plain])
        expect(refused.status).toBe(3)
        expect(JSON.parse(refused.stdout)).toMatchObject({
          outcome: 'invalid',
          body: { reason: 'not-a-working-copy' },
        })
        const made = await ok(tree, ['workspace', 'associate', at.workspace, feature])
        const instance = String(made.body['instance'])
        const { operation } = (made as unknown as { request: { operation: string } }).request
        const again = ['workspace', 'associate', at.workspace, feature, '--resume', operation]
        expect((await ok(tree, again)).body).toEqual({ instance })
        expect((await instancesOf(tree, at.workspace)).map(each => each.address).sort()).toEqual([
          blog,
          feature,
        ])
        const session = await sessionIn(tree, { workspace: at.workspace, instance })
        await ran(tree, session, 1, plan([write('in-feature.txt', 'f')]))
        expect(read(join(feature, 'in-feature.txt'))).toBe('f')

        await ok(tree, ['workspace', 'dissociate', at.workspace, instance])
        expect((await instancesOf(tree, at.workspace)).map(each => each.address)).toEqual([blog])
        expect(read(join(feature, 'in-feature.txt'))).toBe('f')
        // The session that selected the instance is told, and its calls run nowhere.
        const after = await ran(tree, session, 2, plan([write('late.txt', 'l')]))
        expect(after.answers.join('\n')).toContain('cannot be used now')
        expect(existsSync(join(feature, 'late.txt'))).toBe(false)
      })
      expect(exitCode).toBe(0)
    },
  )
})
