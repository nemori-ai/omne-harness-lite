import { describe, expect, it } from 'vitest'
import {
  awaitedReading,
  batchOfRequest,
  batchRequest,
  briefFor,
  delivered,
  GoalRecordSchema,
  NO_PROGRESS,
  handed,
  handedOf,
  NO_EXAMINATION,
  renderBrief,
  submissionIssues,
  submissionOf,
  SubmissionSchema,
  submissionText,
  submit,
  UNCITED,
  validateDraft,
  writtenSince,
  type Batch,
  type BatchKey,
  type CriterionId,
  type GoalRecord,
  type ObservedCall,
  type Submitted,
} from '@omne-harness/goal-contract'

const A1 = 'A1' as CriterionId
const A2 = 'A2' as CriterionId
const A3 = 'A3' as CriterionId
const NOW: BatchKey = { revision: 2, written: 'call-9' }
const BATCH: Batch = { key: NOW, criteria: [A1, A2], delivery: 'handed' }
const one = (criterion: CriterionId, change: Partial<Submitted> = {}): Submitted => ({
  criterion,
  value: 'holds',
  refs: ['x-1'],
  note: '脚本退出码 0',
  ...change,
})

function bodyOf() {
  const checked = validateDraft(
    {
      purpose: '做一个能玩的贪吃蛇',
      criteria: [
        { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
        {
          statement: '方向键能控制蛇',
          evidence: {
            kind: 'examination',
            method: '用 node 载入 snake.js，喂四个方向键，看蛇头的位置',
          },
        },
        { statement: '写了说明', evidence: { kind: 'file', path: 'README.md' } },
      ],
    },
    { attendance: 'attended' },
  )
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}

describe('what the examining side hands in', () => {
  it('names the batch it examined and gives one reading for a criterion: one of three, the calls it cites, what it saw', () => {
    const handedIn = {
      batch: 'examine/1/2/call-9',
      readings: [one(A1), one(A2, { value: 'fails' })],
    }
    expect(SubmissionSchema.parse(handedIn)).toEqual(handedIn)
    const wrong = (change: object) =>
      SubmissionSchema.safeParse({ ...handedIn, readings: [{ ...one(A1), ...change }] }).success
    expect(wrong({ value: 'stale' })).toBe(false)
    expect(wrong({ value: 'gathering' })).toBe(false)
    expect(wrong({ status: 'achieved' })).toBe(false)
    expect(SubmissionSchema.safeParse({ ...handedIn, state: 'settled' }).success).toBe(false)
    expect(SubmissionSchema.safeParse({ ...handedIn, readings: [] }).success).toBe(false)
  })

  it('the name of a batch reads back into the goal and the identity it was handed over under', () => {
    expect(batchOfRequest(batchRequest(3, NOW))).toEqual({ generation: 3, key: NOW })
    const slashed: BatchKey = { revision: 1, written: 'call/9/x' }
    expect(batchOfRequest(batchRequest(1, slashed))).toEqual({ generation: 1, key: slashed })
    expect(batchOfRequest(batchRequest(1, { revision: 1, written: '' }))?.key.written).toBe('')
    expect(batchOfRequest('examine/12/30/call-9')).toEqual({
      generation: 12,
      key: { revision: 30, written: 'call-9' },
    })
    const ODD = [
      '',
      'examine/1',
      'continue/1/2/3',
      'examine/0/2/x',
      'examine/1/x/y',
      'xexamine/1/2/y',
    ]
    for (const odd of ODD) expect(batchOfRequest(odd)).toBeNull()
  })

  it.each([
    ['all of the batch and nothing else', [one(A1), one(A2)], []],
    ['one of the batch left out', [one(A1)], [['A2', 'the batch asks for a reading of it']]],
    [
      'one that is not of the batch',
      [one(A1), one(A2), one(A3)],
      [['A3', 'it is not of this batch']],
    ],
    ['one given twice', [one(A1), one(A1), one(A2)], [['A1', 'it is read twice']]],
  ] as const)('%s', (_name, readings, expected) => {
    const found = submissionIssues(BATCH, readings)
    expect(found.map(issue => [issue.entry, issue.problem])).toEqual(expected)
    expect(found.every(issue => issue.field === 'readings')).toBe(true)
  })

  it('a reading that cites a call which is not of this examination cannot be told, and says why', () => {
    const read = handedOf(
      [one(A1, { refs: ['x-1', 'x-2'] }), one(A2, { refs: ['other-7'] })],
      ['x-1', 'x-2'],
    )
    expect(read).toEqual({
      A1: { value: 'holds', note: '脚本退出码 0', refs: ['x-1', 'x-2'] },
      A2: { value: 'cannot-tell', note: UNCITED, refs: [] },
    })
    expect(UNCITED).toBe('it cites a call that is not of this examination')
    expect(handedOf([one(A1, { refs: [] })], [])).toEqual({
      A1: { value: 'holds', note: '脚本退出码 0', refs: [] },
    })
  })

  it('is the same text for the same readings, whatever order they came in', () => {
    const forward = submissionText([one(A1), one(A2, { value: 'fails' })])
    expect(submissionText([one(A2, { value: 'fails' }), one(A1)])).toBe(forward)
    expect(submissionText([one(A1), one(A2)])).not.toBe(forward)
  })

  it('a batch handed in again is a repeat when it says the same and a conflict when it does not; any other batch is new', () => {
    const before = { ...NO_EXAMINATION, submitted: { key: NOW, digest: 'sha256:aa' } }
    expect(submissionOf(before, NOW, 'sha256:aa')).toBe('repeat')
    expect(submissionOf(before, NOW, 'sha256:bb')).toBe('differs')
    expect(submissionOf(before, { ...NOW, written: 'call-12' }, 'sha256:aa')).toBe('new')
    expect(submissionOf(NO_EXAMINATION, NOW, 'sha256:aa')).toBe('new')
  })
})

describe('the handing over of a batch', () => {
  it('is owed from the write that hands it over until it is known to be taken: owed reads as gathering, unknown as cannot tell', () => {
    const owed = handed(NO_EXAMINATION, NOW, [A1]).examination
    expect(owed.batch?.delivery).toBe('owed')
    expect(awaitedReading(A1, owed, NOW)).toBe('gathering')
    const taken = delivered(owed, NOW, 'handed')
    expect(taken.batch?.delivery).toBe('handed')
    expect(awaitedReading(A1, taken, NOW)).toBe('gathering')
    const lost = delivered(owed, NOW, 'unknown')
    expect(awaitedReading(A1, lost, NOW)).toBe('cannot-tell')
    expect(delivered(lost, NOW, 'handed').batch?.delivery).toBe('handed')
  })

  it('of another batch than the one out changes nothing', () => {
    const owed = handed(NO_EXAMINATION, NOW, [A1]).examination
    expect(delivered(owed, { ...NOW, written: 'call-4' }, 'handed')).toEqual(owed)
    expect(delivered(NO_EXAMINATION, NOW, 'handed')).toEqual(NO_EXAMINATION)
  })
})

describe('the brief of a batch', () => {
  const body = bodyOf()
  const brief = renderBrief(
    body,
    { key: NOW, criteria: [A1, A2], delivery: 'owed' },
    {
      generation: 1,
      where: '/work/snake',
      changed: ['snake.js', 'accept.js'],
    },
  )

  it('gives each criterion of the batch as the body has it, with its command or its method, where the work is and what was written', () => {
    expect(brief).toContain('Batch: examine/1/2/call-9')
    expect(brief).toContain('- [A1] 验收脚本通过\n  - 证据: 复跑 `node accept.js`')
    expect(brief).toContain(
      '- [A2] 方向键能控制蛇\n  - 证据: 查验\n  - 查法: 用 node 载入 snake.js，喂四个方向键，看蛇头的位置',
    )
    expect(brief).toContain('Where the work is: /work/snake')
    expect(brief).toContain('Written since the last batch: snake.js, accept.js')
    expect(brief).not.toContain('写了说明')
    expect(brief).not.toContain('做一个能玩的贪吃蛇')
  })

  it('is the same text for the same batch, and says so when nothing was written or the place is not known', () => {
    const bare = { generation: 1, where: null, changed: [] }
    const again = renderBrief(body, BATCH, bare)
    expect(renderBrief(body, BATCH, bare)).toBe(again)
    expect(again).toBe(
      [
        'Batch: examine/1/2/call-9',
        'Examine each of these criteria yourself and hand in one reading for each with Goal submit, naming this batch.',
        '- [A1] 验收脚本通过\n  - 证据: 复跑 `node accept.js`\n- [A2] 方向键能控制蛇\n  - 证据: 查验\n  - 查法: 用 node 载入 snake.js，喂四个方向键，看蛇头的位置',
        'Written since the last batch: nothing',
      ].join('\n\n'),
    )
  })
})

describe('what was written since the batch before', () => {
  const call = (ref: string, path: string | null, writes = true): ObservedCall => ({
    ref,
    order: 0,
    tool: writes ? 'Files write' : 'Files read',
    command: null,
    path,
    exit: null,
    output: '',
    writes,
  })
  const CALLS = [
    call('c1', 'snake.js'),
    call('c2', 'README.md'),
    call('c3', 'snake.js', false),
    call('c4', 'snake.js'),
    call('c5', null),
    call('c6', 'accept.js'),
    call('c7', 'snake.js'),
  ]

  it('is each path written after that call, once, in the order of the first write; a read and a write of no path are left out', () => {
    expect(writtenSince(CALLS, 'c2')).toEqual(['snake.js', 'accept.js'])
    expect(writtenSince(CALLS, 'c6')).toEqual(['snake.js'])
    expect(writtenSince(CALLS, 'c7')).toEqual([])
  })

  it('is everything written when there was no batch before, or its call is not among these', () => {
    expect(writtenSince(CALLS, '')).toEqual(['snake.js', 'README.md', 'accept.js'])
    expect(writtenSince(CALLS, 'gone')).toEqual(['snake.js', 'README.md', 'accept.js'])
    expect(writtenSince([], '')).toEqual([])
  })
})

describe('readings handed in to a goal', () => {
  const OUT = handed(NO_EXAMINATION, NOW, [A1, A2]).examination
  function recordOf(change: Partial<GoalRecord> = {}): GoalRecord {
    return GoalRecordSchema.parse({
      session: 's',
      version: 7,
      state: {
        status: 'active',
        attendance: 'attended',
        generation: 1,
        revision: 2,
        rounds: 3,
        stalled: 0,
        gap: null,
      },
      body: bodyOf(),
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
      readings: {
        criteria: { A3: { value: 'holds', source: 'judge', ref: null } },
        metrics: {},
        rules: {},
      },
      progress: NO_PROGRESS,
      since: '4172',
      wake: null,
      observed: null,
      examination: OUT,
      ...change,
    })
  }
  const BOTH = [one(A1), one(A2)]
  const hand = (record: GoalRecord, change: Partial<Parameters<typeof submit>[1]> = {}) =>
    submit(record, {
      generation: 1,
      key: NOW,
      readings: BOTH,
      digest: 'sha256:aa',
      real: ['x-1'],
      written: 'call-9',
      running: false,
      ...change,
    })

  it('all right: taken and counted; the goal is judged by the verdict table and the batch is no longer out', () => {
    const step = hand(recordOf())
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.taken).toBe('counted')
    expect(step.record.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(step.record.examination).toMatchObject({
      batch: null,
      submitted: { key: NOW, digest: 'sha256:aa' },
    })
  })

  it('one reading cites a call that is not of the examination: taken, that one cannot be told, and the agent is sent on', () => {
    const step = hand(recordOf(), { readings: [one(A1), one(A2, { refs: ['other-7'] })] })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect([step.taken, step.told]).toEqual(['counted', 'continue'])
    expect(step.record.examination.read[A2]).toMatchObject({ value: 'cannot-tell', note: UNCITED })
    expect(step.record.state).toMatchObject({ status: 'active', rounds: 4 })
  })

  it('the batch is the one out but a file was written since: taken as out of date, and its readings do not count', () => {
    const step = hand(recordOf(), { written: 'call-12' })
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.taken).toBe('stale')
    expect(step.record.state.status).toBe('active')
    expect(step.record.examination).toMatchObject({ batch: null, read: {} })
    expect(step.record.examination.submitted).toEqual({ key: NOW, digest: 'sha256:aa' })
  })

  it('a batch that is not out, or of another goal of the session: taken as out of date, and nothing is written', () => {
    const other = { revision: 2, written: 'call-4' }
    expect(hand(recordOf(), { key: other })).toEqual({ kind: 'kept', taken: 'stale' })
    expect(hand(recordOf(), { generation: 2 })).toEqual({ kind: 'kept', taken: 'stale' })
    expect(hand(recordOf({ examination: NO_EXAMINATION }))).toEqual({
      kind: 'kept',
      taken: 'stale',
    })
  })

  it('handed in before with the same content: nothing changes; with other content: refused', () => {
    const first = hand(recordOf())
    if (first.kind !== 'next') throw new Error(first.kind)
    expect(hand(first.record)).toEqual({ kind: 'kept', taken: 'repeat' })
    expect(hand(first.record, { digest: 'sha256:bb' })).toEqual({
      kind: 'refused',
      reason: 'differs',
    })
  })

  it('one of the batch left out, or one that is not of it: refused, saying which, and nothing changes', () => {
    expect(hand(recordOf(), { readings: [one(A1)] })).toEqual({
      kind: 'refused',
      reason: 'invalid',
      issues: [{ entry: 'A2', field: 'readings', problem: 'the batch asks for a reading of it' }],
    })
    const extra = hand(recordOf(), { readings: [...BOTH, one(A3)] })
    expect(extra).toMatchObject({ kind: 'refused', issues: [{ entry: 'A3' }] })
  })

  it('the brief of the batch out names the goal it is of and what was written since the batch handed in before', () => {
    const calls = [
      {
        ref: 'call-9',
        order: 1,
        tool: 'Files write',
        command: null,
        path: 'a.js',
        exit: null,
        output: '',
        writes: true,
      },
      {
        ref: 'call-12',
        order: 2,
        tool: 'Files write',
        command: null,
        path: 'b.js',
        exit: null,
        output: '',
        writes: true,
      },
    ]
    const first = briefFor(recordOf(), OUT.batch!, { where: null, calls })
    expect(first).toContain('Batch: examine/1/2/call-9')
    expect(first).toContain('Written since the last batch: a.js, b.js')
    const before = { ...OUT, submitted: { key: NOW, digest: 'sha256:aa' } }
    const second = briefFor(recordOf({ examination: before }), OUT.batch!, {
      where: '/work',
      calls,
    })
    expect(second).toContain('Written since the last batch: b.js')
    expect(second).toContain('Where the work is: /work')
  })

  it('never names a state: what it takes is readings, and what it answers is whether they were taken', () => {
    const answers = [hand(recordOf()), hand(recordOf(), { key: { revision: 9, written: '' } })]
    for (const answer of answers) expect(Object.keys(answer)).not.toContain('state')
    expect(
      SubmissionSchema.safeParse({ batch: 'x', readings: BOTH, command: 'settle' }).success,
    ).toBe(false)
  })
})
