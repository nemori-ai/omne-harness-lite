import { describe, expect, it } from 'vitest'
import { productIssues, productSetIssues } from '../src/examine/checks.ts'
import {
  broken,
  examCasesOf,
  ProductSchema,
  type ExamCase,
  type Product,
} from '../src/examine/product.ts'
import { renderExamReport } from '../src/examine/report.ts'
import {
  examineCase,
  examinerCalls,
  scrubbed,
  type CaseResult,
  type Timing,
} from '../src/examine/run.ts'
import { examScore, GATE, neededForGate, passesGate } from '../src/examine/score.ts'
import { batchOf, modelScript } from '../src/examine/script.ts'
import type { GoalView, Stage } from '../src/examine/stage.ts'

const HEAD = "const assert = require('node:assert')\nconst here = process.cwd()\n"
const check = (body: string) => `${HEAD}const m = require(here + '/m.js')\n${body}\n`
const TINY: Product = ProductSchema.parse({
  id: 'x99-tiny',
  source: 'made for this test',
  purpose: 'three small functions',
  files: {
    'm.js': 'exports.one = () => 1\nexports.two = () => 2\nexports.three = () => 3\n',
  },
  criteria: [
    { statement: 'one is 1', method: 'call it', check: check('assert.strictEqual(m.one(), 1)') },
    { statement: 'two is 2', method: 'call it', check: check('assert.strictEqual(m.two(), 2)') },
    {
      statement: 'three is 3',
      method: 'call it',
      check: check('assert.strictEqual(m.three(), 3)'),
    },
  ],
  breaks: [
    {
      name: 'no-one',
      criterion: 'A1',
      edits: [{ path: 'm.js', find: '() => 1', replace: '() => 0' }],
    },
    {
      name: 'no-two',
      criterion: 'A2',
      edits: [{ path: 'm.js', find: '() => 2', replace: '() => 0' }],
    },
    {
      name: 'no-three',
      criterion: 'A3',
      edits: [{ path: 'm.js', find: '() => 3', replace: '() => 0' }],
    },
  ],
  mended: 'no-one',
  spoiled: ['no-two', 'no-three'],
})
const caseOf = (name: string): ExamCase => {
  const found = examCasesOf(TINY).find(entry => entry.id === `x99-tiny/${name}`)
  if (found === undefined) throw new Error(name)
  return found
}

describe('the products of the examiner’s bench', () => {
  it('a product is found wrong when a check fails on it clean, when a break fails another check too, and when a break fails none', () => {
    expect(productIssues(TINY)).toEqual([])
    const first = TINY.criteria[0]
    if (first === undefined) throw new Error('criteria')
    const sour = { ...first, check: check('assert.strictEqual(m.one(), 7)') }
    expect(productIssues({ ...TINY, criteria: [sour, ...TINY.criteria.slice(1)] })).toContain(
      'x99-tiny/clean: the check of A1 fails',
    )
    const wide = { path: 'm.js', find: '() => 3', replace: '() => 0' }
    const two = TINY.breaks.map(entry =>
      entry.name === 'no-one' ? { ...entry, edits: [...entry.edits, wide] } : entry,
    )
    expect(productIssues({ ...TINY, breaks: two })).toEqual([
      'x99-tiny/no-one: the check of A3 fails',
    ])
    const none = TINY.breaks.map(entry =>
      entry.name === 'no-two' ? { ...entry, edits: [{ ...wide, replace: '() => 3 ' }] } : entry,
    )
    expect(productIssues({ ...TINY, breaks: none })).toEqual([
      'x99-tiny/no-two: the check of A2 passes',
    ])
  })

  it('a product that names a break which is not there, or the same one twice among mended and spoiled, is refused before anything runs; a set with too few is told so', () => {
    expect(productIssues({ ...TINY, mended: 'nothing' })).toEqual([
      'x99-tiny: mended and spoiled name the break nothing, which is not there',
    ])
    expect(productIssues({ ...TINY, mended: 'no-two' })).toEqual([
      'x99-tiny: mended and the two of spoiled must be three breaks',
    ])
    expect(productSetIssues([TINY])[0]).toBe('1 products, fewer than 8')
    expect(() => broken({ ...TINY, files: { 'm.js': 'x' } }, 'no-one')).toThrow('exactly once')
  })

  it('the cases of a product: it clean, each break alone but the two that open a sequence, one mended, one replaced by another; the truth follows the break', () => {
    const cases = examCasesOf(TINY)
    expect(cases.map(entry => [entry.id, entry.steps.map(step => step.kind)])).toEqual([
      ['x99-tiny/clean', ['clean']],
      ['x99-tiny/no-three', ['broken']],
      ['x99-tiny/no-one-then-mended', ['broken', 'mended']],
      ['x99-tiny/no-two-then-no-three', ['broken', 'spoiled']],
    ])
    const spoiled = caseOf('no-two-then-no-three')
    expect(spoiled.steps.map(step => step.truth)).toEqual([
      { A1: 'holds', A2: 'fails', A3: 'holds' },
      { A1: 'holds', A2: 'holds', A3: 'fails' },
    ])
    expect(spoiled.steps[1]?.write).toEqual({
      'm.js': 'exports.one = () => 1\nexports.two = () => 2\nexports.three = () => 0\n',
    })
    expect(caseOf('clean').steps[0]?.write).toEqual(TINY.files)
  })
})

