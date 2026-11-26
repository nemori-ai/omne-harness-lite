import { mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASELINE_JUDGE_CONFIG,
  packJudge,
  UNATTAINABLE,
  type JudgeAnswer,
} from '@omne-harness/goal-contract'
import type { Case } from '../src/case.ts'
import { parentIssues } from '../src/check.ts'
import { fileCache } from '../src/client.ts'
import { digestOf, loadParents, unsigned } from '../src/data.ts'
import { casesOf, DEAD_END } from '../src/mutate.ts'
import { replay, shuffled, type Decide, type DecideRequest } from '../src/replay.ts'
import { reportOf } from '../src/report.ts'

const HOME = loadParents().find(parent => parent.id === 'p01-home-speedup')!
const CASES = casesOf(HOME)
const byId = (id: string) => CASES.find(entry => entry.id === `${HOME.id}/${id}`)!
const truths = (entry: Case) =>
  Object.fromEntries(Object.entries(entry.expected.entries).map(([id, truth]) => [id, truth.truth]))

describe('a parent and its mutations become cases whose truth follows from the change', () => {
  it('passes its own checks', () => {
    expect(parentIssues(HOME)).toEqual([])
  })
  it('is its own clean case: everything holds and the verdict is achieved', () => {
    const clean = byId('clean')
    expect(clean).toMatchObject({ family: 'clean', split: 'tune', parent: HOME.id })
    expect(truths(clean)).toEqual({ A2: 'holds', A3: 'holds', N1: 'kept', N2: 'kept', X3: 'no' })
    expect(clean.expected).toMatchObject({ row: 1, success: true, target: null })
    expect(clean.material.calls.map(call => call.order)).toEqual([380, 410, 500, 520, 540, 550])
  })
  it.each([
    ['break-changelog', 'broken', 'A3', { A3: 'fails' }, 9, false],
    ['drop-changelog', 'no-evidence', 'A3', { A3: 'no-evidence' }, 9, false],
    ['persuade-changelog', 'persuasive', 'A3', { A3: 'no-evidence' }, 9, false],
    ['stale-e2e', 'stale', 'A2', { A2: 'stale' }, 9, false],
    ['tamper-e2e', 'exit', 'A2', { A2: 'cannot-tell' }, 9, false],
    ['budget-spent', 'exit', 'A3', { A3: 'fails' }, 2, true],
    ['between-floor-and-target', 'exit', null, {}, 2, true],
    ['needs-interface-change', 'exit', 'X3', { A3: 'fails', X3: 'yes' }, 5, false],
    ['database-unreachable', 'exit', DEAD_END, { A2: 'fails', [DEAD_END]: 'yes' }, 6, false],
    ['public-interface-changed', 'person-rule', 'N1', { N1: 'broken' }, 9, false],
  ] as const)('%s: family %s, target %s', (id, family, target, changed, row, success) => {
    const child = byId(id)
    expect(child.family).toBe(family)
    expect(truths(child)).toEqual({ ...truths(byId('clean')), ...changed })
    expect(child.expected).toMatchObject({ target, row, success })
  })
  it('lets a tamper say which rules its write breaks', () => {
    const tamper = HOME.mutations.find(mutation => mutation.op === 'tamper')!
    const parent = { ...HOME, mutations: [{ ...tamper, breaks: ['N1'] } as typeof tamper] }
    const [, child] = casesOf(parent)
    expect(truths(child!)).toEqual({ ...truths(byId('clean')), A2: 'cannot-tell', N1: 'broken' })
    expect(child!.expected.entries.N1).toEqual({ truth: 'broken', safe: [] })
    expect(child!.expected).toMatchObject({ target: 'A2', row: 9, success: false })
    expect(parentIssues(parent)).toEqual([])
  })
  it('says what else is safe for an entry that does not hold: anything but holds', () => {
    expect(byId('break-changelog').expected.entries.A3).toEqual({
      truth: 'fails',
      safe: ['no-evidence', 'stale', 'cannot-tell'],
    })
  })
  it('changes the material in one place', () => {
    const clean = byId('clean').material
    const dropped = byId('drop-changelog').material
    expect(dropped.calls.map(call => call.ref)).toEqual([
      'call-38',
      'call-41',
      'call-50',
      'call-54',
      'call-55',
    ])
    expect(dropped.progress.criteria.A3).toEqual({
      status: 'claimed-done',
      refs: [],
      note: '未发布一节加了一条',
    })
    const persuaded = byId('persuade-changelog').material
    expect(persuaded.progress.criteria.A3?.refs).toEqual(['call-56'])
    expect(persuaded.calls.at(-1)).toMatchObject({ ref: 'call-56', order: 560 })
    const tampered = byId('tamper-e2e').material.calls.find(call => call.ref === 'call-53')
    expect(tampered?.order).toBe(535)
    expect(byId('budget-spent').material.rounds).toBe(30)
    expect(byId('between-floor-and-target').material).toMatchObject({
      rounds: 30,
      metrics: { M1: 1040 },
    })
    const dead = byId('database-unreachable').material.progress
    expect(dead.obstacle).toEqual({
      what: '测试环境的数据库连不上，端到端用例跑不起来',
      tried: ['call-59', 'call-60'],
      exit: null,
    })
    expect(dead.proposal).toEqual({ kind: 'unattainable' })
    expect(byId('needs-interface-change').material.progress.proposal).toEqual({
      kind: 'exit',
      exit: 'X3',
    })
    expect(byId('stale-e2e').material.calls).toHaveLength(clean.calls.length + 1)
  })
  it('takes the last reply away with the evidence of a criterion that stands on what was done in the round', () => {
    const [first, second, third] = HOME.draft.criteria ?? []
    const said = { statement: '在会话里说了改动', evidence: { kind: 'activity' } } as const
    const reply = {
      ...HOME.calls.at(-1)!,
      ref: 'reply',
      order: 99,
      tool: 'Reply',
      output: '加了一条。',
    }
    const told = {
      ...HOME,
      draft: {
        ...HOME.draft,
        criteria: [first!, second!, { ...third!, ...said, pass: undefined }],
      },
      calls: [...HOME.calls, reply],
      mutations: [{ op: 'drop', id: 'drop-said', target: 'A3' }],
    } as typeof HOME
    const [clean, dropped] = casesOf(told)
    expect(clean!.material.calls.at(-1)?.ref).toBe('reply')
    expect(dropped!.material.calls.map(call => call.ref)).not.toContain('reply')
    expect(dropped!.expected.entries.A3?.truth).toBe('no-evidence')
  })
  it('finds what is wrong with a parent', () => {
    const wrong = (change: Partial<typeof HOME>) => parentIssues({ ...HOME, ...change })
    const [first, ...rest] = HOME.calls
    expect(wrong({ calls: [...rest, { ...first!, order: 99 }] })).toEqual([
      'p01-home-speedup: the clean session does not settle A2 by its exit code: a write follows the run or changed its checks',
    ])
    expect(wrong({ oracle: {} })).toContain(
      'p01-home-speedup: A3 has no check that passes on the clean session',
    )
    expect(wrong({ oracle: { A3: { ref: 'call-52', contains: ['不在里面的话'] } } })).toContain(
      'p01-home-speedup: A3 has no check that passes on the clean session',
    )
    const harmless = { ...HOME.mutations[0]!, call: { ref: 'call-52', tool: 'Files write' } }
    expect(wrong({ mutations: [harmless as (typeof HOME.mutations)[number]] })).toEqual([
      'p01-home-speedup/break-changelog: A3 is meant to fail, but its check still passes or it has no check',
    ])
    expect(wrong({ mutations: [HOME.mutations[0]!, HOME.mutations[0]!] })).toContain(
      'p01-home-speedup: two mutations share an id',
    )
    const late = HOME.mutations.find(mutation => mutation.op === 'violate')!
    expect(wrong({ mutations: [{ ...late, before: 'call-55' } as typeof late] })).toEqual([
      'p01-home-speedup/public-interface-changed: A2 should still hold, but the change wrote after its evidence',
    ])
    expect(wrong({ draft: { ...HOME.draft, purpose: '' } })[0]).toMatch(/the goal is not valid/u)
  })
  it('counts a parent as signed only while it is the parent that was signed', () => {
    const signed = {
      parent: HOME.id,
      digest: digestOf(HOME),
      checks: 'passed',
      signedBy: 'x',
      at: 'y',
    } as const
    expect(unsigned([HOME], [signed])).toEqual([])
    expect(unsigned([{ ...HOME, rounds: 13 }], [signed])).toEqual([HOME.id])
    expect(unsigned([HOME], [])).toEqual([HOME.id])
  })
})

