import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  readToolInvocationRef,
  type FactBatch,
  type ToolExecutionFact,
  type ToolLiveExecution,
  type ToolStartRecord,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import { completedFinal } from '@omne-harness/tool-contract/testing'
import { startHarness, losingCommits, type StartOptions } from './start-values.ts'
import {
  adoption,
  evidence,
  ok,
  operationId,
  principalA,
  request,
  tenantA,
  text,
  type Block,
  callId as readCall,
} from './runtime-values.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

function fixture(
  options: StartOptions & {
    channel?: 'end' | 'throw'
    returning?: Promise<void>
    pendingFinal?: { seen: ReturnType<typeof deferred<FactBatch<Block>>>; resume: Promise<void> }
  } = {},
) {
  const lives = new Map<string, ToolLiveExecution<Block>>()
  const controllers = new Map<string, AbortController>()
  const stats = {
    returns: 0,
    readers: 0,
    next: 0,
    pendingNext: 0,
    recoveries: 0,
    acknowledgements: 0,
    loads: 0,
  }
  let ackOffline = false
  let recoveryOffline = false
  const key = (start: ToolStartRecord) =>
    JSON.stringify([start.execution.tenant, start.execution.call, start.operation])
  const h = startHarness({
    ...options,
    commands: base => {
      const commands = options.commands?.(base) ?? base
      return {
        ...commands,
        loadRecovery: input => {
          stats.loads += 1
          return commands.loadRecovery(input)
        },
      }
    },
    bindingPort: base => ({
      ...base,
      start: async (...args) => {
        const started = await base.start(...args)
        if ('failure' in started) return started
        const original = started.ok
        const live: ToolLiveExecution<Block> = {
          ...original,
          acknowledge: receipt => {
            stats.acknowledgements += 1
            return ackOffline
              ? Promise.resolve(
                  fail({ kind: 'unavailable', dependency: 'source', diagnostic: 'offline' }),
                )
              : original.acknowledge(receipt)
          },
          facts: input => ({
            [Symbol.asyncIterator]: () => {
              stats.readers += 1
              const iterator = original.facts(input)[Symbol.asyncIterator]()
              let final = false
              return {
                next: async () => {
                  stats.next += 1
                  stats.pendingNext += 1
                  try {
                    if (final && options.channel === 'end') return { done: true, value: undefined }
                    if (final && options.channel === 'throw') throw new Error('secret-source-error')
                    const result = await iterator.next()
                    if (
                      !result.done &&
                      result.value.events.some(event => event.fact.kind === 'final')
                    ) {
                      final = true
                      options.pendingFinal?.seen.resolve(result.value)
                      await options.pendingFinal?.resume
                    }
                    return result
                  } finally {
                    stats.pendingNext -= 1
                  }
                },
                return: async () => {
                  stats.returns += 1
                  await iterator.return?.()
                  await options.returning
                  stats.readers -= 1
                  return { done: true, value: undefined }
                },
              }
            },
          }),
        }
        lives.set(key(args[0].start), live)
        return succeed(live)
      },
    }),
    bindingsPort: base => ({
      ...base,
      recover: async input => {
        stats.recoveries += 1
        const live = lives.get(key(input.start))
        if (live === undefined || recoveryOffline)
          return fail({
            kind: 'unavailable',
            dependency: 'source',
            diagnostic: 'secret-recovery-error',
          })
        return succeed({
          acknowledge: live.acknowledge,
          inspectStart: () => Promise.resolve(succeed({ kind: 'live', execution: live })),
          inspectSuspension: () => Promise.reject(new Error('unused')),
          stop: live.stop,
          inspectControl: live.inspectControl,
        })
      },
    }),
  })
  const invoke = async (position: string) => {
    const payload = request({ consumer: { ...request().consumer, position } })
    const invoked = await h.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: payload,
    })
    if (invoked.kind !== 'accepted') throw new Error(JSON.stringify(invoked))
    const call = readToolInvocationRef(invoked.reference).call
    const controller = new AbortController()
    controllers.set(call, controller)
    await h.runOnce(call, controller.signal)
    const access = { principal: principalA, tenant: tenantA, call }
    return { access, call, controller, reference: invoked.reference, payload }
  }
  const load = (call: string) =>
    h.commands
      .loadRecovery({ principal: principalA, tenant: tenantA, call: readCall(call) })
      .then(ok)
  const start = async (call: string) => {
    const recovery = await load(call)
    if (recovery.start?.kind !== 'start') throw new Error('not started')
    return recovery.start
  }
  const final = async (
    call: string,
    terminal: ToolTerminal = { kind: 'completed' },
  ): Promise<Extract<ToolExecutionFact<Block>, { kind: 'final' }>> => ({
    kind: 'final',
    raw: ok(
      await h.custody.preserve({
        principal: principalA,
        tenant: tenantA,
        call: readCall(call),
        operation: operationId('raw'),
        codec: adoption('codec'),
        bytes: new TextEncoder().encode('raw'),
        source: evidence('raw-source'),
      }),
    ),
    result: {
      ...completedFinal().result,
      content: [text('answer', 'done')],
      original: { kind: 'none' },
    },
    terminal,
    effect: completedFinal().effect,
  })
  const pump = async () => {
    for (let i = 0; i < 100; i += 1) {
      await flush()
      const scheduled = h.host.scheduled.shift()
      if (scheduled === undefined) return
      await h.runOnce(scheduled.call, controllers.get(scheduled.call)?.signal)
    }
    throw new Error('driver did not become quiet')
  }
  const close = async () => {
    for (const controller of controllers.values()) controller.abort()
    await flush()
  }
  return {
    h,
    stats,
    invoke,
    load,
    start,
    final,
    pump,
    close,
    controllers,
    ackOffline: (value: boolean) => {
      ackOffline = value
    },
    recoveryOffline: () => {
      recoveryOffline = true
    },
  }
}

