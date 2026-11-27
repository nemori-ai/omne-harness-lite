import { judged, outcomeOf } from '@omne-harness/perf-harness'
import { describe, expect, it } from 'vitest'
import type { StepLine } from '../src/driver/lab.ts'
import { callId, LIST, requestsOf, roundMark, scriptOf, type RoundShape } from '../src/script.ts'
import { SUITES } from '../src/suites.ts'
import {
  measuredOf,
  MULTI_ROUND,
  MULTI_STEP,
  takenMeasured,
  writesOf,
} from '../src/suites/sessions.ts'
import {
  BYTE_ALLOWANCE,
  CHANGES,
  gatesOf,
  READ_ALLOWANCE,
  READS,
  rungsOf,
  sampleOf,
  type Axis,
} from '../src/suites/scale.ts'
import { digestsOf, stepsOf, type Step, type Trajectory } from '../src/trajectory.ts'

const step = (round: number, at: number, over: Partial<Step> = {}): Step => ({
  round,
  step: at,
  reads: 900,
  commits: 81,
  commitBytes: 1_000_000,
  requestBytes: 60_000 + 700 * (round * 100 + at),
  otherRequests: 0,
  byHandler: { 'tenant-1/session.history': 30, 'system.identity/identity.standing': 360 },
  byParticipant: { 'tenant-1/session': 11, 'tenant-1/tool': 31 },
  ...over,
})

const AXIS: Axis = {
  name: 'step',
  from: 'the cost model of the test',
  scales: [2, 4, 8, 16],
  placeOf: one => one.step,
  known: {},
}

const round = (shape: (at: number) => Partial<Step> = () => ({})): Step[] =>
  Array.from({ length: 16 }, (_, index) => step(1, index + 1, shape(index + 1)))

const stateOf = (steps: readonly Step[], name: string, axis: Axis = AXIS) =>
  judged(gatesOf(steps, axis)).find(item => item.gate.name === name)