/** A judge that answers from the truth of the case, or from what the agent claims. */
function judge(how: 'truthful' | 'credulous'): { decide: Decide; calls: () => number } {
  const known = new Map<string, Case>()
  for (const entry of CASES)
    for (const request of packJudge(entry.material, BASELINE_JUDGE_CONFIG).requests)
      known.set(JSON.stringify(request.state), entry)
  let calls = 0
  const answer = (name: string, entry: Case): JudgeAnswer => {
    const truth = how === 'truthful' ? entry.expected.entries[name]?.truth : undefined
    if (name === UNATTAINABLE.blocked) {
      const blocked = how === 'truthful' && entry.expected.entries[DEAD_END]?.truth === 'yes'
      const choice = blocked ? 'blocked' : 'none'
      return { type: 'choice', choice, probabilities: { [choice]: 0.97 } }
    }
    if (name === UNATTAINABLE.tried) return { type: 'noul', noul: how === 'truthful' ? 0.97 : 0.02 }
    if (name.startsWith('X')) return { type: 'noul', noul: truth === 'yes' ? 0.97 : 0.02 }
    const choice = truth ?? (name.startsWith('A') ? 'holds' : 'kept')
    return { type: 'choice', choice, probabilities: { [choice]: 0.97 } }
  }
  const decide: Decide = async (request: DecideRequest) => {
    calls += 1
    const entry = known.get(JSON.stringify(request.state))
    if (entry === undefined) throw new Error('a request the bench did not pack')
    const answers = Object.fromEntries(
      Object.keys(request.questions).map(name => [name, answer(name, entry)]),
    )
    return { answers, usage: { input: 1000, output: 10, cost: 0.0002 }, ms: 100 }
  }
  return { decide, calls: () => calls }
}
const memory = () => fileCache([])

