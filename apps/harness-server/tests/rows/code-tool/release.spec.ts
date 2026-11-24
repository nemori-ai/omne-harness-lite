// @module-tag slow
// Starts the release tree with a Model script that calls Code, and reads what the program did.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { ONCE, answerCard, pendingCard, setShell } from '../authorization/release-flow-support.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallReferences,
  toolCalls,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const PROGRAMS: Readonly<Record<string, string>> = {
  read: [
    'const a = await Files.read({ path: "a.txt" })',
    'const b = await tools.Files.read({ path: "b.txt" })',
    'return { total: a.text.length + b.text.length, first: a.text.slice(0, 5) }',
  ].join('\n'),
  twice: [
    'const first = await Shell.execute({ script: "echo one-done" })',
    'let second',
    'try { second = (await Shell.execute({ script: "echo one-done" })).stdout }',
    'catch (error) { second = "refused:" + error.kind + ":" + error.effect }',
    'return { first: first.stdout.trim(), second }',
  ].join('\n'),
  refused: [
    'try { await Shell.execute({ script: "echo never-done" }); return "ran" }',
    'catch (error) { return { kind: error.kind, tool: error.tool, command: error.command, effect: error.effect } }',
  ].join('\n'),
  together: [
    'const [held, read] = await Promise.all([',
    '  Shell.execute({ script: "echo held-done" }),',
    '  Files.read({ path: "a.txt" }),',
    '])',
    'return { held: held.stdout.trim(), read: read.text }',
  ].join('\n'),
  hidden: ['try { await Files.read({ path: "missing.txt" }) } catch {}', 'return "all fine"'].join(
    '\n',
  ),
  slow: [
    'const quick = await Shell.execute({ script: "echo quick-done" })',
    'const rest = await Promise.all([',
    '  Shell.execute({ script: "sleep 45; echo a-done" }),',
    '  Shell.execute({ script: "sleep 45; echo b-done" }),',
    '])',
    'return [quick.stdout, rest.length]',
  ].join('\n'),
  loop: 'while (true) {}',
  memory:
    'const all = []\nwhile (true) all.push(new Array(100000).fill("x".repeat(64) + all.length))',
  output: 'return "x".repeat(200000)',
}

// Each new user message asks for one call: a program by its label, or one direct read of a file.
const codeScript = toolCallsByRequest(body => {
  const last = (
    JSON.parse(body) as { messages?: { role: string; content: unknown }[] }
  ).messages?.at(-1)
  if (last?.role !== 'user') return []
  const text = JSON.stringify(last.content)
  const label = /start: code ([a-z0-9-]+)/.exec(text)?.[1]
  const code = label === undefined ? undefined : PROGRAMS[label]
  if (code !== undefined)
    return [
      {
        id: `call_${label}`,
        tool: 'Code',
        arguments: JSON.stringify({ command: 'execute', code }),
      },
    ]
  const path = /start: path ([a-z0-9.-]+)/.exec(text)?.[1]
  if (path !== undefined)
    return [
      { id: 'call_path', tool: 'Code', arguments: JSON.stringify({ command: 'execute', path }) },
    ]
  return /start: direct/.test(text)
    ? [
        {
          id: 'call_direct',
          tool: 'Files',
          arguments: JSON.stringify({
            command: 'read',
            intent: 'test call',
            params: { path: 'a.txt' },
          }),
        },
      ]
    : []
})

/** The server's default directory: where a session with no workspace works. */
function seed(tree: ReleaseTree, files: Readonly<Record<string, string>>): string {
  const directory = join(dirname(tree.storageRoot), 'workspace')
  mkdirSync(directory, { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text)
  return directory
}

async function ended(tree: ReleaseTree, session: string, what: string, runs = 1) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length === runs,
  )
  return { session, entries, result: toolResults(entries).join('\n') }
}

async function ran(tree: ReleaseTree, label: string) {
  return ended(tree, await tree.startSession(`start: code ${label}`), label)
}

