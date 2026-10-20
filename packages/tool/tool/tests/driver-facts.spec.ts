import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolResultVersion,
  decodeToolWaitId,
  readToolInvocationRef,
  type ToolLiveExecution,
  type ToolRecoveryBinding,
} from '@omne-harness/tool-contract'
import { completedFinal, createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { createToolLedger } from '@omne-harness/tool'
import {
  admitCall,
  startHarness,
  losingCommits,
  type StartOptions,
  type StartHarness,
} from './start-values.ts'
import {
  configurationOf,
  callId,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  request,
  tenantA,
  text,
  type Block,
} from './runtime-values.ts'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

function fixture(
  options: {
    returns?: ReturnType<typeof deferred<void>>
    channel?: 'end' | 'throw' | 'after-batch' | 'unsupported' | 'invalid'
    commands?: StartOptions['commands']
    store?: StartOptions['store']
  } = {},
) {
  const signals = new Map<string, AbortSignal>()
  const lives = new Map<string, ToolLiveExecution<Block>>()
  const stats = {
    readers: 0,
    maxReaders: 0,
    next: 0,
    maxNext: 0,
    batches: 0,
    returns: 0,
    acknowledgements: 0,
    recoveries: 0,
    cursors: [] as (string | null)[],
  }
  let settledInspection = false
  let ackFailure: 'unavailable' | 'throw' | null = null
  let loseAck = false
  let sourceHold: ReturnType<typeof deferred<void>> | null = null
  const h = startHarness({
    ...(options.commands === undefined ? {} : { commands: options.commands }),
    ...(options.store === undefined ? {} : { store: options.store }),
    bindingPort: base => ({
      ...base,
      start: async (...args) => {
        const result = await base.start(...args)
        if ('failure' in result) return result
        const original = result.ok
        const wrapped: ToolLiveExecution<Block> = {
          ...original,
          facts: input => ({
            [Symbol.asyncIterator]: () => {
              const inner = original.facts(input)[Symbol.asyncIterator]()
              stats.readers += 1
              stats.maxReaders = Math.max(stats.maxReaders, stats.readers)
              stats.cursors.push(input.after)
              let first = true
              return {
                next: async () => {
                  stats.next += 1
                  stats.maxNext = Math.max(stats.maxNext, stats.next)
                  try {
                    if (
                      options.channel === 'after-batch' &&
                      stats.batches > 0 &&
                      input.after === null
                    )
                      return { done: true, value: undefined }
                    if (first && options.channel === 'end') {
                      first = false
                      return { done: true, value: undefined }
                    }
                    if (first && options.channel === 'throw') {
                      first = false
                      throw new Error('secret-reader')
                    }
                    const next = await inner.next()
                    if (!next.done) {
                      stats.batches += 1
                      if (options.channel === 'invalid')
                        return { done: false, value: { ...next.value, cursor: '' } }
                      if (options.channel === 'unsupported')
                        return {
                          done: false,
                          value: {
                            ...next.value,
                            events: [
                              ...next.value.events,
                              {
                                event: 'unsupported',
                                fact: {
                                  kind: 'continued',
                                  wait: ok(decodeToolWaitId('wait')),
                                  response: operationId('answer'),
                                  timing: evidence('timing'),
                                },
                              },
                            ],
                          },
                        }
                    }
                    return next
                  } finally {
                    stats.next -= 1
                  }
                },
                return: async () => {
                  stats.returns += 1
                  try {
                    await inner.return?.()
                    await options.returns?.promise
                  } finally {
                    stats.readers -= 1
                  }
                  return { done: true, value: undefined }
                },
              }
            },
          }),
          acknowledge: async receipt => {
            stats.acknowledgements += 1
            if (ackFailure === 'throw') throw new Error('secret-source')
            if (ackFailure === 'unavailable')
              return fail({
                kind: 'unavailable',
                dependency: 'source',
                diagnostic: 'secret-source',
              })
            const confirmed = await original.acknowledge(receipt)
            await sourceHold?.promise
            if (loseAck) {
              loseAck = false
              throw new Error('secret-ack')
            }
            return confirmed
          },
        }
        lives.set(args[0].start.operation, wrapped)
        return succeed(wrapped)
      },
    }),
    bindingsPort: bindings => ({
      ...bindings,
      recover: async input => {
        stats.recoveries += 1
        const live = lives.get(input.start.operation)
        if (live === undefined)
          return fail({ kind: 'unavailable', dependency: 'source', diagnostic: 'unavailable' })
        const recovery: ToolRecoveryBinding<Block> = {
          acknowledge: receipt => live.acknowledge(receipt),
          inspectStart: () =>
            settledInspection
              ? Promise.resolve(
                  succeed({
                    kind: 'settled',
                    source: evidence('source'),
                    event: 'final',
                    fact: {
                      ...completedFinal(),
                      result: {
                        ...completedFinal().result,
                        content: [],
                        original: { kind: 'none' },
                      },
                    },
                  }),
                )
              : Promise.resolve(succeed({ kind: 'live', execution: live })),
          inspectSuspension: () => Promise.reject(new Error('unused')),
          stop: input => live.stop(input),
          inspectControl: input => live.inspectControl(input),
        }
        return succeed(recovery)
      },
    }),
  })
  const invoke = async (signal: AbortSignal, scope = 'scope') => {
    const outcome = await h.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: request({
        scope: { ...request().scope, key: scope },
        consumer: { ...request().consumer, position: scope },
      }),
    })
    if (outcome.kind !== 'accepted') throw new Error(JSON.stringify(outcome))
    const call = readToolInvocationRef(outcome.reference).call
    signals.set(call, signal)
    h.host.scheduled.splice(0)
    await h.runOnce(call, signal)
    const access = { principal: principalA, tenant: tenantA, call }
    const recovery = ok(await h.commands.loadRecovery(access))
    if (recovery.start === null || recovery.start.kind !== 'start') throw new Error('not started')
    return { call, access, start: recovery.start, reference: outcome.reference }
  }
  const pump = async () => {
    await flush()
    for (let next = h.host.scheduled.shift(); next !== undefined; next = h.host.scheduled.shift())
      await h.runOnce(next.call, signals.get(next.call))
    await flush()
  }
  return {
    h,
    stats,
    invoke,
    pump,
    signals,
    failSource: (failure: typeof ackFailure) => {
      ackFailure = failure
    },
    inspectSettled: () => {
      settledInspection = true
    },
    loseAck: () => {
      loseAck = true
    },
    holdSource: (hold: typeof sourceHold) => {
      sourceHold = hold
    },
  }
}