describe('the model script of a case', () => {
  it('with the real examiner leaves every request that carries a brief to the provider, and the working side says a word and writes nothing before the second step', () => {
    const entry = caseOf('no-one-then-mended')
    expect(modelScript(entry, 0, 'real')).toEqual({
      steps: [{ when: {}, say: '好了。' }],
      provider: [{ has: ['Batch: examine/'] }],
    })
    const second = modelScript(entry, 1, 'real')
    expect(second.steps[0]).toEqual({
      when: { lacks: ['Batch: examine/', 'bench-edit-1-0'] },
      call: [
        {
          id: 'bench-edit-1-0',
          tool: 'Files',
          arguments: {
            command: 'write',
            intent: 'write',
            params: { path: 'm.js', mode: 'replace', text: TINY.files['m.js'] },
          },
        },
      ],
    })
    expect(batchOf(entry, 0)).toBe('examine/1/1/')
    expect(batchOf(entry, 1)).toBe('examine/1/1/bench-edit-1-0')
  })

  it('the two examiners that prove the gauge look once and hand in: one the truth, one that everything holds; nothing goes to the provider', () => {
    const entry = caseOf('no-two-then-no-three')
    const readings = (kind: 'truthful' | 'lenient', step: number) => {
      const script = modelScript(entry, 1, kind)
      expect(script.provider).toEqual([])
      const calls = script.steps.flatMap(found => found.call ?? [])
      const hand = calls.find(call => call.id === `x-hand-${String(step)}`)
      if (hand === undefined) throw new Error('no hand-in')
      const { params } = hand.arguments as {
        params: { batch: string; readings: { value: string }[] }
      }
      return [params.batch, params.readings.map(reading => reading.value)]
    }
    expect(readings('truthful', 1)).toEqual([
      'examine/1/1/bench-edit-1-0',
      ['holds', 'holds', 'fails'],
    ])
    expect(readings('truthful', 0)).toEqual(['examine/1/1/', ['holds', 'fails', 'holds']])
    expect(readings('lenient', 1)).toEqual([
      'examine/1/1/bench-edit-1-0',
      ['holds', 'holds', 'holds'],
    ])
    const order = modelScript(entry, 1, 'truthful').steps.map(
      step => step.call?.[0]?.id ?? step.say,
    )
    expect(order).toEqual([
      'x-look-1',
      'x-hand-1',
      'x-look-0',
      'x-hand-0',
      '交了。',
      'bench-edit-1-0',
      '好了。',
    ])
  })
})

