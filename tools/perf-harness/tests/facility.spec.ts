import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  affected,
  baselineFile,
  baselineOf,
  compareCounts,
  compareSteady,
  judged,
  outcomeOf,
  perf,
  readBaseline,
  readResult,
  runPaired,
  select,
  steadyOf,
  unknown,
  type Control,
  type Gate,
  type Measured,
  type Result,
  type Sample,
  type Setting,
  type Side,
  type Suite,
} from '../src/index.ts'
import { described, steady } from './machine.ts'

const gate = (over: Partial<Gate> = {}): Gate => ({
  name: 'reads of one step',
  from: 'multi-step: reads',
  state: 'pass',
  detail: 'ratios 1, 1, 1',
  ...over,
})

const control = (over: Partial<Control> = {}): Control => ({
  gate: 'reads of one step',
  expected: 'fail',
  state: 'fail',
  detail: 'ratios 1, 2, 4',
  ...over,
})

describe('what the gates of a result come to', () => {
  it('passes when every gate passes and every sample came out as it must', () => {
    expect(outcomeOf({ gates: [gate()], controls: [control()] })).toBe('pass')
  })

  it('fails on a failed gate, even beside a blocked one', () => {
    const gates = [gate({ state: 'fail' }), gate({ name: 'other', state: 'blocked' })]
    expect(outcomeOf({ gates, controls: [] })).toBe('fail')
  })

  it('is blocked, never passed, on a blocked gate or with no gate at all', () => {
    expect(outcomeOf({ gates: [gate({ state: 'blocked' })], controls: [] })).toBe('blocked')
    expect(outcomeOf({ gates: [], controls: [] })).toBe('blocked')
  })

  it('blocks a gate whose must-fail sample got through, whatever the gate said', () => {
    const result = { gates: [gate()], controls: [control({ state: 'pass' })] }
    expect(judged(result)[0]).toMatchObject({
      outcome: 'blocked',
      note: 'its must-fail sample came out pass',
    })
    expect(
      outcomeOf({ gates: [gate()], controls: [control({ expected: 'pass', state: 'fail' })] }),
    ).toBe('blocked')
  })

  it('lets a failure that was accepted stand, and fails once it no longer fails', () => {
    const known = { card: '#1752', reason: 'the fix belongs to the next run' }
    expect(judged({ gates: [gate({ state: 'fail', known })], controls: [] })[0]).toMatchObject({
      outcome: 'pass',
      note: 'known failure, accepted in #1752: the fix belongs to the next run (ratios 1, 1, 1)',
    })
    expect(judged({ gates: [gate({ state: 'pass', known })], controls: [] })[0]).toMatchObject({
      outcome: 'fail',
      note: 'no longer fails: remove the acceptance of #1752 (ratios 1, 1, 1)',
    })
    expect(outcomeOf({ gates: [gate({ state: 'blocked', known })], controls: [] })).toBe('blocked')
  })
})

const suiteOf = (id: string, measured: () => Measured, sample?: Suite['sample']): Suite => ({
  id,
  title: `the ${id} suite`,
  tiers: ['short', 'full'],
  paths: [`packages/${id}`, 'apps/server/src/'],
  limits: ['times of a single run'],
  plan: tier => ({
    workload: { suite: id, tier, steps: 4 },
    assembly: { synchronous: 'full' },
    settings: { journalMode: 'wal', synchronous: 'full' },
    release: true,
  }),
  measure: () => Promise.resolve(measured()),
  sample: sample ?? (() => Promise.resolve({ measures: { wall: 100, cpu: 50 }, digests: ['a'] })),
})

const counts = (reads: number): Measured => ({
  readings: [
    { name: 'reads of one step', kind: 'count', unit: 'reads', value: reads },
    { name: 'commits of one step', kind: 'count', unit: 'commits', value: 3 },
    { name: 'a step', kind: 'time', unit: 'ms', value: 12 },
  ],
  gates: [gate({ state: reads === 10 ? 'pass' : 'fail' })],
  controls: [control()],
  digests: ['sha256:one', 'sha256:two'],
})

