import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  FactBatch,
  FactReceipt,
  ToolLiveExecution,
  ToolRecoveryBinding,
} from '@omne-harness/tool-contract'
import {
  createToolFactAcknowledgementGuard,
  createToolLedger,
  type ToolFactAcknowledgementGuard,
} from '@omne-harness/tool'
import { createMemoryToolClock, completedFinal } from '@omne-harness/tool-contract/testing'
import { admitCall, startHarness } from './start-values.ts'
import {
  callId,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  tenantB,
  type Block,
  type Principal,
} from './runtime-values.ts'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

/** A real started memory execution supplies facts and its idempotent ACK to the recovery route. */
async function fixture(options: { hold?: ReturnType<typeof deferred> } = {}) {
  let live: ToolLiveExecution<Block> | undefined
  let ackGuard: ToolFactAcknowledgementGuard<Principal> | undefined
  let recoveries = 0
  const recoveredStarts: FactBatch<Block>['start'][] = []
  let attempts = 0
  let confirmations = 0
  let loseReply = false
  let failure: 'throw' | 'unavailable' | 'malformed' | null = null
  const seen = new Set<string>()
  const confirmation = { ...evidence('confirmed'), owner: 'independent-confirmation-owner' }
  const acknowledgement = async (receipt: FactReceipt) => {
    attempts += 1
    if (failure === 'throw') throw new Error('secret-source-payload')
    if (failure === 'unavailable')
      return fail({
        kind: 'unavailable' as const,
        dependency: 'source',
        diagnostic: 'secret-source-payload',
      })
    if (failure === 'malformed') return succeed({ ...confirmation, revision: '' })
    if (live === undefined) throw new Error('not started')
    ok(await live.acknowledge(receipt))
    if (!seen.has(receipt.batch)) {
      seen.add(receipt.batch)
      confirmations += 1
    }
    if (loseReply) {
      loseReply = false
      throw new Error('secret-source-payload')
    }
    return succeed(confirmation)
  }
  const harness = startHarness({
    bindingPort: base => ({
      ...base,
      start: async (...args) => {
        const result = await base.start(...args)
        if ('ok' in result) live = result.ok
        return result
      },
    }),
    bindingsPort: bindings => {
      const paired = {
        ...bindings,
        recover: async (input: Parameters<typeof bindings.recover>[0]) => {
          recoveredStarts.push(input.start)
          recoveries += 1
          await options.hold?.promise
          const recovery: ToolRecoveryBinding<Block> = {
            acknowledge: acknowledgement,
            inspectStart: () =>
              Promise.resolve(succeed({ kind: 'unknown', diagnostic: 'live removed' })),
            inspectSuspension: () => Promise.reject(new Error('unused')),
            stop: () => Promise.reject(new Error('unused')),
            inspectControl: () => Promise.reject(new Error('unused')),
          }
          return succeed(recovery)
        },
      }
      ackGuard = createToolFactAcknowledgementGuard(paired)
      return paired
    },
  })
  await admitCall(harness, 'ack')
  await harness.drive('ack')
  const access = { principal: principalA, tenant: tenantA, call: callId('ack') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null || live === undefined) throw new Error('not started')
  if (recovery.start.kind !== 'start') throw new Error('not an initial start')
  await harness.binding.controls.finish(recovery.start, completedFinal())
  const iterator = live
    .facts({ after: null, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  const next = await iterator.next()
  if (next.done) throw new Error('missing source batch')
  const batch = next.value
  if (ackGuard === undefined) throw new Error('no paired guard')
  const receipt = ok(await harness.commands.receiveFacts({ ...access, start: batch.start, batch }))
  await iterator.return?.()
  const input = {
    ...access,
    operation: operationId('ack-operation'),
    receipt,
    sourceReceipt: confirmation,
  }
  const records = async () => {
    const read = await harness.memory.read({ kind: 'call', tenant: tenantA, call: access.call })
    if (read.kind !== 'complete') throw new Error('unreadable')
    return read.records
  }
  return {
    harness,
    access,
    input,
    batch,
    confirmation,
    records,
    ackGuard,
    recoveredStarts,
    recoveries: () => recoveries,
    attempts: () => attempts,
    confirmations: () => confirmations,
    loseReply: () => {
      loseReply = true
    },
    fail: (value: typeof failure) => {
      failure = value
    },
  }
}

async function pending(f: Awaited<ReturnType<typeof fixture>>) {
  const recovery = ok(await f.harness.commands.loadRecovery(f.access))
  return {
    pending: recovery.streams[0]?.pendingAcknowledgements,
    tasks: recovery.tasks.filter(task => task.kind === 'fact-ack'),
  }
}

describe('trusted source fact acknowledgement', () => {
  it('uses the original recovery route and atomically saves confirmation, operation and duty removal', async () => {
    const f = await fixture()
    const before = f.harness.memory.commits
    const progress = ok(await f.harness.commands.recordFactAcknowledgement(f.input))
    expect(progress.pendingAcknowledgements).toEqual([])
    expect(f.harness.memory.commits).toBe(before + 1)
    const records = await f.records()
    expect(records.find(record => record.kind === 'fact-batch')).toMatchObject({
      batch: { acknowledgement: { kind: 'confirmed', sourceReceipt: f.confirmation } },
    })
    expect(
      records.find(
        record => record.kind === 'operation' && record.operation.operation === f.input.operation,
      ),
    ).toMatchObject({ operation: { receipt: { kind: 'fact-acknowledgement', progress } } })
    expect(await pending(f)).toEqual({ pending: [], tasks: [] })
    expect(f.confirmations()).toBe(1)
    if (f.batch.start.kind !== 'start') throw new Error('not initial')
    expect(f.harness.binding.controls.pendingAcknowledgements(f.batch.start)).toBe(0)
    expect(f.recoveries()).toBe(1)
    expect(f.recoveredStarts).toEqual([f.batch.start])
    const rebuilt = createToolLedger(
      f.harness.memory,
      guards(),
      createMemoryToolClock(),
      configurationOf({}),
    )
    expect(ok(await rebuilt.commands.recordFactAcknowledgement(f.input))).toEqual(progress)
    expect(f.recoveries()).toBe(1)
    expect(
      await rebuilt.commands.recordFactAcknowledgement({ ...f.input, principal: principalB }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(ok(await rebuilt.reads.operation(f.input))).toMatchObject({ kind: 'committed' })
    const recovery = ok(await rebuilt.commands.loadRecovery(f.access))
    const settle = recovery.tasks.find(task => task.kind === 'settle')
    if (settle?.kind !== 'settle') throw new Error('missing saved final')
    expect(ok(await rebuilt.facts.read({ ...f.access, basis: settle.basis })).fact).toEqual(
      f.batch.events[0]?.fact,
    )

    expect(
      ok(
        await f.harness.commands.receiveFacts({
          ...f.access,
          start: f.batch.start,
          batch: f.batch,
        }),
      ),
    ).toEqual(f.input.receipt)
    expect(await pending(f)).toEqual({ pending: [], tasks: [] })
  })

  it.each(['owner', 'record', 'revision', 'digest'] as const)(
    'rejects forged confirmation %s against real source evidence',
    async field => {
      const f = await fixture()
      const reply = await f.harness.commands.recordFactAcknowledgement({
        ...f.input,
        sourceReceipt: { ...f.confirmation, [field]: 'forged' },
      })
      expect(reply).toMatchObject({ failure: { kind: 'invalid', field: 'sourceReceipt' } })
      expect((await pending(f)).tasks).toHaveLength(1)
      expect((await pending(f)).pending).toEqual([f.input.receipt])
      expect(f.recoveries()).toBe(1)
    },
  )

  it('rejects unknown batches, forged custody, wrong cursor/start and foreign qualification before recovery', async () => {
    const f = await fixture()
    for (const receipt of [
      { ...f.input.receipt, batch: 'unknown' },
      { ...f.input.receipt, start: operationId('other-start') },
      { ...f.input.receipt, cursor: 'wrong' },
      { ...f.input.receipt, custody: { ...f.input.receipt.custody, digest: 'forged' } },
    ])
      expect(
        await f.harness.commands.recordFactAcknowledgement({ ...f.input, receipt }),
      ).toHaveProperty('failure.kind', 'invalid')
    expect(
      await f.harness.commands.recordFactAcknowledgement({ ...f.input, principal: principalB }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(
      await f.harness.commands.recordFactAcknowledgement({ ...f.input, tenant: tenantB }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(f.recoveries()).toBe(0)
    expect((await pending(f)).tasks).toHaveLength(1)
  })

  it.each(['throw', 'unavailable', 'malformed'] as const)(
    'retains responsibility and redacts a %s source response',
    async failure => {
      const f = await fixture()
      f.fail(failure)
      const reply = await f.harness.commands.recordFactAcknowledgement(f.input)
      expect(reply).toHaveProperty('failure.kind', 'unavailable')
      expect(JSON.stringify(reply)).not.toContain('secret-source-payload')
      expect((await pending(f)).pending).toEqual([f.input.receipt])
      f.fail(null)
      expect(
        ok(await f.harness.commands.recordFactAcknowledgement(f.input)).pendingAcknowledgements,
      ).toEqual([])
    },
  )

  it('retains the duty when the injected confirmation guard itself throws', async () => {
    const f = await fixture()
    const ledger = createToolLedger(
      f.harness.memory,
      {
        ...guards(),
        factAcknowledgements: {
          verify: () => {
            throw new Error('secret-guard-payload')
          },
        },
      },
      createMemoryToolClock(),
      configurationOf({}),
    )
    const failed = await ledger.commands.recordFactAcknowledgement(f.input)
    expect(failed).toHaveProperty('failure.kind', 'unavailable')
    expect(JSON.stringify(failed)).not.toContain('secret-guard-payload')
    expect((await pending(f)).pending).toEqual([f.input.receipt])
    expect(f.recoveries()).toBe(0)
    expect(
      ok(await f.harness.commands.recordFactAcknowledgement(f.input)).pendingAcknowledgements,
    ).toEqual([])
  })

  it('recovers a lost source ACK response without releasing source responsibility twice', async () => {
    const f = await fixture()
    f.loseReply()
    expect(await f.harness.commands.recordFactAcknowledgement(f.input)).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    expect((await pending(f)).pending).toEqual([f.input.receipt])
    expect(
      ok(await f.harness.commands.recordFactAcknowledgement(f.input)).pendingAcknowledgements,
    ).toEqual([])
    expect(f.attempts()).toBe(2)
    expect(f.confirmations()).toBe(1)
  })

  it.each(['unknown-applied', 'unknown-dropped', 'unknown-delayed', 'throw-applied'] as const)(
    'retries original operation after %s without losing original duty',
    async fault => {
      const f = await fixture()
      f.harness.memory.injectCommit(fault)
      expect(await f.harness.commands.recordFactAcknowledgement(f.input)).toEqual({
        failure: { kind: 'commit-unknown', operation: f.input.operation },
      })
      if (fault === 'unknown-dropped' || fault === 'unknown-delayed')
        expect((await pending(f)).pending).toEqual([f.input.receipt])
      else expect((await pending(f)).pending).toEqual([])
      if (fault === 'unknown-delayed')
        expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'committed' }])
      const result = ok(await f.harness.commands.recordFactAcknowledgement(f.input))
      expect(result.pendingAcknowledgements).toEqual([])
      expect(await pending(f)).toEqual({ pending: [], tasks: [] })
      expect(f.confirmations()).toBe(1)
      expect(ok(await f.harness.ledger.reads.operation(f.input))).toMatchObject({
        kind: 'committed',
      })
    },
  )

  it('holds the P01 fence across source verification and permits a fresh original submission', async () => {
    const hold = deferred()
    const f = await fixture({ hold })
    const inFlight = f.harness.commands.recordFactAcknowledgement(f.input)
    await expect.poll(f.recoveries).toBe(1)
    expect(ok(await f.harness.ledger.reads.operation(f.input))).toEqual({ kind: 'not-committed' })
    hold.resolve()
    expect(await inFlight).toHaveProperty('failure.kind', 'unavailable')
    expect((await pending(f)).pending).toEqual([f.input.receipt])
    expect(
      ok(await f.harness.commands.recordFactAcknowledgement(f.input)).pendingAcknowledgements,
    ).toEqual([])
    expect(f.confirmations()).toBe(1)
  })

  it('excludes a delayed unknown commit after a negative query, then retries the same source receipt', async () => {
    const f = await fixture()
    f.harness.memory.injectCommit('unknown-delayed')
    expect(await f.harness.commands.recordFactAcknowledgement(f.input)).toHaveProperty(
      'failure.kind',
      'commit-unknown',
    )
    expect(ok(await f.harness.ledger.reads.operation(f.input))).toEqual({ kind: 'not-committed' })
    expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
    expect((await pending(f)).pending).toEqual([f.input.receipt])
    expect(
      ok(await f.harness.commands.recordFactAcknowledgement(f.input)).pendingAcknowledgements,
    ).toEqual([])
    expect(f.confirmations()).toBe(1)
  })

  it('fixes receipt, operation and tenant before asynchronous access qualification', async () => {
    const f = await fixture()
    const hold = deferred()
    let entered = false
    const originalGuards = guards()
    const ledger = createToolLedger(
      f.harness.memory,
      {
        ...originalGuards,
        factAcknowledgements: f.ackGuard,
        access: {
          qualify: async input => {
            expect(input.tenant).toBe(f.access.tenant)
            expect(input.principal).toBe(principalA)
            entered = true
            await hold.promise
            return originalGuards.access.qualify(input)
          },
        },
      },
      createMemoryToolClock(),
      configurationOf({}),
    )
    const input = {
      ...f.input,
      receipt: { ...f.input.receipt },
      sourceReceipt: { ...f.input.sourceReceipt },
    }
    const original = {
      ...input,
      receipt: structuredClone(input.receipt),
      sourceReceipt: structuredClone(input.sourceReceipt),
    }
    const inFlight = ledger.commands.recordFactAcknowledgement(input)
    expect(entered).toBe(true)
    input.receipt.cursor = 'mutated'
    input.sourceReceipt.record = 'mutated'
    input.operation = operationId('mutated')
    input.tenant = tenantB
    hold.resolve()
    expect(ok(await inFlight).pendingAcknowledgements).toEqual([])
    expect(
      ok(await ledger.commands.recordFactAcknowledgement(original)).pendingAcknowledgements,
    ).toEqual([])
    expect(f.recoveries()).toBe(1)
  })

  it('rejects malformed receipt data before any external confirmation', async () => {
    const f = await fixture()
    for (const receipt of [
      { ...f.input.receipt, extra: true },
      { ...f.input.receipt, custody: { ...f.input.receipt.custody, extra: true } },
      {
        ...f.input.receipt,
        get cursor(): string {
          throw new Error('secret')
        },
      },
    ]) {
      expect(
        await f.harness.commands.recordFactAcknowledgement({ ...f.input, receipt }),
      ).toHaveProperty('failure.kind', 'invalid')
    }
    expect(f.recoveries()).toBe(0)
    expect((await pending(f)).pending).toEqual([f.input.receipt])
  })

  it('fixes caller data before awaited qualification and verification', async () => {
    const hold = deferred()
    const f = await fixture({ hold })
    const input = {
      ...f.input,
      receipt: { ...f.input.receipt, custody: { ...f.input.receipt.custody } },
      sourceReceipt: { ...f.input.sourceReceipt },
    }
    const original = structuredClone(input)
    const inFlight = f.harness.commands.recordFactAcknowledgement(input)
    await expect.poll(f.recoveries).toBe(1)
    input.receipt.custody.digest = 'changed'
    input.sourceReceipt.digest = 'changed'
    input.operation = operationId('changed')
    hold.resolve()
    const progress = ok(await inFlight)
    expect(progress.pendingAcknowledgements).toEqual([])
    expect(ok(await f.harness.commands.recordFactAcknowledgement(original))).toEqual(progress)
    expect(ok(await f.harness.ledger.reads.operation(original))).toMatchObject({
      kind: 'committed',
    })
  })

  it('rejects changed operation inputs, preserves historical progress and records a new duplicate operation', async () => {
    const f = await fixture()
    const original = ok(await f.harness.commands.recordFactAcknowledgement(f.input))
    expect(
      await f.harness.commands.recordFactAcknowledgement({
        ...f.input,
        sourceReceipt: evidence('other'),
      }),
    ).toEqual({ failure: { kind: 'conflict', operation: f.input.operation } })
    const next: FactBatch<Block> = {
      ...f.batch,
      batch: 'second',
      after: f.batch.cursor,
      cursor: 'new/cursor',
      events: [],
    }
    ok(await f.harness.commands.receiveFacts({ ...f.access, start: next.start, batch: next }))
    expect(ok(await f.harness.commands.recordFactAcknowledgement(f.input))).toEqual(original)
    const duplicate = { ...f.input, operation: operationId('ack-duplicate') }
    const progress = ok(await f.harness.commands.recordFactAcknowledgement(duplicate))
    expect(progress.cursor).toBe(next.cursor)
    expect(progress.pendingAcknowledgements).toHaveLength(1)
    expect(ok(await f.harness.ledger.reads.operation(duplicate))).toMatchObject({
      kind: 'committed',
    })
    expect(f.recoveries()).toBe(1)
    expect(f.confirmations()).toBe(1)
    const operation = (await f.records()).find(
      record => record.kind === 'operation' && record.operation.operation === duplicate.operation,
    )
    expect(operation).toMatchObject({ operation: { receipt: { progress } } })
  })

  it('treats recovery-port failure as unavailable rather than forged', async () => {
    const f = await fixture()
    const guard = createToolFactAcknowledgementGuard<unknown, Block, unknown>({
      recover: () =>
        Promise.resolve(fail({ kind: 'unavailable', dependency: 'source', diagnostic: 'secret' })),
    })
    expect(
      await guard.verify({ ...f.access, start: f.batch.start, source: f.batch.source, ...f.input }),
    ).toHaveProperty('kind', 'unavailable')
  })
})

describe('confirmed batch evidence is immutable', () => {
  it.each(['owner', 'record', 'revision', 'digest'] as const)(
    'rejects a new operation replacing confirmed sourceReceipt %s',
    async field => {
      const f = await fixture()
      ok(await f.harness.commands.recordFactAcknowledgement(f.input))
      const before = await f.records()
      const commits = f.harness.memory.commits
      const recoveries = f.recoveries()
      const replacement = {
        ...f.input,
        operation: operationId('new-confirmation'),
        sourceReceipt: { ...f.confirmation, [field]: 'changed' },
      }
      expect(await f.harness.commands.recordFactAcknowledgement(replacement)).toMatchObject({
        failure: { kind: 'invalid', field: 'sourceReceipt' },
      })
      expect(await f.records()).toEqual(before)
      expect(f.harness.memory.commits).toBe(commits)
      expect(f.recoveries()).toBe(recoveries)
      expect(await pending(f)).toEqual({ pending: [], tasks: [] })
      const original = { ...replacement, sourceReceipt: f.confirmation }
      expect(
        ok(await f.harness.commands.recordFactAcknowledgement(original)).pendingAcknowledgements,
      ).toEqual([])
      expect(ok(await f.harness.ledger.reads.operation(original))).toMatchObject({
        kind: 'committed',
      })
    },
  )
})
