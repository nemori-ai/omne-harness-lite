import type { AnswerOf, BodyOf, LoginIdentity } from '@omne-harness/access-cordis-contract'
import {
  NO_PROGRESS,
  NO_EXAMINATION,
  NO_READINGS,
  validateDraft,
  type GoalRecord,
  type GoalRefusal,
  type Outcome,
} from '@omne-harness/goal-contract'
import { createGoalContribution } from '@omne-harness/goal-access'
import type { GoalChangeListener, GoalEntry, GoalFace } from '@omne-harness/goal-access'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'

type Operations = (typeof goalProtocol)['operations']
type Name = keyof Operations & string

const limits: JsonLimits = {
  maxBytes: 200_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 200,
  maxStringLength: 20_000,
  maxNumberLength: 100,
}
export const TENANT = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
export const SESSION = '0123456789abcdef'.repeat(4)
export const WHERE = { tenant: TENANT, session: SESSION }
export const LOGIN = { login: 'alice' } as unknown as LoginIdentity
export const SUBJECT = Object.freeze({ kind: 'the person at the panel' })

/** A body as it arrives: read through the protocol, so a test hands a handler what the pipeline would. */
export function bodyOf<K extends Name>(name: K, sample: unknown): BodyOf<Operations[K]> {
  const tree = readJsonText(JSON.stringify(sample), limits)
  if (tree.kind !== 'ok') throw new Error('sample is not JSON')
  const read = goalProtocol.operations[name].body.read(tree.value, limits)
  if (!read.ok) throw new Error(`${name}: the protocol does not take this body`)
  return read.value as BodyOf<Operations[K]>
}

/** An answer as it leaves: written through the protocol, so what a handler answers is shown to fit its outcome. */
export function wireOf<K extends Name>(name: K, answer: AnswerOf<Operations[K]>): unknown {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const outcomes = goalProtocol.operations[name].outcomes as Record<string, unknown>
  const codec = outcomes[answer.outcome] as {
    write(value: unknown, limits: JsonLimits): { ok: true; value: never } | { ok: false }
  }
  const written = codec.write(answer.body, limits)
  if (!written.ok) throw new Error(`${name}: ${answer.outcome} does not fit the protocol`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) }
}

const checked = validateDraft(
  {
    purpose: '把首页的加载时间降下来',
    criteria: [
      { statement: '端到端用例全过', evidence: { kind: 'command', command: 'pnpm test:e2e' } },
    ],
    rules: [{ statement: '不改公共接口。' }],
    exits: [
      {
        statement: '预算用尽',
        kind: 'budget',
        limits: [{ amount: 20, unit: 'rounds' }],
        deliver: '当前最好的结果',
        counts: 'failure',
      },
    ],
  },
  { attendance: 'attended' },
)
if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))

export const RECORD: GoalRecord = {
  session: SESSION,
  version: 3,
  state: {
    status: 'paused',
    attendance: 'attended',
    generation: 2,
    revision: 2,
    rounds: 7,
    stalled: 3,
    gap: { open: 1, remaining: {} },
    pause: { by: 'verdict', row: 7, exit: null },
  },
  body: checked.body,
  history: [
    {
      revision: 1,
      via: 'card',
      words: '把首页降下来',
      wordsAt: '30',
      draftedBy: 'agent',
      confirmedBy: 'server-entry',
      operation: 'op-1',
      at: '2026-11-25T00:00:01.000Z',
    },
    {
      revision: 2,
      via: 'direct',
      words: null,
      draftedBy: 'person',
      confirmedBy: 'acc-1',
      operation: 'op-2',
      at: '2026-11-25T00:10:00.000Z',
    },
  ],
  readings: {
    ...NO_READINGS,
    criteria: { A1: { value: 'fails', source: 'judge', ref: 'call-9' } },
  },
  progress: {
    ...NO_PROGRESS,
    criteria: { A1: { status: 'doing', refs: ['call-9'], note: '还差三条' } },
  },
  since: 'entry-4',
  wake: null,
  observed: null,
  examination: NO_EXAMINATION,
}
export const ACTIVE: GoalRecord = {
  ...RECORD,
  state: {
    status: 'active',
    attendance: 'attended',
    generation: 2,
    revision: 2,
    rounds: 7,
    stalled: 0,
    gap: null,
  },
}
export const SETTLED: GoalRecord = {
  ...RECORD,
  state: {
    status: 'settled',
    attendance: 'attended',
    generation: 2,
    revision: 2,
    rounds: 20,
    outcome: { kind: 'exit', exit: 'X1', counts: 'failure' },
  },
}

type Scripted<T> = Outcome<T, GoalRefusal> | Error
const played = <T>(answer: Scripted<T>): Promise<Outcome<T, GoalRefusal>> =>
  answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
export const done = <T>(value: T, recalled = false): Outcome<T, GoalRefusal> => ({
  kind: 'done',
  value,
  recalled,
})
export const refused = (reason: GoalRefusal): Outcome<never, GoalRefusal> => ({
  kind: 'refused',
  reason,
})

export function world() {
  const asked: unknown[] = []
  const script = {
    entry: { kind: 'admitted', subject: SUBJECT, by: 'acc-1' } as GoalEntry | Error,
    read: done<GoalRecord | null>(RECORD) as Scripted<GoalRecord | null>,
    write: done(RECORD) as Scripted<GoalRecord>,
    command: done<GoalRecord | null>(RECORD) as Scripted<GoalRecord | null>,
    mounted: true,
    fed: true,
  }
  const goals: GoalFace = {
    read: (...input) => (asked.push(['read', ...input]), played(script.read)),
    write: (...input) => (asked.push(['write', ...input]), played(script.write)),
    command: (...input) => (asked.push(['command', ...input]), played(script.command)),
  }
  const listeners = new Map<string, GoalChangeListener>()
  const contribution = createGoalContribution({
    goals: () => (script.mounted ? goals : undefined),
    entrance: {
      admit: async () => {
        if (script.entry instanceof Error) throw script.entry
        return script.entry
      },
    },
    changes: () =>
      script.fed
        ? {
            subscribe(tenant, session, listener) {
              listeners.set(`${tenant}/${session}`, listener)
              return () => void listeners.delete(`${tenant}/${session}`)
            },
          }
        : undefined,
  })
  const call = () => ({ principal: LOGIN, messageId: 'm-1', signal: new AbortController().signal })
  const run = async <K extends Name>(name: K, sample: unknown): Promise<unknown> => {
    const handler = contribution.operations[name] as (
      call: unknown,
      body: unknown,
    ) => Promise<AnswerOf<Operations[K]>>
    return wireOf(name, await handler(call(), bodyOf(name, sample)))
  }
  return { script, asked, listeners, contribution, run }
}