type Told = Readonly<{ view: GoalView; spent?: number }>
/** A stage that answers by a list: each read of the goal takes the next view. */
function stageOf(views: readonly Told[], work: Record<string, string>) {
  const log: string[] = []
  let at = -1
  const stage: Stage = {
    script: model => void log.push(`script ${String(model.steps.length)}`),
    setGoal: async () => void log.push('set'),
    goal: async () => {
      at = Math.min(at + 1, views.length - 1)
      return views[at]?.view ?? null
    },
    resume: async generation => void log.push(`resume ${String(generation)}`),
    history: async () => [],
    spent: () => ({ calls: at + 1, usd: views[at]?.spent ?? 0, modelMs: 0 }),
    work: () => work,
    close: async () => {},
  }
  return { stage, log }
}
const view = (status: string, values: readonly string[], examiner = 'x-1'): GoalView => ({
  state: { status, generation: 1, outcome: null },
  gap: values.map((value, index) => ({ id: `A${String(index + 1)}`, value, reader: 'examiner' })),
  examiner,
})
function timing(): Timing & { waited: number } {
  const clock = { at: 0, waited: 0 }
  return {
    now: () => clock.at,
    wait: async ms => {
      clock.at += ms
      clock.waited += 1
    },
    pollMs: 1000,
    batchMs: 5000,
    get waited() {
      return clock.waited
    },
  }
}

describe('one case on a stage', () => {
  it('waits while a batch is out or the goal is still going, reads each criterion as the goal holds it once it rests, and counts the cost and the time of each batch apart', async () => {
    const entry = caseOf('no-two-then-no-three')
    const second = entry.steps[1]?.files ?? {}
    const { stage, log } = stageOf(
      [
        { view: view('active', ['gathering', 'gathering', 'gathering']) },
        { view: view('active', ['holds', 'fails', 'holds']) },
        { view: view('paused', ['holds', 'fails', 'holds']), spent: 0.03 },
        { view: view('paused', ['holds', 'fails', 'holds']), spent: 0.03 },
        { view: view('active', ['stale', 'stale', 'stale']), spent: 0.03 },
        { view: view('paused', ['holds', 'holds', 'cannot-tell']), spent: 0.05 },
      ],
      { ...second, 'notes.txt': 'left behind' },
    )
    const clock = timing()
    const result = await examineCase(stage, entry, TINY, 'real', clock)
    expect(log).toEqual(['script 1', 'set', 'script 2', 'resume 1'])
    expect(result.error).toBeNull()
    expect(result.batches.map(batch => [batch.step, batch.kind, batch.seconds])).toEqual([
      [0, 'broken', 2],
      [1, 'spoiled', 1],
    ])
    expect(result.batches[0]?.readings).toEqual({
      A1: { truth: 'holds', said: 'holds' },
      A2: { truth: 'fails', said: 'fails' },
      A3: { truth: 'holds', said: 'holds' },
    })
    expect(result.batches[1]?.readings['A3']).toEqual({ truth: 'fails', said: 'cannot-tell' })
    expect(result.batches.map(batch => batch.usd)).toEqual([0.03, 0.05 - 0.03])
    expect(result.batches[0]).toMatchObject({ changed: ['m.js'], added: ['notes.txt'] })
    expect(result.batches[1]).toMatchObject({ changed: [], added: ['notes.txt'] })
  })

  it('a goal that settles on the first batch, every criterion read as held, ends the case there: that batch is counted, and the step it never reached is named', async () => {
    const entry = caseOf('no-one-then-mended')
    const { stage, log } = stageOf(
      [{ view: view('settled', ['holds', 'holds', 'holds']) }],
      entry.steps[0]?.files ?? {},
    )
    const result = await examineCase(stage, entry, TINY, 'lenient', timing())
    expect(log).toEqual(['script 4', 'set'])
    expect(result).toMatchObject({ error: null, unreached: 1 })
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0]?.readings['A1']).toEqual({ truth: 'fails', said: 'holds' })
    const score = examScore([result])
    expect(score.falseHolds).toMatchObject({ errors: 1, n: 1 })
    expect(score.cutShort).toEqual(['x99-tiny/no-one-then-mended'])
    const page = renderExamReport({
      name: 'e',
      examiner: 'lenient',
      definition: 'scripted',
      products: 1,
      score,
    })
    expect(page).toContain(
      '后面的步骤没查到的（前一批的读数照算）：\n- `x99-tiny/no-one-then-mended`',
    )
  })

  it('a row the examiner did not read counts as unread, and a batch that does not come back in time ends the case with what it had', async () => {
    const entry = caseOf('clean')
    const system: GoalView = {
      state: { status: 'paused', generation: 1, outcome: null },
      gap: [
        { id: 'A1', value: 'holds', reader: 'examiner' },
        { id: 'A2', value: 'no-evidence' },
      ],
    }
    const read = await examineCase(
      stageOf([{ view: system }], TINY.files).stage,
      entry,
      TINY,
      'real',
      timing(),
    )
    expect(Object.values(read.batches[0]?.readings ?? {}).map(reading => reading.said)).toEqual([
      'holds',
      'unread',
      'unread',
    ])
    const never = stageOf(
      [{ view: view('active', ['gathering', 'gathering', 'gathering']) }],
      TINY.files,
    )
    const late = await examineCase(never.stage, entry, TINY, 'real', timing())
    expect(late).toMatchObject({ batches: [], error: 'the batch did not come back in time' })
  })

  it('keeps the calls of the examining session with what came back, cut short and with the directory of the run taken out', () => {
    const tree = (value: string) => ({ kind: 'string', value })
    const args = {
      kind: 'object',
      entries: [{ key: 'script', value: tree('ls /tmp/run-7/workspace') }],
    }
    const history = [
      {
        kind: 'message.assistant',
        payload: {
          message: {
            blocks: [{ kind: 'tool_call', callId: 'c1', name: 'Shell', arguments: args }],
          },
        },
      },
      {
        kind: 'message.tool',
        payload: {
          message: {
            blocks: [
              { kind: 'tool_result', callId: 'c1' },
              { kind: 'text', text: `/tmp/run-7/workspace/m.js ${'x'.repeat(2000)}` },
            ],
          },
        },
      },
      { kind: 'run.terminal', payload: {} },
    ]
    const [call] = examinerCalls(history, { run: '/tmp/run-7', user: 'nobody-here' })
    expect(call).toMatchObject({
      id: 'c1',
      tool: 'Shell',
      arguments: '{"script":"ls <run>/workspace"}',
    })
    expect(call?.result.startsWith('<run>/workspace/m.js xxx')).toBe(true)
    expect(call?.result).toHaveLength(900)
  })
})