const process = {
  kind: 'process' as const,
  blocks: [
    {
      index: 'out',
      mode: 'append' as const,
      state: 'closed' as const,
      sequence: '0',
      trim: null,
      content: { ...text('out', 'hello'), visibility: { toHuman: true, toModel: false } },
    },
  ],
}

describe('managed original facts', () => {
  it('ACKs facts for a 200-character admission with one queryable operation across retries', async () => {
    const confirmations: Parameters<StartHarness['commands']['recordFactAcknowledgement']>[0][] = []
    const f = fixture({
      commands: base => ({
        ...base,
        recordFactAcknowledgement: input => {
          confirmations.push(input)
          return base.recordFactAcknowledgement(input)
        },
      }),
      store: memory =>
        losingCommits(
          memory,
          input =>
            input.writes.some(
              write =>
                write.kind === 'put' &&
                write.record.kind === 'operation' &&
                write.record.operation.receipt.kind === 'fact-acknowledgement',
            ),
          'dropped',
        ),
    })
    const call = callId('a'.repeat(197))
    const access = { principal: principalA, tenant: tenantA, call }
    const controller = new AbortController()
    f.signals.set(call, controller.signal)
    await admitCall(f.h, call)
    f.h.host.scheduled.splice(0)
    await f.h.runOnce(call, controller.signal)
    const running = ok(await f.h.commands.loadRecovery(access))
    const start = running.start
    if (start?.kind !== 'start') throw new Error('not started')
    expect(running.admission).toHaveLength(200)
    expect(start.operation).toHaveLength(206)
    expect(running.state.phase).toBe('running')
    await f.h.binding.controls.finish(start, completedFinal())
    await f.pump()
    const saved = ok(await f.h.commands.loadRecovery(access))
    expect(saved.streams[0]?.pendingAcknowledgements).toEqual([])
    expect(saved.tasks.some(task => task.kind === 'fact-ack')).toBe(false)
    expect(f.h.binding.controls.pendingAcknowledgements(start)).toBe(0)
    const settle = saved.tasks.find(task => task.kind === 'settle')
    if (settle?.kind !== 'settle') throw new Error('missing saved final')
    expect(ok(await f.h.ledger.facts.read({ ...access, basis: settle.basis })).fact).toEqual(
      completedFinal(),
    )
    expect(confirmations).toHaveLength(2)
    const original = confirmations[0]
    if (original === undefined) throw new Error('missing confirmation command')
    expect(confirmations[1]).toEqual(original)
    expect(original.operation).toMatch(/^fact-ack:sha256:[a-f0-9]{64}$/u)
    const operation = ok(
      await f.h.ledger.reads.operation({ ...access, operation: original.operation }),
    )
    expect(operation).toMatchObject({ kind: 'committed' })
    const commits = f.h.memory.commits
    const progress = ok(await f.h.commands.recordFactAcknowledgement(original))
    expect(progress.pendingAcknowledgements).toEqual([])
    expect(f.h.memory.commits).toBe(commits)
    expect(
      ok(await f.h.ledger.reads.operation({ ...access, operation: original.operation })),
    ).toEqual(operation)
    controller.abort()
    await flush()
  })
  it('automatically preserves and ACKs process and full final after invoke and run return', async () => {
    const began = performance.now()
    const f = fixture()
    const controller = new AbortController()
    const adds = vi.spyOn(controller.signal, 'addEventListener')
    const removes = vi.spyOn(controller.signal, 'removeEventListener')
    const c = await f.invoke(controller.signal)
    expect(f.stats.next).toBe(1)
    const pending = ok(await f.h.commands.loadRecovery(c.access))
    expect(pending.tasks).toContainEqual(
      expect.objectContaining({ kind: 'facts', operation: c.start.operation }),
    )
    await f.h.binding.controls.emit(c.start, process)
    await f.pump()
    await f.h.binding.controls.finish(c.start, completedFinal())
    await f.pump()
    const saved = ok(await f.h.commands.loadRecovery(c.access))
    expect(saved.streams[0]?.pendingAcknowledgements).toEqual([])
    expect(saved.tasks.some(task => task.kind === 'fact-ack')).toBe(false)
    expect(f.h.binding.controls.pendingAcknowledgements(c.start)).toBe(0)
    expect(saved.state.phase).toBe('running')
    expect(saved.state.queue.kind).toBe('held')
    const settle = saved.tasks.find(task => task.kind === 'settle')
    if (settle?.kind !== 'settle') throw new Error('missing final duty')
    const rebuilt = createToolLedger(
      f.h.memory,
      guards(),
      createMemoryToolClock(),
      configurationOf({}),
    )
    expect(ok(await rebuilt.facts.read({ ...c.access, basis: settle.basis })).fact).toEqual(
      completedFinal(),
    )
    controller.abort()
    await flush()
    expect(f.stats).toMatchObject({ readers: 0, next: 0, maxReaders: 1, maxNext: 1, batches: 2 })
    const hostListeners =
      adds.mock.calls.filter(([type]) => type === 'abort').length -
      removes.mock.calls.filter(([type]) => type === 'abort').length
    expect(hostListeners).toBe(0)
    console.info(
      'FACT_RESOURCE',
      JSON.stringify({ ...f.stats, hostListeners, elapsedMs: performance.now() - began }),
    )
  })

  it('holds one ready batch and does not request the next before custody and ACK', async () => {
    const f = fixture()
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    await f.h.binding.controls.emit(c.start, process)
    await f.h.binding.controls.finish(c.start, completedFinal())
    await flush()
    expect(f.stats.batches).toBe(1)
    expect(f.stats.maxNext).toBe(1)
    expect(f.h.binding.controls.pendingAcknowledgements(c.start)).toBe(2)
    await f.pump()
    await f.pump()
    expect(f.stats.batches).toBe(2)
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toEqual([])
    controller.abort()
    await flush()
  })

  it('retains a new run while the aborted reader is still returning', async () => {
    const returns = deferred<void>()
    const f = fixture({ returns })
    const old = new AbortController()
    const c = await f.invoke(old.signal)
    const remove = vi.spyOn(old.signal, 'removeEventListener')
    old.abort()
    await flush()
    expect(f.stats.returns).toBe(1)
    const next = new AbortController()
    f.signals.set(c.call, next.signal)
    await f.h.runOnce(c.call, next.signal)
    expect(f.stats.maxReaders).toBe(1)
    returns.resolve()
    await f.pump()
    expect(f.stats.cursors).toEqual([null, null])
    expect(f.stats.maxReaders).toBe(1)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    next.abort()
    await flush()
    expect(f.stats.readers).toBe(0)
  })

  it('does not attach for an already aborted signal or schedule a cancelled reconnect intent', async () => {
    const returns = deferred<void>()
    const f = fixture({ returns })
    const old = new AbortController()
    const c = await f.invoke(old.signal)
    old.abort()
    await flush()
    const next = new AbortController()
    await f.h.runOnce(c.call, next.signal)
    next.abort()
    f.h.host.scheduled.splice(0)
    returns.resolve()
    await flush()
    expect(f.h.host.scheduled).toEqual([])
    await f.h.runOnce(c.call, next.signal)
    expect(f.stats.cursors).toEqual([null])
  })

  it('closes the registration race when abort occurs inside addEventListener', async () => {
    const f = fixture()
    const controller = new AbortController()
    const add = controller.signal.addEventListener.bind(controller.signal)
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args) => {
      controller.abort()
      add(...args)
    })
    const c = await f.invoke(controller.signal)
    await flush()
    expect(f.stats).toMatchObject({ readers: 0, next: 0 })
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).tasks.some(task => task.kind === 'facts'),
    ).toBe(true)
  })

  it('does not issue custody after abort while ready and does not block another call', async () => {
    let receives = 0
    const f = fixture({
      commands: base => ({
        ...base,
        receiveFacts: input => {
          receives += 1
          return base.receiveFacts(input)
        },
      }),
    })
    const firstSignal = new AbortController()
    const first = await f.invoke(firstSignal.signal, 'first')
    const secondSignal = new AbortController()
    const second = await f.invoke(secondSignal.signal, 'second')
    await f.h.binding.controls.emit(first.start, process)
    await flush()
    firstSignal.abort()
    await f.h.binding.controls.finish(second.start, completedFinal())
    await f.pump()
    expect(receives).toBe(1)
    expect(ok(await f.h.commands.loadRecovery(first.access)).streams).toEqual([])
    expect(
      ok(await f.h.commands.loadRecovery(second.access)).tasks.some(task => task.kind === 'settle'),
    ).toBe(true)
    secondSignal.abort()
    await flush()
  })

  it('keeps an in-flight custody commit and recovers its original pending ACK', async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const controller = new AbortController()
    const f = fixture({
      commands: base => ({
        ...base,
        receiveFacts: async input => {
          entered.resolve()
          await release.promise
          return base.receiveFacts(input)
        },
      }),
    })
    const c = await f.invoke(controller.signal)
    await f.h.binding.controls.finish(c.start, completedFinal())
    await flush()
    const currentRun = new AbortController()
    const running = f.h.runOnce(c.call, currentRun.signal)
    await entered.promise
    controller.abort()
    release.resolve()
    await running
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toHaveLength(1)
    expect(f.stats.acknowledgements).toBe(0)
    await flush()
    f.h.rebuildRuntime()
    const resumed = new AbortController()
    await f.h.runOnce(c.call, resumed.signal)
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toEqual([])
    resumed.abort()
    await flush()
    expect(f.stats.recoveries).toBeGreaterThan(0)
  })

  it('leaves source ACK in flight observable and resumes the original duty after abort', async () => {
    const f = fixture()
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    await f.h.binding.controls.finish(c.start, completedFinal())
    await flush()
    const hold = deferred<void>()
    f.holdSource(hold)
    const running = f.h.runOnce(c.call, controller.signal)
    await vi.waitFor(() => expect(f.stats.acknowledgements).toBe(1))
    controller.abort()
    hold.resolve()
    await running
    expect(f.h.binding.controls.pendingAcknowledgements(c.start)).toBe(0)
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toHaveLength(1)
    f.holdSource(null)
    await flush()
    f.h.rebuildRuntime()
    const resumed = new AbortController()
    await f.h.runOnce(c.call, resumed.signal)
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toEqual([])
    resumed.abort()
    await flush()
  })

  it.each(['end', 'throw'] as const)(
    'retains the facts duty on %s and reconnects after retryDelay',
    async channel => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const f = fixture({ channel })
      const controller = new AbortController()
      const c = await f.invoke(controller.signal)
      await f.pump()
      const recovery = ok(await f.h.commands.loadRecovery(c.access))
      expect(recovery.state.phase).toBe('running')
      expect(recovery.state.queue.kind).toBe('held')
      expect(recovery.tasks.some(task => task.kind === 'settle')).toBe(false)
      expect(f.stats.cursors).toEqual([null])
      await vi.advanceTimersByTimeAsync(1000)
      await f.pump()
      expect(f.stats.cursors).toEqual([null, null])
      controller.abort()
      await flush()
    },
  )

  it('reconnects from the saved cursor after channel end without producing a final', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = fixture({ channel: 'after-batch' })
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    await f.h.binding.controls.emit(c.start, process)
    await f.pump()
    await f.pump()
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).tasks.some(task => task.kind === 'settle'),
    ).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await f.pump()
    expect(f.stats.cursors).toEqual([null, 'cursor-1'])
    controller.abort()
    await flush()
  })

  it.each(['unsupported', 'invalid'] as const)(
    'stops %s input without ACK or a retry loop',
    async channel => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const f = fixture({ channel })
      const controller = new AbortController()
      const c = await f.invoke(controller.signal)
      await f.h.binding.controls.finish(c.start, completedFinal())
      await f.pump()
      await vi.advanceTimersByTimeAsync(3000)
      await f.pump()
      const recovery = ok(await f.h.commands.loadRecovery(c.access))
      expect(recovery.streams).toEqual([])
      expect(recovery.tasks.some(task => task.kind === 'settle')).toBe(false)
      expect(f.stats).toMatchObject({ batches: 1, acknowledgements: 0, readers: 0 })
      controller.abort()
    },
  )

  it('retries a refused ready wake with the existing delay and stops it on abort', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = fixture()
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    const schedule = vi
      .spyOn(f.h.host, 'schedule')
      .mockResolvedValue(fail({ kind: 'unavailable', dependency: 'host', diagnostic: 'refused' }))
    await f.h.binding.controls.emit(c.start, process)
    await flush()
    expect(schedule).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(schedule).toHaveBeenCalledTimes(2)
    controller.abort()
    await vi.advanceTimersByTimeAsync(1000)
    expect(schedule).toHaveBeenCalledTimes(2)
    await flush()
    expect(f.stats.readers).toBe(0)
  })

  it('captures a rejected iterator return and can reconnect after cleanup', async () => {
    const returns = deferred<void>()
    const f = fixture({ returns })
    const old = new AbortController()
    const c = await f.invoke(old.signal)
    old.abort()
    await flush()
    returns.reject(new Error('secret-return'))
    await flush()
    expect(f.stats.readers).toBe(0)
    const next = new AbortController()
    await f.h.runOnce(c.call, next.signal)
    expect(f.stats.maxReaders).toBe(1)
    next.abort()
    await flush()
  })

  it('keeps the named recovery gap when inspectStart is settled without a batch or cursor', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = fixture()
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    controller.abort()
    await flush()
    f.inspectSettled()
    f.h.rebuildRuntime()
    f.h.host.scheduled.splice(0)
    await f.h.runOnce(c.call)
    await vi.advanceTimersByTimeAsync(3000)
    expect(f.h.host.scheduled).toEqual([])
    expect(f.h.binding.executions).toEqual([c.call])
    expect(f.stats.cursors).toEqual([null])
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).tasks.some(task => task.kind === 'facts'),
    ).toBe(true)
  })

  it('prioritizes a saved ACK over a controlled settled phase snapshot after live loss', async () => {
    const f = fixture({
      commands: base => ({
        ...base,
        loadRecovery: async input => {
          const result = await base.loadRecovery(input)
          if ('failure' in result || !result.ok.tasks.some(task => task.kind === 'fact-ack'))
            return result
          return succeed({
            ...result.ok,
            state: {
              ...result.ok.state,
              phase: 'settled',
              wait: { kind: 'none' },
              result: ok(decodeToolResultVersion('result')),
              relation: 'foreground',
              terminal: completedFinal().terminal,
            },
          })
        },
      }),
    })
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    f.loseAck()
    await f.h.binding.controls.finish(c.start, completedFinal())
    await f.pump()
    controller.abort()
    await flush()
    f.h.rebuildRuntime()
    const resumed = new AbortController()
    await f.h.runOnce(c.call, resumed.signal)
    await f.pump()
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toEqual([])
    resumed.abort()
    await flush()
    expect(f.stats.recoveries).toBeGreaterThan(0)
  })

  it.each(['unavailable', 'throw'] as const)(
    'retains and retries source %s without rejecting run',
    async failure => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const f = fixture()
      const controller = new AbortController()
      const c = await f.invoke(controller.signal)
      f.failSource(failure)
      await f.h.binding.controls.finish(c.start, completedFinal())
      await f.pump()
      expect(
        ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
      ).toHaveLength(1)
      f.failSource(null)
      await vi.advanceTimersByTimeAsync(1000)
      await f.pump()
      expect(
        ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
      ).toEqual([])
      controller.abort()
      await flush()
    },
  )

  it('retries ACK loss and unknown ledger acknowledgement without losing the original batch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = fixture({
      store: memory =>
        losingCommits(
          memory,
          input =>
            input.writes.some(
              write =>
                write.kind === 'put' &&
                write.record.kind === 'operation' &&
                write.record.operation.receipt.kind === 'fact-acknowledgement',
            ),
          'dropped',
        ),
    })
    const controller = new AbortController()
    const c = await f.invoke(controller.signal)
    f.loseAck()
    await f.h.binding.controls.finish(c.start, completedFinal())
    await f.pump()
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    await f.pump()
    await vi.advanceTimersByTimeAsync(1000)
    await f.pump()
    expect(
      ok(await f.h.commands.loadRecovery(c.access)).streams[0]?.pendingAcknowledgements,
    ).toEqual([])
    controller.abort()
    await flush()
  })
})
