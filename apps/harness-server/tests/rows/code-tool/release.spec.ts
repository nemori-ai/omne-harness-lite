// @module-tag slow
// Starts the release tree with a Model script that calls Code, and reads what the program did.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { ONCE, answerCard, pendingCard, setShell } from '../authorization/release-flow-support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
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
      // Longer than the computing limit: waiting for a person is not computing.
      await new Promise(resolve => setTimeout(resolve, 2500))
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toHaveLength(1)
      await answerCard(tree, card, ['--option', 'allow-once'], 'reply-held')
      const { result } = await ended(tree, session, 'together')
      expect(result).toContain('"held":"held-done"')
      expect(result).toContain('"read":"read while waiting"')
      expect(callsOf(tree, 'Shell')).toHaveLength(1)
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
