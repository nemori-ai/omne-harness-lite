// @module-tag slow
// Starts the release tree and drives sessions and workspaces with the real omne command line.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runOmne } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = { outcome: string; body: Record<string, unknown>; request: Record<string, string> }
const replyOf = (stdout: string) => JSON.parse(stdout) as Reply

function project(base: string, name: string): string {
  const root = join(base, name)
  mkdirSync(root)
  writeFileSync(join(root, 'README.md'), `# ${name}\n`)
  return root
}

async function registered(tree: ReleaseTree, directory: string) {
  const reply = replyOf((await tree.cli(['workspace', 'register', directory])).stdout)
  expect(reply.outcome).toBe('succeeded')
  const { workspace, instance } = reply.body as { workspace: string; instance: string }
  return { workspace, instance, at: ['--workspace', workspace, '--instance', instance] }
}

async function stranger(tree: ReleaseTree) {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  const server = `http://127.0.0.1:${String(tree.port)}`
  const credential = 'frank-pw-session-workspace-51b7'
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'frank'],
          home,
          server,
          cwd: base,
          credential,
        })
      ).status,
    ).toBe(0)
  return (args: readonly string[]) => runOmne({ args, home, server, cwd: base })
}

const WORKSPACE_KINDS = ['session.created', 'session.workspace-changed']
const ofKind = (entries: readonly { kind: string }[], kind: string) =>
  entries.filter(entry => entry.kind === kind)

describe('a session and the workspace it works in', () => {
  it(
    'is created in a verified instance, refuses one that is not, changes its selection by command and reads it back',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'session-workspace-')))
      const options = { script: toolCallsThenText(() => []), extraHistoryKinds: WORKSPACE_KINDS }
      const exitCode = await onReleaseTree(options, async tree => {
        const blog = await registered(tree, project(base, 'blog'))
        const shop = await registered(tree, project(base, 'shop'))

        const created = await tree.cli(['create-session', '--definition', 'coding', ...blog.at])
        expect(created.status).toBe(0)
        const session = String(replyOf(created.stdout).body['session'])
        const first = await historyOf(tree, session)
        expect(JSON.stringify(ofKind(first, 'session.created'))).toContain(blog.workspace)
        expect(JSON.stringify(ofKind(first, 'session.created'))).toContain(blog.instance)
        expect(ofKind(first, 'session.workspace-changed')).toEqual([])
        const read = async () =>
          replyOf((await tree.cli(['read-workspace-selection', '--session', session])).stdout)
        expect(await read()).toMatchObject({
          outcome: 'succeeded',
          body: {
            workspace: { workspace: blog.workspace, instance: blog.instance },
            state: 'attached',
            directory: join(base, 'blog'),
            reason: null,
          },
        })

        // An instance that is not one, an instance of another workspace, and another tenant: no session.
        const bogus = [
          '--workspace',
          blog.workspace,
          '--instance',
          'wsi_zzzzzzzzzzzzzzzzzzzzzzzzzz',
        ]
        const mixed = ['--workspace', blog.workspace, '--instance', shop.instance]
        for (const at of [bogus, mixed]) {
          const refused = await tree.cli(['create-session', '--definition', 'coding', ...at])
          expect([refused.status, replyOf(refused.stdout).outcome]).toEqual([3, 'invalid'])
        }
        const frank = await stranger(tree)
        const foreign = await frank(['create-session', '--definition', 'coding', ...blog.at])
        expect([foreign.status, replyOf(foreign.stdout).outcome]).toEqual([3, 'invalid'])
        const peek = await frank(['read-workspace-selection', '--session', session])
        expect([peek.status === 0, peek.stdout.includes(blog.instance)]).toEqual([false, false])

        const select = (target: readonly string[]) =>
          tree.cli(['select-workspace', '--session', session, ...target])
        const moved = replyOf((await select(shop.at)).stdout)
        expect(moved).toMatchObject({
          outcome: 'succeeded',
          body: { directory: join(base, 'shop') },
        })
        const again = replyOf((await select(shop.at)).stdout)
        expect(again.outcome).toBe('succeeded')
        const refused = replyOf((await select(bogus)).stdout)
        expect(refused).toMatchObject({ outcome: 'invalid', body: { reason: 'not-permitted' } })
        // Selecting the selection it stands at commits like any other, as selecting the current model does.
        const changed = ofKind(await historyOf(tree, session), 'session.workspace-changed')
        expect(changed).toHaveLength(2)
        expect(JSON.stringify(changed)).toContain(shop.instance)
        expect(JSON.stringify(changed)).not.toContain(blog.instance)
        expect(await read()).toMatchObject({
          outcome: 'succeeded',
          body: {
            workspace: { workspace: shop.workspace, instance: shop.instance },
            state: 'attached',
            directory: join(base, 'shop'),
          },
        })

        expect(replyOf((await select(['--none'])).stdout)).toMatchObject({
          outcome: 'succeeded',
          body: { directory: null },
        })
        expect(ofKind(await historyOf(tree, session), 'session.workspace-changed')).toHaveLength(3)
        const none = await read()
        expect(none).toMatchObject({
          outcome: 'succeeded',
          body: { workspace: null, state: 'default' },
        })
        expect(none.body['directory']).toEqual(expect.any(String))
      })
      expect(exitCode).toBe(0)
    },
  )
})
