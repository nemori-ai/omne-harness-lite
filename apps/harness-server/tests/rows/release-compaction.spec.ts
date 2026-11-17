// @module-tag slow
import { expect, it, onTestFailed } from 'vitest'
import { writeFileSync } from 'node:fs'
import {
  agentCompactionKey,
  agentReceivedCommitsKey,
  agentMaterialsKey,
  agentRequestsKey,
  agentJournalKey,
  agentModelContextKey,
  agentToolReceptionTargetsKey,
  agentMessageHandoffKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  decodeCompactionOutcome,
  type CompactionRequest,
  type ExecutionSnapshot,
} from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import { executionFailures, historyOf, onReleaseTree, pollUntil } from '../support/release-tree.ts'

const SUMMARY = 'release-summary-marker: prior investigation completed; finish the original task.'
const LARGE_HISTORY = 'memo '.repeat(12_000)
const TOOL = JSON.stringify({
  command: 'execute',
  params: { script: 'printf compaction-tool-complete' },
})
const SCALE = Number(process.env['OMNE_COMPACTION_SCALE'] ?? 1)
const SCALE_PHASE = '/tmp/omne-1310-compaction-delivery/scale-phase.txt'
const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

it.each([1, 2])(
  'replaces the provider at assembly and continues the same Run through %i compactions in serve',
  { timeout: process.env['OMNE_COMPACTION_TRACE'] === '1' ? 60_000 : 240_000 },
  async cycles => {
    const requests: string[] = []
    const compactions: CompactionRequest[] = []
    const delivered: unknown[] = []
    let readSnapshot: () => Promise<ExecutionSnapshot | undefined> = async () => undefined
    let currentAtStart: unknown
    const measurement = {
      active: false,
      started: 0,
      elapsedMs: 0,
      heapStart: 0,
      heapPeak: 0,
      loadCount: 0,
      loadBytes: 0,
      inputEntries: 0,
      protectedEntries: 0,
      inputBytes: 0,
    }
    if (process.env['OMNE_COMPACTION_SCALE'] !== undefined) writeFileSync(SCALE_PHASE, '')
    await onReleaseTree(
      {
        permission: 'bypass-permissions',
        collaboration: 'co-work',
        compactionTriggerPercent: '1',
        compactionProvider: {
          binding: {
            authority: 'release/rules',
            adoption: { owner: 'release-test', name: 'rules', revision: '1', digest: 'rules/1' },
          },
          inject: [],
          executor: () => ({
            async advance(request, generation) {
              compactions.push(request)
              if (measurement.active) {
                measurement.inputEntries = request.input.history.entries.length
                measurement.protectedEntries = request.input.history.protected.length
                measurement.inputBytes = Buffer.byteLength(JSON.stringify(request.input.history))
              }
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
                        history.entries.some(
                          entry => entry.ref === ref && entry.message.role === 'user',
                        ),
                    ),
                    derivation: generation,
                  },
                }),
              )
              if ('failure' in judged || judged.ok.kind !== 'completed')
                throw new Error(JSON.stringify(judged))
              delivered.push(judged.ok.message)
              return succeed({ phase: 'terminal', physical: 'settled', outcome: judged.ok })
            },
            cancel: async () => succeed('settled'),
          }),
        },
        script: async ({ body }) => {
          requests.push(body)
          if (process.env['OMNE_COMPACTION_SCALE'] !== undefined) {
            if (requests.length === 2) {
              const settled = await pollUntil(
                'the old Agent output and owned result duties are closed',
                () => readSnapshot(),
                snapshot =>
                  snapshot !== undefined &&
                  snapshot.output.emittedThrough === snapshot.output.acknowledgedThrough &&
                  snapshot.results.every(
                    result =>
                      result.completion !== null &&
                      (result.result.producer.kind !== 'compaction' ||
                        result.release.kind === 'confirmed'),
                  ) &&
                  snapshot.handoffs.every(handoff => handoff.history.kind !== 'pending'),
              )
              currentAtStart = {
                output: settled?.output,
                results: settled?.results.length,
                openResults: settled?.results.filter(
                  result =>
                    result.completion === null ||
                    (result.result.producer.kind === 'compaction' &&
                      result.release.kind !== 'confirmed'),
                ).length,
                pendingHandoffs: settled?.handoffs.filter(
                  handoff => handoff.history.kind === 'pending',
                ).length,
              }
              measurement.active = true
              measurement.started = performance.now()
              measurement.heapStart = process.memoryUsage().heapUsed
              measurement.heapPeak = measurement.heapStart
              writeFileSync(SCALE_PHASE, String(SCALE))
            } else if (requests.length === 3) {
              measurement.active = false
              measurement.elapsedMs = performance.now() - measurement.started
              writeFileSync(SCALE_PHASE, '')
            }
          }
          const serving = {
            model: (JSON.parse(body) as { model: string }).model,
            provider: 'OpenAI',
          }
          const events =
            requests.length <= cycles
              ? [
                  {
                    ...serving,
                    choices: [{ delta: { content: `history-round-${requests.length}: ` } }],
                  },
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
                            { length: requests.length === 1 ? SCALE : 1 },
                            (_, index) => ({
                              index,
                              id: `call_shell_${requests.length}_${index}`,
                              type: 'function',
                              function: { name: 'Shell', arguments: TOOL },
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
        },
      },
      async world => {
        const failures: { operation: string; failure: unknown; commit?: unknown }[] = []
        const trace: unknown[] = []
        let latestLoad: unknown
        for (const [key, methods] of [
          [agentCompactionKey, ['admit', 'inspect', 'acknowledge']],
          [agentReceivedCommitsKey, ['commit', 'query']],
          [agentMaterialsKey, ['read']],
          [agentRequestsKey, ['prepare', 'assessCompaction', 'resume']],
          [agentJournalKey, ['commit', 'load', 'query', 'recordResult', 'recordHandoff']],
          [agentModelContextKey, ['read']],
          [agentToolReceptionTargetsKey, ['resolve']],
          [agentMessageHandoffKey, ['prepare', 'lookup']],
        ] as const) {
          const service = world.scope.get(key)
          if (service === undefined) throw new Error(`the release has no ${key}`)
          for (const method of methods) {
            const original: unknown = Reflect.get(service, method)
            if (typeof original !== 'function') throw new Error(`${key}.${method} is missing`)
            Reflect.set(service, method, async (...args: unknown[]) => {
              const answer: unknown = await Reflect.apply(original, service, args)
              if (key === agentJournalKey && method === 'load')
                readSnapshot = async () => {
                  const read: unknown = await Reflect.apply(original, service, args)
                  latestLoad = read
                  return typeof read === 'object' && read !== null && 'ok' in read
                    ? (read.ok as ExecutionSnapshot)
                    : undefined
                }
              if (measurement.active && key === agentJournalKey && method === 'load') {
                measurement.loadCount += 1
                measurement.loadBytes += Buffer.byteLength(JSON.stringify(answer))
                measurement.heapPeak = Math.max(
                  measurement.heapPeak,
                  process.memoryUsage().heapUsed,
                )
              }
              if (process.env['OMNE_COMPACTION_TRACE'] === '1') {
                if (method === 'load') latestLoad = answer
                trace.push({ service: key, method, input: args[0], answer })
                if (trace.length > 40) trace.shift()
              }
              if (
                typeof answer === 'object' &&
                answer !== null &&
                'failure' in answer &&
                failures.length < 20
              )
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
          if (process.env['OMNE_COMPACTION_TRACE'] === '1')
            writeFileSync(
              '/tmp/omne-1310-compaction-delivery/release-trace.json',
              JSON.stringify({
                storageRoot: world.storageRoot,
                requests: requests.length,
                compactions: compactions.length,
                failures,
                latestLoad,
                trace,
              }),
            )
        })
        onTestFailed(() => {
          process.stderr.write(`compaction release failures: ${JSON.stringify(failures)}\n`)
        })
        const session = await world.startSession('Investigate and finish the original task.')
        const history = await pollUntil(
          'compaction and original Run completion',
          () =>
            process.env['OMNE_COMPACTION_SCALE'] !== undefined && requests.length < 3
              ? Promise.resolve([])
              : historyOf(world, session),
          seen =>
            seen.some(entry => entry.kind === 'run.terminal') ||
            failures.some(
              ({ operation, failure }) =>
                (compactions.length > 0 && operation === `${agentModelContextKey}.read`) ||
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
            ),
        )
        const diagnostics = JSON.stringify({
          requests: requests.length,
          compactions: compactions.length,
          failures: executionFailures(world.storageRoot),
          serviceFailures: failures,
          entries: history.map(entry => ({
            kind: entry.kind,
            ...(entry.kind === 'run.terminal' ? { payload: entry.payload } : {}),
          })),
        })
        expect(
          history.some(entry => entry.kind === 'message.compaction'),
          diagnostics,
        ).toBe(true)
        expect(history.filter(entry => entry.kind === 'run.started')).toHaveLength(1)
        expect(
          history.filter(entry => entry.kind === 'run.terminal'),
          diagnostics,
        ).toHaveLength(1)
        expect(compactions).toHaveLength(cycles)
        expect(delivered).toHaveLength(cycles)
        expect(requests).toHaveLength(cycles + 1)
        expect(requests[1]).toContain(SUMMARY)
        expect(requests[1]).not.toContain(LARGE_HISTORY)
        expect(JSON.stringify(history)).toContain(LARGE_HISTORY)
        expect(JSON.stringify(history)).toContain('original-task-complete')
        expect(JSON.stringify(history)).toContain('compaction-tool-complete')
        expect(history.filter(entry => entry.kind === 'message.tool')).toHaveLength(
          SCALE + cycles - 1,
        )
        expect(
          JSON.stringify(history.filter(entry => entry.kind === 'message.compaction')),
        ).toContain(SUMMARY)
        expect(
          compactions[0]?.input.history.entries.some(entry =>
            JSON.stringify(entry.message).includes(LARGE_HISTORY),
          ),
        ).toBe(true)
        if (cycles === 2) {
          const previous = compactions[0]
          const current = compactions[1]
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
          if (process.env['OMNE_COMPACTION_SCALE'] !== undefined)
            writeFileSync(
              `/tmp/omne-1310-compaction-delivery/scale-${SCALE}.json`,
              JSON.stringify(
                {
                  oldToolCalls: SCALE,
                  currentAtStart,
                  ...measurement,
                  requests: requests.length,
                  compactions: compactions.length,
                  historyEntries: history.length,
                  secondModelBytes: Buffer.byteLength(requests[1]!),
                  thirdModelBytes: Buffer.byteLength(requests[2]!),
                },
                null,
                2,
              ),
            )
        }
      },
    )
  },
)
