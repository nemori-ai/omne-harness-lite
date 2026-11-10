import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { mintEvidence } from '../src/evidence.ts'
import { settlementOperation } from '../src/ledger-environment-release.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { auditQueues, admitCall } from './start-values.ts'
import { settlementFixture, refProcess } from './settlement-values.ts'
import {
  adoption,
  callId,
  evidence,
  guards,
  configurationOf,
  testSettlementPorts,
  failure,
  judged,
  ok,
  operationId,
  principalB,
  tenantB,
  text,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

describe('original execution settlement', () => {
  it('retains the actual original, commits all downstream duties, then releases the held slot', async () => {
    const f = await settlementFixture()
    await admitCall(f.harness, 'waiter')
    await f.harness.drive('waiter')
    expect((await f.harness.state('waiter')).phase).toBe('queued')
    const settled = judged(ok(await f.preserve()))
    expect(settled).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'completed' },
      effect: f.final.effect,
      execution: { kind: 'ended' },
      timing: { kind: 'unknown', diagnostic: 'execution-end-clock-marker-unavailable' },
    })
    expect(settled.timing).toMatchObject({ accumulatedMs: f.before.state.timing.accumulatedMs })
    expect(f.lateClockSamples).toEqual([])
    if (f.before.state.timing.kind !== 'running') throw new Error('fixture timing')
    expect(settled.timing).toHaveProperty('segment', f.before.state.timing.segment)
    expect(await f.harness.released(f.access.call)).toBe(true)
    expect(await f.harness.queue()).not.toContainEqual(
      expect.objectContaining({ call: f.access.call }),
    )
    const recovery = await f.load()
    expect(recovery.result).toMatchObject({
      version: settled.phase === 'settled' ? settled.result : null,
    })
    expect(recovery.tasks.map(task => task.kind).sort()).toEqual([
      'clock',
      'deliver',
      'fact-ack',
      'release',
    ])
    expect(recovery.streams[0]?.pendingAcknowledgements).toHaveLength(1)
    const first = f.commits.find(commit =>
      commit.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
    )
    expect(first?.domain.kind).toBe('call')
    const puts = first?.writes.flatMap(write => (write.kind === 'put' ? [write.record] : [])) ?? []
    expect(puts.map(record => record.kind)).toEqual(
      expect.arrayContaining(['call', 'result', 'environment-release']),
    )
    const release = puts.find(record => record.kind === 'environment-release')
    if (release?.kind !== 'environment-release') throw new Error('missing canonical release')
    expect(release.environmentRelease.progress).toMatchObject({ kind: 'pending' })
    expect(release.environmentRelease.progress).toHaveProperty('diagnostic', expect.any(String))
    expect(puts).toContainEqual({
      kind: 'task',
      task: {
        kind: 'release',
        operation: release.environmentRelease.release.operation,
        state: 'pending',
        diagnostic: null,
        release: release.environmentRelease.release,
      },
    })
    expect(puts.find(record => record.kind === 'result')).toMatchObject({
      kind: 'result',
      result: {
        custody: {
          kind: 'execution',
          cleanup: {
            kind: 'planned',
            operation: release.environmentRelease.release.operation,
          },
        },
      },
    })
    expect(puts.filter(record => record.kind === 'task').map(record => record.task.kind)).toEqual(
      expect.arrayContaining(['deliver', 'queue', 'release', 'clock']),
    )
    const result = (await f.records()).find(record => record.kind === 'result')
    if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
      throw new Error('missing custody')
    expect(release.environmentRelease.release.custody).toEqual(result.result.custody.materialized)
    if (settled.phase !== 'settled') throw new Error('fixture not settled')
    expect(
      ok(await f.ledger.reads.result({ ...f.access, result: settled.result, after: null })),
    ).toMatchObject({ terminal: f.final.terminal, effect: f.final.effect, value: f.final.result })
    await f.harness.drive('waiter')
    expect((await f.harness.state('waiter')).phase).toBe('running')
    const count = f.harness.memory.commits
    expect(ok(await f.preserve())).toEqual(settled)
    expect(f.harness.memory.commits).toBe(count)
    expect(
      failure(
        await f.ledger.commands.preserveResult({
          ...f.input,
          operation: operationId('competitor'),
          expected: recovery.state.revision,
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: f.input.operation })
    expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(1)
  })

  it.each(['basis', 'instance', 'generation'] as const)(
    'rejects a substituted %s before custody',
    async field => {
      const f = await settlementFixture()
      const put = vi.spyOn(f.bodies.store, 'put')
      const changes = {
        basis: evidence('foreign-final'),
        instance: 'foreign-instance',
        generation: 'foreign-generation',
      }
      expect(
        failure(await f.ledger.commands.preserveResult({ ...f.input, [field]: changes[field] }))
          .kind,
      ).toBe('invalid')
      expect(put).not.toHaveBeenCalled()
      expect((await f.load()).state.phase).toBe('running')
      expect(await f.harness.released(f.access.call)).toBe(false)
    },
  )

  it('keeps tenant qualification and immutable closed data checks on retries', async () => {
    const f = await settlementFixture()
    ok(await f.preserve())
    const denied = { ...f.input, principal: principalB }
    expect(failure(await f.ledger.commands.preserveResult(denied)).kind).toBe('denied')
    expect(
      failure(await f.ledger.commands.preserveResult({ ...f.input, tenant: tenantB })).kind,
    ).toBe('denied')
    const extra = { ...f.input, basis: { ...f.input.basis, extra: 'forged' } }
    expect(failure(await f.ledger.commands.preserveResult(extra)).kind).toBe('invalid')
    const basis = Object.defineProperty({}, 'record', {
      get() {
        throw new Error('secret')
      },
      enumerable: true,
    })
    expect(
      failure(await f.ledger.commands.preserveResult({ ...f.input, basis: basis as never })).kind,
    ).toBe('invalid')
    expect(
      failure(
        await f.ledger.commands.preserveResult({
          ...f.input,
          basis: evidence('changed-final'),
        }),
      ).kind,
    ).toBe('conflict')
  })

  it('requires saved final evidence, never logical state or arbitrary terminal data', async () => {
    const f = await settlementFixture()
    const store = f.harness.memory
    const current = await store.read({ kind: 'call', tenant: f.access.tenant, call: f.access.call })
    if (current.kind !== 'complete') throw new Error('fixture store')
    const tasks = current.records.filter(
      record => record.kind === 'task' && record.task.kind === 'settle',
    )
    await store.commit({
      domain: { kind: 'call', tenant: f.access.tenant, call: f.access.call },
      expected: current.revision,
      revision: ok(decodeToolRevision(`${BigInt(current.revision) + 1n}`)),
      writes: tasks.map(record => ({
        kind: 'delete',
        key: record.kind === 'task' ? `task:${record.task.kind}:${record.task.operation}` : '',
      })),
    })
    expect(failure(await f.preserve())).toMatchObject({
      kind: 'invalid',
      reason: 'saved-final-required',
    })
    expect(await f.harness.released(f.access.call)).toBe(false)
  })
})

