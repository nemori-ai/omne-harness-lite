// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { HitlCardItem } from '@omne-harness/public-contract'
import type { ToolInvokeOutcome } from '@omne-harness/tool-contract'
import {
  historyOf,
  onReleaseTree,
  toolCalls,
  toolCallsThenText,
  type Entry,
  type ReleaseTree,
  type ToolCallRow,
} from '../../support/release-tree.ts'

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})

const waitFor = (name: string) =>
  JSON.stringify({
    command: 'execute',
    params: { script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done` },
  })
const echo = (text: string) =>
  JSON.stringify({ command: 'execute', params: { script: `echo ${text}` } })

const script = toolCallsThenText(body =>
  body.includes('start: ask and wait')
    ? [
        { id: 'call_a', tool: 'Ask', arguments: ASK },
        { id: 'call_b', tool: 'Shell', arguments: waitFor('go-b') },
      ]
    : body.includes('start: ask and echo')
      ? [
          { id: 'call_a', tool: 'Ask', arguments: ASK },
          { id: 'call_b', tool: 'Shell', arguments: echo('b-done') },
        ]
      : body.includes('start: wait x')
        ? [{ id: 'call_x', tool: 'Shell', arguments: waitFor('go-x') }]
        : [{ id: 'call_y', tool: 'Shell', arguments: echo('y-done') }],
)
const options = { script, permission: 'bypass-permissions' }

const release = (world: ReleaseTree, name: string) =>
  writeFileSync(join(dirname(world.storageRoot), 'workspace', name), '')

async function callsUntil(
  world: ReleaseTree,
  what: string,
  done: (calls: readonly ToolCallRow[]) => boolean,
): Promise<readonly ToolCallRow[]> {
  let calls: readonly ToolCallRow[] = []
  for (const end = Date.now() + 120_000; Date.now() < end; await sleep(100)) {
    calls = toolCalls(world.storageRoot)
    if (done(calls)) return calls
  }
  throw new Error(`${what} did not happen: ${JSON.stringify(calls)}`)
}

const callOf = (calls: readonly ToolCallRow[], tool: string) => calls.find(row => row.tool === tool)
const stageOf = (calls: readonly ToolCallRow[], tool: string) => callOf(calls, tool)?.entry?.stage

async function settled(world: ReleaseTree, session: string): Promise<readonly Entry[]> {
  let entries: readonly Entry[] = []
  for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250)) {
    entries = await historyOf(world, session)
    if (entries.some(entry => entry.kind === 'run.terminal')) return entries
  }
  throw new Error(`the Run of the session did not end: ${JSON.stringify(entries.map(e => e.kind))}`)
}

function textsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textsOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (record['kind'] === 'text' && typeof record['text'] === 'string') return [record['text']]
  return Object.values(record).flatMap(textsOf)
}

const toolResults = (entries: readonly Entry[]) =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .map(entry => textsOf(entry.payload).join('\n'))

async function answer(world: ReleaseTree, session: string, text: string): Promise<void> {
  for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250))
    if ((await world.cards({ sessionRef: session })).length > 0) break
  const listed = await world.cli(['list-cards', '--session', session])
  expect(listed.status, listed.stderr).toBe(0)
  const [item] = (JSON.parse(listed.stdout) as { body: { items: HitlCardItem[] } }).body.items
  if (item === undefined) throw new Error('the session has no card')
  const answered = await world.cli([
    'submit-reply',
    '--request',
    item.card.ref.request.requestId,
    '--card',
    item.card.ref.cardId,
    '--revision',
    item.card.revision,
    '--text',
    text,
    '--reply-id',
    `reply-${session}`,
  ])
  expect(answered.status, answered.stderr).toBe(0)
}

const ANSWER = 'Q1 Which port should the dev server use?: the person wrote: "Use 8081"'

describe('the slots of the concurrency scope of one run (C5)', () => {
  it(
    'with toolConcurrency 1, B runs while A waits for a person; answered, A queues until B ends',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask and wait')
        const waiting = await callsUntil(
          world,
          'A parked and B held',
          calls => stageOf(calls, 'Ask') === 'parked' && stageOf(calls, 'Shell') === 'held',
        )
        expect(waiting.map(row => row.tool)).toEqual(['Ask', 'Shell'])
        const [a, b] = waiting
        expect(a?.phase).toBe('suspended')
        expect(a?.entry?.domain).toBe(b?.entry?.domain)
        expect([a?.entry?.scopeBudget, b?.entry?.scopeBudget]).toEqual([1, 1])

        await answer(world, session, 'Use 8081')
        await callsUntil(world, 'A ready', calls => stageOf(calls, 'Ask') === 'ready')
        for (let sample = 0; sample < 10; sample += 1, await sleep(200)) {
          const calls = toolCalls(world.storageRoot)
          expect([stageOf(calls, 'Ask'), stageOf(calls, 'Shell')]).toEqual(['ready', 'held'])
        }
        expect((await historyOf(world, session)).some(entry => entry.kind === 'message.tool')).toBe(
          false,
        )

        release(world, 'go-b')
        const seen: string[] = []
        await callsUntil(world, 'both released', calls => {
          const ask = stageOf(calls, 'Ask')
          const shell = stageOf(calls, 'Shell')
          seen.push(`${ask ?? '-'}/${shell ?? '-'}`)
          return ask === undefined && shell === undefined
        })
        expect(seen.filter(pair => pair.startsWith('held/') && !pair.endsWith('/-'))).toEqual([])

        const entries = await settled(world, session)
        expect(entries.map(entry => entry.kind)).toEqual([
          'message.user',
          'run.started',
          'message.assistant',
          'message.tool',
          'message.tool',
          'message.assistant',
          'run.terminal',
        ])
        const results = toolResults(entries)
        expect(results[0]).toBe(ANSWER)
        expect(results[1]).toContain('go-b-done')
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'two runs each call a tool: the call of one run does not queue behind the call of the other',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const first = await world.startSession('start: wait x')
        await callsUntil(world, 'X held', calls => stageOf(calls, 'Shell') === 'held')
        const second = await world.startSession('start: echo y')
        const other = await settled(world, second)
        expect(toolResults(other)).toEqual([expect.stringContaining('y-done')])
        expect(other.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
        const calls = toolCalls(world.storageRoot)
        expect(calls.map(row => [row.tool, row.phase, row.entry?.stage ?? null]).sort()).toEqual([
          ['Shell', 'running', 'held'],
          ['Shell', 'settled', null],
        ])

        release(world, 'go-x')
        const entries = await settled(world, first)
        expect(toolResults(entries)).toEqual([expect.stringContaining('go-x-done')])
        expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'with queue capacity 1, a new call of the run after A parked waits for the queue and runs once A is released',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree({ ...options, queueCapacity: 1 }, async world => {
        const runtime = world.toolRuntime()
        const invoke = runtime.invoke.bind(runtime)
        const answers: ToolInvokeOutcome[] = []
        const parkedAt: (string | undefined)[] = []
        Object.assign(runtime, {
          invoke: async (input: Parameters<typeof invoke>[0]) => {
            if (input.request.availability.definition.name !== 'Shell') return invoke(input)
            if (parkedAt.length === 0) {
              await callsUntil(world, 'A parked', calls => stageOf(calls, 'Ask') === 'parked')
              parkedAt.push(stageOf(toolCalls(world.storageRoot), 'Ask'))
            }
            const outcome = await invoke(input)
            answers.push(outcome)
            return outcome
          },
        })

        const session = await world.startSession('start: ask and echo')
        for (const end = Date.now() + 120_000; Date.now() < end && answers.length === 0;)
          await sleep(100)
        expect(parkedAt).toEqual(['parked'])
        expect(answers[0]).toMatchObject({
          kind: 'rejected',
          failure: { kind: 'unavailable', dependency: 'tool-queue' },
        })
        expect(
          toolCalls(world.storageRoot).map(row => [row.tool, row.entry?.stage ?? null]),
        ).toEqual([['Ask', 'parked']])

        await answer(world, session, 'Use 8081')
        const entries = await settled(world, session)
        expect(entries.map(entry => entry.kind)).toEqual([
          'message.user',
          'run.started',
          'message.assistant',
          'message.tool',
          'message.tool',
          'message.assistant',
          'run.terminal',
        ])
        expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
        expect(toolResults(entries)).toEqual([ANSWER, expect.stringContaining('b-done')])
        const refusals = answers.filter(outcome => outcome.kind === 'rejected')
        expect(refusals.length).toBeGreaterThanOrEqual(1)
        expect(answers.at(-1)?.kind).toBe('accepted')
      })
    },
  )
})
