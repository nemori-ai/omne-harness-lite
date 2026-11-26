import { describe, expect, it } from 'vitest'
import {
  awaitedReading,
  batchRequest,
  cancelled,
  delivered,
  ExaminationSchema,
  handed,
  keptExamination,
  NO_EXAMINATION,
  owesExamination,
  pendingOf,
  received,
  sameKey,
  takenBack,
  validateDraft,
  type BatchKey,
  type CriterionId,
  type Examination,
  type GoalBody,
} from '@omne-harness/goal-contract'

const A1 = 'A1' as CriterionId
const A2 = 'A2' as CriterionId
const A3 = 'A3' as CriterionId
const NOW: BatchKey = { revision: 2, written: 'call-9' }
const EARLIER: BatchKey = { revision: 2, written: 'call-4' }
const BEFORE_REVISION: BatchKey = { revision: 1, written: 'call-9' }
const out = (key: BatchKey, delivery: 'handed' | 'unknown' = 'handed'): Examination => ({
  ...NO_EXAMINATION,
  used: 1,
  batch: { key, criteria: [A1, A2], delivery, ran: {} },
})
const read = (key: BatchKey, value: 'holds' | 'fails' | 'cannot-tell'): Examination => ({
  ...NO_EXAMINATION,
  used: 1,
  read: { [A1]: { key, value, note: null, refs: [] } },
})