describe('downstream custody closure', () => {
  it.each(['failed', 'interrupted'] as const)(
    'keeps abnormal %s facts and blocked cleanup even with empty history',
    async kind => {
      const terminal =
        kind === 'failed'
          ? ({ kind, cause: 'executor', diagnostic: 'failed' } as const)
          : ({ kind, cause: { kind: 'foreground-limit' } } as const)
      const f = await settlementFixture({ terminal })
      ok(await f.preserve())
      const recovery = await f.load()
      expect(recovery.tasks.map(task => task.kind)).toEqual(
        expect.arrayContaining(['facts', 'settle', 'fact-ack', 'clock']),
      )
      expect(recovery.tasks.find(task => task.kind === 'settle')).toMatchObject({
        state: 'blocked',
        diagnostic: 'non-completed-output-barrier-unconfirmed',
      })
      expect(
        f.commits.find(commit =>
          commit.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
        )?.writes,
      ).toContainEqual(
        expect.objectContaining({
          kind: 'put',
          record: expect.objectContaining({
            kind: 'result',
            result: expect.objectContaining({
              custody: expect.objectContaining({
                kind: 'execution',
                cleanup: {
                  kind: 'awaiting-independent-custody',
                  preparation: f.before.preparations[0]?.operation,
                  diagnostic: 'non-completed-output-barrier-unconfirmed',
                },
              }),
            }),
          }),
        }),
      )
      expect((await f.records()).some(record => record.kind === 'environment-release')).toBe(false)
      const later = {
        ...f.batch,
        batch: 'late',
        after: f.batch.cursor,
        cursor: 'late-cursor',
        events: [
          {
            event: 'late-process',
            fact: { kind: 'process' as const, blocks: [refProcess('late')] },
          },
        ],
      }
      ok(await f.ledger.commands.receiveFacts({ ...f.access, start: f.batch.start, batch: later }))
      expect((await f.resultPage()).value).toEqual(f.final.result)
      expect((await f.load()).tasks.filter(task => task.kind === 'fact-ack')).toHaveLength(2)
    },
  )

  it('checks all replaced references and never treats a legacy address as full custody', async () => {
    const f = await settlementFixture({ process: [refProcess('old'), refProcess('new', '1')] })
    ok(await f.preserve())
    expect((await f.load()).tasks.find(task => task.kind === 'settle')).toMatchObject({
      state: 'blocked',
      diagnostic: 'process-output-independent-custody-required',
    })
    expect((await f.records()).some(record => record.kind === 'environment-release')).toBe(false)
    expect(await f.harness.released(f.access.call)).toBe(true)
    const originalResult = f.commits
      .find(commit =>
        commit.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
      )
      ?.writes.find(write => write.kind === 'put' && write.record.kind === 'result')
    expect(originalResult).toMatchObject({
      kind: 'put',
      record: {
        kind: 'result',
        result: {
          custody: {
            cleanup: {
              kind: 'awaiting-independent-custody',
              preparation: f.before.preparations[0]?.operation,
              diagnostic: 'process-output-independent-custody-required',
            },
          },
        },
      },
    })
  })
})