describe('original final settlement in one shared driver', () => {
  it('F01 keeps the second call queued after retention until the original call commit lands', async () => {
    const committing = deferred<void>()
    const release = deferred<void>()
    let retains = 0
    const f = fixture({
      custodyPort: base => ({
        ...base,
        retainResult: input => {
          retains += 1
          return base.retainResult(input)
        },
      }),
      store: memory => ({
        ...memory,
        commit: async input => {
          if (
            input.writes.some(
              write =>
                write.kind === 'put' &&
                write.record.kind === 'operation' &&
                write.record.operation.receipt.kind === 'preserve-result',
            )
          ) {
            committing.resolve()
            await release.promise
          }
          return memory.commit(input)
        },
      }),
    })
    const first = await f.invoke('first')
    const second = await f.invoke('second')
    await f.h.binding.controls.finish(await f.start(first.call), await f.final(first.call))
    await flush()
    const running = f.h.runOnce(first.call, first.controller.signal)
    await committing.promise
    expect(retains).toBe(1)
    expect((await f.load(first.call)).state.phase).toBe('running')
    await f.h.runOnce(second.call, second.controller.signal)
    expect(f.h.binding.executions).toEqual([first.call])
    release.resolve()
    await running
    await f.pump()
    expect(f.h.binding.executions).toEqual([first.call, second.call])
    await f.close()
  })

  it('F01/F11 releases the shared slot after retention and keeps an offline ACK recoverable', async () => {
    const retained = deferred<void>()
    const retaining = deferred<void>()
    const f = fixture({
      custodyPort: base => ({
        ...base,
        retainResult: async input => {
          retaining.resolve()
          await retained.promise
          return base.retainResult(input)
        },
      }),
    })
    const first = await f.invoke('first')
    const second = await f.invoke('second')
    expect(f.h.binding.executions).toEqual([first.call])
    const final = await f.final(first.call)
    f.ackOffline(true)
    await f.h.binding.controls.finish(await f.start(first.call), final)
    await flush()
    const settling = f.h.runOnce(first.call, first.controller.signal)
    await retaining.promise
    expect((await f.load(first.call)).state.phase).toBe('running')
    await f.h.runOnce(second.call, second.controller.signal)
    expect(f.h.binding.executions).toEqual([first.call])
    retained.resolve()
    await settling
    await f.pump()
    const saved = await f.load(first.call)
    expect(saved.state).toMatchObject({
      phase: 'settled',
      terminal: final.terminal,
      execution: { kind: 'ended' },
      timing: { kind: 'unknown', diagnostic: 'execution-end-clock-marker-unavailable' },
    })
    expect(saved.tasks.some(task => task.kind === 'fact-ack')).toBe(true)
    expect(saved.tasks.some(task => task.kind === 'facts')).toBe(false)
    expect(saved.tasks.some(task => task.kind === 'clock' && task.state === 'blocked')).toBe(true)
    expect(f.h.binding.executions).toEqual([first.call, second.call])
    expect(f.stats.returns).toBe(1)
    expect(
      ok(await f.h.runtime.queries.lookup({ ...first.access, reference: first.reference })),
    ).toMatchObject({ kind: 'found', state: { phase: 'settled' } })
    first.controller.abort()
    f.h.rebuildRuntime()
    f.ackOffline(false)
    await f.h.runOnce(first.call, new AbortController().signal)
    expect((await f.load(first.call)).streams[0]?.pendingAcknowledgements).toEqual([])
    expect(f.stats.recoveries).toBeGreaterThan(0)
    const repeated = await f.h.runtime.invoke({ ...first.access, request: first.payload })
    expect(repeated).toMatchObject({
      kind: 'accepted',
      reference: first.reference,
      recovered: true,
    })
    expect(
      await f.h.runtime.invoke({
        ...first.access,
        request: {
          ...first.payload,
          arguments: {
            ...first.payload.arguments,
            original: '{"changed":true}',
            effective: '{"changed":true}',
          },
        },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'conflict' } })
    expect(f.h.binding.executions.filter(call => call === first.call)).toHaveLength(1)
    await f.close()
  })

  it.each(['dropped', 'applied'] as const)(
    'F05 repairs an %s unknown queue commit by replaying the original preserve task',
    async mode => {
      const operations: string[] = []
      let retains = 0
      const f = fixture({
        store: memory =>
          losingCommits(
            memory,
            input =>
              input.domain.kind === 'queue' &&
              input.writes.some(
                write => write.kind === 'put' && write.record.kind === 'queue-release',
              ),
            mode,
          ),
        custodyPort: base => ({
          ...base,
          retainResult: input => {
            retains += 1
            return base.retainResult(input)
          },
        }),
        commands: base => ({
          ...base,
          preserveResult: input => {
            operations.push(input.operation)
            return base.preserveResult(input)
          },
        }),
      })
      const first = await f.invoke('first')
      const second = await f.invoke('second')
      await f.h.binding.controls.finish(await f.start(first.call), await f.final(first.call))
      await f.pump()
      const pending = await f.load(first.call)
      expect(pending.state.phase).toBe('settled')
      // The original command can report success while its queue tail is still pending.
      await f.h.runOnce(first.call, first.controller.signal)
      await f.h.runOnce(second.call, second.controller.signal)
      await f.pump()
      expect((await f.load(first.call)).tasks.some(task => task.kind === 'queue')).toBe(false)
      expect(f.h.binding.executions).toEqual([first.call, second.call])
      expect(retains).toBe(1)
      expect(new Set(operations).size).toBe(1)
      expect(operations.length).toBeGreaterThanOrEqual(2)
      expect(await f.h.released()).toContain(first.call)
      await f.close()
    },
  )

  it('F05 reconciles a predecessor after the release notification is lost, then closes its original queue task', async () => {
    let allowRelease = false
    let retains = 0
    const f = fixture({
      custodyPort: base => ({
        ...base,
        retainResult: input => {
          retains += 1
          return base.retainResult(input)
        },
      }),
      store: memory => ({
        ...memory,
        commit: input => {
          if (
            !allowRelease &&
            input.domain.kind === 'queue' &&
            input.writes.some(
              write => write.kind === 'put' && write.record.kind === 'queue-release',
            )
          )
            return Promise.resolve({ kind: 'unavailable', diagnostic: 'queue offline' })
          return memory.commit(input)
        },
      }),
    })
    const first = await f.invoke('first')
    const second = await f.invoke('second')
    await f.h.binding.controls.finish(await f.start(first.call), await f.final(first.call))
    await flush()
    await f.h.runOnce(first.call, first.controller.signal)
    const pending = await f.load(first.call)
    expect(pending.state.phase).toBe('settled')
    expect(pending.tasks.some(task => task.kind === 'queue')).toBe(true)
    expect(pending.streams[0]?.pendingAcknowledgements).toEqual([])
    expect(f.h.binding.executions).toEqual([first.call])
    f.h.host.scheduled.splice(0)
    allowRelease = true
    await f.h.runOnce(second.call, second.controller.signal)
    expect((await f.load(first.call)).tasks.some(task => task.kind === 'queue')).toBe(true)
    await f.pump()
    expect(f.h.binding.executions).toEqual([first.call, second.call])
    await f.h.runOnce(first.call, first.controller.signal)
    expect((await f.load(first.call)).tasks.some(task => task.kind === 'queue')).toBe(false)
    expect(retains).toBe(1)
    await f.close()
  })

  it('F10 preserves the abnormal reader and accepts its late process without changing the result', async () => {
    const f = fixture()
    const first = await f.invoke('first')
    const start = await f.start(first.call)
    const final = await f.final(first.call, {
      kind: 'failed',
      cause: 'executor',
      diagnostic: 'failed',
    })
    await f.h.binding.controls.finish(start, final)
    await f.pump()
    const settled = await f.load(first.call)
    expect(settled.state.phase).toBe('settled')
    expect(settled.tasks.some(task => task.kind === 'facts' && task.state === 'pending')).toBe(true)
    expect(settled.tasks.some(task => task.kind === 'settle' && task.state === 'blocked')).toBe(
      true,
    )
    expect(f.stats.returns).toBe(0)
    await f.h.binding.controls.emit(start, {
      kind: 'process',
      blocks: [
        {
          index: 'late',
          mode: 'replace',
          state: 'closed',
          sequence: '0',
          trim: null,
          content: text('late', 'late output'),
        },
      ],
    })
    await f.pump()
    const late = await f.load(first.call)
    expect({
      ...late.state,
      revision: settled.state.revision,
      source: settled.state.source,
    }).toEqual(settled.state)
    expect(late.result).toEqual(settled.result)
    expect(late.streams[0]?.pendingAcknowledgements).toEqual([])
    expect(f.h.binding.controls.pendingAcknowledgements(start)).toBe(0)
    const records = await f.h.memory.read({ kind: 'call', tenant: tenantA, call: first.call })
    expect(
      records.kind === 'complete' &&
        records.records.some(
          record => record.kind === 'fact-event' && record.fact.fact.kind === 'process',
        ),
    ).toBe(true)
    expect(f.stats.returns).toBe(0)
    await f.close()
  })

  it.each(['end', 'throw'] as const)(
    'F06/F10 persistently blocks an abnormal source that reports %s without spinning',
    async channel => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const f = fixture({ channel })
      const first = await f.invoke('first')
      await f.h.binding.controls.finish(
        await f.start(first.call),
        await f.final(first.call, {
          kind: 'interrupted',
          cause: { kind: 'control', operation: operationId('stop'), withdrawn: false },
        }),
      )
      await f.pump()
      const saved = await f.load(first.call)
      expect(saved.tasks).toContainEqual(
        expect.objectContaining({
          kind: 'facts',
          state: 'blocked',
          diagnostic:
            channel === 'end' ? 'settled-facts-source-ended' : 'settled-facts-source-unavailable',
        }),
      )
      expect(f.stats.returns).toBe(1)
      f.h.host.scheduled.splice(0)
      const loads = f.stats.loads
      await vi.advanceTimersByTimeAsync(5000)
      expect(f.h.host.scheduled).toEqual([])
      expect(f.stats.loads).toBe(loads)
      f.h.rebuildRuntime()
      await f.h.runOnce(first.call)
      expect(f.stats.readers).toBe(0)
      expect(
        (await f.load(first.call)).tasks.some(
          task => task.kind === 'facts' && task.state === 'blocked',
        ),
      ).toBe(true)
      await f.close()
    },
  )

  it('F12 aborts only coordination and lets a fresh run reconnect the abnormal reader', async () => {
    const f = fixture()
    const first = await f.invoke('first')
    await f.h.binding.controls.finish(
      await f.start(first.call),
      await f.final(first.call, { kind: 'failed', cause: 'executor', diagnostic: 'failed' }),
    )
    await f.pump()
    first.controller.abort()
    await flush()
    const fresh = new AbortController()
    f.controllers.set(first.call, fresh)
    await f.h.runOnce(first.call, fresh.signal)
    await f.pump()
    expect(
      (await f.load(first.call)).tasks.some(
        task => task.kind === 'facts' && task.state === 'pending',
      ),
    ).toBe(true)
    expect(f.stats.readers).toBe(1)
    expect(f.h.binding.executions).toEqual([first.call])
    await f.close()
  })

  it('F10 records lost abnormal-source recovery as blocked without restarting the author', async () => {
    const f = fixture()
    const first = await f.invoke('first')
    await f.h.binding.controls.finish(
      await f.start(first.call),
      await f.final(first.call, { kind: 'failed', cause: 'executor', diagnostic: 'failed' }),
    )
    await f.pump()
    first.controller.abort()
    await flush()
    f.h.rebuildRuntime()
    f.recoveryOffline()
    await f.h.runOnce(first.call, new AbortController().signal)
    expect((await f.load(first.call)).tasks).toContainEqual(
      expect.objectContaining({
        kind: 'facts',
        state: 'blocked',
        diagnostic: 'settled-facts-source-unavailable',
      }),
    )
    expect(f.h.binding.executions).toEqual([first.call])
    await f.close()
  })

  it.each(['dropped', 'applied'] as const)(
    'F10 retries the same blocked-source observation after an %s unknown commit',
    async mode => {
      const operations: string[] = []
      const f = fixture({
        channel: 'throw',
        store: memory =>
          losingCommits(
            memory,
            input =>
              input.writes.some(
                write =>
                  write.kind === 'put' &&
                  write.record.kind === 'operation' &&
                  write.record.operation.receipt.kind === 'record-task',
              ),
            mode,
          ),
        commands: base => ({
          ...base,
          recordTask: input => {
            operations.push(input.operation)
            return base.recordTask(input)
          },
        }),
      })
      const first = await f.invoke('first')
      await f.h.binding.controls.finish(
        await f.start(first.call),
        await f.final(first.call, { kind: 'failed', cause: 'executor', diagnostic: 'failed' }),
      )
      await f.pump()
      expect(
        (await f.load(first.call)).tasks.some(
          task => task.kind === 'facts' && task.state === 'blocked',
        ),
      ).toBe(true)
      expect(new Set(operations).size).toBe(1)
      const operation = operations[0]
      if (operation === undefined) throw new Error('missing observation')
      expect(
        ok(
          await f.h.ledger.reads.operation({ ...first.access, operation: operationId(operation) }),
        ),
      ).toMatchObject({ kind: 'committed' })
      expect(f.stats.returns).toBe(1)
      await f.close()
    },
  )

  it('F11 repairs the queue while an original next is still unresolved', async () => {
    const seen = deferred<FactBatch<Block>>()
    const resume = deferred<void>()
    const f = fixture({ pendingFinal: { seen, resume: resume.promise } })
    const first = await f.invoke('first')
    const second = await f.invoke('second')
    const start = await f.start(first.call)
    await f.h.binding.controls.finish(start, await f.final(first.call))
    const batch = await seen.promise
    // A second coordinator has already preserved this exact batch from the original source.
    ok(await f.h.commands.receiveFacts({ ...first.access, start, batch }))
    await f.h.runOnce(first.call, first.controller.signal)
    await f.pump()
    expect(f.stats.pendingNext).toBe(2)
    expect(f.h.binding.executions).toEqual([first.call, second.call])
    expect((await f.load(first.call)).tasks.some(task => task.kind === 'queue')).toBe(false)
    resume.resolve()
    await flush()
    expect(f.stats.pendingNext).toBe(1)
    await f.close()
  })

  it('F11 closes a completed reader without waiting for return before the next call starts', async () => {
    const returning = deferred<void>()
    const f = fixture({ returning: returning.promise })
    const first = await f.invoke('first')
    const second = await f.invoke('second')
    await f.h.binding.controls.finish(await f.start(first.call), await f.final(first.call))
    await f.pump()
    expect(f.stats.returns).toBe(1)
    expect(f.stats.readers).toBe(2)
    expect(f.h.binding.executions).toEqual([first.call, second.call])
    returning.resolve()
    await flush()
    expect(f.stats.readers).toBe(1)
    await f.close()
  })
})
