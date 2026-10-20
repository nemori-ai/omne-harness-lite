import { expect, it } from 'vitest'
import { decodeResultVersion, decodeReadId, type ModelCommands } from '@omne-harness/model-contract'
import { runtimeFixture } from './runtime-fixture.ts'
import { settleRuntime } from './runtime-consumption-fixture.ts'
import { completionRecords } from './completion-records.ts'
import { callId, fixture, identity, op, proof, unbox } from './memory-fixture.ts'

type Commands = ModelCommands<ReturnType<typeof fixture>['principal']>
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
function completion(
  f: ReturnType<typeof runtimeFixture>,
  result: Parameters<Commands['handoff']>[0]['result'],
) {
  return {
    ...f.admit,
    operation: op('ack'),
    result,
    evidence: {
      kind: 'processed' as const,
      completion: proof(`${f.admit.call}/${result}`, 'consumer'),
    },
  }
}

for (const method of ['acquireRead', 'nextRead', 'endRead', 'handoff'] as const) {
  it(`snapshots declared ${method} fields before waiting while preserving opaque identity`, async () => {
    const gate = deferred()
    const entered = deferred()
    let observed: Parameters<Commands[typeof method]>[0] | undefined
    const delay =
      <A extends Parameters<Commands[typeof method]>[0], T>(run: (input: A) => Promise<T>) =>
      async (input: A) => {
        observed = input
        entered.resolve()
        await gate.promise
        return run(input)
      }
    const f = runtimeFixture({}, commands => ({
      ...commands,
      acquireRead: method === 'acquireRead' ? delay(commands.acquireRead) : commands.acquireRead,
      nextRead: method === 'nextRead' ? delay(commands.nextRead) : commands.nextRead,
      endRead: method === 'endRead' ? delay(commands.endRead) : commands.endRead,
      handoff: method === 'handoff' ? delay(commands.handoff) : commands.handoff,
    }))
    try {
      const settled = await settleRuntime(f)
      const principal = { ...f.principal, proof: () => true }
      const authorize = f.options.authority.authorize
      f.options.authority.authorize = input =>
        authorize({
          ...input,
          access: {
            ...input.access,
            principal: input.access.principal === principal ? f.principal : input.access.principal,
          },
        })
      const base = { ...f.admit, principal, operation: op('read'), result: settled.version }
      let read
      if (method === 'nextRead' || method === 'endRead') {
        const started = unbox(await f.provider.runtime.consumption.beginRead(base))
        if (started.kind !== 'started') throw new Error('missing read')
        read = started.read
      }
      const input = {
        ...completion(f, settled.version),
        principal,
        read: read ?? unbox(decodeReadId('mread_placeholder')),
        after: '2',
        extraCallback: () => true,
      }
      const consumption = f.provider.runtime.consumption
      const pending =
        method === 'acquireRead'
          ? consumption.beginRead(input)
          : method === 'handoff'
            ? consumption.acknowledge(input)
            : method === 'nextRead'
              ? consumption.readNext(input)
              : consumption.closeRead(input)
      await entered.promise
      Object.assign(input, {
        principal: { subject: 'trusted' as const },
        tenant: identity('6'),
        call: callId('changed'),
        operation: op('changed'),
        result: unbox(decodeResultVersion('mrver_changed')),
        after: '99',
        read: unbox(decodeReadId('mread_changed')),
      })
      Object.assign(input.evidence.completion, {
        owner: 'forged',
        record: 'forged',
        revision: '99',
        digest: 'forged',
      })
      gate.resolve()
      expect(await pending).toHaveProperty('ok')
      expect(observed?.principal).toBe(principal)
      expect(observed?.tenant).toBe(f.tenant)
      expect(observed?.call).toBe(f.admit.call)
      expect(observed).not.toHaveProperty('extraCallback')
      if (observed && 'evidence' in observed)
        expect(observed.evidence).toEqual(completion(f, settled.version).evidence)
    } finally {
      gate.resolve()
      await f.dispose()
    }
  })
}
for (const method of ['nextRead', 'handoff'] as const) {
  it(`rechecks current authority after a wait before real ${method}`, async () => {
    const gate = deferred()
    const entered = deferred()
    const delay =
      <A, T>(run: (input: A) => Promise<T>) =>
      async (input: A) => {
        entered.resolve()
        await gate.promise
        return run(input)
      }
    const f = runtimeFixture({}, commands => ({
      ...commands,
      nextRead: method === 'nextRead' ? delay(commands.nextRead) : commands.nextRead,
      handoff: method === 'handoff' ? delay(commands.handoff) : commands.handoff,
    }))
    try {
      const settled = await settleRuntime(f)
      const first = unbox(
        await f.provider.runtime.consumption.beginRead({
          ...f.admit,
          operation: op('read'),
          result: settled.version,
        }),
      )
      if (
        first.kind !== 'started' ||
        first.value.kind !== 'reading' ||
        first.value.page.next === null
      )
        throw new Error('missing page')
      const pending =
        method === 'nextRead'
          ? f.provider.runtime.consumption.readNext({
              ...f.admit,
              read: first.read,
              after: first.value.page.next,
            })
          : f.provider.runtime.consumption.acknowledge(completion(f, settled.version))
      await entered.promise
      f.denied.add(method === 'nextRead' ? 'content' : 'handoff')
      gate.resolve()
      expect(await pending).toMatchObject({ failure: { kind: 'denied' } })
      expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).state.custody.kind).toBe(
        'producer',
      )
    } finally {
      gate.resolve()
      await f.dispose()
    }
  })
}
for (const effect of ['applied', 'not-applied'] as const) {
  it(`recognizes the original ACK after ${effect} unknown, without implicit retries`, async () => {
    let calls = 0
    let inject = true
    const f = runtimeFixture({}, commands => ({
      ...commands,
      handoff: async input => {
        calls++
        if (inject) {
          inject = false
          f.controls.commands.injectUnknown({ ...input, method: 'handoff', effect })
        }
        return commands.handoff(input)
      },
    }))
    try {
      const settled = await settleRuntime(f)
      const input = completion(f, settled.version)
      const unknown = { failure: { kind: 'commit-unknown', operation: input.operation } }
      expect(await f.provider.runtime.consumption.acknowledge(input)).toEqual(unknown)
      expect(calls).toBe(1)
      expect(await f.provider.runtime.consumption.acknowledge(input)).toEqual(unknown)
      expect(calls).toBe(2)
      expect(
        await f.provider.runtime.consumption.acknowledge({
          ...input,
          result: unbox(decodeResultVersion('mrver_other')),
        }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
      f.controls.commands.reveal({
        ...input,
        result: effect === 'applied' ? 'committed' : 'not-committed',
      })
      const receipt = unbox(await f.provider.runtime.consumption.acknowledge(input))
      expect(receipt.custody.operation).toBe(input.operation)
      expect(await f.provider.runtime.consumption.acknowledge(input)).toEqual({ ok: receipt })
      f.denied.add('handoff')
      expect(await f.provider.runtime.consumption.acknowledge(input)).toMatchObject({
        failure: { kind: 'denied' },
      })
    } finally {
      await f.dispose()
    }
  })
}
it('validates completion record ownership, all evidence fields and the entire frozen consumer relationship', async () => {
  const records = completionRecords()
  const f = runtimeFixture({}, undefined, records.verify)
  try {
    const settled = await settleRuntime(f)
    const original = {
      tenant: f.tenant,
      call: f.admit.call,
      result: settled.version,
      consumer: f.admit.consumer,
      label: 'done',
      outcome: 'business result saved',
    }
    const genuine = records.finish(original)
    const forged = [
      { ...genuine, owner: 'other' },
      { ...genuine, revision: '2' },
      { ...genuine, digest: 'changed' },
      { ...genuine, record: 'absent' },
      records.finish({ ...original, call: callId('other') }),
      records.finish({ ...original, result: unbox(decodeResultVersion('mrver_other')) }),
      records.finish({ ...original, tenant: identity('6') }),
      records.finish({ ...original, consumer: { ...original.consumer, position: 'other' } }),
    ]
    for (const [index, evidence] of forged.entries()) {
      expect(
        await f.provider.runtime.consumption.acknowledge({
          ...completion(f, settled.version),
          operation: op(`forged-${index}`),
          evidence: { kind: 'processed', completion: evidence },
        }),
      ).toMatchObject({ failure: { kind: 'handoff-invalid' } })
      expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).state.custody.kind).toBe(
        'producer',
      )
    }
    const input = {
      ...completion(f, settled.version),
      evidence: { kind: 'processed' as const, completion: genuine },
    }
    expect(
      await f.provider.runtime.consumption.acknowledge({ ...input, tenant: identity('6') }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    f.denied.add('content')
    f.denied.add('control')
    const receipt = unbox(await f.provider.runtime.consumption.acknowledge(input))
    expect(receipt.custody.receipt).toEqual(genuine)
    expect(
      await f.provider.runtime.consumption.acknowledge({
        ...input,
        evidence: {
          kind: 'processed',
          completion: records.finish({ ...original, label: 'other' }),
        },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
  } finally {
    await f.dispose()
  }
})
it('protects live reads during cleanup, releases after close and preserves the confirmed receipt on failure', async () => {
  const f = runtimeFixture()
  try {
    const settled = await settleRuntime(f)
    const readInput = { ...f.admit, operation: op('read'), result: settled.version }
    const first = unbox(await f.provider.runtime.consumption.beginRead(readInput))
    if (first.kind !== 'started') throw new Error('missing read')
    expect(
      await f.provider.runtime.consumption.acknowledge({
        ...completion(f, settled.version),
        operation: readInput.operation,
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    const input = completion(f, settled.version)
    const receipt = unbox(await f.provider.runtime.consumption.acknowledge(input))
    const execution = unbox(await f.dependencies.commands.loadRecovery(f.admit)).execution
    if (!execution) throw new Error('missing execution')
    expect(
      unbox(
        await f.dependencies.commands.advanceCleanup({
          ...execution,
          operation: op('cleanup-open'),
        }),
      ),
    ).toMatchObject({ cleanup: 'blocked', diagnostic: 'active-read' })
    unbox(await f.provider.runtime.consumption.closeRead({ ...f.admit, read: first.read }))
    f.controls.commands.setCleanupFailure({ ...f.admit, diagnostic: 'fixture-blocked' })
    expect(
      unbox(
        await f.dependencies.commands.advanceCleanup({
          ...execution,
          operation: op('cleanup-failed'),
        }),
      ),
    ).toMatchObject({ cleanup: 'blocked', diagnostic: 'fixture-blocked' })
    expect(unbox(await f.provider.runtime.consumption.acknowledge(input)).custody.receipt).toEqual(
      receipt.custody.receipt,
    )
    f.controls.commands.setCleanupFailure({ ...f.admit, diagnostic: null })
    expect(
      unbox(
        await f.dependencies.commands.advanceCleanup({
          ...execution,
          operation: op('cleanup-release'),
        }),
      ),
    ).toMatchObject({ cleanup: 'released' })
    expect(await f.provider.runtime.consumption.beginRead(readInput)).toMatchObject({
      ok: { kind: 'started', value: { kind: 'ended', reason: 'closed' } },
    })
    expect(unbox(await f.provider.runtime.consumption.acknowledge(input)).custody).toMatchObject({
      operation: receipt.custody.operation,
      receipt: receipt.custody.receipt,
      cleanup: 'released',
    })
  } finally {
    await f.dispose()
  }
})
for (const mode of ['throw', 'reject', 'failure', 'refresh-throw', 'refresh-reject'] as const) {
  it(`keeps ${mode} distinct from ACK commit results`, async () => {
    let enabled = false
    let handoffs = 0
    const defect = new Error('synthetic-command-defect')
    const f = runtimeFixture({}, commands => ({
      ...commands,
      handoff(input) {
        handoffs++
        if (enabled && mode === 'throw') throw defect
        if (enabled && mode === 'reject') return Promise.reject(defect)
        if (enabled && mode === 'failure')
          return Promise.resolve({
            failure: { kind: 'unavailable', dependency: 'test-command', diagnostic: 'offline' },
          })
        return commands.handoff(input)
      },
      loadRecovery(input) {
        if (enabled && mode === 'refresh-throw') throw defect
        if (enabled && mode === 'refresh-reject') return Promise.reject(defect)
        return commands.loadRecovery(input)
      },
    }))
    try {
      const settled = await settleRuntime(f)
      enabled = true
      const pending = f.provider.runtime.consumption.acknowledge(completion(f, settled.version))
      if (mode === 'throw' || mode === 'reject') await expect(pending).rejects.toBe(defect)
      else if (mode === 'failure')
        expect(await pending).toEqual({
          failure: { kind: 'unavailable', dependency: 'test-command', diagnostic: 'offline' },
        })
      else expect(await pending).toHaveProperty('ok')
      expect(handoffs).toBe(1)
    } finally {
      enabled = false
      await f.dispose()
    }
  })
}
it('rejects retained statically without resource access, handoff or scheduling; reserved operation stays invalid', async () => {
  let accesses = 0
  const f = runtimeFixture({}, commands => ({
    ...commands,
    handoff: input => {
      accesses++
      return commands.handoff(input)
    },
    acquireRead: input => {
      accesses++
      return commands.acquireRead(input)
    },
  }))
  try {
    const result = (await settleRuntime(f)).version
    f.controls.instances.take()
    const baseline = f.controls.instances.take()
    const replies: Awaited<ReturnType<typeof f.provider.runtime.consumption.acknowledge>>[] = []
    for (const target of [
      f.admit,
      { ...f.admit, call: callId('absent') },
      { ...f.admit, tenant: identity('6') },
      { ...f.admit, principal: { subject: 'trusted' as const } },
    ])
      replies.push(
        await f.provider.runtime.consumption.acknowledge({
          ...target,
          result,
          operation: op('retained'),
          evidence: { kind: 'retained', custody: proof('retained') },
        }),
      )
    expect(replies.every(reply => JSON.stringify(reply) === JSON.stringify(replies[0]))).toBe(true)
    expect(replies[0]).toMatchObject({
      failure: {
        kind: 'unavailable',
        dependency: 'model-runtime',
        diagnostic: expect.stringContaining('stage=6.1'),
      },
    })
    expect(
      await f.provider.runtime.consumption.acknowledge({
        ...completion(f, result),
        operation: op('--reserved'),
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'operation' } })
    expect(accesses).toBe(0)
    expect(f.controls.instances.take()).toEqual(baseline)
  } finally {
    await f.dispose()
  }
})
