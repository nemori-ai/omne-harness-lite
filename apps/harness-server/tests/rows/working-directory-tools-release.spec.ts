// @module-tag slow
// Starts the release tree and checks where the file and command tools of a session work.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { answerCard, pendingCard } from './authorization/release-flow-support.ts'
import {
  historyOf,
  onReleaseTree,
  onReleaseTreeRuns,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../support/release-tree.ts'

type Call = Readonly<{
  tool: 'Files' | 'Shell' | 'Tools'
  command: string
  params: Record<string, unknown>
}>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
type Reply = { outcome: string; body: Record<string, unknown> }

const write = (path: string, text: string): Call => ({
  tool: 'Files',
  command: 'write',
  params: { path, text, mode: 'create' },
})
const shell = (script: string, cwd?: string): Call => ({
  tool: 'Shell',
  command: 'execute',
  params: { script, ...(cwd === undefined ? {} : { cwd }) },
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
    arguments: JSON.stringify({ command: call.command, intent: 'test call', params: call.params }),
  }))
})

function project(base: string, name: string): string {
  const root = join(base, name)
  mkdirSync(root)
  writeFileSync(join(root, 'README.md'), `# ${name}\n`)
  return root
}

async function ok(tree: ReleaseTree, args: readonly string[]): Promise<Reply> {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as Reply
}

async function registered(tree: ReleaseTree, directory: string) {
  const { workspace, instance } = (await ok(tree, ['workspace', 'register', directory])).body
  return ['--workspace', String(workspace), '--instance', String(instance)]
}

async function sessionIn(tree: ReleaseTree, at: readonly string[]): Promise<string> {
  const created = await ok(tree, ['create-session', '--definition', 'coding', ...at])
  return String(created.body['session'])
}

const send = (tree: ReleaseTree, session: string, text: string) =>
  ok(tree, ['send-input', '--session', session, '--text', text])

const runsEnded = (tree: ReleaseTree, session: string, runs: number) =>
  pollUntil(
    `${String(runs)} runs of the session end`,
    () => historyOf(tree, session),
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )

async function ran(tree: ReleaseTree, session: string, runs: number, text: string) {
  await send(tree, session, text)
  return toolResults(await runsEnded(tree, session, runs)).join('\n')
}

const read = (path: string) => readFileSync(path, 'utf8').trim()
/** The server's default directory: where a session with no workspace works. */
const defaultOf = (tree: ReleaseTree) => join(dirname(tree.storageRoot), 'workspace')
const bypass = { script: planned, permission: 'bypass-permissions' }

describe('where the file and command tools of a session work', () => {
  it(
    'each session works in the instance it selected, a session with none in the server default, and none reaches into another',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-tools-')))
      const [blog, shop] = [project(base, 'blog'), project(base, 'shop')]
      await onReleaseTree(bypass, async tree => {
        const inBlog = await sessionIn(tree, await registered(tree, blog))
        const inShop = await sessionIn(tree, await registered(tree, shop))
        const inNone = await sessionIn(tree, [])
        const work = plan([write('note.txt', 'written here'), shell('pwd > where.txt')])
        await Promise.all([inBlog, inShop, inNone].map(session => send(tree, session, work)))
        await Promise.all([inBlog, inShop, inNone].map(session => runsEnded(tree, session, 1)))
        const fallback = realpathSync(defaultOf(tree))
        for (const directory of [blog, shop, fallback]) {
          expect(read(join(directory, 'note.txt'))).toBe('written here')
          expect(realpathSync(read(join(directory, 'where.txt')))).toBe(directory)
        }
        // The fence is the directory of the call: the other instance and the default are outside it.
        const reaching = plan([
          write(join(shop, 'from-blog.txt'), 'x'),
          write(join(fallback, 'from-blog.txt'), 'x'),
          shell('pwd', shop),
        ])
        const answers = await ran(tree, inBlog, 2, reaching)
        expect(answers.match(/reason=notAuthorized/gu)).toHaveLength(3)
        expect(existsSync(join(shop, 'from-blog.txt'))).toBe(false)
        expect(existsSync(join(fallback, 'from-blog.txt'))).toBe(false)
      })
    },
  )

  it(
    'a call in flight when the session changes its workspace finishes where it started; the next step works in the new one',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-switch-')))
      const [blog, shop] = [project(base, 'blog'), project(base, 'shop')]
      await onReleaseTree(bypass, async tree => {
        const session = await sessionIn(tree, await registered(tree, blog))
        const toShop = await registered(tree, shop)
        const waiting = 'touch started; while [ ! -f go ]; do sleep 0.1; done; pwd > late.txt'
        await send(tree, session, plan([shell(waiting)], [write('next-step.txt', 'after')]))
        await pollUntil(
          'the command to start',
          async () => existsSync(join(blog, 'started')),
          started => started,
        )
        await ok(tree, ['select-workspace', '--session', session, ...toShop])
        writeFileSync(join(blog, 'go'), '')
        await runsEnded(tree, session, 1)
        expect(realpathSync(read(join(blog, 'late.txt')))).toBe(blog)
        expect(read(join(shop, 'next-step.txt'))).toBe('after')
        expect(existsSync(join(shop, 'late.txt'))).toBe(false)
        expect(existsSync(join(blog, 'next-step.txt'))).toBe(false)
      })
    },
  )

  it(
    'a call accepted later in the step than a change of workspace still works in the directory of the step',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-step-')))
      const [blog, shop] = [project(base, 'blog'), project(base, 'shop')]
      const asking = { script: planned, permission: 'auto_permission' }
      await onReleaseTree(asking, async tree => {
        const session = await sessionIn(tree, await registered(tree, blog))
        const toShop = await registered(tree, shop)
        await send(tree, session, plan([shell('pwd > same-step.txt')]))
        // The call waits for a person. The change of workspace is committed while it waits.
        const card = await pendingCard(tree, session, 'the command of the step')
        await ok(tree, ['select-workspace', '--session', session, ...toShop])
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-same-step')
        await runsEnded(tree, session, 1)
        expect(realpathSync(read(join(blog, 'same-step.txt')))).toBe(blog)
        expect(existsSync(join(shop, 'same-step.txt'))).toBe(false)
      })
    },
  )

  it(
    'a call of a session whose instance is gone is answered unavailable and writes nowhere; it works again when the instance is back',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-gone-')))
      const shop = project(base, 'shop')
      const gone = join(base, 'gone')
      await onReleaseTree(bypass, async tree => {
        const session = await sessionIn(tree, await registered(tree, shop))
        renameSync(shop, gone)
        const answers = await ran(tree, session, 1, plan([write('lost.txt', 'x'), shell('pwd')]))
        expect(
          answers.match(
            /unavailable: the workspace selected for this session cannot be used now \(reason: instance-unavailable\)/gu,
          ),
        ).toHaveLength(2)
        for (const directory of [gone, defaultOf(tree)])
          expect(existsSync(join(directory, 'lost.txt'))).toBe(false)
        renameSync(gone, shop)
        await ran(tree, session, 2, plan([write('back.txt', 'again')]))
        expect(read(join(shop, 'back.txt'))).toBe('again')
      })
    },
  )
})