function bodyOf(): GoalBody {
  const checked = validateDraft(
    {
      purpose: '做一个能玩的贪吃蛇',
      criteria: [
        { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
        {
          statement: '方向键能控制蛇',
          evidence: { kind: 'examination', method: '用 node 走一局' },
        },
        { statement: '写了说明', evidence: { kind: 'file', path: 'README.md' } },
      ],
    },
    { attendance: 'attended' },
  )
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}

describe('the reading of a criterion that waits for a run again or an examination', () => {
  it.each([
    ['was not examined under this revision: nothing was read', NO_EXAMINATION, 'no-evidence'],
    ['was read under an earlier revision only', read(BEFORE_REVISION, 'holds'), 'no-evidence'],
    ['is in the batch that is out and not back', out(NOW), 'gathering'],
    ['came back, and a file was written since', read(EARLIER, 'holds'), 'stale'],
    ['came back as holding, and nothing was written since', read(NOW, 'holds'), 'holds'],
    ['came back as not done', read(NOW, 'fails'), 'fails'],
    ['came back from a batch that was not finished', read(NOW, 'cannot-tell'), 'cannot-tell'],
    ['is in a batch whose handing over is not known', out(NOW, 'unknown'), 'cannot-tell'],
  ] as const)('%s', (_name, examination, expected) => {
    expect(awaitedReading(A1, examination, NOW)).toBe(expected)
  })

  it('a batch of another identity that is still out does not make it gathering', () => {
    expect(awaitedReading(A1, out(EARLIER), NOW)).toBe('no-evidence')
    expect(awaitedReading(A3, out(NOW), NOW)).toBe('no-evidence')
  })
})

describe('the identity of a batch', () => {
  it('is the revision and where the last write stands; the request of a batch names the goal too', () => {
    expect(sameKey(NOW, { revision: 2, written: 'call-9' })).toBe(true)
    expect(sameKey(NOW, EARLIER)).toBe(false)
    expect(sameKey(NOW, BEFORE_REVISION)).toBe(false)
    expect(batchRequest(3, NOW)).toBe('examine/3/2/call-9')
    expect(batchRequest(3, NOW)).not.toBe(batchRequest(4, NOW))
  })

  it('what is pending is the batch of the current identity, whether its handing over is known or not', () => {
    expect(pendingOf(out(NOW), NOW)).toEqual([A1, A2])
    expect(pendingOf(out(NOW, 'unknown'), NOW)).toEqual([A1, A2])
    expect(pendingOf(out(EARLIER), NOW)).toEqual([])
    expect(pendingOf(NO_EXAMINATION, NOW)).toEqual([])
  })
})

describe('handing a batch over', () => {
  it('counts one examination and keeps the batch; nothing of an earlier identity is cancelled when none is out', () => {
    expect(handed(NO_EXAMINATION, NOW, [A1, A2])).toEqual({
      examination: {
        ...NO_EXAMINATION,
        batch: { key: NOW, criteria: [A1, A2], delivery: 'owed', ran: {} },
        used: 1,
      },
      replaced: null,
    })
  })

  it('replaces a batch of another identity that is still out, and says which', () => {
    const step = handed(out(EARLIER), NOW, [A1])
    expect(step.replaced).toEqual({ key: EARLIER, criteria: [A1, A2], delivery: 'handed', ran: {} })
    expect(step.examination).toMatchObject({ batch: { key: NOW, criteria: [A1] }, used: 2 })
  })

  it('is handed once for one identity: the same identity again changes nothing, while it is out and after a reading came back under it', () => {
    const once = out(NOW)
    expect(handed(once, NOW, [A1, A2])).toEqual({ examination: once, replaced: null })
    const back = read(NOW, 'fails')
    expect(handed(back, NOW, [A2])).toEqual({ examination: back, replaced: null })
    expect(handed(back, { ...NOW, written: 'call-12' }, [A2]).examination.batch?.criteria).toEqual([
      A2,
    ])
    const submitted = { ...NO_EXAMINATION, submitted: { key: NOW, digest: 'sha256:aa' } }
    expect(handed(submitted, NOW, [A1])).toEqual({ examination: submitted, replaced: null })
  })
})

describe('what a goal owes for its examination', () => {
  it('is a batch that is out, taken or not, or a verdict for readings that arrived while a round was going; nothing else', () => {
    const owed = handed(NO_EXAMINATION, NOW, [A1]).examination
    expect(owesExamination(owed)).toBe(true)
    expect(owesExamination(delivered(owed, NOW, 'unknown'))).toBe(true)
    expect(owesExamination(delivered(owed, NOW, 'handed'))).toBe(true)
    expect(owesExamination(NO_EXAMINATION)).toBe(false)
    expect(ExaminationSchema.parse({ batch: null, used: 0, read: {} })).toEqual(NO_EXAMINATION)
    expect(owesExamination({ ...NO_EXAMINATION, arrived: true })).toBe(true)
    expect(owesExamination({ ...delivered(owed, NOW, 'handed'), arrived: true })).toBe(true)
  })
})

describe('a batch taken back from the examining side', () => {
  const out = handed(NO_EXAMINATION, NOW, [A1]).examination
  const LATER: BatchKey = { ...NOW, written: 'call-12' }

  it('is the batch that was out and is not any more with nothing of it read: cancelled, or replaced by another', () => {
    expect(takenBack(out, cancelled(out).examination)).toEqual(out.batch)
    expect(takenBack(out, handed(out, LATER, [A1]).examination)).toEqual(out.batch)
  })

  it('is none while the same batch is out, when none was out, and when the batch came back: read, or handed in', () => {
    expect(takenBack(out, delivered(out, NOW, 'handed'))).toBeNull()
    expect(takenBack(NO_EXAMINATION, out)).toBeNull()
    expect(takenBack(NO_EXAMINATION, NO_EXAMINATION)).toBeNull()
    const read = received(out, NOW, { [A1]: { value: 'holds', note: null, refs: [] } })
    expect(takenBack(out, read.examination)).toBeNull()
    const late = { ...cancelled(out).examination, submitted: { key: NOW, digest: 'sha256:aa' } }
    expect(takenBack(out, late)).toBeNull()
    const other = { ...cancelled(out).examination, submitted: { key: LATER, digest: 'sha256:aa' } }
    expect(takenBack(out, other)).toEqual(out.batch)
  })
})

describe('the readings of a batch coming in', () => {
  const answers = { [A1]: { value: 'holds', note: null, refs: ['x-1'] } } as const

  it('are kept for the batch that is out, each with the identity it was read under; what it left out cannot be told', () => {
    const step = received(out(NOW), NOW, answers)
    expect(step.taken).toBe(true)
    expect(step.examination.batch).toBeNull()
    expect(step.examination.read).toEqual({
      [A1]: { key: NOW, value: 'holds', note: null, refs: ['x-1'] },
      [A2]: {
        key: NOW,
        value: 'cannot-tell',
        note: 'the examiner handed in no reading of it',
        refs: [],
      },
    })
  })

  it('a round that ended without handing in leaves every criterion of the batch untold, with the reason', () => {
    const step = received(out(NOW), NOW, null)
    expect(Object.values(step.examination.read).map(entry => [entry?.value, entry?.note])).toEqual([
      ['cannot-tell', 'the examination ended without handing in its readings'],
      ['cannot-tell', 'the examination ended without handing in its readings'],
    ])
  })

  it('are dropped when they are of a batch that is not the one out; the batch out stays', () => {
    const waiting = out(NOW)
    expect(received(waiting, EARLIER, answers)).toEqual({ examination: waiting, taken: false })
    expect(received(NO_EXAMINATION, NOW, answers)).toEqual({
      examination: NO_EXAMINATION,
      taken: false,
    })
  })
})

describe('a batch that is out when something else happens to the goal', () => {
  it('is cancelled by a cancel, an abort or a settling: the examination keeps its count and no batch', () => {
    expect(cancelled(out(NOW))).toEqual({
      examination: { ...out(NOW), batch: null },
      cancelled: { key: NOW, criteria: [A1, A2], delivery: 'handed', ran: {} },
    })
    expect(cancelled(NO_EXAMINATION)).toEqual({ examination: NO_EXAMINATION, cancelled: null })
  })

  it('a revision voids the reading of a criterion it touched and cancels the batch that criterion is in', () => {
    const both: Examination = {
      ...out(NOW),
      read: {
        [A1]: { key: EARLIER, value: 'holds', note: null, refs: [] },
        [A3]: { key: EARLIER, value: 'fails', note: null, refs: [] },
      },
    }
    const touched = keptExamination(both, new Set([A2, A3]))
    expect(touched.cancelled?.criteria).toEqual([A1, A2])
    expect(touched.examination).toEqual({
      ...NO_EXAMINATION,
      used: 1,
      read: { [A3]: both.read[A3] },
    })
    const untouched = keptExamination(both, new Set([A1, A2, A3]))
    expect(untouched).toEqual({ examination: both, cancelled: null })
  })

  it('the body says how many examinations its budget allows', () => {
    const limits = bodyOf().exits.find(exit => exit.kind === 'budget')?.limits
    expect(limits).toContainEqual({ amount: 3, unit: 'examinations' })
  })
})
