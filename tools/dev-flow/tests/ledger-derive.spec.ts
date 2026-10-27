import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { csvField, toCsv } from '../src/ledger/csv.ts'
import {
  CARD_COLUMNS,
  deriveLedger,
  LEDGER_VERSION,
  MILESTONE_COLUMNS,
  nearestRank,
  WAVE_COLUMNS,
  type LedgerInputs,
} from '../src/ledger/derive.ts'
import { readAdmission, readBoard, readCapture, readSlots } from '../src/ledger/sources.ts'

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/ledger/${name}`, import.meta.url))
const capture = readCapture(fixture('capture.json'))
const slots = readSlots(fixture('slots.jsonl'))
const board = readBoard(fixture('board.json'))
const admission = readAdmission(fixture('admission'))

function inputs(overrides: Partial<LedgerInputs> = {}): LedgerInputs {
  return {
    capture,
    milestone: 'M1.5',
    admission: undefined,
    slots,
    board,
    files: { capture: 'capture.json', slots: 'slots.jsonl', board: 'board.json' },
    generatedAt: '2026-10-27T00:00:00.000Z',
    ...overrides,
  }
}
const byCard = (ledger: ReturnType<typeof deriveLedger>, card: number) => {
  const row = ledger.cards.find(item => item.card === String(card))
  if (row === undefined) throw new Error(`no row for #${card}`)
  return row
}