describe('queue repair after committed settlement', () => {
  it.each([
    ['queue', 'unavailable'],
    ['queue', 'unknown-applied'],
    ['queue', 'unknown-dropped'],
    ['queue', 'unknown-delayed'],
    ['close', 'unknown-applied'],
    ['close', 'unknown-dropped'],
  ] as const)(
    'replays the original receipt through %s %s without retaining twice',
    async (stage, fault) => {
      const f = await settlementFixture()
      let injected = false
      f.interceptCommit(async input => {
        const closes =
          input.domain.kind === 'call' &&
          input.writes.some(write => write.kind === 'delete' && write.key.startsWith('task:queue:'))
        if (!injected && (stage === 'queue' ? input.domain.kind === 'queue' : closes)) {
          injected = true
          f.harness.memory.injectCommit(fault)
        }
        return f.harness.memory.commit(input)
      })
      expect(failure(await f.preserve()).kind).toBe(
        fault === 'unavailable' ? 'unavailable' : 'commit-unknown',
      )
      expect(
        ok(await f.ledger.reads.operation({ ...f.access, operation: f.input.operation })).kind,
      ).toBe('committed')
      expect((await f.load()).state.phase).toBe('settled')
      if (stage === 'queue')
        expect((await f.load()).tasks.some(task => task.kind === 'queue')).toBe(true)
      const result = (await f.records()).find(record => record.kind === 'result')
      ok(await f.preserve())
      expect((await f.records()).find(record => record.kind === 'result')).toEqual(result)
      expect((await f.load()).tasks.some(task => task.kind === 'queue')).toBe(false)
      expect(await f.harness.released(f.access.call)).toBe(true)
      if (fault === 'unknown-delayed')
        expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
    },
  )

  it('lets a waiting call repair the predecessor before the original operation closes its task', async () => {
    const f = await settlementFixture()
    let blocked = true
    f.interceptCommit(input =>
      blocked && input.domain.kind === 'queue'
        ? Promise.resolve({ kind: 'unavailable', diagnostic: 'queue currently unavailable' })
        : f.harness.memory.commit(input),
    )
    expect(failure(await f.preserve()).kind).toBe('unavailable')
    await admitCall(f.harness, 'repair-waiter')
    blocked = false
    await f.harness.drive('repair-waiter')
    expect((await f.harness.state('repair-waiter')).phase).toBe('running')
    ok(await f.preserve())
    expect((await f.load()).tasks.some(task => task.kind === 'queue')).toBe(false)
    expect(await f.harness.released(f.access.call)).toBe(true)
  })
})

