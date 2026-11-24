// @module-tag slow
// Starts the release tree and reads what the model is told about the session's working directory.
import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  onReleaseTreeRuns,
  pollUntil,
  sse,
  type ReleaseTree,
} from '../support/release-tree.ts'

type Body = Readonly<{ messages: readonly Readonly<Record<string, unknown>>[] }>
type Reply = { outcome: string; body: Record<string, unknown> }

const KEY = 'session.working-directory'
const SNAPSHOT = 'Runtime context: the current values.'
const CHANGE = 'Runtime context: these values changed.'

function replying(bodies: Body[]) {
  return ({ body }: { body: string }) => {
    const request = JSON.parse(body) as Body & { model: string }
    bodies.push(request)
    const serving = { model: request.model, provider: 'OpenAI' }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { content: `reply ${bodies.length}` } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
}

const textOf = (message: Readonly<Record<string, unknown>>): string =>
  typeof message['content'] === 'string' ? message['content'] : JSON.stringify(message['content'])
const told = (body: Body, marker: string): string[] =>
  body.messages
    .filter(message => message['role'] !== 'system')
    .map(textOf)
    .filter(text => text.includes(marker) && text.includes(KEY))
/** The reminders the request after `earlier` added about the working directory. */
const added = (earlier: Body, later: Body): string[] =>
  told({ messages: later.messages.slice(earlier.messages.length) }, CHANGE)

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

function driver(tree: ReleaseTree, session: string, ended = 0) {
  let runs = ended
  return {
    async step(text: string) {
      await ok(tree, ['send-input', '--session', session, '--text', text])
      runs += 1
      await pollUntil(
        `${String(runs)} runs end`,
        () => historyOf(tree, session),
        seen => seen.filter(entry => entry.kind === 'run.terminal').length >= runs,
      )
    },
    select: (target: readonly string[]) =>
      ok(tree, ['select-workspace', '--session', session, ...target]),
  }
}

describe('the working directory the model is told', () => {
  it(
    'changes at the next step with the old and the new directory, once, and says when it cannot be used',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'working-directory-')))
      const [blogRoot, shopRoot] = [project(base, 'blog'), project(base, 'shop')]
      const bodies: Body[] = []
      await onReleaseTree({ script: replying(bodies) }, async tree => {
        const blog = await registered(tree, blogRoot)
        const shop = await registered(tree, shopRoot)
        const created = await ok(tree, ['create-session', '--definition', 'coding', ...blog])
        const drive = driver(tree, String(created.body['session']))

        await drive.step('First.')
        await drive.select(shop)
        await drive.step('Second.')
        // Selecting the same instance again commits, and the directory in force does not change.
        await drive.select(shop)
        await drive.step('Third.')
        renameSync(shopRoot, join(base, 'gone'))
        await drive.step('Fourth.')
        renameSync(join(base, 'gone'), shopRoot)
        await drive.step('Fifth.')
        await drive.select(['--none'])
        await drive.step('Sixth.')
      })
      expect(bodies).toHaveLength(6)
      const [one, two, three, four, five, six] = bodies as [Body, Body, Body, Body, Body, Body]

      const [first] = told(one, SNAPSHOT)
      expect(first).toContain(`"state":"attached"`)
      expect(first).toContain(JSON.stringify(blogRoot))

      const switched = added(one, two)
      expect(switched).toHaveLength(1)
      const [before, previous] = switched[0]!.split('<previous>')
      expect(before).toContain(JSON.stringify(shopRoot))
      expect(before).not.toContain(JSON.stringify(blogRoot))
      expect(previous).toContain(JSON.stringify(blogRoot))
      expect(textOf(two.messages.at(-1) ?? {})).toContain('Second.')

      expect(added(two, three)).toEqual([])

      const lost = added(three, four)
      expect(lost).toHaveLength(1)
      expect(lost[0]!.split('<previous>')[0]).toContain(`"state":"unusable"`)
      expect(lost[0]!.split('<previous>')[0]).toContain(`"reason":"instance-unavailable"`)
      expect(lost[0]!.split('<previous>')[0]).not.toContain(JSON.stringify(shopRoot))

      const back = added(four, five)
      expect(back).toHaveLength(1)
      expect(back[0]!.split('<previous>')[0]).toContain(`"state":"attached"`)
      expect(back[0]!.split('<previous>')[0]).toContain(JSON.stringify(shopRoot))

      const none = added(five, six)
      expect(none).toHaveLength(1)
      expect(none[0]!.split('<previous>')[0]).toContain(`"state":"default"`)
    },
  )

  it(
    'is the server default for a session with no workspace, and is told again after the process is rebuilt',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const bodies: Body[] = []
      let session = ''
      await onReleaseTreeRuns({ script: replying(bodies) }, [
        async tree => {
          session = await tree.startSession('Before the restart.')
          await pollUntil(
            'the first run ends',
            () => historyOf(tree, session),
            seen => seen.some(entry => entry.kind === 'run.terminal'),
          )
        },
        async tree => {
          await driver(tree, session, 1).step('After the restart.')
        },
      ])
      const [before, after] = bodies as [Body, Body]
      const value = (text: string | undefined) =>
        /"directory":"[^"]+","files":\{\},"state":"default"/u.exec(text ?? '')?.[0]
      expect(told(before, SNAPSHOT)).toHaveLength(1)
      expect(value(told(before, SNAPSHOT)[0])).toBeDefined()
      expect(told(after, SNAPSHOT)).toHaveLength(2)
      expect(value(told(after, SNAPSHOT)[1])).toBe(value(told(before, SNAPSHOT)[0]))
      expect(told(after, CHANGE)).toEqual([])
    },
  )
})