const resultOf = (
  id: string,
  batches: readonly (readonly [string, string][])[],
  usd = 0.02,
): CaseResult => ({
  id,
  product: 'x99-tiny',
  examiner: 'real',
  calls: [],
  unreached: 0,
  error: null,
  batches: batches.map((pairs, step) => ({
    step,
    kind: step === 0 ? 'broken' : 'spoiled',
    readings: Object.fromEntries(
      pairs.map(([truth, said], at) => [`A${String(at + 1)}`, { truth, said }]),
    ) as never,
    seconds: 30 + step * 10,
    usd,
    calls: 9,
    changed: step === 0 ? [] : ['m.js'],
    added: [],
  })),
})

describe('what names this machine', () => {
  it('is taken out of a text: the directory of the run whole or cut short, with or without /private, the temporary directory of the system and the name of the user', () => {
    const machine = { run: '/tmp/bench/x01-cart--clean-Ab12', user: 'somebody' }
    const text = [
      'cd /private/tmp/bench/x01-cart--clean-Ab12/workspace && ls',
      'src=/private/tmp/bench/x01-cart--cle… and /tmp/bench/x01-cart--clean-Ab12/os-home',
      'cp -R /private/tmp/ben… to /usr/local/bi…',
      '-rw-r--r-- 1 somebody staff /var/folders/mz/abc123/T/tmp.9 /private/var/folders/mz/abc123/T/x',
    ].join('\n')
    expect(scrubbed(text, machine)).toBe(
      [
        'cd <run>/workspace && ls',
        'src=<run>… and <run>/os-home',
        'cp -R <run>… to /usr/local/bi…',
        '-rw-r--r-- 1 <user> staff <tmp>/tmp.9 <tmp>/x',
      ].join('\n'),
    )
    expect(scrubbed(text, { run: '', user: '' })).toBe(text)
  })
})