it('does not release a logical ended state that lacks the original saved final proof', async () => {
  const f = await settlementFixture()
  const domain = { kind: 'call' as const, tenant: f.access.tenant, call: f.access.call }
  f.interceptCommit(input =>
    input.domain.kind === 'queue'
      ? Promise.resolve({ kind: 'unavailable', diagnostic: 'queue blocked' })
      : f.harness.memory.commit(input),
  )
  expect(failure(await f.preserve()).kind).toBe('unavailable')
  const read = await f.harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('fixture read')
  const call = read.records.find(record => record.kind === 'call')
  if (call?.kind !== 'call') throw new Error('fixture call')
  await f.harness.memory.commit({
    domain,
    expected: read.revision,
    revision: ok(decodeToolRevision(`${BigInt(read.revision) + 1n}`)),
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'call',
          call: {
            ...call.call,
            state: {
              ...call.call.state,
              execution: { kind: 'ended', evidence: evidence('arbitrary-terminal') },
            },
          },
        },
      },
    ],
  })
  await admitCall(f.harness, 'still-waiting')
  await f.harness.drive('still-waiting')
  expect(await f.harness.released(f.access.call)).toBe(false)
  expect((await f.harness.state('still-waiting')).phase).toBe('queued')
})

it('retains the background relation and closes only its known paused time', async () => {
  const f = await settlementFixture({ mode: 'background' })
  expect(f.before.state.timing.kind).toBe('paused')
  const state = judged(ok(await f.preserve()))
  expect(state).toMatchObject({
    phase: 'settled',
    relation: 'background',
    foreground: f.before.state.foreground,
    timing: { kind: 'closed', accumulatedMs: f.before.state.timing.accumulatedMs },
  })
  expect((await f.load()).tasks.some(task => task.kind === 'clock')).toBe(false)
  expect(f.lateClockSamples).toEqual([])
})

it('does not replace a previous operation receipt with the canonical release operation', async () => {
  const f = await settlementFixture()
  const operation = canonicalReleaseOperation(f)
  const receipt = f.before.streams[0]?.pendingAcknowledgements[0]
  if (receipt === undefined) throw new Error('fixture acknowledgement')
  const acknowledgementLedger = createToolLedger(
    f.harness.memory,
    {
      ...guards(),
      factAcknowledgements: { verify: () => Promise.resolve({ kind: 'trusted' }) },
    },
    createMemoryToolClock(),
    configurationOf({}),
    {
      content: null,
      releaseInspection: testSettlementPorts().releaseInspection,
    },
  )
  ok(
    await acknowledgementLedger.commands.recordFactAcknowledgement({
      ...f.access,
      operation,
      receipt,
      sourceReceipt: evidence('acknowledged-original-source'),
    }),
  )
  const previous = (await f.records()).find(
    record => record.kind === 'operation' && record.operation.operation === operation,
  )
  expect(previous).toMatchObject({
    kind: 'operation',
    operation: { receipt: { kind: 'fact-acknowledgement' } },
  })
  expect(
    failure(
      await f.ledger.commands.preserveResult({
        ...f.input,
        expected: (await f.load()).state.revision,
      }),
    ),
  ).toEqual({ kind: 'conflict', operation })
  expect(
    (await f.records()).find(
      record => record.kind === 'operation' && record.operation.operation === operation,
    ),
  ).toEqual(previous)
  expect((await f.load()).state.phase).toBe('running')
  expect((await f.load()).tasks.find(task => task.kind === 'settle')).toMatchObject({
    state: 'pending',
  })
  expect((await f.records()).some(record => record.kind === 'result')).toBe(false)
})

it('does not write preserve and canonical plan receipts under the same operation', async () => {
  const f = await settlementFixture()
  const operation = canonicalReleaseOperation(f)
  expect(failure(await f.ledger.commands.preserveResult({ ...f.input, operation }))).toEqual({
    kind: 'conflict',
    operation,
  })
  expect((await f.load()).state.phase).toBe('running')
  expect((await f.load()).tasks.find(task => task.kind === 'settle')).toMatchObject({
    state: 'pending',
  })
  expect(
    (await f.records()).some(
      record => record.kind === 'operation' && record.operation.operation === operation,
    ),
  ).toBe(false)
  expect((await f.records()).some(record => record.kind === 'result')).toBe(false)
  ok(await f.preserve())
})

