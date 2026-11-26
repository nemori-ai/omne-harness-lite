import { describe, expect, it } from 'vitest'
import { refusedBy, standingOf } from '../../../src/rows/schedule-session/calls.ts'

const adopted = { owner: 'o', name: 'coding', revision: 'v7', digest: 'sha256:x' }
const work = (change: Record<string, unknown> = {}) =>
  ({
    run: { kind: 'none' },
    pending: [],
    backgroundPlaceholders: [],
    definition: { name: 'coding', adopted },
    ...change,
  }) as never as Parameters<typeof standingOf>[0]

describe('where the work of a session stands, as a Job reads it', () => {
  it('is quiet with no run going, no input waiting and no call in the background; it names the definition adopted', () => {
    expect(standingOf(work())).toEqual({
      quiet: true,
      run: null,
      adopted: { name: 'coding', version: 'v7' },
    })
    expect(standingOf(work({ backgroundPlaceholders: undefined })).quiet).toBe(true)
    expect(standingOf(work({ run: { kind: 'terminal', terminal: {} } }))).toMatchObject({
      quiet: true,
      run: null,
    })
  })

  it.each([
    ['a run going', { run: { kind: 'active', run: 'run-1' } }, 'run-1'],
    ['an input waiting', { pending: ['in-1'] }, null],
    ['a call in the background', { backgroundPlaceholders: ['c-1'] }, null],
  ])('is not quiet with %s', (_, change, run) => {
    expect(standingOf(work(change))).toMatchObject({ quiet: false, run })
  })
})

describe('what a refused creation of the session means to the Job', () => {
  it.each(['commit-unknown', 'unavailable', 'quarantined'])(
    'is unknown when Session answers %s: the same creation is asked again',
    kind => {
      expect(refusedBy({ kind } as never)).toEqual({ kind: 'unknown' })
    },
  )

  it('can be tried again when Session denies it: the grant of schedule may be installed again', () => {
    expect(refusedBy({ kind: 'denied' } as never)).toEqual({
      kind: 'refused',
      recoverable: true,
      reason: 'denied',
    })
  })

  it('never stands when the creation is invalid, and says which field and why', () => {
    expect(
      refusedBy({ kind: 'invalid', field: 'modes', reason: 'does not match' } as never),
    ).toEqual({ kind: 'refused', recoverable: false, reason: 'invalid: modes: does not match' })
  })
})
