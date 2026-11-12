// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 名额按 run 的并发范围计（切片 04，验收 C5）。发行的范围是 run（`rows/tool-runtime/scope.ts`），范围预算是 Agent 的
// `toolConcurrency`，测试的运维者层取 1。
// - 同一 run 的 Ask A 与 Shell B：A 等人时条目停泊、不占名额，B 照常执行；A 答复后重新排队，B 结束后 A 才取得名额。
// - 两个 run 各调一次 Shell：一个 run 的调用占着名额时，另一个 run 的调用不排在它后面。
// - 队列容量为 1：A 停泊之后，同一 run 的新调用在受理处被 `tool-queue` 拒绝，停泊的条目仍计入容量。
// Shell B 在工作区里等一个文件出现才结束，所以场景决定它何时结束。几个 Run 不同时继续模型请求：同一租户的几个 Run
// 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），不是本文件要核的事。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
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

/** A Shell call that ends only when the file `name` is in the workspace, then prints `name`. */
const waitFor = (name: string) =>
  JSON.stringify({
    command: 'execute',
    params: { script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done` },
  })
const echo = (text: string) =>
  JSON.stringify({ command: 'execute', params: { script: `echo ${text}` } })

/**
 * The model calls by user input: `ask and wait` calls Ask, then a Shell that waits for `go-b`;
 * `ask and echo` calls Ask, then a Shell that ends at once; `wait x` and `echo y` call one Shell.
 */
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

/** Creates the file `name` in the workspace of the Shell (the files root of the test operator). */
const release = (world: ReleaseTree, name: string) =>
  writeFileSync(join(dirname(world.storageRoot), 'workspace', name), '')

/** Polls the Tool calls until `done` holds for them; answers them. */
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

/** The history of `session` once its Run has ended. */
async function settled(world: ReleaseTree, session: string): Promise<readonly Entry[]> {
  let entries: readonly Entry[] = []
  for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250)) {
    entries = await historyOf(world, session)
    if (entries.some(entry => entry.kind === 'run.terminal')) return entries
  }
  throw new Error(`the Run of the session did not end: ${JSON.stringify(entries.map(e => e.kind))}`)
}

/** The texts of the text blocks in a value, in order. */
function textsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textsOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (record['kind'] === 'text' && typeof record['text'] === 'string') return [record['text']]
  return Object.values(record).flatMap(textsOf)
}

/** The result texts of the tool messages in a history, one per tool message. */
const toolResults = (entries: readonly Entry[]) =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .map(entry => textsOf(entry.payload).join('\n'))

/** Answers the one pending card of `session` with `text` through the CLI. */
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
        // A waits for a person: its entry is parked and holds no slot, so B holds the one slot.
        const waiting = await callsUntil(
          world,
          'A parked and B held',
          calls => stageOf(calls, 'Ask') === 'parked' && stageOf(calls, 'Shell') === 'held',
        )
        expect(waiting.map(row => row.tool)).toEqual(['Ask', 'Shell'])
        const [a, b] = waiting
        expect(a?.phase).toBe('suspended')
        // One run, one scope: both entries are in the same queue, with the budget of the Agent.
        expect(a?.entry?.domain).toBe(b?.entry?.domain)
        expect([a?.entry?.scopeBudget, b?.entry?.scopeBudget]).toEqual([1, 1])

        await answer(world, session, 'Use 8081')
        // Answered, A is in the queue again and waits: B still holds the one slot.
        await callsUntil(world, 'A ready', calls => stageOf(calls, 'Ask') === 'ready')
        for (let sample = 0; sample < 10; sample += 1, await sleep(200)) {
          const calls = toolCalls(world.storageRoot)
          expect([stageOf(calls, 'Ask'), stageOf(calls, 'Shell')]).toEqual(['ready', 'held'])
        }
        expect((await historyOf(world, session)).some(entry => entry.kind === 'message.tool')).toBe(
          false,
        )

        // B ends; only then A takes the slot. A never holds it while B still has its entry.
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
        // Run X holds the one slot of its scope until `go-x`. Run Y gets its own scope.
        const second = await world.startSession('start: echo y')
        const other = await settled(world, second)
        expect(toolResults(other)).toEqual([expect.stringContaining('y-done')])
        expect(other.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
        // Y's call ended and left the queue; X's call still holds the slot of its own scope.
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
        // The Agent invokes A, then B. B's invoke is held until A is parked, so the refusal is
        // about the parked entry, not about an entry that still holds or waits for a slot. A full
        // queue is a temporary refusal: the Agent waits and sends the same request again.
        const runtime = world.toolRuntime()
        const invoke = runtime.invoke.bind(runtime)
        const answers: ToolInvokeOutcome[] = []
        const parkedAt: (string | undefined)[] = []
        Object.assign(runtime, {
          invoke: async (input: Parameters<typeof invoke>[0]) => {
            if (input.request.availability.definition.name !== 'Shell') return invoke(input)
            // Only the first invoke of B is held; the later ones are the Agent sending it again.
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
        // The refusal wrote nothing: A is the only call, and its entry is still parked.
        expect(
          toolCalls(world.storageRoot).map(row => [row.tool, row.entry?.stage ?? null]),
        ).toEqual([['Ask', 'parked']])

        // The parked entry takes the slot again when A is answered. Once A settled and its place is
        // released, the same request of B is accepted and runs; the Agent asks the model again
        // with both results.
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
        // B was refused more than once and accepted once: every refusal answered the same way.
        const refusals = answers.filter(outcome => outcome.kind === 'rejected')
        expect(refusals.length).toBeGreaterThanOrEqual(1)
        expect(answers.at(-1)?.kind).toBe('accepted')
      })
    },
  )
})
