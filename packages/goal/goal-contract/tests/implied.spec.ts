import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUDGET_ROUNDS,
  DEFAULT_JUDGE_CONFIG,
  EvidenceSchema,
  GoalBodySchema,
  GoalRecordSchema,
  IMPLIED_PURPOSE_MAX,
  IMPLIED_STATEMENT,
  impliedBody,
  impliedKey,
  impliedRecord,
  isImpliedKey,
  JUDGE_LIMITS,
  NO_PROGRESS,
  packJudge,
  renderBody,
  sessionOfKey,
  validateDraft,
  type GoalBody,
  type JudgeConfig,
  type ObservedCall,
} from '@omne-harness/goal-contract'

const bodyOf = (text: string): GoalBody => {
  const body = impliedBody(text)
  if (body === null) throw new Error('no implied body')
  return body
}
const call = (order: number, change: Partial<ObservedCall> = {}): ObservedCall => ({
  ref: `c${String(order)}`,
  order,
  tool: 'Shell execute',
  command: `step ${String(order)}`,
  path: null,
  exit: 0,
  output: `out ${String(order)}`,
  writes: false,
  ...change,
})

describe('the goal a self-driving session stands on when nobody set one', () => {
  it('has the input that opened the round for its purpose, one criterion on what was done, and the default budget', () => {
    const body = bodyOf('  把改动说明写进 CHANGELOG \n')
    expect(GoalBodySchema.parse(body)).toEqual(body)
    expect(body).toMatchObject({
      purpose: '把改动说明写进 CHANGELOG',
      criteria: [
        { id: 'A1', statement: IMPLIED_STATEMENT, evidence: { kind: 'activity' }, pass: null },
      ],
      metrics: [],
      rules: [],
      exits: [{ id: 'X1', kind: 'budget', limits: [{ amount: DEFAULT_BUDGET_ROUNDS }] }],
      issued: { A: 1, M: 0, N: 0, X: 1, R: 0 },
    })
    expect(renderBody(body)).toContain(`- [A1] ${IMPLIED_STATEMENT}\n  - 证据: 这一轮做过的事`)
  })

  it('keeps the head of an input longer than a purpose may be, counted as a person counts, and is none for an input without words', () => {
    const long = `${'长'.repeat(IMPLIED_PURPOSE_MAX)}尾巴`
    expect([...bodyOf(long).purpose]).toHaveLength(IMPLIED_PURPOSE_MAX)
    expect(bodyOf(long).purpose.endsWith('尾巴')).toBe(false)
    expect(impliedBody(' \n\t')).toBeNull()
  })

  it('is no criterion a draft may write: what was done is evidence only for the goal the system implies', () => {
    const draft = {
      purpose: 'x',
      criteria: [{ statement: 'done', evidence: { kind: 'activity' } }],
    }
    const checked = validateDraft(draft, { attendance: 'attended' })
    expect(checked).toMatchObject({ kind: 'invalid', issues: [{ entry: 'A1', field: 'evidence' }] })
    expect(EvidenceSchema.safeParse({ kind: 'activity' }).success).toBe(false)
  })
})

describe('the judging of an implied goal', () => {
  const config: JudgeConfig = {
    ...DEFAULT_JUDGE_CONFIG,
    packaging: { ...DEFAULT_JUDGE_CONFIG.packaging, staleness: 'decided' },
  }
  const material = (calls: readonly ObservedCall[]) => ({
    body: bodyOf('把改动说明写进 CHANGELOG'),
    attendance: 'unattended' as const,
    progress: NO_PROGRESS,
    calls: [...calls],
    metrics: {},
    rounds: 0,
  })

  const only = (packed: ReturnType<typeof packJudge>) => {
    const [request, ...more] = packed.requests
    if (request === undefined || more.length > 0) throw new Error('not one request')
    return request
  }

  it('asks its one criterion of the judge and shows it the last calls of the round, whatever they were', () => {
    const calls = Array.from({ length: JUDGE_LIMITS.evidencePerEntry + 2 }, (_, at) => call(at))
    const packed = packJudge(material(calls), config)
    expect(packed.decided).toEqual({})
    const request = only(packed)
    expect(Object.keys(request.questions)).toEqual(['A1'])
    const evidence = (request.state as { evidence: { A1: { ref: string }[] } }).evidence.A1
    expect(evidence.map(item => item.ref)).toEqual(
      calls.slice(-JUDGE_LIMITS.evidencePerEntry).map(made => made.ref),
    )
  })

  it('is never stale by a later write: the writes of the round are what it reads', () => {
    const calls = [call(0), call(1, { writes: true, path: 'a.md', tool: 'Files write' })]
    const packed = packJudge(material(calls), config)
    expect(packed.decided).toEqual({})
    expect(Object.keys(packed.requests[0]?.questions ?? {})).toEqual(['A1'])
    const shown = (only(packed).state as { evidence: { A1: object[] } }).evidence.A1
    expect(shown).toHaveLength(2)
    for (const item of shown) expect(item).not.toHaveProperty('laterWrites')
  })

  it('is asked with nothing to show when the round made no call', () => {
    const { state } = only(packJudge(material([]), config))
    expect((state as { evidence: { A1: unknown[] } }).evidence.A1).toEqual([])
  })
})

describe('where an implied goal is kept', () => {
  it('is under a key of its session no session has, and the key leads back to the session', () => {
    const session = 'f'.repeat(64)
    expect(impliedKey(session)).not.toBe(session)
    expect(sessionOfKey(impliedKey(session))).toBe(session)
    expect(sessionOfKey(session)).toBe(session)
    expect([isImpliedKey(impliedKey(session)), isImpliedKey(session)]).toEqual([true, false])
  })

  it('begins as the next revision of the one goal under its key: in progress, unattended, no round used, from where the input stood', () => {
    const body = bodyOf('把改动说明写进 CHANGELOG')
    const at = '2026-11-25T18:00:00.000Z'
    const first = impliedRecord(null, { session: 's', body, since: '41', at })
    expect(GoalRecordSchema.parse(first)).toEqual(first)
    expect(first).toMatchObject({
      session: impliedKey('s'),
      version: 1,
      state: { status: 'active', attendance: 'unattended', generation: 1, revision: 1, rounds: 0 },
      body,
      since: '41',
      wake: null,
      observed: null,
      history: [{ revision: 1, via: 'direct', draftedBy: 'creator', operation: 'implied/41', at }],
    })
    const used = { ...first, state: { ...first.state, rounds: 2, stalled: 1 } }
    const next = impliedRecord(used, { session: 's', body, since: '57', at })
    expect(next).toMatchObject({
      version: 2,
      state: { status: 'active', generation: 1, revision: 2, rounds: 0, stalled: 0, gap: null },
      since: '57',
      history: [{ revision: 2, operation: 'implied/57' }],
    })
    expect(next.history).toHaveLength(1)
  })
})
