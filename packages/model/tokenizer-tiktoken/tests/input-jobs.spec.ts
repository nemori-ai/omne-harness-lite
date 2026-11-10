import { describe, expect, it } from 'vitest'
import type { TokenizationSegment } from '@omne-harness/model-contract/provider'
import { jobsOf, retainedInputBytes } from '../src/input-jobs.ts'

const text = (value: string): TokenizationSegment => ({ kind: 'text', text: value })
const special = (name: string): TokenizationSegment => ({ kind: 'special-token', name })
const joined = (jobs: readonly (readonly TokenizationSegment[])[]) =>
  jobs
    .flat()
    .map(segment => (segment.kind === 'text' ? segment.text : `<${segment.name}>`))
    .join('')

describe('the jobs of one count input', () => {
  it('is one job of the same segments when the input fits', () => {
    const input = [text('abc'), special('eot'), text('def')]
    const jobs = [...jobsOf(input, 1024)]
    expect(jobs).toEqual([input])
    expect(jobs[0]?.[0]).toBe(input[0])
  })

  it('is one empty job for an empty input', () => {
    expect([...jobsOf([], 1024)]).toEqual([[]])
  })

  it('cuts a text that one job cannot hold, keeps every job within the bound and loses nothing', () => {
    const input = [text('a'.repeat(1000)), special('eot'), text('b'.repeat(300)), text('c')]
    for (const bound of [166, 200, 256, 1024, 4096]) {
      const jobs = [...jobsOf(input, bound)]
      for (const job of jobs) expect(retainedInputBytes(job)).toBeLessThanOrEqual(bound)
      expect(joined(jobs)).toBe(joined([input]))
    }
    expect([...jobsOf(input, 256)].length).toBeGreaterThan(20)
  })

  it('does not cut a surrogate pair', () => {
    const jobs = [...jobsOf([text('😀'.repeat(200))], 170)]
    expect(jobs.length).toBeGreaterThan(1)
    for (const segment of jobs.flat())
      expect(segment.kind === 'text' ? segment.text : '').toMatch(/^(?:😀)+$/u)
  })

  it('leaves a special token whole, in a job of its own when it does not fit with others', () => {
    const jobs = [...jobsOf([text('ab'), special('n'.repeat(500)), text('cd')], 256)]
    expect(jobs).toEqual([[text('ab')], [special('n'.repeat(500))], [text('cd')]])
  })

  it('counts two bytes for a code unit and the overhead of the job and of each segment', () => {
    expect(retainedInputBytes([])).toBe(32)
    expect(retainedInputBytes([text('abcd'), special('ab')])).toBe(32 + 128 + 8 + 128 + 4)
  })
})
