import { describe, expect, it } from 'vitest'
import {
  BASELINE_JUDGE_CONFIG,
  awaitedReading,
  continueRequest,
  evidence,
  gapTable,
  GoalRecordSchema,
  handed,
  keptExamination,
  keptFindings,
  NO_EXAMINATION,
  NO_PROGRESS,
  NO_READINGS,
  NOT_HANDED_IN,
  STALL_LIMIT,
  ExaminationSchema,
  observe,
  packJudge,
  received,
  settleArrived,
  validateDraft,
  withAwaited,
  type BatchKey,
  type CriterionId,
  type CriterionReading,
  type Examination,
  type Findings,
  type GoalRecord,
  type Handed,
  type JudgeMaterial,
  type SetGoalState,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

const SNAKE = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [
    {
      statement: '单元测试全过',
      evidence: { kind: 'command', command: 'node --test' },
      pass: { kind: 'exit-zero' },
    },
    { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
    { statement: '方向键能控制蛇', evidence: { kind: 'examination', method: '用 node 走一局' } },
  ],
  rules: [{ statement: '不引第三方库。' }],
} as const
function bodyOf(draft: unknown) {
  const checked = validateDraft(draft, { attendance: 'attended' })
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}
const BODY = bodyOf(SNAKE)
const A1 = 'A1' as CriterionId
const A2 = 'A2' as CriterionId
const A3 = 'A3' as CriterionId
const NOW: BatchKey = { revision: 2, written: 'call-9' }
const EARLIER: BatchKey = { revision: 2, written: 'call-4' }

const active = (change: Partial<SetGoalState> = {}): SetGoalState =>
  ({
    status: 'active',
    attendance: 'attended',
    generation: 1,
    revision: 2,
    rounds: 3,
    stalled: 0,
    gap: null,
    ...change,
  }) as SetGoalState
const SPOT = {
  criteria: { A1: { value: 'holds', source: 'system', ref: null } },
  metrics: {},
  rules: { N1: { value: 'kept', source: 'judge', ref: null } },
} as const
function recordOf(change: Partial<GoalRecord> = {}): GoalRecord {
  return GoalRecordSchema.parse({
    session: 's',
    version: 7,
    state: active(),
    body: BODY,
    history: [
      {
        revision: 1,
        via: 'direct',
        words: null,
        draftedBy: 'person',
        confirmedBy: 'acc-1',
        operation: 'op-1',
        at: '2026-11-25T00:00:00.000Z',
      },
    ],
    readings: SPOT,
    progress: NO_PROGRESS,
    since: '4172',
    wake: null,
    observed: null,
    ...change,
  })
}
const FOUND: Findings = {
  judge: 'answered',
  criteria: { A1: 'holds' },
  metrics: {},
  rules: { N1: 'kept' },
  exits: [],
  unattainable: false,
}
const AT = { generation: 1, revision: 2, rounds: 3, written: 'call-9' }
const seen = (record: GoalRecord, findings: Findings = FOUND, written = 'call-9') =>
  observe(record, { call: 'call/0', at: AT, written, decided: { A1: 'holds' }, findings })
const out = (key: BatchKey = NOW, criteria = [A2, A3]): Examination => ({
  ...NO_EXAMINATION,
  used: 1,
  batch: { key, criteria, delivery: 'owed', ran: {} },
})
const HOLD: Handed = { value: 'holds', note: null, refs: ['x-3'] }
const BOTH = { A2: HOLD, A3: HOLD } as const

describe('an observation of a goal with criteria that wait', () => {
  it('hands them over as one batch once all that is read on the spot stands: no round is counted and the round ends', () => {
    const step = seen(recordOf())
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.answer).toBe('pass')
    expect(step.handed).toEqual({ key: NOW, criteria: [A2, A3], delivery: 'owed', ran: {} })
    expect(step.cancelled).toBeNull()
    expect(step.record.state).toEqual(active())
    expect(step.record.examination).toEqual(out())
    expect(step.record.wake).toBeNull()
    expect(step.record.readings.criteria).toMatchObject({
      A1: { value: 'holds', source: 'system' },
      A2: { value: 'gathering', source: 'system' },
      A3: { value: 'gathering', source: 'examiner' },
    })
  })

  it('hands nothing over a second time while the batch of this identity is out', () => {
    const step = seen(recordOf({ examination: out() }))
    if (step.kind !== 'next') throw new Error(step.kind)
    expect([step.answer, step.handed, step.cancelled]).toEqual(['pass', null, null])
    expect(step.record.examination).toEqual(out())
  })

  it('replaces the batch that is out when a file was written since, and says which was taken back', () => {
    const step = seen(recordOf({ examination: out(EARLIER) }))
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.cancelled).toEqual(out(EARLIER).batch)
    expect(step.handed?.key).toEqual(NOW)
    expect(step.record.examination.used).toBe(2)
  })

  it('does not hand over while something read on the spot is open: the round goes on', () => {
    const step = seen(recordOf(), { ...FOUND, criteria: { A1: 'fails' } })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect([step.answer, step.handed]).toEqual(['continue', null])
    expect(step.record.examination).toEqual(NO_EXAMINATION)
    expect(step.record.state).toMatchObject({ rounds: 4 })
  })

  it('is achieved only on readings of this identity that hold; the batch count stays', () => {
    const read = received(out(), NOW, BOTH).examination
    const done = seen(recordOf({ examination: read }))
    if (done.kind !== 'next') throw new Error(done.kind)
    expect(done.record.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(done.record.readings.criteria.A3).toEqual({
      value: 'holds',
      source: 'examiner',
      ref: null,
      note: null,
    })
    const written = seen(recordOf({ examination: read }), FOUND, 'call-12')
    expect(written.kind).toBe('reobserve')
    const later = observe(recordOf({ examination: read }), {
      call: 'call/0',
      at: { ...AT, written: 'call-12' },
      written: 'call-12',
      decided: { A1: 'holds' },
      findings: FOUND,
    })
    if (later.kind !== 'next') throw new Error(later.kind)
    expect(later.record.state.status).toBe('active')
    expect(later.handed?.key).toEqual({ revision: 2, written: 'call-12' })
    expect(later.record.readings.criteria.A2?.value).toBe('gathering')
  })

  it('takes back the batch that is out when the goal settles', () => {
    const spent = recordOf({ state: active({ rounds: 50 }), examination: out() })
    const step = observe(spent, {
      call: 'call/0',
      at: { ...AT, rounds: 50 },
      written: 'call-9',
      decided: { A1: 'fails' },
      findings: { ...FOUND, criteria: { A1: 'fails' } },
    })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state.status).toBe('settled')
    expect(step.cancelled).toEqual(out().batch)
    expect(step.record.examination.batch).toBeNull()
  })

  it('settles by the budget when a batch is to be handed over and the examinations are used up', () => {
    const used = received({ ...out(EARLIER), used: 3 }, EARLIER, BOTH).examination
    const step = seen(recordOf({ examination: used }))
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'exit', exit: 'X1', counts: 'failure' },
    })
    expect(step.handed).toBeNull()
  })

  it('does not ask the judge about a criterion that waits', () => {
    const material: JudgeMaterial = {
      body: BODY,
      attendance: 'attended',
      progress: NO_PROGRESS,
      calls: [],
      metrics: {},
      rounds: 3,
    }
    const packed = packJudge(material, BASELINE_JUDGE_CONFIG)
    expect(packed.requests.flatMap(request => Object.keys(request.questions))).toEqual(['N1'])
    expect(packed.decided).toEqual({ A1: 'no-evidence' })
  })

  it('leaves the findings of a goal without such criteria as they are', () => {
    const home = bodyOf(HOME)
    expect(withAwaited(home, out(), NOW, FOUND)).toBe(FOUND)
  })
})

