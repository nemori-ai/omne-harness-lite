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
import { runOmne, savedTenant } from '../r9/support.ts'
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
  return { tree: { ...tree, home, cli } as ReleaseTree, tenant: savedTenant(home) }
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
        // The two writes meet the fence; the command is stopped before it starts, naming the directory.
        expect(answers.match(/reason=notAuthorized/gu)).toHaveLength(2)
        expect(answers).toContain(
          `rejected reason=outsideScope path=${JSON.stringify(shop)} effect=write`,
        )
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
    'a card open over a restart is answered and its call runs once, in the directory of the step that made it',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-rebuilt-')))
      const blog = project(base, 'blog')
      const asking = { script: planned, permission: 'auto_permission' }
      let session = ''
      await onReleaseTreeRuns(asking, [
        async tree => {
          session = await sessionIn(tree, await registered(tree, blog))
          const once = [shell('echo ran >> once.txt')]
          await send(tree, session, plan(once))
          await pendingCard(tree, session, 'the command, before the restart')
        },
        async tree => {
          // The block is recovered from the session log: the step's directory is in force at once.
          const card = await pendingCard(tree, session, 'the command, after the restart')
          await answerCard(tree, card, ['--option', 'allow-once'], 'reply-rebuilt')
          const answers = toolResults(await runsEnded(tree, session, 1)).join('\n')
          expect(answers).not.toMatch(/no working directory/u)
          expect(read(join(blog, 'once.txt'))).toBe('ran')
          expect(existsSync(join(defaultOf(tree), 'once.txt'))).toBe(false)
        },
      ])
    },
  )

  it(
    'a workspace selected after the restart and before the next step does not move the call the open card holds',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-recovered-')))
      const [blog, shop] = [project(base, 'blog'), project(base, 'shop')]
      const asking = { script: planned, permission: 'auto_permission' }
      let session = ''
      let inShop: readonly string[] = []
      await onReleaseTreeRuns(asking, [
        async tree => {
          inShop = await registered(tree, shop)
          session = await sessionIn(tree, await registered(tree, blog))
          const where = [shell('pwd > where.txt')]
          await send(tree, session, plan(where))
          await pendingCard(tree, session, 'the command, before the restart')
        },
        async tree => {
          // Recovery puts back the last step's value, not the newest selection.
          await ok(tree, ['select-workspace', '--session', session, ...inShop])
          const card = await pendingCard(tree, session, 'the command, after the selection')
          await answerCard(tree, card, ['--option', 'allow-once'], 'reply-recovered')
          await runsEnded(tree, session, 1)
          expect(realpathSync(read(join(blog, 'where.txt')))).toBe(blog)
          expect(existsSync(join(shop, 'where.txt'))).toBe(false)
        },
      ])
    },
  )
})

/** The one pending card of an account, read and answered through that account's own command line. */
async function allowOnce(tree: ReleaseTree, what: string) {
  type Listed = {
    card: { ref: { request: { requestId: string }; cardId: string }; revision: string }
  }
  const [item] = await pollUntil(
    `the card of ${what}`,
    async () =>
      (JSON.parse((await tree.cli(['list-cards'])).stdout) as { body: { items?: Listed[] } }).body
        .items ?? [],
    items => items.length === 1,
  )
  const { ref, revision } = item!.card
  const reply = ['--revision', revision, '--option', 'allow-once', '--reply-id', `reply-${what}`]
  await ok(tree, [
    'submit-reply',
    '--request',
    ref.request.requestId,
    '--card',
    ref.cardId,
    ...reply,
  ])
}

const REFUSED =
  /unavailable: the workspace selected for this session cannot be used now \(reason: not-permitted\)/gu
const reminded = (entries: Awaited<ReturnType<typeof historyOf>>) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => JSON.stringify(entry.payload))
    .filter(
      text => text.includes('session.working-directory') && text.includes('these values changed'),
    )