describe('suites', () => {
  const suites = [suiteOf('a', () => counts(10)), suiteOf('b', () => counts(10))]

  it('are affected by a change under one of their paths, not by a path that only begins alike', () => {
    expect(affected(suites, ['packages/a/src/x.ts']).map(suite => suite.id)).toEqual(['a'])
    expect(affected(suites, ['apps/server/src/y.ts']).map(suite => suite.id)).toEqual(['a', 'b'])
    expect(affected(suites, ['packages/ab/x.ts', 'apps/server/srcs/y.ts', 'docs/z.md'])).toEqual([])
  })

  it('are all selected when none is named, and a name nobody has is told back', () => {
    expect(select(suites, [])).toEqual({ suites })
    expect(select(suites, ['b'])).toEqual({ suites: [suites[1]] })
    expect(select(suites, ['b', 'x'])).toEqual({ unknown: ['x'] })
  })
})

describe('a paired run', () => {
  const flat = (side: Side): Promise<Sample> =>
    Promise.resolve({
      measures: { wall: side === 'candidate' ? 130 : 100, cpu: 90 },
      digests: ['a'],
    })

  it('stops as soon as the first measure can be judged, at ten rounds, and judges every other measure too', async () => {
    const paired = await runPaired(flat)
    expect(paired).toMatchObject({
      rounds: 10,
      equivalence: { state: 'equivalent' },
      verdicts: { wall: { state: 'slower' }, cpu: { state: 'unchanged' } },
    })
  })

  it('goes on to the limit while the evidence is not enough', async () => {
    let calls = 0
    const noisy = (side: Side, round: number): Promise<Sample> => {
      calls += 1
      const swing = ((round * 7 + (side === 'self' ? 3 : 0)) % 5) * 20
      return Promise.resolve({ measures: { wall: 100 + swing }, digests: [] })
    }
    const paired = await runPaired(noisy, { limit: 14 })
    expect(paired.rounds).toBe(14)
    expect(paired.verdicts?.['wall']?.state).toBe('insufficient')
    expect(calls).toBe(14 * 3)
  })

  it('holds each measure to its own smallest change worth acting on', async () => {
    const reads = (side: Side): Promise<Sample> =>
      Promise.resolve({ measures: { reads: side === 'candidate' ? 1020 : 1000 }, digests: [] })
    expect((await runPaired(reads)).verdicts?.['reads']?.state).toBe('unchanged')
    const strict = await runPaired(reads, { minimumChange: { reads: 0.01 } })
    expect(strict.verdicts?.['reads']?.state).toBe('slower')
  })

  it('does not judge anything once the candidate did other work, and says where', async () => {
    const other = (side: Side): Promise<Sample> =>
      Promise.resolve({
        measures: { wall: 1 },
        digests: side === 'candidate' ? ['a', 'x'] : ['a', 'b'],
      })
    expect(await runPaired(other)).toEqual({
      equivalence: { state: 'different', first: 1 },
      verdicts: null,
      rounds: 1,
    })
  })

  it('cannot judge a base whose own two runs differ', async () => {
    const unstable = (side: Side): Promise<Sample> =>
      Promise.resolve({ measures: { wall: 1 }, digests: [side] })
    expect((await runPaired(unstable)).equivalence).toEqual({ state: 'unstable', first: 0 })
  })

  it('refuses a sample that carries no measure', async () => {
    await expect(runPaired(() => Promise.resolve({ measures: {}, digests: [] }))).rejects.toThrow(
      'a sample carries no measure',
    )
  })

  it('does not take the place a side runs in for a change: that is what rotation is for', async () => {
    const warming = [1.3, 1.15, 1]
    let place = 0
    const byPlace = (): Promise<Sample> => {
      const factor = warming[place % 3] ?? 1
      place += 1
      return Promise.resolve({ measures: { wall: 100 * factor }, digests: [] })
    }
    expect((await runPaired(byPlace, { limit: 12 })).verdicts?.['wall']?.state).toBe('insufficient')
    place = 0
    const fixed = await runPaired(byPlace, {
      limit: 12,
      order: () => ['base', 'self', 'candidate'],
    })
    expect(fixed.verdicts?.['wall']?.state).toBe('faster')
  })
})

