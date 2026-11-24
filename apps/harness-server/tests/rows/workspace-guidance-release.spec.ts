// @module-tag slow
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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

it(
  'C2 a completed first write introduces its directory and parent in the following request',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-write-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const leaf = join(root, 'src', 'pay')
    mkdirSync(leaf, { recursive: true })
    writeFileSync(join(root, 'src', 'AGENTS.md'), 'PARENT_GUIDANCE_107')
    writeFileSync(join(leaf, 'AGENTS.md'), 'LEAF_GUIDANCE_313')
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'pay-write',
              tool: 'Files',
              arguments: JSON.stringify({
                command: 'write',
                intent: 'create payment note',
                params: { path: 'src/pay/note.txt', text: 'one write', mode: 'create' },
              }),
            },
          ]
        : []
    })
    await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        const entries = await run(tree, await sessionIn(tree, root))
        expect(readFileSync(join(leaf, 'note.txt'), 'utf8')).toBe('one write')
        expect(requests).toHaveLength(2)
        expect(requests[0]).not.toMatch(/PARENT_GUIDANCE_107|LEAF_GUIDANCE_313/u)
        expect(requests[1]).toContain('PARENT_GUIDANCE_107')
        expect(requests[1]).toContain('LEAF_GUIDANCE_313')
        const result = entries.findIndex(entry => entry.kind === 'message.tool')
        const guidance = entries.findIndex(
          entry =>
            entry.kind === 'message.system_reminder' &&
            JSON.stringify(entry.payload).includes('LEAF_GUIDANCE_313'),
        )
        expect(result).toBeGreaterThanOrEqual(0)
        expect(guidance).toBeGreaterThan(result)
      },
    )
  },
)

it(
  'C3 sibling writes share one parent body and later visits do not repeat it',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-parallel-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    for (const leaf of ['pay', 'docs', 'next'])
      mkdirSync(join(root, 'src', leaf), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), 'ROOT_55917')
    writeFileSync(join(root, 'src', 'AGENTS.md'), 'SHARED_62585')
    for (const leaf of ['pay', 'docs', 'next'])
      writeFileSync(join(root, 'src', leaf, 'AGENTS.md'), 'GUIDE_' + leaf)
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      const leaves = requests.length === 1 ? ['docs', 'pay'] : requests.length === 2 ? ['next'] : []
      return leaves.map(leaf => ({
        id: 'call_' + leaf,
        tool: 'Files',
        arguments: JSON.stringify({
          command: 'write',
          intent: 'write note',
          params: { path: 'src/' + leaf + '/note.txt', text: 'ok', mode: 'create' },
        }),
      }))
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      await run(tree, await sessionIn(tree, root))
      expect(requests).toHaveLength(3)
      for (const marker of ['ROOT_55917', 'SHARED_62585', 'GUIDE_pay', 'GUIDE_docs', 'GUIDE_next'])
        expect(requests[2]!.split(marker).length - 1, marker).toBe(1)
    })
  },
)