describe('a tenant removed from a workspace', () => {
  const told = { ...bypass, extraHistoryKinds: ['message.system_reminder'] }

  it(
    'is told at its next step, its calls there are answered unavailable, and a new session there is refused',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-removed-')))
      const blog = project(base, 'blog')
      await onReleaseTree(told, async tree => {
        const at = await registered(tree, blog)
        const workspace = at[1]!
        const frank = await another(tree, 'frank')
        await ok(tree, ['workspace', 'grant', workspace, frank.tenant])
        const session = await sessionIn(frank.tree, at)
        await ran(frank.tree, session, 1, plan([write('by-frank.txt', 'one')]))
        expect(read(join(blog, 'by-frank.txt'))).toBe('one')
        expect(reminded(await historyOf(frank.tree, session))).toEqual([])

        // Nothing tells the session: its next step asks, and so does each call.
        await ok(tree, ['workspace', 'remove', workspace, frank.tenant])
        const work = plan([write('after.txt', 'two'), shell('pwd > after-shell.txt')])
        const answers = await ran(frank.tree, session, 2, work)
        expect(answers.match(REFUSED)).toHaveLength(2)
        for (const directory of [blog, defaultOf(tree)])
          for (const name of ['after.txt', 'after-shell.txt'])
            expect(existsSync(join(directory, name))).toBe(false)
        const reminders = reminded(await historyOf(frank.tree, session))
        expect(reminders).toHaveLength(1)
        expect(reminders[0]).toMatch(/state\\+":\\+"unusable/u)
        expect(reminders[0]).toMatch(/reason\\+":\\+"not-permitted/u)

        const again = await frank.tree.cli(['create-session', '--definition', 'coding', ...at])
        expect([again.status, (JSON.parse(again.stdout) as Reply).outcome]).toEqual([3, 'invalid'])
        const hidden = await frank.tree.cli(['workspace', 'show', workspace])
        expect((JSON.parse(hidden.stdout) as Reply).outcome).toBe('not-found')

        // What it did before stays where it was done, and the owner is as before.
        expect(read(join(blog, 'by-frank.txt'))).toBe('one')
        expect(read(join(blog, 'README.md'))).toBe('# blog')
        const owned = (await ok(tree, ['workspace', 'list'])).body['workspaces']
        expect(owned).toEqual([{ workspace, type: 'directory', standing: 'owner' }])
        const own = await sessionIn(tree, at)
        await ran(tree, own, 1, plan([write('by-owner.txt', 'mine')]))
        expect(read(join(blog, 'by-owner.txt'))).toBe('mine')
      })
    },
  )

  it(
    'a call it already made, accepted before the removal, is refused when it comes to run: knowing the directory is no permit',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'directory-removed-step-')))
      const blog = project(base, 'blog')
      const asking = { ...told, permission: 'auto_permission' }
      await onReleaseTree(asking, async tree => {
        const at = await registered(tree, blog)
        const frank = await another(tree, 'frank')
        await ok(tree, ['workspace', 'grant', at[1]!, frank.tenant])
        const session = await sessionIn(frank.tree, at)
        await send(frank.tree, session, plan([shell('pwd > same-step.txt')]))
        // The call was accepted in this step and waits for a person. No step begins before it runs.
        const entries = await pollUntil(
          'the call to be made',
          () => historyOf(frank.tree, session),
          seen => seen.some(entry => entry.kind === 'message.assistant'),
        )
        expect(reminded(entries)).toEqual([])
        await ok(tree, ['workspace', 'remove', at[1]!, frank.tenant])
        await allowOnce(frank.tree, 'the command of the removed tenant')
        const after = await runsEnded(frank.tree, session, 1)
        // The call ends, refused: it is fenced into nothing. The step after it is told why.
        expect(toolResults(after).join('\n')).toMatch(
          /^rejected request="[^"]+" reason=notAuthorized$/u,
        )
        const kinds = after.map(entry => entry.kind)
        expect(kinds.indexOf('message.tool')).toBeLessThan(
          kinds.lastIndexOf('message.system_reminder'),
        )
        expect(reminded(after)).toHaveLength(1)
        expect(reminded(after)[0]).toMatch(/reason\\+":\\+"not-permitted/u)
        expect(existsSync(join(blog, 'same-step.txt'))).toBe(false)
        expect(existsSync(join(defaultOf(tree), 'same-step.txt'))).toBe(false)
      })
    },
  )
})

describe('files outside the workspace of a session', () => {
  it(
    'a session with a workspace keeps to it by the setting, Shell is stopped before it starts and names the path; a session with none is as before',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'outside-files-')))
      const blog = project(base, 'blog')
      const outside = join(base, 'outside')
      mkdirSync(outside)
      const secret = join(outside, 'secret.txt')
      writeFileSync(secret, 'outside-bytes\n')
      const readFile = (path: string): Call => ({
        tool: 'Files',
        command: 'read',
        params: { path },
      })
      await onReleaseTree(bypass, async tree => {
        const inBlog = await sessionIn(tree, await registered(tree, blog))
        const none = await ran(tree, inBlog, 1, plan([shell(`cat ${secret}`), readFile(secret)]))
        expect(none).toContain(
          `rejected reason=outsideScope path=${JSON.stringify(secret)} effect=read`,
        )
        expect(none).not.toContain('outside-bytes')
        await ok(tree, [
          'setting',
          'set',
          '--independent',
          'workspace/outside-files',
          'access',
          '--value',
          '"read"',
        ])
        const written = join(outside, 'written.txt')
        const reads = await ran(
          tree,
          inBlog,
          2,
          plan([shell(`cat ${secret}`), readFile(secret), shell(`echo x > ${written}`)]),
        )
        expect(reads.match(/outside-bytes/gu)?.length).toBe(2)
        expect(reads).toContain(
          `rejected reason=outsideScope path=${JSON.stringify(written)} effect=write`,
        )
        expect(existsSync(written)).toBe(false)
        // A session with no workspace reads no setting and runs its scripts as before.
        const plain = await sessionIn(tree, [])
        expect(await ran(tree, plain, 1, plan([shell(`cat ${secret}`)]))).toContain('outside-bytes')
      })
    },
  )
})
