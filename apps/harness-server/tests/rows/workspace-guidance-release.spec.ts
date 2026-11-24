// @module-tag slow
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
} from '../support/release-tree.ts'

async function command(tree: ReleaseTree, args: string[]) {
  const reply = await tree.cli(args)
  expect(reply.status, reply.stderr).toBe(0)
  return (JSON.parse(reply.stdout) as { body: Record<string, string> }).body
}

async function registered(tree: ReleaseTree, root: string) {
  const { workspace, instance } = await command(tree, ['workspace', 'register', root])
  return ['--workspace', workspace!, '--instance', instance!]
}

async function sessionIn(tree: ReleaseTree, root: string | string[]) {
  const selected = typeof root === 'string' ? await registered(tree, root) : root
  const { session } = await command(tree, ['create-session', '--definition', 'coding', ...selected])
  return session!
}

async function run(tree: ReleaseTree, session: string, ordinal = 1) {
  await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
  return pollUntil(
    'the run ends',
    () => {
      for (const record of tree.records) {
        const text = (record['fields'] as { text?: string } | undefined)?.text
        if (text?.includes('owner=session-log-journal diagnostic=')) throw new Error(text)
      }
      return historyOf(tree, session)
    },
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= ordinal,
  )
}

it(
  'C1 the first model request receives only the selected workspace root guidance',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-guidance-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const root = join(base, 'workspace')
    const child = join(root, 'pay')
    mkdirSync(child, { recursive: true })
    writeFileSync(join(base, 'AGENTS.md'), 'OUTSIDE_GUIDANCE_856')
    writeFileSync(join(child, 'AGENTS.md'), 'CHILD_GUIDANCE_629')
    writeFileSync(join(root, 'AGENTS.md'), 'ROOT_GUIDANCE_471')
    const captured: { role: string; content: unknown }[][] = []
    await onReleaseTree(
      {
        script: toolCallsByRequest(body => {
          captured.push(
            (JSON.parse(body) as { messages: { role: string; content: unknown }[] }).messages,
          )
          return []
        }),
        extraHistoryKinds: ['message.system_reminder'],
      },
      async tree => {
        const entries = await run(tree, await sessionIn(tree, root))
        expect(captured).toHaveLength(1)
        const messages = captured[0]!
        expect(JSON.stringify(messages.filter(m => m.role === 'system'))).not.toContain(
          'ROOT_GUIDANCE_471',
        )
        const guidance = messages.filter(m =>
          JSON.stringify(m.content).includes('ROOT_GUIDANCE_471'),
        )
        expect(guidance).toHaveLength(1)
        expect(JSON.stringify(guidance)).toContain('AGENTS.md')
        expect(JSON.stringify(messages)).not.toMatch(/OUTSIDE_GUIDANCE_856|CHILD_GUIDANCE_629/u)
        expect(
          JSON.stringify(entries.filter(entry => entry.kind === 'message.system_reminder')),
        ).toContain('ROOT_GUIDANCE_471')
        const empty = join(base, 'empty')
        mkdirSync(empty)
        await run(tree, await sessionIn(tree, empty))
        expect(captured).toHaveLength(2)
        expect(JSON.stringify(captured[1])).not.toMatch(
          /ROOT_GUIDANCE_471|OUTSIDE_GUIDANCE_856|CHILD_GUIDANCE_629/u,
        )
      },
    )
  },
)