describe('the readings of a batch arriving at the goal', () => {
  const arrive = (
    record: GoalRecord,
    how: Partial<Parameters<typeof evidence>[1]> = {},
  ): ReturnType<typeof evidence> =>
    evidence(record, { key: NOW, written: 'call-9', running: false, answers: BOTH, ...how })
  const waiting = (change: Partial<GoalRecord> = {}) => recordOf({ examination: out(), ...change })

  it('with no round going and everything holding, the goal is achieved at once', () => {
    const step = arrive(waiting())
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect([step.told, step.record.wake]).toEqual([null, null])
    expect(step.record.version).toBe(8)
    expect(step.record.examination).toMatchObject({ batch: null, used: 1 })
    expect(step.record.readings.criteria.A2).toMatchObject({ value: 'holds', source: 'system' })
  })

  it('with no round going and something not done, a round is counted and the agent is sent on with what the examiner saw', () => {
    const NOT_DONE: Handed = { value: 'fails', note: '按右键蛇不转向', refs: ['x-7'] }
    const step = arrive(waiting(), { answers: { A2: HOLD, A3: NOT_DONE } })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.told).toBe('continue')
    expect(step.record.state).toMatchObject({ status: 'active', rounds: 4 })
    expect(step.record.wake).toEqual({
      kind: 'continue',
      request: continueRequest({ generation: 1, revision: 2, rounds: 4 }),
    })
    const row = gapTable(BODY, step.record.readings, 4).find(entry => entry.id === 'A3')
    expect(row).toMatchObject({
      reading: '证据显示没做到',
      source: 'examiner',
      short: '按右键蛇不转向',
      open: true,
    })
  })

  it('a round that ended without handing in leaves the batch untold, and the agent is sent on', () => {
    const step = arrive(waiting(), { answers: null })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.told).toBe('continue')
    expect(step.record.readings.criteria.A3).toMatchObject({
      value: 'cannot-tell',
      note: NOT_HANDED_IN,
    })
  })

  it('with no round going and no coming closer for the third time, the goal is handed to the person, who is told', () => {
    const stalled = active({ stalled: STALL_LIMIT - 1, gap: { open: 1, remaining: {} } } as never)
    const NOT_DONE: Handed = { value: 'fails', note: '按右键蛇不转向', refs: [] }
    const step = arrive(waiting({ state: stalled }), { answers: { A2: HOLD, A3: NOT_DONE } })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.told).toBe('tell')
    expect(step.record.state).toMatchObject({ status: 'paused', pause: { by: 'verdict', row: 7 } })
    expect(step.record.wake).toBeNull()
  })

  it('shows what the examiner saw only beside a reading of this identity', () => {
    const old: Examination = {
      ...NO_EXAMINATION,
      used: 1,
      read: { [A3]: { key: EARLIER, value: 'fails', note: '按右键蛇不转向', refs: [] } },
    }
    const step = seen(recordOf({ examination: old }), { ...FOUND, criteria: { A1: 'fails' } })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.readings.criteria.A3).toEqual({
      value: 'stale',
      source: 'examiner',
      ref: null,
      note: null,
    })
  })

  it('while a round is going, the readings are kept and the goal is left to that round; a verdict is owed in case that round is already past its observation', () => {
    const step = arrive(waiting(), { running: true })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state).toEqual(active())
    expect(step.told).toBeNull()
    expect(step.record.examination.read[A3]).toMatchObject({ key: NOW, value: 'holds' })
    expect(step.record.readings.criteria.A3?.value).toBe('holds')
    expect(step.record.examination.arrived).toBe(true)
  })

  describe('a verdict owed for readings that arrived while a round was going', () => {
    const owed = () => {
      const step = arrive(waiting(), { running: true })
      if (step.kind !== 'next') throw new Error(step.kind)
      return step.record
    }
    const settle = (record: GoalRecord, running = false, written = 'call-9') =>
      settleArrived(record, { written, running })

    it('is given once no round is going: everything holds, so the goal is achieved', () => {
      const step = settle(owed())
      if (step === null) throw new Error('nothing was settled')
      expect(step.record.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
      expect(step.record.examination.arrived).toBe(false)
      expect(step.told).toBeNull()
    })

    it('waits while a round is still going, and is not owed by a goal nothing arrived for', () => {
      expect(settle(owed(), true)).toBeNull()
      expect(settle(waiting())).toBeNull()
    })

    it('sends the agent on when something was found not done', () => {
      const NOT_DONE: Handed = { value: 'fails', note: '按右键蛇不转向', refs: [] }
      const first = arrive(waiting(), { running: true, answers: { A2: HOLD, A3: NOT_DONE } })
      if (first.kind !== 'next') throw new Error(first.kind)
      const step = settle(first.record)
      expect(step?.told).toBe('continue')
      expect(step?.record.state).toMatchObject({ status: 'active', rounds: 4 })
      expect(step?.record.wake?.kind).toBe('continue')
    })

    it('is no longer owed once the round made its own observation, or the goal is paused or settled', () => {
      const observed = seen(owed())
      if (observed.kind !== 'next') throw new Error(observed.kind)
      expect(observed.record.examination.arrived).toBe(false)
      const paused = { ...active(), status: 'paused', pause: { by: 'person' } } as SetGoalState
      expect(settle({ ...owed(), state: paused })).toBeNull()
    })

    it('hands a new batch over when a file was written since: the readings that arrived are out of date', () => {
      const step = settle(owed(), false, 'call-12')
      if (step === null) throw new Error('nothing was settled')
      expect(step.record.state.status).toBe('active')
      expect(step.record.examination).toMatchObject({
        arrived: false,
        used: 2,
        batch: { key: { revision: 2, written: 'call-12' }, criteria: [A2, A3], delivery: 'owed' },
      })
    })
  })

  it('while the goal is paused, the readings are kept and it stays paused', () => {
    const paused = { ...active(), status: 'paused', pause: { by: 'person' } } as SetGoalState
    const step = arrive(waiting({ state: paused }))
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state).toEqual(paused)
    expect(step.record.examination.read[A2]).toMatchObject({ value: 'holds' })
    const during = arrive(waiting({ state: paused }), { running: true })
    if (during.kind !== 'next') throw new Error(during.kind)
    expect(during.record.examination.arrived).toBe(false)
  })

  it('of the batch that is out but no longer the awaited one are not kept: a file was written since', () => {
    const step = arrive(waiting(), { written: 'call-12' })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.record.state).toEqual(active())
    expect(step.record.examination).toEqual({ ...NO_EXAMINATION, used: 1 })
    expect(step.record.readings.criteria.A3?.value).toBe('no-evidence')
  })

  it('of another batch than the one out, or for a settled goal, are dropped and nothing is written', () => {
    expect(arrive(waiting(), { key: EARLIER })).toEqual({ kind: 'dropped' })
    expect(arrive(recordOf())).toEqual({ kind: 'dropped' })
    const settled: SetGoalState = {
      status: 'settled',
      attendance: 'attended',
      generation: 1,
      revision: 2,
      rounds: 3,
      outcome: { kind: 'cancelled' },
    }
    const gone = waiting({ state: settled })
    expect(arrive(gone)).toEqual({ kind: 'dropped' })
  })

  it('an examination is kept as it stands: a batch whose handing over is not known, and each of the three readings', () => {
    const kept: Examination = {
      batch: { key: NOW, criteria: [A2], delivery: 'unknown', ran: {} },
      used: 2,
      read: {
        [A1]: { key: EARLIER, value: 'fails', note: '没过', refs: ['x-1'] },
        [A2]: { key: EARLIER, value: 'cannot-tell', note: null, refs: [] },
        [A3]: { key: NOW, value: 'holds', note: null, refs: [] },
      },
      examiner: 'x-session',
      arrived: true,
      submitted: { key: EARLIER, digest: 'sha256:aa' },
    }
    expect(ExaminationSchema.parse(kept)).toEqual(kept)
    const odd = { ...kept, batch: { ...kept.batch, delivery: 'lost' } }
    expect(ExaminationSchema.safeParse(odd).success).toBe(false)
  })

  it('reads the kept readings as findings that asked nothing', () => {
    expect(keptFindings(SPOT)).toEqual(FOUND)
    expect(keptFindings(NO_READINGS).criteria).toEqual({})
  })
})

