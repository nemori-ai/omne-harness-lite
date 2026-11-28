// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem as HitlCardItem } from '@omne-harness/human-intervention-protocol'
import type { ToolInvokeOutcome } from '@omne-harness/tool-contract'
import {
  historyOf,
  onReleaseTree,
  toolCalls,
  toolCallsByRequest,
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
    intent: 'test call',
    params: { script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done` },
  })
const echo = (text: string) =>
  JSON.stringify({ command: 'execute', intent: 'test call', params: { script: `echo ${text}` } })

const script = toolCallsThenText(body =>
  body.includes('start: ask and wait')
    ? [
        { id: 'call_a', tool: 'Ask', arguments: ASK },
        { id: 'call_b', tool: 'Shell', arguments: waitFor('go-b') },
      ]
    : body.includes('start: wait x')
      ? [{ id: 'call_x', tool: 'Shell', arguments: waitFor('go-x') }]
      : [{ id: 'call_y', tool: 'Shell', arguments: echo('y-done') }],
)
const options = { script, permission: 'bypass-permissions' }

const inBackground = JSON.stringify({
  command: 'execute',
  intent: 'wait in the background',
  params: {
    script: 'while [ ! -f go-x ]; do sleep 0.1; done; echo go-x-done',
    run_in_background: true,
  },
})
// The first reply starts a call in the background; the reply to its placeholder makes one more call.
const thenOneMore = toolCallsByRequest(body => {
  const results = body.split('"role":"tool"').length - 1
  if (results === 0) return [{ id: 'call_x', tool: 'Shell', arguments: inBackground }]
  return results === 1 ? [{ id: 'call_q', tool: 'Shell', arguments: echo('q-done') }] : []
})

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

describe('the slots of the concurrency scope of one run', () => {
  // AG-33: the calls of one reply go in the order the model wrote. B has effects, so it is not
  // sent while A, before it, has no result; the scope budget is capacity only and orders nothing.
  it(
    'B is not sent while A, written before it, waits for a person; answered, B runs',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask and wait')
        await callsUntil(world, 'A parked', calls => stageOf(calls, 'Ask') === 'parked')
        for (let sample = 0; sample < 10; sample += 1, await sleep(200)) {
          const calls = toolCalls(world.storageRoot)
          expect(calls.map(row => [row.tool, row.entry?.stage])).toEqual([['Ask', 'parked']])
        }
        expect(callOf(toolCalls(world.storageRoot), 'Ask')?.entry?.scopeBudget).toBe(8)

        await answer(world, session, 'Use 8081')
        const running = await callsUntil(
          world,
          'B held',
          calls => stageOf(calls, 'Shell') === 'held',
        )
        expect(running.map(row => row.tool)).toEqual(['Ask', 'Shell'])
        expect(callOf(running, 'Shell')?.entry?.scopeBudget).toBe(8)
        expect(callOf(running, 'Ask')?.phase).toBe('settled')

        release(world, 'go-b')
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
    'with queue capacity 1, a new call of the run waits for the queue while an earlier call is in the background, and runs once that one ends',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree({ ...options, script: thenOneMore, queueCapacity: 1 }, async world => {
        const runtime = world.toolRuntime()
        const invoke = runtime.invoke.bind(runtime)
        const answers: ToolInvokeOutcome[] = []
        Object.assign(runtime, {
          invoke: async (input: Parameters<typeof invoke>[0]) => {
            const outcome = await invoke(input)
            if (input.request.arguments.effective.includes('q-done')) answers.push(outcome)
            return outcome
          },
        })

        const session = await world.startSession('start: background, then one more')
        for (const end = Date.now() + 120_000; Date.now() < end && answers.length === 0;)
          await sleep(100)
        expect(answers[0]).toMatchObject({
          kind: 'rejected',
          failure: { kind: 'unavailable', dependency: 'tool-queue' },
        })
        expect(toolCalls(world.storageRoot).map(row => row.tool)).toEqual(['Shell'])

        release(world, 'go-x')
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250))
          if (answers.at(-1)?.kind === 'accepted') break
        expect(answers.at(-1)?.kind).toBe('accepted')
        expect(answers.filter(outcome => outcome.kind === 'rejected').length).toBeGreaterThan(0)
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250))
          if (toolResults(await historyOf(world, session)).some(text => text.includes('q-done')))
            break
        expect(toolResults(await historyOf(world, session)).join('\n')).toContain('q-done')
      })
    },
  )
})
