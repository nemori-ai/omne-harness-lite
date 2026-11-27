import { judged, outcomeOf } from '@omne-harness/perf-harness'
import { describe, expect, it } from 'vitest'
import { measuredOf } from '../src/suites/sessions.ts'
import type { Axis } from '../src/suites/scale.ts'
import { SERIES_ROUNDS, seriesGatesOf, seriesReadingsOf } from '../src/suites/series.ts'
import type { RoundEnd, Step, Trajectory } from '../src/trajectory.ts'

const MIB = 1024 * 1024

const rounds = (shape: (round: number) => Partial<RoundEnd> = () => ({})): RoundEnd[] =>
  Array.from({ length: SERIES_ROUNDS }, (_, index) => ({
    round: index + 1,
    wallMs: 4000 + (index % 3) * 20,
    residentBytes: 400 * MIB + (index % 5) * MIB,
    stateBytes: (index + 1) * 100_000,
    ...shape(index + 1),
  }))

const outcomeOfGate = (given: readonly RoundEnd[], name: string) =>
  judged(seriesGatesOf(given, {})).find(item => item.gate.name.startsWith(name))

describe('the gates over the rounds of a long session', () => {
  it('pass a session whose memory, state gained in a round and round time stay level', () => {
    const measured = seriesGatesOf(rounds(), {})
    expect(measured.gates.map(gate => gate.state)).toEqual(['pass', 'pass', 'pass'])
    expect(measured.controls).toHaveLength(6)
    expect(outcomeOf(measured)).toBe('pass')
  })

  it('fail the memory of a server that keeps a megabyte more every round', () => {
    const leaking = rounds(round => ({ residentBytes: 400 * MIB + round * MIB }))
    expect(outcomeOfGate(leaking, 'resident memory')?.outcome).toBe('fail')
    expect(outcomeOfGate(leaking, 'wall time of a round')?.outcome).toBe('pass')
  })

  it('fail the state when every round writes more than the round before it', () => {
    let total = 0
    const swelling = rounds(round => ({ stateBytes: (total += 100_000 + round * 2000) }))
    expect(outcomeOfGate(swelling, 'state bytes gained in a round')?.outcome).toBe('fail')
  })

  it('pass a state that grows by the same bytes every round: that is the log itself', () => {
    expect(outcomeOfGate(rounds(), 'state bytes gained in a round')?.outcome).toBe('pass')
  })

  it('fail the round time of a session that slows down with every round', () => {
    const slowing = rounds(round => ({ wallMs: 4000 + round * 30 }))
    expect(outcomeOfGate(slowing, 'wall time of a round')?.outcome).toBe('fail')
  })

  it('are blocked on a machine that does not tell the memory, and on fewer rounds than the judgment reads', () => {
    const blind = rounds(() => ({ residentBytes: null }))
    expect(outcomeOfGate(blind, 'resident memory')).toMatchObject({
      outcome: 'blocked',
      note: 'the machine does not tell it',
    })
    expect(seriesGatesOf(rounds().slice(0, 50), {}).gates.map(gate => gate.state)).toEqual([
      'blocked',
      'blocked',
      'blocked',
    ])
  })

  it('let a rise that was accepted stand', () => {
    const slowing = rounds(round => ({ wallMs: 4000 + round * 30 }))
    const known = { 'wall time of a round over the rounds': { card: '#1', reason: 'the next run' } }
    const gate = judged(seriesGatesOf(slowing, known)).find(item =>
      item.gate.name.startsWith('wall time'),
    )
    expect(gate?.outcome).toBe('pass')
    expect(gate?.note).toContain('known failure, accepted in #1')
  })

  it('give the middle and the last value of each series as readings', () => {
    const readings = seriesReadingsOf(rounds())
    expect(readings.map(reading => reading.name)).toEqual([
      'resident memory of the server at the end of a round, median',
      'resident memory of the server at the end of a round, last round',
      'state bytes gained in a round, median',
      'state bytes gained in a round, last round',
      'wall time of a round, median',
      'wall time of a round, last round',
    ])
    expect(readings[2]).toMatchObject({ value: 100_000, kind: 'clocked' })
    expect(seriesReadingsOf([])).toEqual([])
  })
})

describe('a suite that asks for the gates over the rounds', () => {
  const step = (round: number): Step => ({
    round,
    step: 1,
    reads: 900,
    commits: 81,
    commitBytes: 1_000_000,
    requestBytes: 60_000 + 700 * round,
    otherRequests: 0,
    byHandler: {},
    byParticipant: {},
  })
  const axis: Axis = {
    name: 'round',
    from: 'the cost model of the test',
    scales: [25, 50, 100, 200],
    placeOf: one => one.round,
    known: {},
  }
  const trajectory = (count: number): Trajectory => ({
    steps: Array.from({ length: count }, (_, index) => step(index + 1)),
    openings: [],
    watchings: [],
    rounds: rounds().slice(0, count),
    digests: [],
    kinds: {},
    entryKinds: [],
    wallMs: 1,
    processorMs: null,
    requests: count * 2,
  })

  it('holds them only on a run of exactly the rounds the judgment reads; a shorter run keeps the readings', () => {
    expect(measuredOf(trajectory(SERIES_ROUNDS), axis, {}).gates).toHaveLength(6)
    const short = measuredOf(trajectory(16), { ...axis, scales: [2, 4, 8, 16] }, {})
    expect(short.gates).toHaveLength(3)
    expect(short.readings.some(reading => reading.name.startsWith('wall time of a round'))).toBe(
      true,
    )
    expect(measuredOf(trajectory(SERIES_ROUNDS), axis).gates).toHaveLength(3)
  })
})
