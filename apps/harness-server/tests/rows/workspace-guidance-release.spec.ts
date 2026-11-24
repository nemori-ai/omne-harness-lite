// @module-tag slow
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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

it(
  'C4 both switch entrances preserve the request prefix and reuse a retained root body on returning',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-switch-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'a')
    const b = join(base, 'b')
    for (const [root, text] of [
      [a, 'GUIDE_A_911'],
      [b, 'GUIDE_B_884'],
    ] as const) {
      mkdirSync(root)
      writeFileSync(join(root, 'AGENTS.md'), text)
    }
    type WireMessage = { role: string; content: unknown }
    const requests: WireMessage[][] = []
    const script = toolCallsByRequest(body => {
      requests.push((JSON.parse(body) as { messages: WireMessage[] }).messages)
      const target = requests.length === 3 ? b : requests.length === 4 ? a : null
      return target === null
        ? []
        : [
            {
              id: 'switch_' + requests.length,
              tool: 'SwitchWorkspace',
              arguments: JSON.stringify({ directory: target }),
            },
          ]
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      const first = await registered(tree, a)
      const second = await registered(tree, b)
      const session = await sessionIn(tree, first)
      await run(tree, session)
      for (const [target, ordinal] of [
        [second, 2],
        [first, 3],
      ] as const) {
        await command(tree, ['select-workspace', '--session', session, ...target])
        await run(tree, session, ordinal)
      }
      expect(requests).toHaveLength(5)
      for (const [index, request] of requests.entries()) {
        const body = JSON.stringify(request)
        expect(body.split('GUIDE_A_911')).toHaveLength(2)
        expect(body.split('GUIDE_B_884')).toHaveLength(index === 0 ? 1 : 2)
        if (index > 0) {
          const prior = requests[index - 1]!
          expect(request.slice(0, prior.length)).toEqual(prior)
        }
        const manifests = request.filter(m =>
          JSON.stringify(m).includes('session.workspace-guidance'),
        )
        const latest = JSON.stringify(manifests.at(-1))
        expect(latest).toContain([a, b, a, b, a][index])
      }
    })
  },
)

it(
  'C4 a Shell result returning after A to B to A keeps its original visit out of the new binding',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-late-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'A'),
      b = join(base, 'B')
    const leaf = join(a, 'src', 'pay')
    mkdirSync(leaf, { recursive: true })
    mkdirSync(b)
    writeFileSync(join(leaf, 'AGENTS.md'), 'STALE_BODY_410')
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'late-shell',
              tool: 'Shell',
              arguments: JSON.stringify({
                command: 'execute',
                intent: 'wait for switch',
                params: {
                  cwd: 'src/pay',
                  script:
                    'printf started > started; while [ ! -f go ]; do sleep 0.1; done; printf completed > completed',
                },
              }),
            },
          ]
        : []
    })
    await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['call.execution-fact', 'message.system_reminder'],
      },
      async tree => {
        const first = await registered(tree, a),
          second = await registered(tree, b)
        const session = await sessionIn(tree, first)
        await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
        try {
          await pollUntil(
            'the original shell starts in A/pay',
            () => existsSync(join(leaf, 'started')),
            Boolean,
          )
          await command(tree, ['select-workspace', '--session', session, ...second])
          await command(tree, ['select-workspace', '--session', session, ...first])
        } finally {
          writeFileSync(join(leaf, 'go'), '')
        }
        const entries = await pollUntil(
          'the original run completes',
          () => historyOf(tree, session),
          seen => seen.some(e => e.kind === 'run.terminal'),
        )
        expect(readFileSync(join(leaf, 'completed'), 'utf8')).toBe('completed')
        expect(requests).toHaveLength(2)
        expect(requests[1]).not.toContain('STALE_BODY_410')
        const evidence = entries.filter(
          e => e.kind === 'call.execution-fact' && JSON.stringify(e.payload).includes(leaf),
        )
        expect(evidence.length).toBeGreaterThan(0)
      },
    )
  },
)
