import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { settlementOperation } from '../src/ledger-environment-release.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { decodeToolRevision } from '@omne-harness/tool-contract'
import type { ToolOutputCustody } from '@omne-harness/tool-contract'
import { auditQueues, admitCall } from './start-values.ts'
import { settlementFixture, refProcess } from './settlement-values.ts'
import {
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
    expect(await f.harness.released()).toContain(f.access.call)
    expect(await f.harness.queue()).not.toContainEqual(
      expect.objectContaining({ call: f.access.call }),
    )
    const recovery = await f.load()
    expect(recovery.rawOutputs).toEqual([f.final.raw])
    expect(recovery.result).toEqual(f.final.result)
    expect(recovery.tasks.map(task => task.kind).sort()).toEqual([
      'clock',
      'deliver',
      'fact-ack',
      'release',
    ])
    expect(recovery.streams[0]?.pendingAcknowledgements).toHaveLength(1)
    const first = f.commits[0]
    expect(first?.domain.kind).toBe('call')
    const puts = first?.writes.flatMap(write => (write.kind === 'put' ? [write.record] : [])) ?? []
    expect(puts.map(record => record.kind)).toEqual(
      expect.arrayContaining(['call', 'result', 'environment-release']),
    )
    expect(puts.filter(record => record.kind === 'task').map(record => record.task.kind)).toEqual(
      expect.arrayContaining(['deliver', 'queue', 'release', 'clock']),
    )
    const result = (await f.records()).find(record => record.kind === 'result')
    if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
      throw new Error('missing custody')
    expect(
      ok(
        await f.custody.retainResult({
          ...f.access,
          operation: result.result.custody.retainOperation,
          raw: f.final.raw,
          value: f.final.result,
        }),
      ),
    ).toEqual(result.result.custody.retained)
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

  it.each(['raw', 'value', 'terminal', 'effect', 'instance', 'generation'] as const)(
    'rejects a substituted %s before custody',
    async field => {
      const retain = vi.fn<ToolOutputCustody<Principal>['retainResult']>()
      const f = await settlementFixture({
        wrapCustody: base => ({ ...base, retainResult: retain }),
      })
      const changes = {
        raw: { ...f.input.raw, custody: evidence('forged-raw') },
        value: { ...f.input.value, content: [text('changed', 'forged')] },
        terminal: { kind: 'failed', cause: 'executor', diagnostic: 'forged' } as const,
        effect: { kind: 'not-started' } as const,
        instance: 'foreign-instance',
        generation: 'foreign-generation',
      }
      expect(
        failure(await f.ledger.commands.preserveResult({ ...f.input, [field]: changes[field] }))
          .kind,
      ).toBe('invalid')
      expect(retain).not.toHaveBeenCalled()
      expect((await f.load()).state.phase).toBe('running')
      expect(await f.harness.released()).not.toContain(f.access.call)
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
    const extra = { ...f.input, raw: { ...f.input.raw, extra: 'forged' } }
    expect(failure(await f.ledger.commands.preserveResult(extra)).kind).toBe('invalid')
    const raw = Object.defineProperty({}, 'codec', {
      get() {
        throw new Error('secret')
      },
      enumerable: true,
    })
    expect(
      failure(await f.ledger.commands.preserveResult({ ...f.input, raw: raw as never })).kind,
    ).toBe('invalid')
    expect(
      failure(
        await f.ledger.commands.preserveResult({
          ...f.input,
          value: { ...f.input.value, content: [text('changed', 'changed')] },
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
    expect(await f.harness.released()).not.toContain(f.access.call)
  })
})

describe('independent output custody and call CAS', () => {
  it.each(['unavailable', 'lost-answer', 'throw', 'not-saved'] as const)(
    'keeps settlement retryable after custody %s',
    async mode => {
      const requests: Parameters<ToolOutputCustody<Principal>['retainResult']>[0][] = []
      let first = true
      const f = await settlementFixture({
        wrapCustody: base => ({
          ...base,
          retainResult: async input => {
            requests.push(structuredClone(input))
            if (!first) return base.retainResult(input)
            first = false
            if (mode === 'unavailable')
              return fail({
                kind: 'unavailable',
                dependency: 'output-custody',
                diagnostic: 'retain unavailable',
              })
            if (mode === 'lost-answer') {
              ok(await base.retainResult(input))
              return fail({ kind: 'commit-unknown', operation: input.operation })
            }
            if (mode === 'throw') throw new Error('secret-password')
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
        }),
      })
      const refused = failure(await f.preserve())
      expect(refused).toMatchObject({ kind: 'unavailable', dependency: 'output-custody' })
      expect(JSON.stringify(refused)).not.toContain('secret-password')
      expect((await f.load()).state.phase).toBe('running')
      expect((await f.load()).tasks.map(task => task.kind)).toContain('settle')
      expect(await f.harness.released()).not.toContain(f.access.call)
      ok(await f.preserve())
      expect(requests).toHaveLength(2)
      expect(requests[0]).toEqual(requests[1])
    },
  )

  it.each(['unknown-applied', 'unknown-dropped', 'unknown-delayed'] as const)(
    'recovers the original call after %s',
    async fault => {
      const retain = vi.fn<ToolOutputCustody<Principal>['retainResult']>()
      const f = await settlementFixture({
        wrapCustody: base => ({
          ...base,
          retainResult: retain.mockImplementation(input => base.retainResult(input)),
        }),
      })
      f.harness.memory.injectCommit(fault)
      expect(failure(await f.preserve())).toEqual({
        kind: 'commit-unknown',
        operation: f.input.operation,
      })
      const uncertain = await f.load()
      expect(uncertain.state.phase).toBe(fault === 'unknown-applied' ? 'settled' : 'running')
      if (fault === 'unknown-applied')
        expect(uncertain.tasks.map(task => task.kind)).toEqual(
          expect.arrayContaining(['queue', 'release', 'deliver', 'clock', 'fact-ack']),
        )
      else expect((await f.records()).some(record => record.kind === 'result')).toBe(false)
      ok(await f.preserve())
      expect(retain).toHaveBeenCalledTimes(fault === 'unknown-applied' ? 1 : 2)
      expect(new Set(retain.mock.calls.map(([input]) => input.operation)).size).toBe(1)
      if (fault === 'unknown-delayed')
        expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
      expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(1)
      expect((await f.load()).tasks.some(task => task.kind === 'queue')).toBe(false)
    },
  )

  it('retains once across CAS conflicts and rejects a concurrent exclusion after external custody', async () => {
    const retain = vi.fn<ToolOutputCustody<Principal>['retainResult']>()
    const f = await settlementFixture({
      wrapCustody: base => ({
        ...base,
        retainResult: retain.mockImplementation(input => base.retainResult(input)),
      }),
    })
    f.harness.memory.injectCommit('conflict', 'conflict')
    ok(await f.preserve())
    expect(retain).toHaveBeenCalledTimes(1)
    const excluded = await settlementFixture({
      wrapCustody: base => ({
        ...base,
        retainResult: async input => {
          const result = await base.retainResult(input)
          expect(
            ok(
              await excluded.ledger.reads.operation({
                ...excluded.access,
                operation: excluded.input.operation,
              }),
            ).kind,
          ).toBe('not-committed')
          return result
        },
      }),
    })
    expect(failure(await excluded.preserve())).toMatchObject({
      kind: 'unavailable',
      dependency: 'ledger-store',
      diagnostic: expect.stringContaining('was excluded by a negative answer'),
    })
    expect((await excluded.load()).state.phase).toBe('running')
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
      expect((await f.load()).result).toEqual(f.final.result)
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
    expect(await f.harness.released()).toContain(f.access.call)
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
      const retain = vi.fn<ToolOutputCustody<Principal>['retainResult']>()
      const f = await settlementFixture({
        wrapCustody: base => ({
          ...base,
          retainResult: retain.mockImplementation(input => base.retainResult(input)),
        }),
      })
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
      expect(retain).toHaveBeenCalledTimes(1)
      expect((await f.records()).find(record => record.kind === 'result')).toEqual(result)
      expect((await f.load()).tasks.some(task => task.kind === 'queue')).toBe(false)
      expect(await f.harness.released()).toContain(f.access.call)
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
    expect(await f.harness.released()).toContain(f.access.call)
  })
})

it('permits cleanup only for complete history reference identity, including raw content', async () => {
  const external = refProcess('attachment')
  if (!('ref' in external.content)) throw new Error('fixture ref')
  const f = await settlementFixture({
    attachments: [external.content.ref],
    process: raw => [
      external,
      {
        ...refProcess('raw', '1'),
        content: {
          kind: 'file',
          id: text('raw-ref', '').id,
          visibility: { toHuman: true, toModel: false },
          ref: raw.content,
          transcript: null,
        },
      },
    ],
  })
  ok(await f.preserve())
  expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(true)
  expect((await f.load()).tasks.some(task => task.kind === 'settle')).toBe(false)
  const old = refProcess('uncovered-old')
  const latest = refProcess('covered-new', '1')
  if (!('ref' in latest.content)) throw new Error('fixture ref')
  const replaced = await settlementFixture({
    process: [old, latest],
    attachments: [latest.content.ref],
  })
  ok(await replaced.preserve())
  expect((await replaced.load()).tasks.some(task => task.kind === 'release')).toBe(false)
  const legacy = await settlementFixture({
    process: [
      {
        ...external,
        content: {
          kind: 'file',
          id: text('legacy', '').id,
          visibility: { toHuman: true, toModel: false },
          storage: external.content.ref.storage,
          key: external.content.ref.key,
          mediaType: external.content.ref.mediaType,
        },
      },
    ],
    attachments: [external.content.ref],
  })
  ok(await legacy.preserve())
  expect((await legacy.load()).tasks.some(task => task.kind === 'release')).toBe(false)
})

it('rechecks history after custody races with a new process fact', async () => {
  let inserted = false
  const f = await settlementFixture({
    wrapCustody: base => ({
      ...base,
      retainResult: async input => {
        const held = await base.retainResult(input)
        if (!inserted) {
          inserted = true
          const batch = {
            ...f.batch,
            batch: 'racing-process',
            after: f.batch.cursor,
            cursor: 'racing-cursor',
            events: [
              {
                event: 'racing-ref',
                fact: { kind: 'process' as const, blocks: [refProcess('not-retained')] },
              },
            ],
          }
          ok(await f.ledger.commands.receiveFacts({ ...f.access, start: f.batch.start, batch }))
        }
        return held
      },
    }),
  })
  expect(failure(await f.preserve()).kind).toBe('stale-revision')
  expect((await f.load()).state.phase).toBe('running')
  ok(
    await f.ledger.commands.preserveResult({
      ...f.input,
      expected: (await f.load()).state.revision,
    }),
  )
  expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(false)
  expect((await f.load()).tasks.find(task => task.kind === 'settle')).toMatchObject({
    state: 'blocked',
  })
})

it('uses one custody identity for competing public preserves, with expected before winner conflict', async () => {
  const inputs: Parameters<ToolOutputCustody<Principal>['retainResult']>[0][] = []
  let ready: (() => void) | undefined
  const gate = new Promise<void>(resolve => {
    ready = resolve
  })
  const f = await settlementFixture({
    wrapCustody: base => ({
      ...base,
      retainResult: async input => {
        inputs.push(structuredClone(input))
        if (inputs.length === 2) ready?.()
        await gate
        return base.retainResult(input)
      },
    }),
  })
  const other = { ...f.input, operation: operationId('another-preserve') }
  const outcomes = await Promise.all([f.preserve(), f.ledger.commands.preserveResult(other)])
  expect(outcomes.filter(outcome => 'ok' in outcome)).toHaveLength(1)
  expect(outcomes.filter(outcome => 'failure' in outcome).map(failure)).toMatchObject([
    { kind: 'stale-revision' },
  ])
  expect(inputs).toHaveLength(2)
  expect(inputs[0]).toEqual(inputs[1])
  const winner = (await f.records()).find(record => record.kind === 'result')
  if (winner?.kind !== 'result') throw new Error('missing winner')
  const loser = winner.result.settledBy === other.operation ? f.input : other
  expect(
    failure(
      await f.ledger.commands.preserveResult({
        ...loser,
        expected: (await f.load()).state.revision,
      }),
    ),
  ).toEqual({ kind: 'conflict', operation: winner.result.settledBy })
  expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(1)
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
  expect(await f.harness.released()).not.toContain(f.access.call)
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

it('does not treat a negative operation query as excluding already retained external bytes', async () => {
  const requests: Parameters<ToolOutputCustody<Principal>['retainResult']>[0][] = []
  const f = await settlementFixture({
    wrapCustody: base => ({
      ...base,
      retainResult: input => {
        requests.push(structuredClone(input))
        return base.retainResult(input)
      },
    }),
  })
  f.harness.memory.injectCommit('unknown-delayed')
  expect(failure(await f.preserve()).kind).toBe('commit-unknown')
  expect(
    ok(await f.ledger.reads.operation({ ...f.access, operation: f.input.operation })).kind,
  ).toBe('not-committed')
  expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
  ok(await f.preserve())
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(1)
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
      custody: f.custody,
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