describe('the three numbers of the examiner’s bench', () => {
  const results = [
    resultOf('a', [
      [
        ['fails', 'holds'],
        ['holds', 'holds'],
        ['holds', 'fails'],
      ],
    ]),
    resultOf(
      'b',
      [
        [
          ['fails', 'cannot-tell'],
          ['holds', 'cannot-tell'],
          ['holds', 'unread'],
        ],
      ],
      0.04,
    ),
    resultOf('c', [
      [
        ['holds', 'holds'],
        ['fails', 'fails'],
        ['holds', 'holds'],
      ],
      [
        ['holds', 'holds'],
        ['holds', 'fails'],
        ['fails', 'holds'],
      ],
    ]),
    resultOf('e', [[['fails', 'holds']], [['holds', 'holds']]]),
    { ...resultOf('d', [[['fails', 'holds']]]), error: 'the batch did not come back in time' },
  ]

  it('unmet read as held over the unmet, where cannot tell is no hold; met not read as held over the met, split by fails and cannot tell; a changed criterion answered wrong as before; a case that did not end counts for nothing', () => {
    const score = examScore(results)
    expect([score.cases, score.batches, score.failed]).toEqual([
      4,
      6,
      ['d: the batch did not come back in time'],
    ])
    expect(score.falseHolds).toMatchObject({ errors: 3, n: 5, rate: 0.6 })
    expect(score.timid).toMatchObject({ errors: 4, n: 9 })
    expect([score.timidFails, score.timidCannotTell]).toEqual([2, 2])
    expect(score.parroted).toMatchObject({ errors: 2, n: 3 })
    expect(score.totalUsd).toBeCloseTo(0.14)
    expect(score.usd).toMatchObject({ n: 6, median: 0.02, max: 0.04 })
    expect(score.seconds.mean).toBeCloseTo(200 / 6)
    expect(score.seconds.max).toBe(40)
    expect(score.changedWork).toEqual(['c#1: m.js', 'e#1: m.js'])
    expect(score.wrong.map(row => `${row.case}#${String(row.step)}/${row.criterion}`)).toEqual([
      'a#0/A1',
      'a#0/A3',
      'b#0/A1',
      'b#0/A2',
      'b#0/A3',
      'c#1/A2',
      'c#1/A3',
      'e#0/A1',
    ])
  })

  it('the gate is the judge’s: no more than one in a hundred, and an upper bound of three in a hundred, which takes 125 unmet criteria all read right', () => {
    expect(GATE).toEqual({ point: 0.01, upper: 0.03 })
    expect(neededForGate()).toBe(125)
    const none = (n: number) =>
      examScore([
        resultOf('x', [Array.from({ length: n }, () => ['fails', 'fails'] as [string, string])]),
      ]).falseHolds
    expect(passesGate(none(125))).toBe(true)
    expect(passesGate(none(124))).toBe(false)
    expect(passesGate(examScore([]).falseHolds)).toBe(false)
  })

  it('the page says each number with its interval, by how much the gate is missed, and names what was read wrong', () => {
    const page = renderExamReport({
      name: 'e',
      examiner: 'real',
      definition: 'examiner@m',
      products: 1,
      score: examScore(results),
    })
    expect(page).toContain('| 没做到的被答成成立 | 60.0%（3/5），95% 区间 23.1% 到 88.2% |')
    expect(page).toContain('其中答没做到 2 条，判不了 2 条')
    expect(page).toContain(
      '没过：点估计 60.0%，高出 59.0%；95% 上界 88.2%，高出 85.2%。没做到的判据要有 125 条全读对',
    )
    expect(page).toContain('- `c#1: m.js`')
    expect(page).toContain('- `d: the batch did not come back in time`')
    expect(page).toContain('| `c` | 2 | spoiled | A3 | fails | holds |')
  })
})