it('excludes an in-flight canonical plan commit and allows a fresh preserve with the same identities', async () => {
  const f = await settlementFixture()
  const operation = canonicalReleaseOperation(f)
  const originalFences = (await f.records()).filter(record => record.kind === 'exclusion')
  let intercepted = false
  f.interceptCommit(async input => {
    const operations = input.writes.flatMap(write =>
      write.kind === 'put' && write.record.kind === 'operation'
        ? [write.record.operation.operation]
        : [],
    )
    if (!intercepted && operations.includes(operation)) {
      intercepted = true
      expect(operations).toEqual(expect.arrayContaining([f.input.operation, operation]))
      expect(ok(await f.ledger.reads.operation({ ...f.access, operation }))).toEqual({
        kind: 'not-committed',
      })
      const committed = await f.harness.memory.commit(input)
      expect(committed.kind).toBe('conflict')
      return committed
    }
    return f.harness.memory.commit(input)
  })
  expect(await f.preserve()).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'ledger-store',
      diagnostic: `operation ${operation} was excluded by a negative answer; resubmit with the same identity`,
    },
  })
  expect(intercepted).toBe(true)
  const excluded = await f.records()
  expect(excluded.some(record => record.kind === 'result')).toBe(false)
  expect(excluded.some(record => record.kind === 'environment-release')).toBe(false)
  expect(
    excluded.some(
      record =>
        record.kind === 'operation' &&
        [f.input.operation, operation].includes(record.operation.operation),
    ),
  ).toBe(false)
  expect((await f.load()).state).toEqual(f.before.state)
  expect((await f.load()).tasks).toEqual(f.before.tasks)
  expect(await f.harness.released(f.access.call)).toBe(false)
  expect(ok(await f.ledger.reads.operation({ ...f.access, operation: f.input.operation }))).toEqual(
    { kind: 'not-committed' },
  )

  const settled = ok(await f.preserve())
  const records = await f.records()
  expect(records.filter(record => record.kind === 'result')).toHaveLength(1)
  expect(records.filter(record => record.kind === 'environment-release')).toHaveLength(1)
  expect(records.filter(record => record.kind === 'exclusion')).toEqual(originalFences)
  expect((await f.load()).tasks.filter(task => task.kind === 'release')).toHaveLength(1)
  expect(await f.harness.released(f.access.call)).toBe(true)
  const receipts = records.filter(
    record =>
      record.kind === 'operation' &&
      [f.input.operation, operation].includes(record.operation.operation),
  )
  expect(receipts).toHaveLength(2)
  for (const identity of [f.input.operation, operation])
    expect(ok(await f.ledger.reads.operation({ ...f.access, operation: identity })).kind).toBe(
      'committed',
    )
  expect(ok(await f.preserve())).toEqual(settled)
  expect(
    (await f.records()).filter(
      record =>
        record.kind === 'operation' &&
        [f.input.operation, operation].includes(record.operation.operation),
    ),
  ).toEqual(receipts)
})

function canonicalReleaseOperation(f: Awaited<ReturnType<typeof settlementFixture>>) {
  const task = f.before.tasks.find(task => task.kind === 'settle')
  const preparation = f.before.preparations[0]
  if (task?.kind !== 'settle' || preparation === undefined)
    throw new Error('fixture final preparation')
  return settlementOperation('release-environment', {
    tenant: f.access.tenant,
    call: f.access.call,
    preparation: preparation.operation,
    final: task.basis,
  })
}

