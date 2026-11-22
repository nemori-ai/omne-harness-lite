// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUsageReads, useLoaded } from '../src/view/reads.ts'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage, KNOWN_OCCUPANCY, type Answer } from './fixtures/fake-usage.ts'

beforeAll(stubDom)
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
  })

describe('one read in a view', () => {
  it('keeps the last answer while a refresh reads again, and takes the new one when it comes', async () => {
    let answer: Promise<Answer> | Answer = { outcome: 'succeeded', body: KNOWN_OCCUPANCY }
    const reads = createUsageReads(fakeUsage(() => answer as Answer).client, () => 'UTC')
    const { result } = renderHook(() =>
      useLoaded(reads, 'occupancy', () => reads.occupancy(TENANT, 'a'.repeat(64))),
    )
    await settle()
    expect(result.current.kind).toBe('ready')
    let arrive: (value: Answer) => void = () => {}
    answer = new Promise<Answer>(resolve => (arrive = resolve))
    act(() => reads.refresh())
    await settle()
    expect(result.current).toEqual({ kind: 'ready', value: KNOWN_OCCUPANCY })
    arrive({ outcome: 'denied' })
    await settle()
    expect(result.current.kind).toBe('refused')
  })

  it('reads a different question from nothing', async () => {
    const reads = createUsageReads(
      fakeUsage(() => ({ outcome: 'succeeded', body: KNOWN_OCCUPANCY })).client,
      () => 'UTC',
    )
    const { result, rerender } = renderHook(
      ({ key }) => useLoaded(reads, key, () => new Promise(() => {})),
      {
        initialProps: { key: 'first' },
      },
    )
    expect(result.current.kind).toBe('loading')
    rerender({ key: 'second' })
    expect(result.current.kind).toBe('loading')
  })
})
