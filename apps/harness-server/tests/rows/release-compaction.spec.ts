// @module-tag slow
import { expect, it, onTestFailed } from 'vitest'
import {
  agentCompactionKey,
  agentReceivedCommitsKey,
  agentMaterialsKey,
  agentRequestsKey,
  agentJournalKey,
  agentToolReceptionTargetsKey,
  agentMessageHandoffKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { decodeCompactionOutcome, type CompactionRequest } from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import { executionFailures, historyOf, onReleaseTree, pollUntil } from '../support/release-tree.ts'

const SUMMARY = 'release-summary-marker: prior investigation completed; finish the original task.'
const LARGE_HISTORY = 'memo '.repeat(12_000)
const TOOL = JSON.stringify({
  command: 'execute',
  intent: 'print a marker',
  params: { script: 'printf compaction-tool-complete' },
})
const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const WATCHED = [
  [agentCompactionKey, ['admit', 'inspect', 'acknowledge']],
  [agentReceivedCommitsKey, ['commit', 'query']],
  [agentMaterialsKey, ['read']],
  [agentRequestsKey, ['prepare', 'assessCompaction', 'resume']],
  [agentJournalKey, ['commit', 'load', 'query', 'recordResult', 'recordHandoff']],
  [agentToolReceptionTargetsKey, ['resolve']],
  [agentMessageHandoffKey, ['prepare', 'lookup']],
] as const

type ServiceFailure = { operation: string; failure: unknown; commit?: unknown }

type CompactionRun = Readonly<{
  requests: readonly string[]
  compactions: readonly CompactionRequest[]
  delivered: readonly unknown[]
  history: Awaited<ReturnType<typeof historyOf>>
  diagnostics: string
}>

// A rules provider that summarizes everything up to the upper bound and keeps protected entries
// and user messages. It stands in for the default provider at assembly.
function rulesExecutor(compactions: CompactionRequest[], delivered: unknown[]) {
  return () => ({
    async advance(request: CompactionRequest, generation: unknown) {
      compactions.push(request)
      const history = request.input.history
      const judged = decodeCompactionOutcome(
        JSON.stringify({
          kind: 'completed',
          message: {
            role: 'compaction',
            id: request.input.outputMessageId,
            blocks: [
              {
                kind: 'text',
                id: 'summary',
                text: `${SUMMARY} iteration ${compactions.length}`,
                visibility: { toModel: true, toHuman: true },
              },
            ],
            covers: { from: history.origin, to: history.upper },
            retained: history.logOrder.filter(
              ref =>
                history.protected.includes(ref) ||
                history.entries.some(entry => entry.ref === ref && entry.message.role === 'user'),
            ),
            derivation: generation,
          },
        }),
      )
      if ('failure' in judged || judged.ok.kind !== 'completed')
        throw new Error(JSON.stringify(judged))
      delivered.push(judged.ok.message)
      return succeed({
        phase: 'terminal' as const,
        physical: 'settled' as const,
        outcome: judged.ok,
      })
    },
    cancel: async () => succeed('settled' as const),
  })
}

// Each model round before the last returns a large text and tool calls, so the next request needs
// compaction. The first round asks for `oldToolCalls` calls; later rounds ask for one.
function modelScript(requests: string[], cycles: number, oldToolCalls: number, tool: string) {
  return async ({ body }: { body: string }) => {
    requests.push(body)
    const serving = { model: (JSON.parse(body) as { model: string }).model, provider: 'OpenAI' }
    const events =
      requests.length <= cycles
        ? [
            { ...serving, choices: [{ delta: { content: `history-round-${requests.length}: ` } }] },
            ...Array.from({ length: 12 }, () => ({
              ...serving,
              choices: [{ delta: { content: 'memo '.repeat(1_000) } }],
            })),
            {
              ...serving,
              choices: [
                {
                  delta: {
                    tool_calls: Array.from(
                      { length: requests.length === 1 ? oldToolCalls : 1 },
                      (_, index) => ({
                        index,
                        id: `call_shell_${requests.length}_${index}`,
                        type: 'function',
                        function: { name: 'Shell', arguments: tool },
                      }),
                    ),
                  },
                },
              ],
            },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          ]
        : [
            { ...serving, choices: [{ delta: { content: 'original-task-complete' } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
          ]
    return { status: 200, contentType: 'text/event-stream', body: sse(events) }
  }
}

function stopsWaiting(failures: readonly ServiceFailure[]): boolean {
  return failures.some(
    ({ operation, failure }) =>
      operation === `${agentRequestsKey}.resume` ||
      operation === `${agentRequestsKey}.assessCompaction` ||
      (typeof failure === 'object' &&
        failure !== null &&
        'diagnostic' in failure &&
        failure.diagnostic === 'the Agent records were not saved: unsupported') ||
      (typeof failure === 'object' &&
        failure !== null &&
        'kind' in failure &&
        (failure.kind === 'invalid' || failure.kind === 'denied')),
  )
}

async function compactionRun(
  cycles: number,
  oldToolCalls: number,
  tool = TOOL,
): Promise<CompactionRun> {
  const requests: string[] = []
  const compactions: CompactionRequest[] = []
  const delivered: unknown[] = []
  let outcome: CompactionRun | undefined
  await onReleaseTree(
    {
      permission: 'bypass-permissions',
      collaboration: 'co-work',
      // The budget holds the fixed part (system prompt, twelve resident tools) and the protected tail.
      compactionTriggerPercent: '2',
      compactionProvider: {
        binding: {
          authority: 'release/rules',
          adoption: { owner: 'release-test', name: 'rules', revision: '1', digest: 'rules/1' },
        },
        inject: [],
        executor: rulesExecutor(compactions, delivered),
      },
      script: modelScript(requests, cycles, oldToolCalls, tool),
    },
    async world => {
      const failures: ServiceFailure[] = []
      for (const [key, methods] of WATCHED) {
        const service = world.scope.get(key)
        if (service === undefined) throw new Error(`the release has no ${key}`)
        for (const method of methods) {
          const original: unknown = Reflect.get(service, method)
          if (typeof original !== 'function') throw new Error(`${key}.${method} is missing`)
          Reflect.set(service, method, async (...args: unknown[]) => {
            const answer: unknown = await Reflect.apply(original, service, args)
            if (typeof answer === 'object' && answer !== null && 'failure' in answer)
              if (failures.length < 20)
                failures.push({
                  operation: `${key}.${method}`,
                  failure: answer.failure,
                  ...(key === agentJournalKey && typeof args[0] === 'object' && args[0] !== null
                    ? {
                        commit: {
                          operation: Reflect.get(args[0], 'operation'),
                          caller: Reflect.get(args[0], 'caller'),
                        },
                      }
                    : {}),
                })
            return answer
          })
        }
      }
      onTestFailed(() => {
        process.stderr.write(`compaction release failures: ${JSON.stringify(failures)}\n`)
      })
      const session = await world.startSession('Investigate and finish the original task.')
      const history = await pollUntil(
        'compaction and original Run completion',
        () => historyOf(world, session),
        seen => seen.some(entry => entry.kind === 'run.terminal') || stopsWaiting(failures),
      )
      outcome = {
        requests,
        compactions,
        delivered,
        history,
        diagnostics: JSON.stringify({
          requests: requests.length,
          compactions: compactions.length,
          failures: executionFailures(world.storageRoot),
          serviceFailures: failures,
          entries: history.map(entry => ({
            kind: entry.kind,
            ...(entry.kind === 'run.terminal' ? { payload: entry.payload } : {}),
          })),
        }),
      }
    },
  )
  if (outcome === undefined) throw new Error('the release tree did not run')
  return outcome
}

function expectCompletedRun(run: CompactionRun, cycles: number, oldToolCalls: number): void {
  const { history, diagnostics } = run
  expect(
    history.some(entry => entry.kind === 'message.compaction'),
    diagnostics,
  ).toBe(true)
  expect(history.filter(entry => entry.kind === 'run.started')).toHaveLength(1)
  expect(
    history.filter(entry => entry.kind === 'run.terminal'),
    diagnostics,
  ).toHaveLength(1)
  expect(run.compactions).toHaveLength(cycles)
  expect(run.delivered).toHaveLength(cycles)
  expect(run.requests).toHaveLength(cycles + 1)
  expect(run.requests[1]).toContain(SUMMARY)
  expect(run.requests[1]).not.toContain(LARGE_HISTORY)
  // C6: the step after the compaction tells the model the runtime context again, in full.
  const after = run.requests[1] ?? ''
  expect(after.lastIndexOf('Runtime context: the current values.')).toBeGreaterThan(
    after.indexOf(SUMMARY),
  )
  expect(JSON.stringify(history)).toContain(LARGE_HISTORY)
  expect(JSON.stringify(history)).toContain('original-task-complete')
  expect(JSON.stringify(history)).toContain('compaction-tool-complete')
  expect(history.filter(entry => entry.kind === 'message.tool')).toHaveLength(
    oldToolCalls + cycles - 1,
  )
  expect(JSON.stringify(history.filter(entry => entry.kind === 'message.compaction'))).toContain(
    SUMMARY,
  )
  expect(
    run.compactions[0]?.input.history.entries.some(entry =>
      JSON.stringify(entry.message).includes(LARGE_HISTORY),
    ),
  ).toBe(true)
}

it.each([1, 2])(
  'replaces the provider at assembly and continues the same Run through %i compactions in serve',
  { timeout: 240_000 },
  async cycles => {
    const run = await compactionRun(cycles, 1)
    expectCompletedRun(run, cycles, 1)
    if (cycles === 2) {
      const [previous, current] = run.compactions
      if (previous === undefined || current === undefined) throw new Error('missing compaction')
      expect(current.input.history.base.kind).toBe('previous')
      expect(current.input.history.origin).toEqual(previous.input.history.origin)
      expect(current.input.history.epoch).not.toEqual(previous.input.history.epoch)
      expect(
        current.input.history.entries.filter(
          entry => entry.message.id === previous.input.outputMessageId,
        ),
      ).toHaveLength(1)
      const visible = JSON.stringify(current.input.history.entries)
      expect(visible.includes('history-round-2:')).toBe(true)
      expect(visible.includes('history-round-1:')).toBe(false)
      expect(visible.includes('Investigate and finish the original task.')).toBe(true)
    }
  },
)

// C8a: with the current view fixed, more already compacted history does not change what the
// next compaction reads or what the next main request sends.
it(
  'gives the next compaction the same input and the model the same requests after 1, 8 and 32 old tool calls',
  { timeout: 600_000 },
  async () => {
    const measured = []
    for (const oldToolCalls of [1, 8, 32]) {
      const run = await compactionRun(2, oldToolCalls)
      expectCompletedRun(run, 2, oldToolCalls)
      const second = run.compactions[1]
      if (second === undefined) throw new Error('missing the second compaction')
      measured.push({
        oldToolCalls,
        inputEntries: second.input.history.entries.length,
        protectedEntries: second.input.history.protected.length,
        requestBytes: run.requests.map(body => Buffer.byteLength(body)).slice(1),
      })
    }
    const [first, ...rest] = measured
    for (const each of rest)
      expect({ ...each, oldToolCalls: first?.oldToolCalls }, JSON.stringify(measured)).toEqual(
        first,
      )
  },
)

// #1351: the refusals of 32 calls are long, so the history of this Run is longer than one page.
it(
  'ends the Run after one reply with 32 refused tool calls, with compaction on',
  { timeout: 240_000 },
  async () => {
    const refused = JSON.stringify({ command: 'no-such-command', params: {} })
    const { history, requests, compactions, diagnostics } = await compactionRun(2, 32, refused)
    expect(
      history.filter(entry => entry.kind === 'run.terminal'),
      diagnostics,
    ).toHaveLength(1)
    expect(history.filter(entry => entry.kind === 'message.tool')).toHaveLength(33)
    expect(JSON.stringify(history)).toContain('original-task-complete')
    expect([requests.length, compactions.length]).toEqual([3, 2])
  },
)
