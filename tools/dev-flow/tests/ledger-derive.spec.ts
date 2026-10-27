import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { CapturedIssue } from '../src/delivery/protocol.ts'
import { csvField, toCsv } from '../src/ledger/csv.ts'
import {
  CARD_COLUMNS,
  deriveLedger,
  LEDGER_VERSION,
  LINE_COLUMNS,
  MILESTONE_COLUMNS,
  nearestRank,
  WAVE_COLUMNS,
  type LedgerInputs,
  type SlotRow,
} from '../src/ledger/derive.ts'
import { readAdmission, readBoard, readCapture, readSlots } from '../src/ledger/sources.ts'

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/ledger/${name}`, import.meta.url))
const capture = readCapture(fixture('capture.json'))
const slots = readSlots(fixture('slots.jsonl'))
const board = readBoard(fixture('board.json'))
const admission = readAdmission(fixture('admission'))
const REDUCE_MISSING =
  'missing:reduce-side admission runs per batch; the test ledger and the slot ledger record no card number'

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
/** The fixture capture with one more comment on card `number`. */
function withComment(number: number, updatedAt: string, body: string) {
  const issues = capture.issues.map((issue): CapturedIssue =>
    issue.number === number
      ? {
          ...issue,
          comments: [
            ...issue.comments,
            { url: `${issue.url}#issuecomment-99`, author: 'human', body, updatedAt },
          ],
        }
      : issue,
  )
  return { ...capture, issues }
}
const slot = (row: Partial<SlotRow> & Pick<SlotRow, 'endedAt' | 'exitCode'>): SlotRow => ({
  event: 'ran',
  command: 'pnpm run check',
  cwd: '/r/.worktrees/issue-101-r1a2',
  issue: 101,
  ...row,
})

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
      map_a: '2',
      map_admit_fail: '1',
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
      map_a: '1',
      map_admit_fail: '0',
      map_admission_evidence: 'false',
      contract_change_declared: 'additive',
    })
  })

  it('counts session restarts only on the line parent card', () => {
    expect(byCard(ledger, 103)).toMatchObject({
      attempts: '0',
      session_restarts: '2',
      t_dispatch: '',
      map_a: '',
      map_admission_evidence: '',
      cycle_days: '7',
    })
  })

  it('accepts a decision line with a note after accept and refuses a longer word', () => {
    const noted = deriveLedger(
      inputs({ capture: withComment(102, '2026-10-02T03:00:00Z', '- 决定：accept（完整接受）\n') }),
    )
    expect(byCard(noted, 102).t_accept).toBe('2026-10-02T03:00:00Z')
    const longer = deriveLedger(
      inputs({ capture: withComment(102, '2026-10-02T03:00:00Z', '- 决定：acceptx\n') }),
    )
    expect(byCard(longer, 102).t_accept).toBe('')
  })

  it('keeps the reduce-side admission and usage columns empty and names why in the meta', () => {
    for (const column of ['a', 'admit_fail', 'first_pass', 'S_admit_min'] as const) {
      expect(ledger.meta.fields.cards[column]).toBe(REDUCE_MISSING)
      for (const row of ledger.cards) expect(row[column]).toBe('')
    }
    for (const role of ['worker', 'review', 'coordinator', 'reduce'])
      for (const column of [`tokens_in_${role}`, `tokens_out_${role}`, `cost_usd_${role}`])
        expect(ledger.meta.fields.cards).toHaveProperty(
          column,
          'missing:the host does not export session usage',
        )
    const missing = CARD_COLUMNS.filter(column =>
      ledger.meta.fields.cards[column].startsWith('missing:'),
    )
    expect(missing).toContain('t_integrating')
    expect(missing).toContain('decision_requested_at')
    for (const row of ledger.cards) for (const column of missing) expect(row[column]).toBe('')
    expect(ledger.meta.fields.cards.map_a).toBe('derived')
    expect(ledger.meta.fields.cards.map_S_admit_min).toBe('missing:no --admission input')
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

describe('line-side admission runs', () => {
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

  it('refuses a ledger whose meta.branch is neither a string nor null', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-ledger-admission-')))
    try {
      mkdirSync(join(root, 'abc1234', '20261001-100000-fast'), { recursive: true })
      writeFileSync(
        join(root, 'abc1234', '20261001-100000-fast', 'ledger.json'),
        JSON.stringify({ meta: { branch: 7, wallSeconds: 1 }, failures: [] }),
      )
      expect(() => readAdmission(root)).toThrow(/meta\.branch must be a string or null/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('maps runs to cards by issue-<N> in the branch into the map_* columns', () => {
    const ledger = deriveLedger(inputs({ admission, files: { capture: 'c', admission: 'a' } }))
    expect(ledger.meta.mapAdmissionSource).toBe('admission')
    expect(ledger.meta.unmappedAdmissionRuns).toBe(1)
    expect(byCard(ledger, 101)).toMatchObject({
      map_a: '1',
      map_admit_fail: '0',
      map_S_admit_min: '5.0',
      a: '',
      first_pass: '',
    })
    expect(byCard(ledger, 102)).toMatchObject({
      map_a: '1',
      map_admit_fail: '1',
      map_S_admit_min: '1.5',
    })
    expect(byCard(ledger, 103)).toMatchObject({ map_a: '', map_S_admit_min: '' })
    for (const column of ['map_a', 'map_admit_fail', 'map_S_admit_min'] as const)
      expect(ledger.meta.fields.cards[column]).toBe('derived')
    expect(ledger.waves.find(row => row.wave === 'W1')?.sum_S_min).toBe('')
    expect(ledger.meta.notes).toContain(
      'Both --admission and --slots were given: map_a and map_admit_fail come from --admission.',
    )
  })

  it('names the missing reason when the only mapped run belongs to a card outside the table', () => {
    const ledger = deriveLedger(
      inputs({
        admission: {
          directoriesWithoutLedger: 0,
          runs: [
            { key: 'h/1', branch: 'human/issue-104-x', wallSeconds: 60, failed: false },
            { key: 'h/2', branch: 'main', wallSeconds: 60, failed: false },
          ],
        },
      }),
    )
    expect(ledger.meta.unmappedAdmissionRuns).toBe(1)
    expect(ledger.meta.fields.cards.map_a).toBe(
      'missing:no admission run maps to a card of the table (no meta.branch contains issue-<N>)',
    )
    expect(ledger.meta.fields.cards.map_S_admit_min).toBe(ledger.meta.fields.cards.map_a)
    expect(byCard(ledger, 101).map_a).toBe('')
  })

  it('maps a slot row by its issue field before its directory', () => {
    const ledger = deriveLedger(
      inputs({
        slots: [
          slot({
            issue: 101,
            cwd: '/r/.worktrees/issue-102-r1a1',
            endedAt: '2026-10-02T10:00:00Z',
            exitCode: 0,
          }),
        ],
      }),
    )
    expect(byCard(ledger, 101).map_a).toBe('1')
    expect(byCard(ledger, 102).map_a).toBe('')
  })
})

describe('wave, milestone and line tables', () => {
  const ledger = deriveLedger(inputs())

  it('derives the wave rows from the card rows', () => {
    expect(ledger.waves.map(row => row.wave)).toEqual(['W1', 'W2'])
    expect(ledger.waves[0]).toMatchObject({
      n: '2',
      L_max_h: '30.5',
      L_med_h: '12.0',
      L_min_h: '12.0',
      idle_seat_time_h: '18.5',
      attempts_extra: '1',
      redispatches: '',
      sum_S_min: '',
      P: '',
    })
    expect(ledger.waves[1]).toMatchObject({
      n: '1',
      L_max_h: '',
      idle_seat_time_h: '',
      attempts_extra: '0',
    })
    expect(ledger.meta.fields.waves.redispatches).toMatch(/^missing:attempt records carry no/)
    expect(ledger.meta.fields.waves.sum_S_min).toBe(REDUCE_MISSING)
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
      p: '',
      first_pass_rate: '',
      flaky_rate: '',
      map_flaky_rate: '1.000',
      gate_median_min: '',
    })
    for (const column of ['p', 'first_pass_rate', 'flaky_rate'] as const)
      expect(ledger.meta.fields.milestone[column]).toBe(REDUCE_MISSING)
  })

  it('takes the median and P85 of t_in_reduce from different cards', () => {
    const result = deriveLedger(
      inputs({ capture: withComment(102, '2026-10-02T03:00:00Z', '- 决定：accept\n') }),
    )
    expect(result.milestone).toMatchObject({
      t_in_reduce_median_h: '6.0',
      t_in_reduce_p85_h: '19.5',
    })
  })

  it('counts a pass before the first failure as no recovery', () => {
    const result = deriveLedger(
      inputs({
        slots: [
          slot({ endedAt: '2026-10-02T10:00:00Z', exitCode: 0 }),
          slot({ endedAt: '2026-10-02T11:00:00Z', exitCode: 1 }),
        ],
      }),
    )
    expect(result.milestone.map_flaky_rate).toBe('0.000')
  })

  it('orders slot rows by endedAt, not by file order', () => {
    const result = deriveLedger(
      inputs({
        slots: [
          slot({ endedAt: '2026-10-02T12:00:00Z', exitCode: 0 }),
          slot({ endedAt: '2026-10-02T10:00:00Z', exitCode: 1 }),
        ],
      }),
    )
    expect(result.milestone.map_flaky_rate).toBe('1.000')
  })

  it('leaves the slot-based cells empty without slots', () => {
    const result = deriveLedger(inputs({ slots: undefined }))
    expect(result.milestone.map_flaky_rate).toBe('')
    expect(result.meta.fields.milestone.map_flaky_rate).toBe('missing:no --slots input')
    expect(result.meta.fields.cards.map_a).toBe('missing:no --admission or --slots input')
  })

  it('counts the cards of each line and keeps coordinator tokens missing', () => {
    expect(ledger.lines).toEqual([
      { line: 'docs-line', cards: '1', coordinator_tokens: '' },
      { line: 'engineering-toolchain', cards: '2', coordinator_tokens: '' },
    ])
    expect(ledger.meta.fields.lines).toEqual({
      line: 'derived',
      cards: 'derived',
      coordinator_tokens: 'missing:the host does not export session usage',
    })
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
    expect(Object.keys(ledger.meta.fields.lines)).toEqual([...LINE_COLUMNS])
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