describe('card table', () => {
  const ledger = deriveLedger(inputs())

  it('keeps only the cards of the milestone, in card order', () => {
    expect(ledger.cards.map(row => row.card)).toEqual(['101', '102', '103'])
    expect(deriveLedger(inputs({ milestone: undefined })).cards.map(row => row.card)).toEqual([
      '101',
      '102',
      '103',
      '104',
    ])
  })

  it('derives the card that was dispatched twice and accepted', () => {
    expect(byCard(ledger, 101)).toMatchObject({
      attempts: '2',
      line: 'engineering-toolchain',
      kind: 'feature',
      wave: 'W1',
      milestone: 'M1.5',
      t_dispatch: '2026-10-01T08:00:00Z',
      t_deliver: '2026-10-02T14:30:00Z',
      t_accept: '2026-10-03T10:00:00Z',
      cycle_days: '2',
      t_in_line_h: '30.5',
      t_in_reduce_h: '19.5',
      a: '2',
      admit_fail: '1',
      first_pass: 'false',
      map_admission_evidence: 'true',
      contract_change_declared: 'none',
      session_restarts: '',
    })
  })

  it('leaves the acceptance cells of a card without an accept decision empty', () => {
    expect(byCard(ledger, 102)).toMatchObject({
      attempts: '1',
      line: 'docs-line',
      kind: 'bug',
      t_dispatch: '2026-10-01T09:00:00Z',
      t_deliver: '2026-10-01T21:00:00Z',
      t_accept: '',
      t_in_line_h: '12.0',
      t_in_reduce_h: '',
      cycle_days: '',
      a: '1',
      admit_fail: '0',
      first_pass: 'true',
      map_admission_evidence: 'false',
      contract_change_declared: 'additive',
    })
  })

  it('counts session restarts only on the line parent card', () => {
    expect(byCard(ledger, 103)).toMatchObject({
      attempts: '0',
      session_restarts: '2',
      t_dispatch: '',
      a: '',
      first_pass: '',
      map_admission_evidence: '',
      cycle_days: '7',
    })
  })

  it('keeps every column the version does not derive empty and names why in the meta', () => {
    const missing = CARD_COLUMNS.filter(column =>
      ledger.meta.fields.cards[column].startsWith('missing:'),
    )
    expect(missing).toContain('t_integrating')
    expect(missing).toContain('decision_requested_at')
    expect(missing).toContain('S_admit_min')
    for (const row of ledger.cards) for (const column of missing) expect(row[column]).toBe('')
    expect(ledger.meta.fields.cards.S_admit_min).toBe('missing:no --admission input')
    expect(ledger.meta.fields.cards.a).toBe('derived')
  })

  it('falls back to the body line and warns when the binding does not parse', () => {
    const broken = capture.issues.map(issue =>
      issue.number === 101
        ? { ...issue, body: issue.body.replace('"revision": 1', '"revision": "one"') }
        : issue,
    )
    const result = deriveLedger(inputs({ capture: { ...capture, issues: broken } }))
    expect(byCard(result, 101)).toMatchObject({ line: 'body-line-not-used', attempts: '2' })
    expect(result.meta.warnings).toEqual([
      expect.stringMatching(/^#101: the body binding does not parse/),
    ])
  })
})

describe('admission runs', () => {
  it('pairs a fast directory with the slow directory after it and keeps a lone slow one apart', () => {
    expect(admission.runs).toEqual([
      { key: 'abc1234/20261001-090000', branch: 'main', wallSeconds: 60, failed: false },
      {
        key: 'abc1234/20261001-100000',
        branch: 'human/issue-101-ledger',
        wallSeconds: 300,
        failed: false,
      },
      {
        key: 'abc1234-dirty/20261002-120000',
        branch: 'human/issue-102-docs',
        wallSeconds: 90,
        failed: true,
      },
    ])
    expect(admission.directoriesWithoutLedger).toBe(1)
  })

  it('maps runs to cards by issue-<N> in the branch and derives the admission columns', () => {
    const ledger = deriveLedger(inputs({ admission, files: { capture: 'c', admission: 'a' } }))
    expect(ledger.meta.admissionSource).toBe('admission')
    expect(ledger.meta.unmappedAdmissionRuns).toBe(1)
    expect(byCard(ledger, 101)).toMatchObject({
      a: '1',
      admit_fail: '0',
      first_pass: 'true',
      S_admit_min: '5.0',
    })
    expect(byCard(ledger, 102)).toMatchObject({
      a: '1',
      admit_fail: '1',
      first_pass: 'false',
      S_admit_min: '1.5',
    })
    expect(byCard(ledger, 103)).toMatchObject({ a: '', S_admit_min: '' })
    expect(ledger.milestone).toMatchObject({ p: '0.500', first_pass_rate: '0.500' })
    expect(ledger.waves.find(row => row.wave === 'W1')?.sum_S_min).toBe('6.5')
    for (const column of ['a', 'admit_fail', 'first_pass', 'S_admit_min'] as const)
      expect(ledger.meta.fields.cards[column]).toBe('derived')
    expect(ledger.meta.fields.milestone.p).toBe('derived')
    expect(ledger.meta.notes).toContain(
      'Both --admission and --slots were given: a and admit_fail come from --admission.',
    )
  })

  it('names the missing reason when no run branch names a card', () => {
    const ledger = deriveLedger(
      inputs({
        admission: {
          directoriesWithoutLedger: 0,
          runs: [{ key: 'h/1', branch: 'main', wallSeconds: 60, failed: false }],
        },
      }),
    )
    expect(ledger.meta.unmappedAdmissionRuns).toBe(1)
    expect(ledger.meta.fields.cards.a).toBe(
      'missing:no admission run maps to a card (no meta.branch contains issue-<N>)',
    )
    expect(byCard(ledger, 101).a).toBe('')
  })
})

describe('wave and milestone tables', () => {
  const ledger = deriveLedger(inputs())

  it('derives the wave rows from the card rows', () => {
    expect(ledger.waves.map(row => row.wave)).toEqual(['W1', 'W2'])
    expect(ledger.waves[0]).toMatchObject({
      n: '2',
      L_max_h: '30.5',
      L_med_h: '12.0',
      L_min_h: '12.0',
      idle_seat_time_h: '18.5',
      redispatches: '1',
      sum_S_min: '',
      P: '',
    })
    expect(ledger.waves[1]).toMatchObject({
      n: '1',
      L_max_h: '',
      idle_seat_time_h: '',
      redispatches: '0',
    })
  })

  it('groups cards without a board entry under (missing)', () => {
    const result = deriveLedger(inputs({ board: undefined }))
    expect(result.waves.map(row => [row.wave, row.n])).toEqual([['(missing)', '3']])
    expect(result.meta.fields.cards.wave).toBe('missing:no --board input')
  })

  it('derives the milestone row with nearest-rank quantiles', () => {
    expect(ledger.milestone).toMatchObject({
      milestone: 'M1.5',
      cycle_days_median: '2',
      cycle_days_p85: '7',
      t_in_line_median_h: '12.0',
      t_in_line_p85_h: '30.5',
      t_in_reduce_median_h: '19.5',
      t_in_reduce_p85_h: '19.5',
      p: '0.333',
      first_pass_rate: '0.500',
      flaky_rate: '1.000',
      gate_median_min: '',
    })
  })

  it('leaves the slot-based cells empty without slots', () => {
    const result = deriveLedger(inputs({ slots: undefined }))
    expect(result.milestone).toMatchObject({ p: '', first_pass_rate: '', flaky_rate: '' })
    expect(result.meta.fields.milestone.flaky_rate).toBe('missing:no --slots input')
    expect(result.meta.fields.milestone.p).toBe('missing:no --admission or --slots input')
  })

  it('writes the version, inputs and a status for every column into the meta', () => {
    expect(ledger.meta).toMatchObject({
      version: LEDGER_VERSION,
      generatedAt: '2026-10-27T00:00:00.000Z',
      inputs: { capture: 'capture.json', admission: null, milestone: 'M1.5' },
      unmappedAdmissionRuns: null,
      slots: { checkRows: 5, unmappedCheckRows: 1 },
    })
    expect(Object.keys(ledger.meta.fields.cards)).toEqual([...CARD_COLUMNS])
    expect(Object.keys(ledger.meta.fields.waves)).toEqual([...WAVE_COLUMNS])
    expect(Object.keys(ledger.meta.fields.milestone)).toEqual([...MILESTONE_COLUMNS])
    expect(LEDGER_VERSION).toBe('1')
  })
})

describe('nearest rank', () => {
  it('takes the value at the ceiling rank and leaves an empty sample empty', () => {
    const values = [10, 3, 7, 1, 9, 2, 8, 4, 6, 5]
    expect(nearestRank(values, 50)).toBe(5)
    expect(nearestRank(values, 85)).toBe(9)
    expect(nearestRank([4], 85)).toBe(4)
    expect(nearestRank([], 50)).toBeUndefined()
  })
})

describe('csv', () => {
  it('quotes fields with a comma, quote or line break and doubles inner quotes', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField('cr\r')).toBe('"cr\r"')
    expect(toCsv(['x', 'y'], [{ x: '1', y: '' }])).toBe('x,y\r\n1,\r\n')
  })
})
