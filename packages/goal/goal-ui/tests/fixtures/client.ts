import type { GoalView } from '@omne-harness/goal-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { GoalClient } from '../../src/model/goal-driver.ts'
import { treeOf } from '../../src/model/panel.ts'

export const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}' as unknown as TenantId
export const SESSION = '0123456789abcdef'.repeat(4)

export const BODY = {
  purpose: '把首页的加载时间降下来',
  criteria: [
    { id: 'A1', statement: '用例全过', evidence: { kind: 'command', command: 'pnpm test' } },
  ],
  metrics: [],
  rules: [{ id: 'N1', statement: '不改公共接口。' }],
  exits: [
    {
      id: 'X1',
      statement: '预算用尽',
      kind: 'budget',
      limits: [{ amount: 20, unit: 'rounds' }],
      deliver: '当前的结果',
      counts: 'failure',
    },
  ],
}

export function goalOf(change: Partial<GoalView['state']> = {}, body: unknown = BODY): GoalView {
  return {
    state: {
      status: 'active',
      attendance: 'attended',
      generation: 1,
      revision: 1,
      rounds: 3,
      pause: null,
      outcome: null,
      ...change,
    },
    rendered: '## 目的\n把首页的加载时间降下来\n\n## 达成\n- [A1] 用例全过',
    body: treeOf(body)!,
    gap: [
      {
        id: 'A1',
        ought: '用例全过',
        reading: '证据显示没做到',
        source: 'judge',
        ref: 'call-9',
        open: true,
        short: null,
      },
      {
        id: '预算',
        ought: '20 轮',
        reading: '用了 3 轮',
        source: 'system',
        ref: null,
        open: false,
        short: '剩 17',
      },
    ],
    progress: treeOf({
      criteria: { A1: { status: 'doing', refs: ['call-9'], note: '还差三条' } },
      obstacle: null,
      deliverables: ['dist/report.html'],
      notes: ['先量再改'],
    })!,
    history: [
      {
        revision: 1,
        via: 'card',
        words: '把首页降下来',
        draftedBy: 'agent',
        confirmedBy: 'server-entry',
        operation: 'card-1',
        at: '2026-11-25T00:00:01.000Z',
      },
    ],
  }
}

type Answer = Readonly<{ outcome: string; body?: unknown }> | Error
const played = async (answer: Answer) => {
  if (answer instanceof Error) throw answer
  return answer
}

/** A client the test scripts: each operation answers what was set last, and every call is kept. The observation gives a frame whenever the test says so. */
export function fakeClient() {
  const calls: [string, unknown][] = []
  const script: Record<'read' | 'write' | 'query' | 'command', Answer> = {
    read: { outcome: 'succeeded', body: { goal: goalOf() } },
    write: { outcome: 'succeeded', body: { goal: goalOf({ revision: 2 }) } },
    query: { outcome: 'not-committed', body: {} },
    command: {
      outcome: 'succeeded',
      body: { goal: goalOf({ status: 'paused', pause: { by: 'person' } }) },
    },
  }
  const streams: { push(): void; end(): void; signal: AbortSignal }[] = []
  const client = {
    'read-goal': (body: unknown) => (calls.push(['read-goal', body]), played(script.read)),
    'write-goal': (body: unknown) => (calls.push(['write-goal', body]), played(script.write)),
    'query-write-goal': (body: unknown) => (
      calls.push(['query-write-goal', body]),
      played(script.query)
    ),
    'command-goal': (body: unknown) => (calls.push(['command-goal', body]), played(script.command)),
    observe: {
      'observe-goal'(_open: unknown, options: { signal: AbortSignal }) {
        let pending = 0
        let ended = false
        let wake: (() => void) | undefined
        const rouse = () => {
          wake?.()
          wake = undefined
        }
        options.signal.addEventListener('abort', rouse)
        streams.push({
          push: () => ((pending += 1), rouse()),
          end: () => ((ended = true), rouse()),
          signal: options.signal,
        })
        return (async function* () {
          for (;;) {
            if (options.signal.aborted || ended) return 'unavailable'
            if (pending === 0) {
              await new Promise<void>(resolve => {
                wake = resolve
              })
              continue
            }
            pending -= 1
            yield { kind: 'changed' as const }
          }
        })()
      },
    },
  } as unknown as GoalClient
  return { client, calls, script, streams }
}

export const settled = async (): Promise<void> => {
  for (let turn = 0; turn < 12; turn += 1)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
}