describe('a tool that is not resident, called through Tools', () => {
  it(
    'works in the directory its parent call was pinned to: the instance the session selected',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-forward-')))
      const blog = project(base, 'blog')
      await onReleaseTree({ ...bypass, nonresident: ['Files'] }, async tree => {
        const session = await sessionIn(tree, await registered(tree, blog))
        const forwarded: Call = {
          tool: 'Tools',
          command: 'execute',
          params: {
            name: 'Files',
            command: 'write',
            arguments: { path: 'through-tools.txt', text: 'forwarded', mode: 'create' },
          },
        }
        await ran(tree, session, 1, plan([forwarded]))
        expect(read(join(blog, 'through-tools.txt'))).toBe('forwarded')
        expect(existsSync(join(defaultOf(tree), 'through-tools.txt'))).toBe(false)
      })
    },
  )
})

describe('the working directory of a call over a restart of the server', () => {
  it(
    'a call accepted before the restart runs after it in the directory it was pinned to, whatever the session selected since',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-restart-')))
      const [blog, shop] = [project(base, 'blog'), project(base, 'shop')]
      let session = ''
      await onReleaseTreeRuns(bypass, [
        async tree => {
          session = await sessionIn(tree, await registered(tree, blog))
          const toShop = await registered(tree, shop)
          // The Tool cannot take the call now, so the Agent holds the request it prepared.
          const runtime = tree.toolRuntime()
          const invoke = runtime.invoke.bind(runtime)
          let held = 0
          Object.assign(runtime, {
            invoke: async (input: Parameters<typeof invoke>[0]) => {
              if (input.request.availability.definition.name !== 'Shell') return invoke(input)
              held += 1
              const failure = {
                kind: 'unavailable',
                dependency: 'toolRuntime',
                diagnostic: 'later',
              }
              return { kind: 'rejected', failure } as Awaited<ReturnType<typeof invoke>>
            },
          })
          await send(tree, session, plan([shell('pwd > recovered.txt')]))
          await pollUntil(
            'the Agent to hand the call over',
            async () => held,
            count => count > 0,
          )
          await ok(tree, ['select-workspace', '--session', session, ...toShop])
        },
        async tree => {
          await runsEnded(tree, session, 1)
          expect(realpathSync(read(join(blog, 'recovered.txt')))).toBe(blog)
          for (const directory of [shop, defaultOf(tree)])
            expect(existsSync(join(directory, 'recovered.txt'))).toBe(false)
        },
      ])
    },
  )

  it(
    'a call accepted after the restart and before the next step is answered unavailable and runs nothing; the next step runs it',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-rebuilt-')))
      const blog = project(base, 'blog')
      const asking = { script: planned, permission: 'auto_permission' }
      let session = ''
      await onReleaseTreeRuns(asking, [
        async tree => {
          session = await sessionIn(tree, await registered(tree, blog))
          const twice = [shell('echo ran >> twice.txt')]
          await send(tree, session, plan(twice, twice))
          await pendingCard(tree, session, 'the command, before the restart')
        },
        async tree => {
          // No step has begun in this process: the working directory has no value yet.
          const first = await pendingCard(tree, session, 'the command, after the restart')
          await answerCard(tree, first, ['--option', 'allow-once'], 'reply-rebuilt-1')
          const retried = await pendingCard(tree, session, 'the command again, in the next step')
          expect(retried.ref.request.requestId).not.toBe(first.ref.request.requestId)
          expect(existsSync(join(blog, 'twice.txt'))).toBe(false)
          await answerCard(tree, retried, ['--option', 'allow-once'], 'reply-rebuilt-2')
          const answers = toolResults(await runsEnded(tree, session, 1)).join('\n')
          expect(
            answers.match(/unavailable: this session has no working directory in force now/gu),
          ).toHaveLength(1)
          expect(read(join(blog, 'twice.txt'))).toBe('ran')
        },
      ])
    },
  )
})