type Child = Readonly<{
  ordinal: number
  tool: string
  command: string | null
  preview: string
  state: string
  child: string | null
}>

/** What `tool/v1` answers for the positions under one call. */
async function childrenOf(tree: ReleaseTree, reference: string) {
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/tool/v1/list-call-children`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'omne-message-id': `m-${Math.random().toString(36).slice(2)}`,
        'omne-contract-revision': '2',
      },
      body: JSON.stringify({ tenant: savedTenant(tree.home), reference, cursor: null }),
    },
  )
  const json = (await response.json()) as { outcome: string; body?: { items?: Child[] } }
  return { outcome: json.outcome, items: json.body?.items ?? [] }
}

const codeReference = (tree: ReleaseTree): string => {
  const [reference] = toolCallReferences(tree.storageRoot, 'Code')
  if (reference === undefined) throw new Error('no call of Code in the ledger')
  return reference
}

const callsOf = (tree: ReleaseTree, tool: string) =>
  toolCalls(tree.storageRoot).filter(row => row.tool === tool)

it('a program reads two files through Files and gives back only what it chose', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'bypass-permissions' },
    async tree => {
      seed(tree, { 'a.txt': 'hello world', 'b.txt': 'second file' })
      const { result } = await ran(tree, 'read')
      expect(result).toContain('done Code execute')
      expect(result).toContain('"total":22')
      expect(result).toContain('"first":"hello"')
      expect(result).not.toContain('second file')
      const calls = toolCalls(tree.storageRoot)
      expect(calls.filter(row => row.tool === 'Code')).toHaveLength(1)
      expect(calls.filter(row => row.tool === 'Files')).toHaveLength(2)
    },
  )
  expect(exit).toBe(0)
})

it('HS-52 a tool that asks is asked for at each position of a program: releasing one position releases only it', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'auto_permission', extraHistoryKinds: [ONCE] },
    async tree => {
      const session = await tree.startSession('start: code twice')
      const first = await pendingCard(tree, session, 'the first position')
      expect(first.question).toMatchObject({
        kind: 'release',
        target: { tool: 'Shell', command: 'execute' },
        origin: { program: true },
      })
      expect(callsOf(tree, 'Shell')).toHaveLength(0)
      // A person reads the card through the client protocol: it says a program made the action.
      const listed = await tree.cli(['list-cards', '--session', session])
      expect(listed.status, listed.stderr).toBe(0)
      const [shown] = (
        JSON.parse(listed.stdout) as {
          body: { items: { card: { question: { origin: unknown } } }[] }
        }
      ).body.items
      expect(shown?.card.question.origin).toMatchObject({ program: true })
      expect(listed.stderr).toContain('来源：由程序发起')
      await answerCard(tree, first, ['--option', 'allow-once'], 'reply-first')
      const second = await pollUntil(
        'the card of the second position',
        () => tree.cards({ sessionRef: session, states: ['pending'] }),
        cards =>
          cards.length === 1 &&
          cards[0]?.card.ref.request.requestId !== first.ref.request.requestId,
      )
      expect(callsOf(tree, 'Shell')).toHaveLength(1)
      await answerCard(tree, second[0]!.card, ['--option', 'deny-once'], 'reply-second')
      const { result, entries } = await ended(tree, session, 'twice')
      expect(result).toContain('"first":"one-done"')
      expect(result).toContain('"second":"refused:denied:none"')
      expect(callsOf(tree, 'Shell')).toHaveLength(1)
      expect(callsOf(tree, 'Code')).toHaveLength(1)
      const granted = entries.filter(entry => entry.kind === ONCE)
      expect(granted).toHaveLength(1)
      const payload = granted[0]?.payload as {
        expression: { scope: { consumer: { position: string } } }
      }
      const { expression } = payload
      expect(expression.scope).toMatchObject({
        kind: 'once',
        consumer: { owner: '@omne-harness/agent' },
      })
      expect(expression.scope.consumer.position).toMatch(/\/nested\/1$/u)
    },
  )
  expect(exit).toBe(0)
})

it('HS-52 a tool set to deny is refused inside a program, with no card and no call', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'auto_permission' },
    async tree => {
      await setShell(tree, 'deny', 'shell-denied')
      const { session, result } = await ran(tree, 'refused')
      expect(result).toContain('done Code execute')
      expect(result).toContain('"kind":"denied"')
      expect(result).toContain('"tool":"Shell"')
      expect(result).toContain('"effect":"none"')
      expect(callsOf(tree, 'Shell')).toHaveLength(0)
      expect(await tree.cards({ sessionRef: session })).toHaveLength(0)
      const listed = await childrenOf(tree, codeReference(tree))
      expect(listed.items).toMatchObject([
        { ordinal: 1, tool: 'Shell', command: 'execute', state: 'denied' },
      ])
    },
  )
  expect(exit).toBe(0)
})

it('one position that waits for a person does not hold another: the other call ends first, and one answer is one decision', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'auto_permission', programLimits: { computeMs: 1500 } },
    async tree => {
      seed(tree, { 'a.txt': 'read while waiting' })
      const session = await tree.startSession('start: code together')
      const card = await pendingCard(tree, session, 'the held position')
      await pollUntil(
        'the read of the other position to end',
        async () => callsOf(tree, 'Files'),
        rows => rows.length === 1,
      )
      expect(callsOf(tree, 'Shell')).toHaveLength(0)
      const reference = codeReference(tree)
      const waiting = await pollUntil(
        'the position of the read to show its end',
        () => childrenOf(tree, reference),
        listed => listed.items[1]?.state === 'completed',
      )
      expect(waiting).toMatchObject({
        outcome: 'succeeded',
        items: [
          { ordinal: 1, tool: 'Shell', command: 'execute', state: 'waiting', child: null },
          { ordinal: 2, tool: 'Files', command: 'read', state: 'completed' },
        ],
      })
      expect(waiting.items[0]?.preview).toContain('echo held-done')
      const read = waiting.items[1]?.child ?? ''
      expect(await childrenOf(tree, read)).toEqual({ outcome: 'succeeded', items: [] })
      expect(await childrenOf(tree, reference.replace(/"[^"]*"\]$/u, '"op-never"]'))).toEqual({
        outcome: 'denied',
        items: [],
      })
      // Longer than the computing limit: waiting for a person is not computing.
      await new Promise(resolve => setTimeout(resolve, 2500))
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toHaveLength(1)
      await answerCard(tree, card, ['--option', 'allow-once'], 'reply-held')
      const { result } = await ended(tree, session, 'together')
      expect(result).toContain('"held":"held-done"')
      expect(result).toContain('"read":"read while waiting"')
      expect(callsOf(tree, 'Shell')).toHaveLength(1)
      const after = await childrenOf(tree, reference)
      expect(after.items.map(item => item.state)).toEqual(['completed', 'completed'])
      const [shell] = toolCallReferences(tree.storageRoot, 'Shell')
      expect(after.items[0]?.child).toBe(shell)
      const cli = await tree.cli(['calls', 'children', '--call', reference])
      expect(cli.status, cli.stderr).toBe(0)
      expect(cli.stdout).toMatch(/^1 {2}completed {2}Shell execute · .*echo held-done/u)
      expect(cli.stdout).toMatch(/\n2 {2}completed {2}Files read · /u)
    },
  )
  expect(exit).toBe(0)
})

it.each([
  ['loop', 'compute'],
  ['memory', 'memory'],
  ['output', 'output'],
] as const)(
  'a program that runs away (%s) is ended and the limit is named: %s',
  async (label, limit) => {
    const exit = await onReleaseTree(
      {
        script: codeScript,
        permission: 'bypass-permissions',
        programLimits: { computeMs: 1500, memoryBytes: 16 * 1024 * 1024, outputBytes: 65_536 },
      },
      async tree => {
        const { result } = await ran(tree, label)
        expect(result).toContain(`Code execute failed kind=exceeded limit=${limit}`)
        expect(result).not.toContain('done Code execute')
      },
    )
    expect(exit).toBe(0)
  },
)

it('HS-53 without the row of the restricted domain Code is not available, and other tools run as before', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'bypass-permissions', withoutRows: ['execution-program'] },
    async tree => {
      seed(tree, { 'a.txt': 'still readable' })
      const { session, result } = await ran(tree, 'read')
      expect(result).toContain('Code is not available now (dependency-unavailable:program.run)')
      expect(callsOf(tree, 'Code')).toHaveLength(0)
      const sent = await tree.cli(['send-input', '--session', session, '--text', 'start: direct'])
      expect(sent.status, sent.stderr).toBe(0)
      const direct = await ended(tree, session, 'the direct read', 2)
      expect(direct.result).toContain('still readable')
      expect(callsOf(tree, 'Files')).toHaveLength(1)
    },
  )
  expect(exit).toBe(0)
})

it('a program kept in a file is run by its path: the file is read as a call of the program, and the result names it', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'bypass-permissions' },
    async tree => {
      const program = 'const a = await Files.read({ path: "a.txt" })\nreturn a.text.length'
      seed(tree, { 'a.txt': 'hello world', 'count.ts': program })
      const session = await tree.startSession('start: path count.ts')
      const { result } = await ended(tree, session, 'the stored program')
      expect(result).toContain('done Code execute')
      expect(result).toMatch(
        /\nprogram: count\.ts sha256:[0-9a-f]{64}\nresult:\n11\ncalls: 2 completed/u,
      )
      expect(callsOf(tree, 'Files')).toHaveLength(2)
      const sent = await tree.cli([
        'send-input',
        '--session',
        session,
        '--text',
        'start: path gone.ts',
      ])
      expect(sent.status, sent.stderr).toBe(0)
      const missing = await ended(tree, session, 'the missing program', 2)
      expect(missing.result).toContain('Code execute failed kind=unreadable\ngone.ts: ')
      expect(missing.result).toContain('Nothing ran.')
    },
  )
  expect(exit).toBe(0)
})

it('TL-73 a failure a program caught and hid is in the summary the model reads', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'bypass-permissions' },
    async tree => {
      const { result } = await ran(tree, 'hidden')
      expect(result).toContain(
        'done Code execute\nresult:\n"all fine"\ncalls: 0 completed, 1 failed',
      )
      expect(result).toMatch(/\n- #1 Files\.read failed, effect /u)
    },
  )
  expect(exit).toBe(0)
})

it('TL-69 stopping a program midway stops the calls it still has: each says stopped, and the one that completed stays', async () => {
  const exit = await onReleaseTree(
    { script: codeScript, permission: 'bypass-permissions' },
    async tree => {
      const session = await tree.startSession('start: code slow')
      const reference = await pollUntil(
        'the call of Code',
        async () => toolCallReferences(tree.storageRoot, 'Code')[0],
        found => found !== undefined,
      )
      if (reference === undefined) throw new Error('no call of Code')
      await pollUntil(
        'the two slow commands to run',
        () => childrenOf(tree, reference),
        listed => listed.items.filter(item => item.state === 'running').length === 2,
      )
      const stopped = await tree.cli([
        'calls',
        'stop',
        '--session',
        session,
        '--call',
        reference,
        '--reason',
        'stop the program midway',
      ])
      expect(stopped.status, stopped.stderr).toBe(0)
      const started = Date.now()
      const after = await pollUntil(
        'every position to have an end',
        () => childrenOf(tree, reference),
        listed =>
          listed.items.every(item => !['running', 'queued', 'waiting'].includes(item.state)),
      )
      expect(after.items.map(item => item.state)).toEqual(['completed', 'stopped', 'stopped'])
      // Far sooner than the commands would have ended by themselves.
      expect(Date.now() - started).toBeLessThan(30_000)
      const { result } = await ended(tree, session, 'the stopped program')
      expect(result).not.toContain('a-done')
      expect(result).not.toContain('done Code execute')
    },
  )
  expect(exit).toBe(0)
})