describe('the gates of an axis', () => {
  it('pass a trajectory whose steps cost the same at every rung', () => {
    const measured = gatesOf(round(), AXIS)
    expect(measured.gates.map(gate => gate.state)).toEqual(['pass', 'pass', 'pass'])
    expect(outcomeOf(measured)).toBe('pass')
  })

  it('fail the commits of a step on a single commit more at a later rung', () => {
    expect(
      stateOf(
        round(at => ({ commits: at > 8 ? 82 : 81 })),
        'commits of a step',
      ),
    ).toMatchObject({
      outcome: 'fail',
    })
  })

  it('fail the commit bytes of a step that grow with the steps before it', () => {
    const grown = round(at => ({ commitBytes: 1_000_000 + at * 4000 }))
    expect(stateOf(grown, 'commit bytes of a step')?.outcome).toBe('fail')
    expect(stateOf(grown, 'commits of a step')?.outcome).toBe('pass')
  })

  it('let the commit bytes of a step move by the few bytes the clock writes, and fail them beyond that', () => {
    const wobbling = round(at => ({ commitBytes: at === 4 ? 1_000_002 : 1_000_000 }))
    expect(stateOf(wobbling, 'commit bytes of a step')?.outcome).toBe('pass')
    const beyond = round(at => ({
      commitBytes: at > 8 ? 1_000_000 * (1 + BYTE_ALLOWANCE * 2) : 1_000_000,
    }))
    expect(stateOf(beyond, 'commit bytes of a step')?.outcome).toBe('fail')
  })

  it('let the reads of a step move inside the allowance, and fail them beyond it', () => {
    const within = round(at => ({ reads: at > 8 ? 900 * (1 + READ_ALLOWANCE / 2) : 900 }))
    expect(stateOf(within, 'reads of a step')?.outcome).toBe('pass')
    const beyond = round(at => ({ reads: at > 8 ? 900 * (1 + READ_ALLOWANCE * 2) : 900 }))
    expect(stateOf(beyond, 'reads of a step')?.outcome).toBe('fail')
  })

  it('take the middle step of a rung, so one slow step does not decide it', () => {
    expect(
      stateOf(
        round(at => ({ reads: at === 12 ? 2000 : 900 })),
        'reads of a step',
      )?.outcome,
    ).toBe('pass')
  })

  it('are blocked when the request does not grow: the sample that must fail got through', () => {
    const flat = round(() => ({ requestBytes: 60_000 }))
    for (const item of judged(gatesOf(flat, AXIS)))
      expect(item).toMatchObject({ outcome: 'blocked', note: 'its must-fail sample came out pass' })
  })

  it('are blocked when a rung has no step', () => {
    const short = round().slice(0, 8)
    expect(gatesOf(short, AXIS).gates.map(gate => gate.state)).toEqual([
      'blocked',
      'blocked',
      'blocked',
    ])
  })

  it('let a failure that was accepted stand, with the card and the reason', () => {
    const known = { 'commit bytes of a step': { card: '#1', reason: 'the next run' } }
    const grown = round(at => ({ commitBytes: 1_000_000 + at * 4000 }))
    expect(stateOf(grown, 'commit bytes of a step', { ...AXIS, known })).toMatchObject({
      outcome: 'pass',
      note: expect.stringMatching(/^known failure, accepted in #1: the next run \(values /u),
    })
    expect(stateOf(round(), 'commit bytes of a step', { ...AXIS, known })?.outcome).toBe('fail')
  })

  it('hold only the quantities an axis names, each with its two samples', () => {
    const held = gatesOf(round(), { ...AXIS, gated: [READS] })
    expect(held.gates.map(gate => gate.name)).toEqual(['reads of a step'])
    expect(held.controls.map(control => [control.gate, control.expected])).toEqual([
      ['reads of a step', 'fail'],
      ['reads of a step', 'pass'],
    ])
  })

  it('put a step in the rung above half its scale and up to it', () => {
    expect(
      rungsOf(round(), [2, 4, 8, 16], one => one.step).map(rung => rung.steps.map(one => one.step)),
    ).toEqual([[2], [3, 4], [5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]])
  })
})

describe('what a trajectory comes to', () => {
  const trajectory: Trajectory = {
    steps: round(),
    openings: [],
    watchings: [],
    rounds: [],
    digests: ['a', 'b'],
    kinds: { 'message.user': 1 },
    entryKinds: [],
    wallMs: 1234.5,
    processorMs: 2000,
    requests: 17,
  }

  it('gives every quantity at every rung, who committed and who read at the top rung, the floor and the times', () => {
    const { readings } = measuredOf(trajectory, AXIS)
    const named = (name: string) => readings.find(reading => reading.name === name)
    expect(named('commits of a step at step 16')).toMatchObject({ kind: 'count', value: 81 })
    expect(named('reads of a step at step 2')).toMatchObject({ kind: 'clocked', value: 900 })
    expect(named('commit bytes of a step at step 4')).toMatchObject({ kind: 'clocked' })
    expect(named('commit bytes of a step on an empty session')).toMatchObject({ kind: 'clocked' })
    expect(named('request bytes after a step at step 4')).toMatchObject({ kind: 'count' })
    expect(named('commits of a step by tenant-1/tool at step 16')).toMatchObject({
      kind: 'count',
      value: 31,
    })
    expect(named('reads of a step by system.identity/identity.standing at step 16')).toMatchObject({
      kind: 'clocked',
      value: 360,
    })
    expect(named('commits of a step on an empty session')).toMatchObject({ value: 81 })
    expect(named('wall time of the trajectory')).toMatchObject({ kind: 'time', value: 1235 })
    expect(named('processor time of the server')).toMatchObject({ kind: 'time', value: 2000 })
  })

  it('gives a timed round the wall and processor times and what a step reads and commits in bytes, each with its smallest change', () => {
    expect(sampleOf(trajectory)).toEqual({
      digests: ['a', 'b'],
      measures: {
        'wall ms': 1234.5,
        'server processor ms': 2000,
        'reads of a step': 900,
        'commit bytes of a step': 1_000_000,
      },
    })
    expect(CHANGES).toEqual({
      'reads of a step': READ_ALLOWANCE,
      'commit bytes of a step': BYTE_ALLOWANCE,
    })
    for (const suite of SUITES) expect(suite.changes).toBe(CHANGES)
  })

  it('names who committed and who read in the middle step of the top rung, not who did so once on its own clock', () => {
    const once = round(at =>
      at === 12
        ? {
            byParticipant: { 'tenant-1/session': 11, 'tenant-1/media.index': 1 },
            byHandler: { 'tenant-1/session.history': 30, 'tenant-1/media.index.read': 1 },
          }
        : {},
    )
    const { readings } = measuredOf({ ...trajectory, steps: once }, AXIS)
    const names = readings.map(reading => reading.name)
    expect(names).toContain('commits of a step by tenant-1/session at step 16')
    expect(names).toContain('reads of a step by tenant-1/session.history at step 16')
    expect(names).not.toContain('commits of a step by tenant-1/media.index at step 16')
    expect(names).not.toContain('reads of a step by tenant-1/media.index.read at step 16')
  })

  it('leaves out the processor time where it cannot be read', () => {
    const { readings } = measuredOf({ ...trajectory, processorMs: null }, AXIS)
    expect(readings.some(reading => reading.name === 'processor time of the server')).toBe(false)
  })
})

describe('the script of a trajectory', () => {
  const two: RoundShape = { steps: [[LIST], [LIST, LIST]] }

  it('finds every step by the calls before it, and ends a round after its last step', () => {
    const { script, places } = scriptOf([two, { steps: [] }], [{ when: {}, say: 'other' }])
    const steps = script.steps as {
      when: { has: string[]; lacks: string[] }
      say?: string
      call?: { id: string }[]
    }[]
    expect(places).toEqual([
      null,
      { round: 2, step: 'end' },
      { round: 1, step: 'end' },
      { round: 1, step: 2 },
      { round: 1, step: 1 },
    ])
    expect(steps[0]).toEqual({ when: {}, say: 'other' })
    steps.shift()
    expect(steps).toHaveLength(4)
    const fits = (rule: (typeof steps)[number], body: string) =>
      rule.when.has.every(word => body.includes(word)) &&
      !rule.when.lacks.some(word => body.includes(word))
    const answerTo = (body: string) => steps.find(rule => fits(rule, body))
    expect(answerTo(roundMark(1))?.call?.map(call => call.id)).toEqual([callId(1, 1, 1)])
    expect(answerTo(`${roundMark(1)} ${callId(1, 1, 1)}`)?.call?.map(call => call.id)).toEqual([
      callId(1, 2, 1),
      callId(1, 2, 2),
    ])
    const afterAll = `${roundMark(1)} ${callId(1, 1, 1)} ${callId(1, 2, 1)} ${callId(1, 2, 2)}`
    expect(answerTo(afterAll)?.say).toBe(`finished ${roundMark(1)}`)
    expect(answerTo(`${afterAll} finished ${roundMark(2)}`)?.say).toBe(`finished ${roundMark(2)}`)
    expect(requestsOf(two)).toBe(3)
  })
})

const line = (
  request: number,
  reads: number,
  committed: number,
  step: number | null,
): StepLine => ({
  request,
  step,
  requestBytes: 1000 * request,
  requestDigest: `sha256:${String(request)}`,
  storage: {
    reads: [
      {
        domain: 'tenant/org_a/acc_b',
        handler: 'session.history',
        read: reads,
        unavailable: 0,
        cancelled: 0,
      },
      {
        domain: 'system.identity',
        handler: 'identity.standing',
        read: reads * 2,
        unavailable: 3,
        cancelled: 0,
      },
    ],
    commits: [
      {
        domain: 'tenant/org_a/acc_b',
        committed,
        recalled: 0,
        rolledBack: 0,
        unknown: 0,
        conflicted: 0,
        rejected: 0,
        bytes: committed * 100,
      },
    ],
    participants: [{ domain: 'tenant/org_a/acc_b', participant: 'session', committed }],
    queries: [],
  },
})

describe('the steps of a trajectory', () => {
  const shapes: RoundShape[] = [{ steps: [[LIST], [LIST]] }, { steps: [[LIST]] }]
  const { places } = scriptOf(shapes)
  const at = (round: number, step: number | 'end'): number =>
    places.findIndex(place => place?.round === round && place.step === step)
  const lines = [
    line(1, 10, 1, at(1, 1)),
    line(2, 25, 3, at(1, 2)),
    line(3, 45, 6, at(1, 'end')),
    line(4, 100, 20, at(2, 1)),
    line(5, 130, 24, at(2, 'end')),
  ]

  it('are what the storage gained between two requests of one round, never across the end of a round', () => {
    expect(stepsOf(lines, places)).toEqual([
      expect.objectContaining({
        round: 1,
        step: 1,
        reads: 45,
        commits: 2,
        commitBytes: 200,
        requestBytes: 2000,
      }),
      expect.objectContaining({ round: 1, step: 2, reads: 60, commits: 3 }),
      expect.objectContaining({ round: 2, step: 1, reads: 90, commits: 4, requestBytes: 5000 }),
    ])
  })

  it('count a request the trajectory does not hold into the step it fell in, and open no step for it', () => {
    const between = [
      lines[0]!,
      line(9, 12, 2, null),
      line(9, 14, 2, places.length),
      ...lines.slice(1),
    ]
    const [first, second] = stepsOf(between, places)
    expect(first).toMatchObject({ round: 1, step: 1, reads: 45, commits: 2, otherRequests: 2 })
    expect(second).toMatchObject({ round: 1, step: 2, otherRequests: 0 })
    expect(stepsOf(between, places)).toHaveLength(3)
  })

  it('name the domain of a tenant by the order it appears in, never by its identifiers', () => {
    const [first] = stepsOf(lines, places)
    expect(first?.byHandler).toEqual({
      'system.identity/identity.standing': 30,
      'tenant-1/session.history': 15,
    })
    expect(first?.byParticipant).toEqual({ 'tenant-1/session': 2 })
    expect(JSON.stringify(stepsOf(lines, places))).not.toContain('org_a')
  })

  it('leave out a step whose next request never came', () => {
    expect(stepsOf(lines.slice(0, 4), places)).toHaveLength(2)
  })
})

describe('what a run leaves at the edge of the measurement', () => {
  const history = [
    '#30 message.user: please work mk-round-0001',
    '#32 run.started: Run run_abc started (entry interactive)',
    '#50 message.assistant: [tool call Files call_r0001_s0001_c0001] {"entries":[]}',
    '#62 message.tool: [tool result call_r0001_s0001_c0001]',
    '    done request="c4d6b346"',
    '#72 message.assistant: finished mk-round-0001',
    '#75 run.terminal: Run run_abc ended: completed',
  ].join('\n')

  it('does not move with the order two entries landed in: a run and its repeat may interleave them differently', () => {
    const lines = history.split('\n')
    const swapped = [lines[0], lines[1], lines[3], lines[4], lines[2], ...lines.slice(5)].join('\n')
    expect(digestsOf(swapped).digests).toEqual(digestsOf(history).digests)
  })

  it('is one digest for each visible entry, and does not move with identifiers the product made up', () => {
    const { digests, kinds } = digestsOf(history)
    expect(digests).toHaveLength(6)
    expect(kinds).toEqual({
      'message.user': 1,
      'run.started': 1,
      'message.assistant': 2,
      'message.tool': 1,
      'run.terminal': 1,
    })
    const other = history
      .replaceAll('run_abc', 'run_xyz')
      .replace('c4d6b346', '00000000')
      .replace('#75', '#99')
    expect(digestsOf(other).digests).toEqual(digests)
  })

  it('moves when the work differs: another call, another input', () => {
    const { digests } = digestsOf(history)
    expect(
      digestsOf(history.replace('call_r0001_s0001_c0001]', 'call_r0001_s0009_c0001]')).digests,
    ).not.toEqual(digests)
    expect(digestsOf(history.replace('mk-round-0001', 'mk-round-0002')).digests).not.toEqual(
      digests,
    )
  })
})

describe('the session suites', () => {
  it('are registered, each with a short and a full tier, a workload and the paths that move it', () => {
    expect(SUITES.map(suite => suite.id)).toEqual([
      'multi-step',
      'multi-round',
      'cold-open',
      'catch-up',
      'compaction',
      'tool-result',
      'background-calls',
      'attachments',
    ])
    for (const suite of SUITES) {
      expect(suite.tiers).toEqual(['short', 'full'])
      expect(suite.paths).toContain('packages/storage')
      expect(suite.limits.length).toBeGreaterThan(0)
      const short = suite.plan('short')
      expect(short.workload).toMatchObject({ suite: suite.id, tier: 'short' })
      expect(JSON.stringify(suite.plan('full').workload)).not.toBe(JSON.stringify(short.workload))
      expect(() => suite.plan('huge')).toThrow('has no tier huge')
    }
  })

  it('ask different questions: many steps of one round, many rounds of one step', () => {
    type Workload = { rounds: { steps: unknown[] }[] }
    const steps = MULTI_STEP.plan('short').workload as Workload
    const rounds = MULTI_ROUND.plan('short').workload as Workload
    expect([steps.rounds.length, steps.rounds[0]?.steps.length]).toEqual([1, 32])
    expect([rounds.rounds.length, rounds.rounds[0]?.steps.length]).toEqual([16, 1])
  })

  it('put what sets a workload apart into its identity: the files, the restarts, the trigger of a compaction', () => {
    const byId = (id: string) => SUITES.find(suite => suite.id === id)!.plan('short')
    expect(byId('tool-result').workload).toMatchObject({
      files: { 'sized-1k.txt': 1024, 'sized-8k.txt': 8192 },
    })
    expect(byId('cold-open').workload).toMatchObject({ restartBefore: [3, 5, 9, 17] })
    expect(byId('compaction').assembly).toMatchObject({ compactionTrigger: '20' })
    expect(byId('multi-step').assembly).toMatchObject({ compactionTrigger: 'release' })
    expect(byId('attachments').workload).toMatchObject({
      rounds: expect.arrayContaining([expect.objectContaining({ attachBytes: 65536 })]),
    })
  })
})

describe('what taking an input comes to', () => {
  const opening = (round: number, commits: number) => ({
    round,
    cold: false,
    otherRequests: 0,
    reads: 380,
    commits,
    commitBytes: 60_000,
    requestBytes: 60_000 + 700 * round,
    byHandler: {},
  })
  const axis: Axis<ReturnType<typeof opening>> = {
    name: 'round',
    span: 'taking an input',
    from: 'the cost model of the test',
    scales: [2, 4],
    placeOf: one => one.round,
    gated: [],
    known: {},
  }
  const trajectory: Trajectory = {
    steps: [],
    openings: [],
    watchings: [],
    rounds: [],
    digests: [],
    kinds: {},
    entryKinds: [],
    wallMs: 1,
    processorMs: null,
    requests: 4,
  }

  it('reads the commits with the clock: the span starts at a moment of the client, and one more commit can fall in it', () => {
    const openings = [opening(1, 30), opening(2, 30), opening(3, 30), opening(4, 31)]
    const { readings } = takenMeasured(trajectory, openings, axis)
    const named = (name: string) => readings.find(reading => reading.name === name)
    expect(named('commits of taking an input at round 4')).toMatchObject({
      kind: 'clocked',
      value: 30.5,
    })
    expect(named('commit bytes of taking an input at round 4')).toMatchObject({ kind: 'clocked' })
    expect(named('reads of taking an input at round 4')).toMatchObject({ kind: 'clocked' })
    expect(named('request bytes after taking an input at round 4')).toMatchObject({
      kind: 'count',
    })
  })
})

describe('what opening an observation writes', () => {
  const watching = (commits: number) => ({
    round: 2,
    reads: 30,
    commits,
    commitBytes: commits * 100,
    requestBytes: 1,
    byHandler: {},
    byParticipant: {},
  })
  const steps = [step(1, 1)]

  it('passes when no observation committed anything: the expectation is nothing, from the cost model', () => {
    const judgedWrites = writesOf({ watchings: [watching(0), watching(0)], steps })
    expect(judgedWrites.gates).toMatchObject([
      { state: 'pass', from: expect.stringContaining('writes nothing') },
    ])
    expect(judgedWrites.controls.map(control => [control.expected, control.state])).toEqual([
      ['fail', 'fail'],
      ['pass', 'pass'],
    ])
    expect(outcomeOf(judgedWrites)).toBe('pass')
  })

  it('fails when the observations commit: the middle one did', () => {
    const judgedWrites = writesOf({ watchings: [watching(0), watching(1), watching(1)], steps })
    expect(judgedWrites.gates[0]).toMatchObject({
      state: 'fail',
      detail: expect.stringContaining('measured 1, expected 0'),
    })
  })

  it('does not fail on what the product committed on its own clock while one observation was open', () => {
    const judgedWrites = writesOf({
      watchings: [watching(0), watching(0), watching(5), watching(0), watching(0)],
      steps,
    })
    expect(judgedWrites.gates[0]).toMatchObject({ state: 'pass' })
    expect(outcomeOf(judgedWrites)).toBe('pass')
  })

  it('is blocked when no observation was opened', () => {
    expect(outcomeOf(writesOf({ watchings: [], steps }))).toBe('blocked')
  })
})
