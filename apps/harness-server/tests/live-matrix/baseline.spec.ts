import { readJsonText } from '@omne-harness/json-text'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  baselineProblems,
  currentModels,
  liveCells,
  requiredCells,
  type Baseline,
  type LiveModel,
} from './cells.ts'
import {
  HIT_FLOOR,
  fitsBudget,
  judge,
  measure,
  turnsOf,
  type RunView,
  type Turn,
  type TurnAttempt,
} from './measure.ts'

// The free half of the live model matrix: no model is called here.

const BASELINE = JSON.parse(
  readFileSync(new URL('./baseline.json', import.meta.url), 'utf8'),
) as Baseline

const A = 'family-a'
const B = 'family-b'
const MODELS: readonly LiveModel[] = [
  { route: 'b/two', revision: '1', family: B },
  { route: 'a/one', revision: '2', family: A },
  { route: 'a/two', revision: '1', family: A },
  { route: 'a/three', revision: '4', family: A },
  { route: 'b/one', revision: '3', family: B },
]

const cheapPeers = ['b/one', 'a/one']

describe('the cells come from the records', () => {
  it('keeps premium models in their own single-model tests and uses cheap peers for switching', () => {
    const models = currentModels()
    const cells = liveCells(models)
    const alternating = cells.filter(cell => cell.kind === 'alternate')
    expect(alternating.length).toBeGreaterThan(0)
    expect(cells.filter(cell => cell.kind === 'single')).toHaveLength(models.length)
    for (const {
      turns: [first, peer, last],
    } of alternating) {
      expect(first).toBe(last)
      expect([first, peer].join('/')).not.toMatch(/fable|opus|astra/i)
      expect(['anthropic/claude-haiku-5.5', 'qwen/qwen3.8-omni-flash']).toContain(peer)
    }
    for (const model of models.filter(model => /^(deepseek|moonshotai|z-ai)\//.test(model.route))) {
      expect(alternating.filter(cell => cell.turns[0] === model.route)).toHaveLength(1)
    }
  })

  it('refuses a multi-family matrix without an installed inexpensive peer', () => {
    expect(() => liveCells(MODELS, [])).toThrow(/peer/)
    const withoutHaiku = currentModels().filter(
      model => model.route !== 'anthropic/claude-haiku-5.5',
    )
    expect(() => liveCells(withoutHaiku)).toThrow(/haiku/)
  })

  it('gives every model one single-model cell and leads one alternating cell with an inexpensive peer', () => {
    const cells = liveCells(MODELS, cheapPeers)
    expect(cells.map(cell => cell.id)).toEqual([
      'single:a/one',
      'single:a/three',
      'single:a/two',
      'single:b/one',
      'single:b/two',
      'alternate:a/one~b/one',
      'alternate:a/three~b/one',
      'alternate:a/two~b/one',
      'alternate:b/one~a/one',
      'alternate:b/two~a/one',
    ])
    expect(cells.find(cell => cell.id === 'alternate:a/two~b/one')?.turns).toEqual([
      'a/two',
      'b/one',
      'a/two',
    ])
    expect(cells.find(cell => cell.id === 'single:b/two')?.turns).toEqual([
      'b/two',
      'b/two',
      'b/two',
    ])
  })

  it('has no alternating cell when only one family is current', () => {
    expect(liveCells(MODELS.filter(model => model.family === A)).map(cell => cell.kind)).toEqual([
      'single',
      'single',
      'single',
    ])
  })

  it('reads the current official records of the installed families', () => {
    const families = new Set(currentModels().map(model => model.family))
    expect(families).toEqual(
      new Set([
        '@omne-harness/pi-ai-openai',
        '@omne-harness/pi-ai-anthropic',
        '@omne-harness/pi-ai-qwen',
        '@omne-harness/pi-ai-kimi',
        '@omne-harness/pi-ai-deepseek',
        '@omne-harness/pi-ai-glm',
      ]),
    )
    expect(currentModels().every(model => model.revision !== '')).toBe(true)
  })
})

describe('the expectations follow the records', () => {
  const cells = liveCells(MODELS, cheapPeers)
  const entry = (models: readonly string[]) => ({
    measuredOn: '2026-11-18',
    revisions: Object.fromEntries(
      models.map(route => [route, MODELS.find(model => model.route === route)?.revision ?? '']),
    ),
    hitRate: 0.9,
    dropped: 0,
    costUsd: 0.01,
  })
  const complete: Baseline = {
    cells: Object.fromEntries(cells.map(cell => [cell.id, entry([...new Set(cell.turns)])])),
  }

  it('agree when every cell has an entry measured at the current revisions', () => {
    expect(baselineProblems(cells, MODELS, complete)).toEqual([])
  })

  it('turn red when an entry is removed, a revision moves, or an entry has no cell', () => {
    const { ['single:a/one']: _removed, ...rest } = complete.cells
    expect(baselineProblems(cells, MODELS, { cells: rest })).toEqual([
      'single:a/one: no expectation; run the live matrix and record it',
    ])
    const moved = MODELS.map(model =>
      model.route === 'b/one' ? { ...model, revision: '4' } : model,
    )
    expect(baselineProblems(cells, moved, complete)).toEqual([
      'single:b/one: measured b/one at revision 3, the record is at 4',
      'alternate:a/one~b/one: measured b/one at revision 3, the record is at 4',
      'alternate:a/three~b/one: measured b/one at revision 3, the record is at 4',
      'alternate:a/two~b/one: measured b/one at revision 3, the record is at 4',
      'alternate:b/one~a/one: measured b/one at revision 3, the record is at 4',
    ])
    const stale = { cells: { ...complete.cells, 'single:c/gone': entry(['c/gone']) } }
    expect(baselineProblems(cells, MODELS, stale)).toEqual([
      'single:c/gone: no such cell among the current records',
    ])
  })

  it('reports the same unusable expectation that the runner schedules for measurement', () => {
    const id = 'single:a/one'
    const current = entry(['a/one'])
    for (const invalid of [
      { ...current, costUsd: -1 },
      { ...current, revisions: { ...current.revisions, 'gone/model': '1' } },
    ]) {
      const baseline = { cells: { ...complete.cells, [id]: invalid } }
      expect(requiredCells(cells, MODELS, baseline).map(cell => cell.id)).toEqual([id])
      expect(baselineProblems(cells, MODELS, baseline)).toEqual([expect.stringContaining(id)])
    }
  })

  it('hold for the checked-in expectations and the current official records', () => {
    const models = currentModels()
    expect(baselineProblems(liveCells(models), models, BASELINE)).toEqual([])
  })
})

const attempt = (overrides: Partial<TurnAttempt> = {}): TurnAttempt => ({
  route: 'a/one',
  reasoning: 'not-carried',
  input: 100,
  cacheRead: 900,
  cacheWrite: 0,
  costUsd: 0.01,
  ...overrides,
})
const turn = (route: string, overrides: Partial<TurnAttempt> = {}, replied = true): Turn => ({
  route,
  attempt: attempt({ route, ...overrides }),
  replied,
})

describe('what a cell measured', () => {
  it('counts the cache only after each model warmed up, over all of the input', () => {
    const measured = measure([
      turn('a/one', { input: 1000, cacheRead: 0, cacheWrite: 1000 }),
      turn('b/one', { input: 1000, cacheRead: 0, cacheWrite: 1000 }),
      turn('a/one', { input: 100, cacheRead: 800, cacheWrite: 100, reasoning: 'carried' }),
    ])
    expect(measured).toMatchObject({ hitRate: 0.8, counted: 1, dropped: 0, unanswered: 0 })
    expect(measured.costUsd).toBeCloseTo(0.03)
  })

  it('leaves the hit rate unmeasured when no counted attempt knows its whole input', () => {
    expect(
      measure([turn('a/one'), turn('a/one', { cacheWrite: null, reasoning: 'carried' })]),
    ).toMatchObject({ hitRate: null, counted: 0 })
  })

  it('counts a reasoning state as dropped only when an earlier reply of that model kept one', () => {
    expect(measure([turn('a/one', {}, false), turn('a/one')]).dropped).toBe(0)
    expect(measure([turn('a/one'), turn('b/one'), turn('a/one')]).dropped).toBe(1)
    expect(
      measure([turn('a/one'), turn('b/one'), turn('a/one', { reasoning: 'carried' })]).dropped,
    ).toBe(0)
  })

  it('counts turns without an answer and attempts on another model', () => {
    const unanswered: Turn = { route: 'a/one', attempt: null, replied: false }
    expect(measure([unanswered, turn('a/one', { route: 'b/one' })])).toMatchObject({
      unanswered: 1,
      misrouted: 1,
    })
  })
})

describe('when a cell is red', () => {
  const green = measure([turn('a/one'), turn('a/one', { reasoning: 'carried' })])

  it('is green with a carried state and a hit rate over the floor', () => {
    expect(green.hitRate).toBe(0.9)
    expect(judge(green, undefined)).toEqual([])
  })

  it('is red for a dropped state, a missing answer, another model or a rate under the floor', () => {
    expect(judge({ ...green, dropped: 1 }, undefined)).toEqual([
      '1 reasoning state(s) were not carried',
    ])
    expect(judge({ ...green, unanswered: 1, misrouted: 1 }, undefined)).toEqual([
      '1 turn(s) got no completed answer',
      '1 attempt(s) ran on another model',
    ])
    expect(judge({ ...green, hitRate: HIT_FLOOR - 0.001 }, undefined)).toEqual([
      'cache hit rate 0.499 is under the floor 0.5',
    ])
    expect(judge({ ...green, hitRate: HIT_FLOOR }, undefined)).toEqual([])
  })

  it('is red when the rate fell more than the tolerance below the expectation, and not within it', () => {
    const expected = {
      measuredOn: '2026-11-18',
      revisions: {},
      hitRate: 0.9,
      dropped: 0,
      costUsd: 0,
    }
    expect(judge({ ...green, hitRate: 0.74 }, expected)).toEqual([
      'cache hit rate 0.740 fell from the expected 0.900',
    ])
    expect(judge({ ...green, hitRate: 0.76 }, expected)).toEqual([])
    expect(judge({ ...green, hitRate: null }, expected)).toEqual([])
  })
})

describe('the budget of a run', () => {
  it('starts a cell while the spent and the dearest cell so far stay within it, and no further', () => {
    expect(fitsBudget(0, 0, 1)).toBe(true)
    expect(fitsBudget(0.7, 0.3, 1)).toBe(true)
    expect(fitsBudget(0.7, 0.31, 1)).toBe(false)
  })
})

describe('reading the turns from the answers', () => {
  const account = (input: string, read: string, write: string | null, cost: string) => ({
    kind: 'account',
    usage: [
      { name: 'input', state: 'known', lexeme: input },
      { name: 'cache-read', state: 'known', lexeme: read },
      write === null
        ? { name: 'cache-write', state: 'unknown', lexeme: null }
        : { name: 'cache-write', state: 'known', lexeme: write },
    ],
    cost: [{ source: 'billable', state: 'known', lexeme: cost }],
  })
  type Dispatch = RunView['modelCalls'][number]['dispatches'][number]
  const run = (position: string, dispatches: readonly Dispatch[]): RunView => ({
    started: { position },
    modelCalls: [{ dispatches }],
  })
  const dispatch = (
    name: string,
    kind: string,
    reasoning: string,
    acct: Dispatch['account'],
  ): Dispatch => ({
    adapter: { name },
    outcome: { kind },
    reasoning,
    account: acct,
  })

  const visibleAnswer = { kind: 'text', text: '51', visibility: { toHuman: true } }

  function entry(kind: string, payload: unknown) {
    const parsed = readJsonText(JSON.stringify(payload), {
      maxBytes: 1024,
      maxDepth: 10,
      maxMembers: 32,
      maxItems: 16,
      maxStringLength: 128,
      maxNumberLength: 8,
    })
    if (parsed.kind !== 'ok') throw new Error('invalid test history')
    return { kind, payload: parsed.value }
  }

  it.each([
    ['failed', [visibleAnswer]],
    ['cancelled', [visibleAnswer]],
    ['completed', []],
    ['completed', [{ ...visibleAnswer, text: '   ' }]],
    ['completed', [{ ...visibleAnswer, visibility: { toHuman: false } }]],
    ['completed', [{ kind: 'tool_call', name: 'Files' }]],
  ] as const)('keeps the charge for a %s run with no final user answer', (outcome, blocks) => {
    const runs = [
      run('1', [dispatch('a/one', 'completed', 'unknown', account('5', '0', '0', '0.01'))]),
    ]
    const history = [
      entry('message.assistant', { message: { blocks } }),
      entry('run.terminal', { terminal: { outcome } }),
    ]
    const measured = measure(turnsOf(['a/one'], runs, history))
    expect(measured.unanswered).toBe(1)
    expect(measured.costUsd).toBe(0.01)
    expect(judge(measured, undefined)).toContain('1 turn(s) got no completed answer')
  })

  it('pairs the Runs in start order with the selected routes, and each with the last reply before its terminal', () => {
    const runs = [
      run('120', [dispatch('b/one', 'completed', 'not-carried', account('9', '1', '0', '0.002'))]),
      run('40', [
        dispatch('a/one', 'failed', 'unknown', { kind: 'unknown' }),
        dispatch('a/one', 'completed', 'not-carried', account('5', '0', '7', '0.001')),
      ]),
    ]
    const history = [
      { kind: 'message.user', payload: {} },
      { kind: 'message.assistant', payload: { message: {} } },
      { kind: 'message.tool', payload: {} },
      {
        kind: 'message.assistant',
        payload: { message: { blocks: [visibleAnswer], replay: { format: 'f', at: ['b0'] } } },
      },
      { kind: 'run.terminal', payload: { terminal: { outcome: 'completed' } } },
      { kind: 'message.user', payload: {} },
      {
        kind: 'message.assistant',
        payload: { message: { blocks: [visibleAnswer], replay: { format: 'f', at: [] } } },
      },
      { kind: 'run.terminal', payload: { terminal: { outcome: 'completed' } } },
      { kind: 'message.user', payload: {} },
    ]
    const entries = history.map(item => entry(item.kind, item.payload))
    expect(turnsOf(['a/one', 'b/one', 'a/one'], runs, entries)).toEqual([
      {
        route: 'a/one',
        dispatchCosts: [null, 0.001],
        replied: true,
        attempt: {
          route: 'a/one',
          reasoning: 'not-carried',
          input: 5,
          cacheRead: 0,
          cacheWrite: 7,
          costUsd: 0.001,
        },
      },
      {
        route: 'b/one',
        dispatchCosts: [0.002],
        replied: false,
        attempt: {
          route: 'b/one',
          reasoning: 'not-carried',
          input: 9,
          cacheRead: 1,
          cacheWrite: 0,
          costUsd: 0.002,
        },
      },
      { route: 'a/one', dispatchCosts: [], replied: false, attempt: null },
    ])
  })
})