describe('what the gap table says of a criterion that waits', () => {
  const rowOf = (value: CriterionReading, note: string | null = null) =>
    gapTable(
      BODY,
      { ...SPOT, criteria: { A3: { value, source: 'examiner', ref: null, note } } },
      3,
    ).find(row => row.id === 'A3')
  it.each([
    ['no-evidence', '没有证据', '别的行都成立后，系统把它交给查验的一方'],
    ['gathering', '在取证', '现在写文件会让它过时'],
    ['stale', '证据过时', '之后又写过文件：下一次想收工时系统会再查'],
  ] as const)('%s: %s, %s', (value, reading, short) => {
    expect(rowOf(value)).toMatchObject({ reading, short, open: true })
  })
  it('a reading the examiner handed in shows what it saw; one that holds closes the row', () => {
    expect(rowOf('cannot-tell', '副本里起不来')).toMatchObject({
      reading: '判不了',
      short: '副本里起不来',
    })
    expect(rowOf('holds')).toMatchObject({ reading: '成立', short: null, open: false })
  })
})

/** A small generator with a seed: the same seed gives the same sequence on every machine. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

describe('random sequences of what happens to a batch, against a plain reference', () => {
  type Under = 'none' | 'stale' | 'holds' | 'fails' | 'cannot-tell'
  type Plain = {
    under: Record<string, Under>
    out: { ids: string[]; live: boolean } | null
    /** A batch was handed over under the identity that stands now: no other is, until a write or a revision. */
    handed: boolean
  }
  const IDS = [A1, A2, A3]
  const VALUES = ['holds', 'fails', 'cannot-tell'] as const

  it('each criterion reads as the reference says after every step', () => {
    const next = seeded(20261126)
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!
    const inputs = new Set<string>()
    let checked = 0
    for (let run = 0; run < 400; run += 1) {
      let revision = 1
      let writes = 0
      let examination: Examination = NO_EXAMINATION
      const plain: Plain = {
        under: { A1: 'none', A2: 'none', A3: 'none' },
        out: null,
        handed: false,
      }
      const keyNow = (): BatchKey => ({ revision, written: `w${String(writes)}` })
      const trace: string[] = []
      for (let step = 0; step < 12; step += 1) {
        const kind = pick(['write', 'hand', 'back', 'back-late', 'revise'] as const)
        if (kind === 'write') {
          writes += 1
          for (const id of IDS) if (plain.under[id] !== 'none') plain.under[id] = 'stale'
          if (plain.out !== null) plain.out.live = false
          plain.handed = false
          trace.push('w')
        } else if (kind === 'hand') {
          const ids = IDS.filter(() => next() < 0.6)
          if (ids.length === 0) continue
          examination = handed(examination, keyNow(), ids).examination
          if (!plain.handed) plain.out = { ids, live: true }
          plain.handed = true
          trace.push(`h${ids.join('')}`)
        } else if (kind === 'back' || kind === 'back-late') {
          const key =
            kind === 'back' ? (examination.batch?.key ?? keyNow()) : { revision, written: 'w-none' }
          const value = pick(VALUES)
          const answers = Object.fromEntries(IDS.map(id => [id, { value, note: null, refs: [] }]))
          const got = received(examination, key, answers)
          examination =
            got.taken && key.revision === revision && key.written === `w${String(writes)}`
              ? got.examination
              : got.taken
                ? { ...examination, batch: null }
                : examination
          if (kind === 'back' && plain.out !== null) {
            if (plain.out.live) for (const id of plain.out.ids) plain.under[id] = value
            plain.out = null
          }
          trace.push(`${kind === 'back' ? 'b' : 'l'}${value[0]!}`)
        } else {
          const touched = IDS.filter(() => next() < 0.4)
          revision += 1
          examination = keptExamination(
            examination,
            new Set(IDS.filter(id => !touched.includes(id))),
          ).examination
          for (const id of IDS) plain.under[id] = 'none'
          plain.handed = false
          if (plain.out !== null) {
            if (plain.out.ids.some(id => touched.includes(id as CriterionId))) plain.out = null
            else plain.out.live = false
          }
          trace.push(`r${touched.join('')}`)
        }
        inputs.add(trace.join(' '))
        for (const id of IDS) {
          const waited = plain.out !== null && plain.out.live && plain.out.ids.includes(id)
          const under = plain.under[id]!
          const expected = waited ? 'gathering' : under === 'none' ? 'no-evidence' : under
          expect(awaitedReading(id, examination, keyNow()), trace.join(' ')).toBe(expected)
          checked += 1
        }
      }
    }
    console.log(
      `random batches: ${String(inputs.size)} distinct sequences, ${String(checked)} readings checked`,
    )
    expect(inputs.size).toBeGreaterThan(3000)
  })
})