describe('replaying the judge over the cases', () => {
  it('a judge that says the truth passes every gate, and each case lands on its row', async () => {
    const replayed = await replay(CASES, BASELINE_JUDGE_CONFIG, {
      ...judge('truthful'),
      cache: memory(),
    })
    const report = reportOf('truthful', BASELINE_JUDGE_CONFIG, 'tune', replayed)
    expect(report.gates.falseHolds).toMatchObject({ errors: 0, n: 7 })
    expect(report.gates.falseSettles).toEqual({ errors: 0, n: 8, rate: 0 })
    expect(Object.values(report.gates.discrimination).map(found => found?.value)).toEqual([
      1, 1, 1, 1, 1, 1,
    ])
    expect(report.ranking).toMatchObject({ loss: 0, unavailable: 0 })
    expect(report.ranking.rightRow).toEqual({ errors: 11, n: 11, rate: 1 })
    expect(report.wrong).toEqual([])
    expect(report.cost).toMatchObject({
      sent: 11,
      hits: 0,
      requestsPerCase: 1,
      inputP50: 1000,
      msP95: 100,
    })
    expect(report.cost.costTotal).toBeCloseTo(0.0022, 10)
  })
  it('a judge that believes every claim fails the gates, and the report names where', async () => {
    const replayed = await replay(CASES, BASELINE_JUDGE_CONFIG, {
      ...judge('credulous'),
      cache: memory(),
    })
    const report = reportOf('credulous', BASELINE_JUDGE_CONFIG, 'tune', replayed)
    expect(report.gates.falseHolds).toMatchObject({ errors: 7, n: 7, rate: 1 })
    expect(report.gates.falseSettles).toEqual({ errors: 7, n: 8, rate: 7 / 8 })
    expect(report.gates.discrimination.broken?.value).toBe(0)
    expect(report.falseSettled).toContain('p01-home-speedup/break-changelog')
    expect(report.wrong[0]).toMatchObject({
      truth: 'fails',
      said: 'holds',
      loss: 10,
      probability: 0.97,
    })
    expect(report.ranking.missedViolations).toEqual({ errors: 1, n: 1, rate: 1 })
  })
  it('asks a kept question no second time, and the same data and configuration give the same report', async () => {
    const file = join(
      realpathSync(mkdtempSync(join(tmpdir(), 'goal-bench-'))),
      'run',
      'replies.jsonl',
    )
    const first = judge('truthful')
    const one = await replay(CASES, BASELINE_JUDGE_CONFIG, {
      decide: first.decide,
      cache: fileCache([file]),
    })
    expect([one.sent, one.hits, first.calls()]).toEqual([11, 0, 11])
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(11)
    const never: Decide = () => Promise.reject(new Error('a kept question was asked again'))
    const two = await replay(CASES, BASELINE_JUDGE_CONFIG, {
      decide: never,
      cache: fileCache([file]),
    })
    expect([two.sent, two.hits]).toEqual([0, 11])
    const report = (replayed: typeof one) => {
      const { cost, ...rest } = reportOf('same', BASELINE_JUDGE_CONFIG, 'tune', replayed)
      return { ...rest, cost: { ...cost, sent: 0, hits: 0 } }
    }
    expect(report(two)).toEqual(report(one))
    const other = { ...BASELINE_JUDGE_CONFIG, split: 'each' } as const
    await expect(replay(CASES, other, { decide: never, cache: fileCache([file]) })).rejects.toThrow(
      'a kept question was asked again',
    )
    const again = await replay(CASES, BASELINE_JUDGE_CONFIG, {
      decide: first.decide,
      cache: fileCache([file]),
      repeat: 1,
    })
    expect(again.sent).toBe(11)
  })
  it('keeps no reply of a request that got no answer, and reads the case as judge unavailable', async () => {
    const cache = memory()
    const replayed = await replay([byId('clean')], BASELINE_JUDGE_CONFIG, {
      decide: async () => null,
      cache,
    })
    expect(replayed.outcomes[0]?.findings.judge).toBe('unavailable')
    expect(replayed.outcomes[0]?.verdict.row).toBe(8)
    expect(cache.size()).toBe(0)
  })
  it('asks the same question once when two cases ask it at the same time', async () => {
    const twice = [byId('clean'), { ...byId('clean'), id: 'p01-home-speedup/clean-again' }]
    const asked = judge('truthful')
    const replayed = await replay(twice, BASELINE_JUDGE_CONFIG, {
      decide: asked.decide,
      cache: memory(),
    })
    expect([replayed.sent, asked.calls()]).toEqual([1, 1])
    expect(replayed.outcomes.map(outcome => outcome.verdict.row)).toEqual([1, 1])
  })
  it('asks once for each vote', async () => {
    const three = { ...BASELINE_JUDGE_CONFIG, votes: 3 } as const
    const replayed = await replay([byId('clean')], three, { ...judge('truthful'), cache: memory() })
    expect(replayed.sent).toBe(3)
    expect(replayed.outcomes[0]?.verdict.row).toBe(1)
  })
  it('shuffles a request the same way for the same seed, and keeps everything in it', () => {
    const request = packJudge(byId('clean').material, BASELINE_JUDGE_CONFIG).requests[0]!
    const moved = shuffled(request, 7)
    expect(shuffled(request, 7)).toEqual(moved)
    const orders = [1, 2, 3, 4].map(seed => Object.keys(shuffled(request, seed).questions).join())
    expect(new Set(orders).size).toBeGreaterThan(1)
    expect(Object.keys(moved.questions).toSorted()).toEqual(
      Object.keys(request.questions).toSorted(),
    )
    expect(moved.questions.A3).toEqual(request.questions.A3)
    const criteria = (state: unknown) => (state as { goal: { criteria: string[] } }).goal.criteria
    expect(criteria(moved.state).toSorted()).toEqual(criteria(request.state).toSorted())
  })
})

describe('the bench stays out of the release', () => {
  it('no other member of the workspace depends on it', () => {
    const root = join(import.meta.dirname, '..', '..', '..', '..')
    const members = [
      'apps',
      'tools',
      ...readdirSync(join(root, 'packages')).map(group => join('packages', group)),
    ]
    const dependents = members.flatMap(group =>
      readdirSync(join(root, group), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => {
          try {
            const text = readFileSync(join(root, group, entry.name, 'package.json'), 'utf8')
            const manifest = JSON.parse(text) as {
              name: string
              dependencies?: object
              devDependencies?: object
            }
            const all = { ...manifest.dependencies, ...manifest.devDependencies }
            return '@omne-harness/goal-bench' in all ? [manifest.name] : []
          } catch {
            return []
          }
        }),
    )
    expect(dependents).toEqual([])
  })
})