describe('the command line', () => {
  let scratch: string
  let lines: string[]
  let errors: string[]
  const io = { out: (line: string) => lines.push(line), err: (line: string) => errors.push(line) }

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'perf-harness-cli-')))
    lines = []
    errors = []
  })

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  const setting = (suites: readonly Suite[], over: Partial<Setting> = {}): Setting => {
    const base = described()
    return {
      root: '/checkout',
      suites,
      baselines: join(scratch, 'baselines'),
      results: join(scratch, 'results'),
      scratch: join(scratch, 'data'),
      pinnedNode: process.versions.node,
      sources: {
        ...base,
        run: (command, args) =>
          command !== 'git'
            ? base.run(command, args)
            : args.includes('rev-parse')
              ? `${'c'.repeat(40)}\n`
              : args.includes('diff')
                ? 'packages/a/src/x.ts\ndocs/y.md\n'
                : '',
      },
      probe: () => steady,
      now: () => new Date('2026-11-27T12:00:00Z'),
      ...over,
    }
  }

  const resultIn = (directory: string): Result => {
    const result = readResult(directory)
    if ('state' in result) throw new Error(result.reason)
    return result
  }

  it('prints the record, the three identifiers and whether there is a baseline, and runs no suite', async () => {
    let ran = false
    const suite = suiteOf('a', () => {
      ran = true
      return counts(10)
    })
    expect(await perf(['env', 'a'], setting([suite]), io)).toBe(0)
    const printed = JSON.parse(lines.join('\n')) as Record<string, unknown>
    expect(ran).toBe(false)
    expect(printed['ids']).toMatchObject({
      workload: expect.stringMatching(/^wl-/),
      assembly: expect.stringMatching(/^asm-/),
      config: expect.stringMatching(/^cfg-/),
    })
    expect(printed['baselines']).toEqual({ counts: 'none', timesOfThisMachine: 'none' })
    expect(Object.keys(printed['environment'] as object)).toEqual([
      'machine',
      'beside',
      'subject',
      'state',
      'probes',
    ])
    expect(readdirSync(join(scratch, 'data'))).toEqual([])
  })

  it('prints only the identifier of the machine when no suite is named', async () => {
    expect(await perf(['env'], setting([suiteOf('a', () => counts(10))]), io)).toBe(0)
    expect((JSON.parse(lines.join('\n')) as { ids: object }).ids).toEqual({
      config: expect.stringMatching(/^cfg-/),
    })
  })

  it('runs a suite, writes the result, prints a report that says it has no baseline, and exits 0', async () => {
    const out = join(scratch, 'out')
    expect(
      await perf(['run', 'a', '--out', out], setting([suiteOf('a', () => counts(10))]), io),
    ).toBe(0)
    const result = resultIn(join(out, 'a.short'))
    expect(result).toMatchObject({ suite: 'a', tier: 'short', limits: ['times of a single run'] })
    expect(result.environment.subject).toMatchObject({ commit: 'c'.repeat(40), dirty: false })
    const report = lines.join('\n')
    expect(report).toContain('# a (short): pass')
    expect(report).toContain('Blocked: no baseline to compare with.')
    expect(report).toContain('- times of a single run')
    expect(report).toContain(`Result: ${join(out, 'a.short')}`)
  })

  it('exits 1 when a gate fails and 2 when a suite decides nothing', async () => {
    expect(await perf(['run', 'a'], setting([suiteOf('a', () => counts(11))]), io)).toBe(1)
    const none: Measured = { readings: [], gates: [], controls: [], digests: [] }
    expect(await perf(['run', 'a'], setting([suiteOf('a', () => none)]), io)).toBe(2)
    expect(
      existsSync(join(scratch, 'results', '2026-11-27T12-00-00-000Z', 'a.short', 'result.json')),
    ).toBe(true)
  })

  it('reports a suite that could not run as blocked with what stopped it, and goes on to the next', async () => {
    const broken: Suite = {
      ...suiteOf('a', () => counts(10)),
      measure: () => Promise.reject(new Error('the lab did not set up')),
    }
    expect(await perf(['run'], setting([broken, suiteOf('b', () => counts(10))]), io)).toBe(2)
    const printed = lines.join('\n')
    expect(printed).toContain('# a (short): blocked')
    expect(printed).toContain(
      '| the suite ran to its end | blocked | the workload itself | the lab did not set up |',
    )
    expect(printed).toContain('# b (short): pass')
  })

  it('writes a baseline of the counts, and later runs are held against it item by item', async () => {
    const first = setting([suiteOf('a', () => counts(10))])
    expect(await perf(['run', 'a', '--tier', 'full', '--write-baseline'], first, io)).toBe(0)
    expect(readBaseline(first.baselines, 'a', 'full')).toMatchObject({
      commit: 'c'.repeat(40),
      counts: { 'commits of one step': 3, 'reads of one step': 10 },
    })
    lines = []
    expect(await perf(['run', 'a', '--tier', 'full'], first, io)).toBe(0)
    expect(lines.join('\n')).toContain(
      `Comparable. All 2 counts equal those of \`${'c'.repeat(40)}\`.`,
    )
    lines = []
    await perf(['run', 'a', '--tier', 'full'], setting([suiteOf('a', () => counts(11))]), io)
    expect(lines.join('\n')).toContain('| reads of one step | 10 | 11 |')
    lines = []
    await perf(['env', 'a', '--tier', 'full'], first, io)
    expect((JSON.parse(lines.join('\n')) as { baselines: object }).baselines).toMatchObject({
      counts: { commit: 'c'.repeat(40), sameQuestion: true },
    })
  })

  it('writes no baseline from a tree that is not clean', async () => {
    const base = setting([suiteOf('a', () => counts(10))])
    const dirty = {
      ...base,
      sources: {
        ...base.sources,
        run: (command: string, args: readonly string[]) =>
          args.includes('status') ? ' M x.ts\n' : base.sources.run(command, args),
      },
    }
    expect(await perf(['run', 'a', '--write-baseline'], dirty, io)).toBe(2)
    expect(errors).toEqual([
      'a: no baseline written: the working tree was not clean: the result cannot be a baseline',
    ])
    expect(readBaseline(dirty.baselines, 'a', 'short')).toBeNull()
  })

  it('writes the baselines of several suites of one run: the first one written does not dirty the tree under the next', async () => {
    const base = setting([suiteOf('a', () => counts(10)), suiteOf('b', () => counts(10))])
    const tracked = {
      ...base,
      sources: {
        ...base.sources,
        run: (command: string, args: readonly string[]) =>
          args.includes('status') && existsSync(base.baselines)
            ? ' M baselines/a.short.json\n'
            : base.sources.run(command, args),
      },
    }
    expect(await perf(['run', '--write-baseline'], tracked, io)).toBe(0)
    expect(errors).toEqual([])
    expect(readBaseline(base.baselines, 'a', 'short')).not.toBeNull()
    expect(readBaseline(base.baselines, 'b', 'short')).not.toBeNull()
  })

  it('does not hold a candidate to a count the base itself does not keep from one run to the next', async () => {
    let runs = 0
    const moving = (): Measured => {
      const measured = counts(10)
      runs += 1
      return {
        ...measured,
        readings: [
          ...measured.readings,
          { name: 'bytes of one step', kind: 'count', unit: 'bytes', value: 1000 + (runs % 2) },
        ],
      }
    }
    const prepared = setting([suiteOf('a', moving)], {
      prepare: commit => Promise.resolve(`/at/${commit}`),
    })
    expect(await perf(['compare', 'base', 'cand', 'a', '--counts-only'], prepared, io)).toBe(2)
    expect(lines.join('\n')).toContain(
      'Blocked: the base differs from itself in bytes of one step: what moves between two runs of one commit is not a count of steps.',
    )
    lines.length = 0
    const still = setting([suiteOf('a', () => counts(10))], {
      prepare: commit => Promise.resolve(`/at/${commit}`),
    })
    expect(await perf(['compare', 'base', 'cand', 'a', '--counts-only'], still, io)).toBe(0)
    expect(lines.join('\n')).toContain('Comparable. All 2 counts equal those of')
  })

  it('measures a candidate that differs once more, and does not call a count it does not keep a difference', async () => {
    const places: string[] = []
    const at = (measuredAt: (root: string, nth: number) => Measured): Suite => ({
      ...suiteOf('a', () => counts(10)),
      measure: (_tier, place) => {
        places.push(place.root)
        return Promise.resolve(
          measuredAt(place.root, places.filter(root => root === place.root).length),
        )
      },
    })
    const prepare = (commit: string) => Promise.resolve(`/at/${commit}`)
    const once = at((root, nth) => {
      const first = root === '/at/cand' && nth === 1
      return {
        ...counts(first ? 12 : 10),
        readings: counts(first ? 12 : 10).readings.map(reading =>
          first && reading.kind === 'count' ? { ...reading, value: reading.value + 2 } : reading,
        ),
      }
    })
    expect(
      await perf(
        ['compare', 'base', 'cand', 'a', '--counts-only'],
        setting([once], { prepare }),
        io,
      ),
    ).toBe(2)
    expect(places).toEqual(['/at/base', '/at/base', '/at/cand', '/at/cand'])
    expect(lines.join('\n')).toContain(
      'Blocked: the candidate differs from itself in commits of one step, reads of one step: what moves between two runs of one commit is not a count of steps.',
    )
    lines.length = 0
    places.length = 0
    const always = at(root => counts(root === '/at/cand' ? 12 : 10))
    expect(
      await perf(
        ['compare', 'base', 'cand', 'a', '--counts-only'],
        setting([always], { prepare }),
        io,
      ),
    ).toBe(1)
    expect(places).toHaveLength(4)
    expect(lines.join('\n')).toContain('| reads of one step | 10 | 12 |')
    lines.length = 0
    places.length = 0
    const same = at(() => counts(10))
    expect(
      await perf(
        ['compare', 'base', 'cand', 'a', '--counts-only'],
        setting([same], { prepare }),
        io,
      ),
    ).toBe(0)
    expect(places).toHaveLength(3)
  })

  it('compares the counts of two results, and refuses two that asked different questions', async () => {
    const one = join(scratch, 'one')
    const two = join(scratch, 'two')
    await perf(['run', 'a', '--out', one], setting([suiteOf('a', () => counts(10))]), io)
    await perf(['run', 'a', '--out', two], setting([suiteOf('a', () => counts(12))]), io)
    lines = []
    expect(
      await perf(['compare', join(one, 'a.short'), join(two, 'a.short')], setting([]), io),
    ).toBe(1)
    expect(lines.join('\n')).toContain('| reads of one step | 10 | 12 |')
    expect(
      await perf(['compare', join(one, 'a.short'), join(one, 'a.short')], setting([]), io),
    ).toBe(0)
    const full = join(scratch, 'full')
    await perf(
      ['run', 'a', '--tier', 'full', '--out', full],
      setting([suiteOf('a', () => counts(10))]),
      io,
    )
    lines = []
    expect(
      await perf(['compare', join(one, 'a.short'), join(full, 'a.full')], setting([]), io),
    ).toBe(2)
    expect(lines.join('\n')).toContain('Refused: the workloads differ.')
    const compared = compareCounts(
      baselineOf(resultIn(join(one, 'a.short'))) as never,
      resultIn(join(full, 'a.full')),
    )
    expect(compared).toEqual({ state: 'refused', reason: 'the workloads differ' })
  })

  it('keeps the counts of a baseline by name, in one file for a suite and a tier, and reads no other schema', async () => {
    const mixed = (): Measured => ({
      ...counts(10),
      readings: [
        { name: 'z of one step', kind: 'count', unit: 'commits', value: 1 },
        { name: 'a of one step', kind: 'count', unit: 'commits', value: 2 },
        { name: 'k of one step', kind: 'count', unit: 'commits', value: 3 },
        { name: 'b of one step', kind: 'clocked', unit: 'reads', value: 4 },
      ],
    })
    const base = setting([suiteOf('a', mixed)])
    const out = join(scratch, 'kept')
    expect(await perf(['run', 'a', '--out', out, '--write-baseline'], base, io)).toBe(0)
    const result = resultIn(join(out, 'a.short'))
    const baseline = baselineOf(result)
    if ('state' in baseline) throw new Error(baseline.reason)
    expect(Object.keys(baseline.counts)).toEqual([
      'a of one step',
      'k of one step',
      'z of one step',
    ])
    const file = baselineFile(base.baselines, 'a', 'short')
    expect(file).toBe(join(base.baselines, 'a.short.json'))
    expect(readBaseline(base.baselines, 'a', 'short')).toEqual(baseline)
    const later = {
      ...result,
      readings: result.readings.map(reading => ({ ...reading, value: reading.value + 1 })),
    }
    expect(compareCounts(baseline, later)).toMatchObject({
      state: 'different',
      differences: [
        { name: 'a of one step', base: 2, now: 3 },
        { name: 'k of one step', base: 3, now: 4 },
        { name: 'z of one step', base: 1, now: 2 },
      ],
    })
    writeFileSync(file, JSON.stringify({ ...baseline, schema: 2 }))
    expect(readBaseline(base.baselines, 'a', 'short')).toBeNull()
  })

  it('makes no baseline of a result whose commit is not known or whose tree was not clean, and says which', async () => {
    const out = join(scratch, 'unfit')
    await perf(['run', 'a', '--out', out], setting([suiteOf('a', () => counts(10))]), io)
    const result = resultIn(join(out, 'a.short'))
    const subject = result.environment.subject
    const withSubject = (over: Partial<typeof subject>): Result => ({
      ...result,
      environment: { ...result.environment, subject: { ...subject, ...over } },
    })
    expect(baselineOf(withSubject({ commit: unknown('not a checkout') }))).toEqual({
      state: 'blocked',
      reason: 'the commit of the result is not known',
    })
    const unclean = {
      state: 'blocked',
      reason: 'the working tree was not clean: the result cannot be a baseline',
    }
    expect(baselineOf(withSubject({ dirty: true }))).toEqual(unclean)
    expect(steadyOf('base', withSubject({ dirty: true }), result)).toEqual(unclean)
    expect(compareSteady(withSubject({ dirty: true }), result, result)).toEqual(unclean)
  })

  it('compares two commits: the counts of each side, then timed rounds over the three sides', async () => {
    const sides: string[] = []
    const suite: Suite = {
      ...suiteOf('a', () => counts(10)),
      measure: (_tier, place) => Promise.resolve(counts(place.root === '/at/cand' ? 12 : 10)),
      sample: (_tier, place) => {
        sides.push(place.root)
        expect(existsSync(place.dataDirectory)).toBe(true)
        return Promise.resolve({
          measures: { 'wall ms': place.root === '/at/cand' ? 80 : 100, 'processor ms': 60 },
          digests: ['a'],
        })
      },
    }
    const prepared = setting([suite], { prepare: commit => Promise.resolve(`/at/${commit}`) })
    expect(await perf(['compare', 'base', 'cand', 'a'], prepared, io)).toBe(1)
    const printed = lines.join('\n')
    expect(printed).toContain('| reads of one step | 10 | 12 |')
    expect(printed).toContain('a: wall ms faster after 10 rounds (median -20.0%')
    expect(printed).toContain('a: processor ms unchanged after 10 rounds')
    expect(sides.slice(0, 3)).toEqual(['/at/base', '/at/base', '/at/cand'])
    expect(sides).toHaveLength(30)
    sides.length = 0
    await perf(['compare', 'base', 'cand', 'a', '--counts-only'], prepared, io)
    expect(sides).toEqual([])
  })

  it('keeps the result of each side of two commits, so the two can be read and compared again', async () => {
    const suite: Suite = {
      ...suiteOf('a', () => counts(10)),
      measure: (_tier, place) => Promise.resolve(counts(place.root === '/at/cand' ? 12 : 10)),
    }
    const prepared = setting([suite], { prepare: commit => Promise.resolve(`/at/${commit}`) })
    await perf(['compare', 'base', 'cand', 'a', '--counts-only'], prepared, io)
    const kept = join(scratch, 'results', '2026-11-27T12-00-00-000Z')
    expect(lines).toContain(
      `Results: ${join(kept, 'base', 'a.short')} ${join(kept, 'candidate', 'a.short')}`,
    )
    expect(resultIn(join(kept, 'base', 'a.short')).readings[0]?.value).toBe(10)
    expect(resultIn(join(kept, 'candidate', 'a.short')).readings[0]?.value).toBe(12)
    lines.length = 0
    expect(
      await perf(
        ['compare', join(kept, 'base', 'a.short'), join(kept, 'candidate', 'a.short')],
        setting([]),
        io,
      ),
    ).toBe(1)
    expect(lines.join('\n')).toContain('| reads of one step | 10 | 12 |')
  })

  it('holds a measure to the smallest change its suite names, and answers 1 when any measure got worse', async () => {
    const sample: Suite['sample'] = (_tier, place) =>
      Promise.resolve({
        measures: { 'wall ms': 100, 'bytes of a step': place.root === '/at/cand' ? 1010 : 1000 },
        digests: ['a'],
      })
    const coarse = suiteOf('a', () => counts(10), sample)
    const prepared = (suite: Suite): Setting =>
      setting([suite], { prepare: commit => Promise.resolve(`/at/${commit}`) })
    expect(await perf(['compare', 'base', 'cand', 'a'], prepared(coarse), io)).toBe(0)
    expect(lines.join('\n')).toContain('a: bytes of a step unchanged after 10 rounds')
    lines.length = 0
    const fine: Suite = { ...coarse, changes: { 'bytes of a step': 0.001 } }
    expect(await perf(['compare', 'base', 'cand', 'a'], prepared(fine), io)).toBe(1)
    const printed = lines.join('\n')
    expect(printed).toContain('a: wall ms unchanged after 10 rounds')
    expect(printed).toContain('a: bytes of a step slower after 10 rounds (median 1.0%')
  })

  it('does not time anything on a runtime that is not the pinned one, and says why', async () => {
    const suite = suiteOf('a', () => counts(10))
    const off = setting([suite], {
      pinnedNode: '0.0.1',
      prepare: commit => Promise.resolve(commit),
    })
    expect(await perf(['compare', 'base', 'cand'], off, io)).toBe(2)
    expect(lines.join('\n')).toContain('a: times are blocked on this machine: Node')
  })

  it('answers 2 and says what is wrong on wrong use', async () => {
    const one = setting([suiteOf('a', () => counts(10))])
    expect(await perf([], one, io)).toBe(2)
    expect(await perf(['help'], one, io)).toBe(0)
    for (const args of [
      ['run', 'nobody'],
      ['run', 'a', '--tier', 'huge'],
      ['run', '--tier'],
      ['run', '--loud'],
      ['fly'],
      ['compare', 'x'],
      ['compare', 'base', 'cand'],
      ['affected'],
      ['report'],
      ['report', join(scratch, 'nothing')],
      ['env', 'nobody'],
    ])
      expect(await perf(args, one, io), args.join(' ')).toBe(2)
    expect(await perf(['run'], setting([]), io)).toBe(2)
    expect(errors).toContain('no suite named nobody; there are: a')
    expect(errors).toContain('a has the tiers short, full')
    expect(errors).toContain('two commits cannot be compared here: nothing prepares a checkout')
    expect(errors).toContain('no suite is registered')
  })

  it('lists the suites the changes since a commit may move, and prints a report again', async () => {
    const suites = [suiteOf('a', () => counts(10)), suiteOf('b', () => counts(10))]
    expect(await perf(['affected', '--base', 'main'], setting(suites), io)).toBe(0)
    expect(lines).toEqual(['a'])
    const out = join(scratch, 'out')
    await perf(['run', 'b', '--out', out], setting(suites), io)
    lines = []
    expect(await perf(['report', join(out, 'b.short')], setting(suites), io)).toBe(0)
    expect(lines[0]).toContain('# b (short): pass')
    expect(readFileSync(join(out, 'b.short', 'result.json'), 'utf8')).not.toContain(scratch)
  })
})
