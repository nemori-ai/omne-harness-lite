import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { GOAL_SOURCES } from '@omne-harness/goal-session'
import { tenantCodec } from '@omne-harness/legal-identity'
import { sourceRequestIdentities } from '@omne-harness/session-contract'
import {
  firstRunIn,
  ownRound,
  refusedBy,
  standingOf,
  startInputOf,
} from '../../../src/rows/schedule-session/calls.ts'

const adopted = { owner: 'o', name: 'coding', revision: 'v7', digest: 'sha256:x' }
const work = (change: Record<string, unknown> = {}) =>
  ({
    run: { kind: 'none' },
    pending: [],
    backgroundPlaceholders: [],
    definition: { name: 'coding', adopted },
    lifecycle: 'dormant',
    ...change,
  }) as never as Parameters<typeof standingOf>[0]

describe('where the work of a session stands, as a Job reads it', () => {
  it('is quiet with no run going, no input waiting and no call in the background; it names the definition adopted', () => {
    expect(standingOf(work())).toEqual({
      usable: true,
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

describe('whether a session still takes work', () => {
  it.each([
    ['initializing', true],
    ['dormant', true],
    ['active', true],
    ['frozen', false],
    ['archived', false],
  ])('a session that is %s: %s', (lifecycle, usable) => {
    expect(standingOf(work({ lifecycle })).usable).toBe(usable)
  })
})

describe('the input a goal owes its session to start', () => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${'1'.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  const tenant = parsed.value
  it('is the input the adapter of goals derives for the same request, and another for another request or session', () => {
    const one = startInputOf(tenant, 'session-1' as never, 'start/1/1')
    expect(one).toBe(
      sourceRequestIdentities({
        tenant,
        source: GOAL_SOURCES.start,
        request: 'start/1/1',
        session: 'session-1' as never,
      }).input,
    )
    expect(startInputOf(tenant, 'session-1' as never, 'start/2/3')).not.toBe(one)
    expect(startInputOf(tenant, 'session-2' as never, 'start/1/1')).not.toBe(one)
  })
})

describe('whether a run is the own round of a Job', () => {
  it('is its own only when the first batch is the start reminder of its goal alone', () => {
    expect(ownRound(['in-start'], 'in-start')).toBe(true)
    expect(ownRound(['in-other'], 'in-start')).toBe(false)
    expect(ownRound(['in-start', 'in-other'], 'in-start')).toBe(false)
    expect(ownRound(['in-other', 'in-start'], 'in-start')).toBe(false)
    expect(ownRound([], 'in-start')).toBe(false)
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

describe('the first run a page of the history says began', () => {
  const LIMITS = {
    maxBytes: 1024,
    maxDepth: 4,
    maxItems: 16,
    maxMembers: 16,
    maxStringLength: 256,
    maxNumberLength: 16,
  }
  /** A payload as Session hands it over: the tree its history keeps, never a plain object. */
  const payload = (value: unknown) => {
    const read = readJsonText(JSON.stringify(value), LIMITS)
    if (read.kind !== 'ok') throw new Error(read.kind)
    return read.value
  }
  const entry = (kind: string, value: unknown) => ({ kind, payload: payload(value) })
  const started = (run: unknown) => entry('run.started', { order: 1, run })

  it('is the run of the first entry that begins one, whatever stands before it', () => {
    const entries = [entry('input.accepted', { run: 'no' }), started('r-1'), started('r-2')]
    expect(firstRunIn(entries)).toBe('r-1')
  })

  it('is none when no entry begins a run, or the one that does names none', () => {
    expect(firstRunIn([])).toBeNull()
    expect(firstRunIn([entry('input.accepted', { run: 'r-1' })])).toBeNull()
    expect(firstRunIn([entry('run.started', {}), started('r-2')])).toBeNull()
    expect(firstRunIn([started(7)])).toBeNull()
    expect(firstRunIn([started(true)])).toBeNull()
    expect(firstRunIn([entry('run.started', ['run', 'r-1'])])).toBeNull()
    expect(firstRunIn([entry('run.started', null)])).toBeNull()
  })
})
