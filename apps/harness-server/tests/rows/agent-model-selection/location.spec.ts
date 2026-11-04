// G-SELECT: the default session binding of the `agent-model-selection` row. A `select` call names
// an execution and no session; the row finds the session through the execution index of the tenant
// (the trusted `storage` and `tenantDomainLookup`) and the Session snapshot, then reads the
// selection that this session saved. These tests run the row with its own default binding in a
// serve tree, with doubles for the index, the Session and the profiles (the real Session log
// storage and the real Session authorization are not covered here).
import type { Failure } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, test } from 'vitest'
import {
  EXECUTION,
  INDEX,
  OTHER_TENANT_TEXT,
  RUN,
  SAVED_SOURCE,
  SESSION,
  TENANT_TEXT,
  activeRun,
  failureOf,
  otherAccess,
  profileOf,
  resolvedOf,
  savedSelection,
  selectInput,
  sessionAccess,
  snapshotWith,
  withLiveRow,
  type TreeOptions,
} from './support.ts'

const ROUTE = 'official-fast'
const OTHER_ROUTE = 'official-deep'

/** The default binding, a Session that saved `ROUTE` for `SESSION` and the two profiles. */
const unindexed: TreeOptions = {
  bindings: {},
  session: access =>
    access.session === SESSION
      ? succeed(savedSelection(ROUTE))
      : succeed(savedSelection(OTHER_ROUTE)),
  profiles: {
    [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))),
    [OTHER_ROUTE]: succeed(resolvedOf(profileOf(OTHER_ROUTE))),
  },
}
/** The same over the index doubles. */
const located: TreeOptions = { ...unindexed, index: {} }

const withExecution = (execution: string) => ({
  ...selectInput,
  advance: { ...selectInput.advance, execution: execution as never },
})

/** One call of the row with `options`; it must settle within `ms`, or the test fails. */
async function callOnce(options: TreeOptions, input = selectInput, ms = 2000) {
  return withLiveRow(options, async live => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      live.select(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`select did not settle in ${ms} ms`)), ms)
      }),
    ]).finally(() => clearTimeout(timer))
    return {
      outcome,
      reads: live.session.reads,
      works: live.session.works,
      index: live.index.reads,
      asked: live.profiles.resolves,
    }
  })
}

const failureFrom = (value: { outcome: Parameters<typeof failureOf>[0] }): Failure => {
  const failure = failureOf(value.outcome)
  if (failure === undefined) throw new Error('expected a failure')
  return failure
}

describe('a located execution', () => {
  test('the selection of the session of the execution is read back', async () => {
    const { value } = await callOnce(located)
    if ('failure' in value.outcome)
      throw new Error(`unexpected failure: ${JSON.stringify(value.outcome.failure)}`)
    expect(value.outcome.ok.recipient.route).toBe(ROUTE)
    expect(value.outcome.ok.evidence).toEqual(SAVED_SOURCE)
  })

  test('the index is asked for the tenant and the execution of the call, in the tenant domain', async () => {
    const { value } = await callOnce(located)
    expect(value.index).toEqual([
      { domain: 'domain-a', input: { tenant: TENANT_TEXT, execution: EXECUTION } },
    ])
  })

  test('the snapshot and the selection are read as a maintainer with the principal of the call', async () => {
    const { value } = await callOnce(located)
    const expected = {
      caller: 'maintainer',
      access: {
        principal: sessionAccess.principal,
        tenant: sessionAccess.tenant,
        session: SESSION,
      },
    }
    expect(value.works).toEqual([expected])
    expect(value.reads).toEqual([expected])
  })

  test('another execution of the tenant reads the selection of its own session', async () => {
    const { value } = await callOnce(
      {
        ...located,
        index: {
          rows: [
            ...INDEX,
            { tenant: TENANT_TEXT, execution: 'execution-2', session: 'session-2', run: 'run-2' },
          ],
        },
        work: access => succeed(snapshotWith(activeRun('run-2', 'execution-2'), access.session)),
      },
      withExecution('execution-2'),
    )
    expect('ok' in value.outcome && value.outcome.ok.recipient.route).toBe(OTHER_ROUTE)
    expect(value.reads.map(read => read.access.session)).toEqual(['session-2'])
  })
})

