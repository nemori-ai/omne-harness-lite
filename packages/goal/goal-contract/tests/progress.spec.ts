import { describe, expect, it } from 'vitest'
import {
  applyTrack,
  citedRefs,
  confirmOptionId,
  DROP_OPTION,
  keptProgress,
  NO_PROGRESS,
  readConfirmOption,
  validateDraft,
  type GoalBody,
  type Progress,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

function home(change: object = {}): GoalBody {
  const checked = validateDraft({ ...HOME, ...change }, { attendance: 'attended' })
  if (checked.kind !== 'valid') throw new Error('fixture')
  return checked.body
}
const tracked = (patch: unknown, before: Progress = NO_PROGRESS): Progress => {
  const result = applyTrack(home(), before, patch)
  if (result.kind !== 'valid') throw new Error(JSON.stringify(result.issues))
  return result.progress
}
const refused = (patch: unknown): string[] => {
  const result = applyTrack(home(), NO_PROGRESS, patch)
  return result.kind === 'invalid' ? result.issues.map(i => `${i.entry ?? '-'}.${i.field}`) : []
}

describe('the progress list follows the numbers of the body', () => {
  it('starts empty, proposing nothing', () => {
    expect(NO_PROGRESS).toEqual({
      criteria: {},
      metrics: {},
      rules: {},
      obstacle: null,
      deliverables: [],
      proposal: { kind: 'none' },
      notes: [],
    })
  })

  it('an update names entries by number; the entries it does not name stay as they were', () => {
    const first = tracked({
      criteria: { A2: { status: 'claimed-done', refs: ['call-44'], note: '全过' } },
      rules: { N1: { check: 'kept' } },
    })
    const second = tracked(
      {
        criteria: { A3: { status: 'doing', refs: [], note: '' } },
        metrics: { M1: { ref: 'call-41' } },
      },
      first,
    )
    expect(second.criteria).toEqual({
      A2: { status: 'claimed-done', refs: ['call-44'], note: '全过' },
      A3: { status: 'doing', refs: [], note: '' },
    })
    expect(second.rules).toEqual({ N1: { check: 'kept' } })
    expect(second.metrics).toEqual({ M1: { ref: 'call-41' } })
  })

  it('the obstacle, the deliverables, the proposal and the notes are replaced whole when named', () => {
    const first = tracked({
      obstacle: { what: '测试环境连不上', tried: ['call-7'], exit: 'X3' },
      deliverables: ['dist/report.md'],
      proposal: { kind: 'exit', exit: 'X3' },
      notes: ['先量基线'],
    })
    expect(first).toMatchObject({
      obstacle: { what: '测试环境连不上', tried: ['call-7'], exit: 'X3' },
      deliverables: ['dist/report.md'],
      proposal: { kind: 'exit', exit: 'X3' },
      notes: ['先量基线'],
    })
    const second = tracked({ obstacle: null, proposal: { kind: 'achieved' } }, first)
    expect(second.obstacle).toBeNull()
    expect(second.proposal).toEqual({ kind: 'achieved' })
    expect(second.notes).toEqual(['先量基线'])
    expect(second.deliverables).toEqual(['dist/report.md'])
  })

  it.each([
    [
      'a criterion the body does not have',
      { criteria: { A9: { status: 'doing', refs: [], note: '' } } },
      ['A9.id'],
    ],
    ['a metric the body does not have', { metrics: { M9: { ref: 'call-1' } } }, ['M9.id']],
    ['a rule the body does not have', { rules: { N9: { check: 'kept' } } }, ['N9.id']],
    [
      'a status outside the four',
      { criteria: { A2: { status: 'done', refs: [], note: '' } } },
      ['A2.status'],
    ],
    [
      'a note past two hundred characters',
      { criteria: { A2: { status: 'doing', refs: [], note: '字'.repeat(201) } } },
      ['A2.note'],
    ],
    [
      'a proposal by an exit the body does not have',
      { proposal: { kind: 'exit', exit: 'X9' } },
      ['-.proposal'],
    ],
    [
      'an obstacle pointing at an exit the body does not have',
      { obstacle: { what: '挡住了', tried: [], exit: 'X9' } },
      ['-.obstacle'],
    ],
    [
      'more than twenty notes',
      { notes: Array.from({ length: 21 }, (_, i) => `n${String(i)}`) },
      ['-.notes'],
    ],
    ['a field nobody knows', { mood: 'good' }, ['-.mood']],
    ['something that is no update', 5, ['-.progress']],
  ])('refused: %s', (_name, patch, expected) => {
    expect(refused(patch)).toEqual(expected)
  })

  it('a note of exactly two hundred characters stands, counted by code points', () => {
    const note = '🙂'.repeat(200)
    expect(
      tracked({ criteria: { A2: { status: 'doing', refs: [], note } } }).criteria.A2?.note,
    ).toBe(note)
  })

  it('names every tool call it cites, once each', () => {
    const progress = tracked({
      criteria: { A2: { status: 'claimed-done', refs: ['call-44', 'call-45'], note: '' } },
      metrics: { M1: { ref: 'call-41' } },
      obstacle: { what: '挡住了', tried: ['call-44', 'call-7'], exit: null },
    })
    expect(citedRefs(progress)).toEqual(['call-44', 'call-45', 'call-41', 'call-7'])
    expect(citedRefs(NO_PROGRESS)).toEqual([])
  })

  it('after a revision, what was said of an entry that changed or went is dropped; a proposal by a removed exit too', () => {
    const before = home()
    const progress = tracked({
      criteria: {
        A2: { status: 'claimed-done', refs: ['call-44'], note: '' },
        A3: { status: 'doing', refs: [], note: '' },
      },
      rules: { N1: { check: 'kept' }, N2: { check: 'maybe-touched' } },
      metrics: { M1: { ref: 'call-41' } },
      obstacle: { what: '挡住了', tried: [], exit: 'X3' },
      proposal: { kind: 'exit', exit: 'X3' },
      notes: ['留着'],
    })
    const after: GoalBody = {
      ...before,
      criteria: before.criteria.map(entry =>
        entry.id === 'A3' ? { ...entry, statement: '改过的判据' } : entry,
      ),
      rules: before.rules.filter(entry => entry.id !== 'N2'),
      exits: before.exits.filter(entry => entry.id !== 'X3'),
    }
    expect(keptProgress(before, after, progress)).toEqual({
      ...progress,
      criteria: { A2: progress.criteria.A2 },
      rules: { N1: { check: 'kept' } },
      obstacle: { what: '挡住了', tried: [], exit: null },
      proposal: { kind: 'none' },
    })
    expect(keptProgress(before, before, progress)).toEqual(progress)
  })
})

describe('the confirm option of a card carries what the card was drafted against', () => {
  const base = { generation: 2, revision: 3, live: true }
  const digest = `sha256:${'a'.repeat(64)}`
  it('writes the base and the digest into the option id, and reads them back', () => {
    const id = confirmOptionId(base, digest)
    expect(id).toBe(`confirm/2.3.1/${digest}`)
    expect(id.length).toBeLessThanOrEqual(256)
    expect(readConfirmOption(id)).toEqual({ base, digest })
    const none = { generation: 0, revision: 0, live: false }
    expect(readConfirmOption(confirmOptionId(none, digest))).toEqual({ base: none, digest })
  })
  it.each([
    DROP_OPTION,
    'confirm',
    'confirm/2.3.1',
    'confirm/2.3.2/sha256:x',
    'confirm/a.b.1/sha256:x',
    `xconfirm/2.3.1/${'d'}`,
  ])('an option that is not a well-formed confirm option reads as none: %s', id =>
    expect(readConfirmOption(id)).toBeNull(),
  )
})