it('keeps the original unknown timing evidence through settlement', async () => {
  const f = await settlementFixture()
  const domain = { kind: 'call', tenant: f.access.tenant, call: f.access.call } as const
  const saved = await f.harness.memory.read(domain)
  if (saved.kind !== 'complete') throw new Error('fixture read')
  const record = saved.records.find(record => record.kind === 'call')
  if (record?.kind !== 'call' || record.call.state.timing.kind !== 'running')
    throw new Error('fixture running timing')
  const timing = {
    ...record.call.state.timing,
    kind: 'unknown',
    accumulatedMs: '37',
    diagnostic: 'original-clock-observation-unavailable',
  } as const
  const revision = ok(decodeToolRevision(String(BigInt(saved.revision) + 1n)))
  const { source: _source, ...previous } = record.call.state
  const body = { ...previous, revision, timing }
  const stateWithUnknownTiming = judged({
    ...body,
    source: mintEvidence('state', { tenant: f.access.tenant, call: f.access.call }, revision, body),
  })
  expect(
    await f.harness.memory.commit({
      domain,
      expected: saved.revision,
      revision,
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'call',
            call: { ...record.call, state: stateWithUnknownTiming },
          },
        },
      ],
    }),
  ).toEqual({ kind: 'committed' })
  expect((await f.load()).state.timing).toEqual(timing)
  const state = ok(
    await f.ledger.commands.preserveResult({
      ...f.input,
      expected: (await f.load()).state.revision,
    }),
  )
  expect(state.timing).toEqual(timing)
  expect((await f.load()).tasks).toContainEqual(
    expect.objectContaining({ kind: 'clock', state: 'blocked' }),
  )
  expect(await f.harness.released(f.access.call)).toBe(true)
  expect(f.lateClockSamples).toEqual([])
})

it('settles every final alias in the result commit and recalls later aliases without the envelope', async () => {
  const f = await settlementFixture()
  const alias = {
    ...f.batch,
    batch: 'alias-before',
    after: f.batch.cursor,
    cursor: 'alias-before/end',
    events: [{ event: 'alias-before', fact: f.pointer }],
  }
  ok(await f.ledger.commands.receiveFacts({ ...f.access, start: alias.start, batch: alias }))
  const state = ok(
    await f.ledger.commands.preserveResult({
      ...f.input,
      expected: (await f.load()).state.revision,
    }),
  )
  const commit = f.commits.find(input =>
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
  )
  const settledFacts = commit?.writes.flatMap(write =>
    write.kind === 'put' && write.record.kind === 'fact-event' ? [write.record.fact] : [],
  )
  expect(settledFacts).toHaveLength(2)
  expect(settledFacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'alias-before',
        fact: expect.objectContaining({ payload: expect.objectContaining({ kind: 'settled' }) }),
      }),
    ]),
  )
  for (const saved of settledFacts ?? []) {
    expect(
      ok(await f.ledger.facts.read({ ...f.access, basis: saved.evidence })).fact,
    ).toMatchObject({
      kind: 'settled-final',
      terminal: f.final.terminal,
      effect: f.final.effect,
      result: state.phase === 'settled' ? state.result : null,
    })
  }
  const late = {
    ...alias,
    batch: 'alias-after',
    after: alias.cursor,
    cursor: 'alias-after/end',
    events: [{ event: 'alias-after', fact: f.pointer }],
  }
  ok(await f.ledger.commands.receiveFacts({ ...f.access, start: late.start, batch: late }))
  const saved = (await f.records()).find(
    record => record.kind === 'fact-event' && record.fact.event === 'alias-after',
  )
  expect(saved).toMatchObject({ fact: { fact: { payload: { kind: 'settled' } } } })
})

it('uses the settled final when settlement overtakes an already prepared alias', async () => {
  let writes = 0
  let settle: (() => Promise<void>) | null = null
  const f = await settlementFixture({
    wrapAccess: base => ({
      qualify: async input => {
        if (settle !== null && input.action === 'write' && ++writes === 2) {
          const finish = settle
          settle = null
          await finish()
        }
        return base.qualify(input)
      },
    }),
  })
  settle = async () => {
    expect(ok(await f.preserve())).toHaveProperty('phase', 'settled')
  }
  const alias = {
    ...f.batch,
    batch: 'concurrent-alias',
    after: f.batch.cursor,
    cursor: 'concurrent-alias/end',
    events: [{ event: 'concurrent-alias', fact: f.pointer }],
  }
  ok(await f.ledger.commands.receiveFacts({ ...f.access, start: alias.start, batch: alias }))
  expect(settle).toBeNull()
  const saved = (await f.records()).find(
    record => record.kind === 'fact-event' && record.fact.event === 'concurrent-alias',
  )
  expect(saved).toMatchObject({ fact: { fact: { payload: { kind: 'settled' } } } })
  if (saved?.kind !== 'fact-event') throw new Error('missing alias')
  expect(
    ok(await f.ledger.facts.read({ ...f.access, basis: saved.fact.evidence })).fact,
  ).toMatchObject({
    kind: 'settled-final',
  })
})