describe('an execution that is not located', () => {
  test('an execution not in the index is unavailable, with a diagnostic, before any Session read', async () => {
    const { value } = await callOnce(located, withExecution('execution-unknown'))
    expect(failureFrom(value)).toEqual({
      kind: 'unavailable',
      owner: 'agent-model-selection',
      diagnostic: 'the execution is not in the execution index of the tenant',
    })
    expect(value.works).toEqual([])
    expect(value.reads).toEqual([])
    expect(value.asked).toEqual([])
  })

  test.each([
    [
      'an unreadable index',
      {
        read: () =>
          ({
            kind: 'unavailable',
            requestKey: 'k',
            reason: 'read_timeout',
            diagnostic: {},
          }) as never,
      },
      'the execution index is not readable (read_timeout)',
    ],
    [
      'a malformed index row',
      { read: () => ({ kind: 'read', requestKey: 'k', output: { session: 1 } }) as never },
      'the execution index row is malformed',
    ],
    [
      'a tenant without a transaction domain',
      { lookup: () => ({ kind: 'unregistered' }) as const },
      'the tenant has no transaction domain',
    ],
    [
      'an unreadable tenant directory',
      { lookup: () => ({ kind: 'unavailable', diagnostic: 'directory down' }) as const },
      'the tenant domain cannot be read (directory down)',
    ],
  ])('%s is unavailable at once, naming the cause', async (_name, index, diagnostic) => {
    const { value } = await callOnce({ ...located, index })
    expect(failureFrom(value)).toEqual({
      kind: 'unavailable',
      owner: 'agent-model-selection',
      diagnostic,
    })
    expect(value.reads).toEqual([])
  })

  test('without the trusted storage in the tree each call is unavailable and the row stays ACTIVE', async () => {
    const { value, run } = await callOnce(unindexed)
    expect(run.state('agent-model-selection')).toMatchObject({ state: 'ACTIVE' })
    expect(failureFrom(value)).toMatchObject({
      kind: 'unavailable',
      owner: 'agent-model-selection',
    })
    expect(value.reads).toEqual([])
  })

  test('a Run that has ended is terminal, and its selection is not read', async () => {
    const { value } = await callOnce({
      ...located,
      work: () =>
        succeed(
          snapshotWith({
            kind: 'terminal',
            terminal: { run: RUN, outcome: 'completed', evidence: SAVED_SOURCE },
          } as never),
        ),
    })
    expect(failureFrom(value)).toEqual({ kind: 'terminal' })
    expect(value.reads).toEqual([])
  })

  test.each([
    ['holds another execution', activeRun(RUN, 'execution-other')],
    ['is another Run', activeRun('run-other', EXECUTION)],
    ['is none', { kind: 'none' } as never],
  ])(
    'a session whose Run %s refuses the call, and its selection is not read',
    async (_name, run) => {
      const { value } = await callOnce({ ...located, work: () => succeed(snapshotWith(run)) })
      expect(failureFrom(value)).toEqual({ kind: 'denied', action: 'select' })
      expect(value.reads).toEqual([])
    },
  )

  test('a snapshot that cannot be read is unavailable, naming the Session failure', async () => {
    const { value } = await callOnce({
      ...located,
      work: () => fail({ kind: 'quarantined', diagnostic: 'gap' }),
    })
    expect(failureFrom(value)).toEqual({
      kind: 'unavailable',
      owner: 'agent-model-selection',
      diagnostic: 'the Session snapshot cannot be read (quarantined)',
    })
  })
})

describe('across tenants', () => {
  test('an execution of another tenant is not found under the tenant of the call', async () => {
    // `execution-b` is in the index, under the other tenant only.
    const { value } = await callOnce(located, withExecution('execution-b'))
    expect(failureFrom(value)).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'the execution is not in the execution index of the tenant',
    })
    expect(value.index).toEqual([
      { domain: 'domain-a', input: { tenant: TENANT_TEXT, execution: 'execution-b' } },
    ])
    expect(value.works).toEqual([])
    expect(value.reads).toEqual([])
  })

  test('the other tenant does not find the execution of this tenant', async () => {
    const { value } = await callOnce(located, {
      ...selectInput,
      principal: otherAccess.principal,
      tenant: otherAccess.tenant,
    })
    expect(failureFrom(value)).toMatchObject({ kind: 'unavailable' })
    expect(value.index).toEqual([
      { domain: 'domain-b', input: { tenant: OTHER_TENANT_TEXT, execution: EXECUTION } },
    ])
    expect(value.reads).toEqual([])
  })

  test('a principal that the Session refuses for the session is denied, and no selection is read', async () => {
    const { value } = await callOnce(
      {
        ...located,
        work: access =>
          access.principal === sessionAccess.principal
            ? succeed(snapshotWith(activeRun()))
            : fail({ kind: 'denied', action: 'readWork' }),
      },
      { ...selectInput, principal: otherAccess.principal },
    )
    expect(failureFrom(value)).toEqual({ kind: 'denied', action: 'readWork' })
    expect(value.works.map(work => work.access.principal)).toEqual([otherAccess.principal])
    expect(value.reads).toEqual([])
  })
})
