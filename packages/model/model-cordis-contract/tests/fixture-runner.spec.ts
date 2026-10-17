import { describe, expect, it } from 'vitest'
import { runFixtures, type Fixture } from './fixture-runner.ts'

// The runner is the gate for the fixture declarations. Each case breaks one declaration rule or one path and
// asserts that the report fails and says which.
const normal = { name: 'accepted call is observed', kind: 'normal' as const, run: () => {} }
const failure = {
  name: 'commit-unknown keeps the original identity',
  kind: 'failure' as const,
  decision: 'coordinator re-queries instead of admitting a new call',
  run: () => {},
}
const complete: Fixture = { role: 'independent-caller', paths: [normal, failure] }

describe('runFixtures', () => {
  it('passes a fixture with both paths and lists the path names it ran', async () => {
    const report = await runFixtures([complete], ['independent-caller'])
    expect(report.ok).toBe(true)
    expect(report.fixtures[0]?.paths.map(path => [path.name, path.kind, path.ok])).toEqual([
      ['accepted call is observed', 'normal', true],
      ['commit-unknown keeps the original identity', 'failure', true],
    ])
  })

  it('fails when a fixture declares no failure path, and does not run its other paths', async () => {
    let ran = false
    const fixture: Fixture = {
      role: 'context',
      paths: [{ ...normal, run: () => void (ran = true) }],
    }
    const report = await runFixtures([fixture], ['context'])
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['fixture context: no failure path declared'])
    expect(ran).toBe(false)
  })

  it('fails when a fixture declares no normal path', async () => {
    const report = await runFixtures([{ role: 'context', paths: [failure] }], [])
    expect(report.problems).toEqual(['fixture context: no normal path declared'])
  })

  it('fails when a failure path does not name the decision it changes', async () => {
    const vague = { ...failure, decision: '  ' }
    const report = await runFixtures([{ role: 'context', paths: [normal, vague] }], [])
    expect(report.problems).toEqual([
      `fixture context: failure path ${failure.name} names no coordination decision`,
    ])
  })

  it('fails when a required role has no fixture', async () => {
    const report = await runFixtures([complete], ['independent-caller', 'session-coordinator'])
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['fixture session-coordinator: required role has no fixture'])
  })

  it('fails when two paths of one fixture share a name', async () => {
    const report = await runFixtures([{ role: 'context', paths: [normal, normal, failure] }], [])
    expect(report.problems).toEqual([
      'fixture context: path name accepted call is observed is declared twice',
    ])
  })

  it('reports a path that throws, with its message, and keeps running the others', async () => {
    const broken = {
      ...normal,
      run: () => {
        throw new Error('observer was closed too early')
      },
    }
    const report = await runFixtures([{ role: 'context', paths: [broken, failure] }], [])
    expect(report.ok).toBe(false)
    expect(report.fixtures[0]?.paths.map(path => [path.ok, path.error])).toEqual([
      [false, 'observer was closed too early'],
      [true, undefined],
    ])
  })
})
