import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { ControlProgress } from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  type ControlDispatch,
  type ToolLiveExecution,
  type ReleaseRecord,
} from '@omne-harness/tool-contract/provider'
import type { ToolLedgerAction } from '@omne-harness/tool'
import { admitCall, startHarness } from './start-values.ts'
import {
  adoption,
  callId,
  evidence,
  ok,
  operationId,
  principalA,
  principalB,
  referenceFor,
  tenantA,
  text,
} from './runtime-values.ts'

function fixture() {
  const lives = new Map<string, ToolLiveExecution>()
  const stops: ControlDispatch[] = []
  const deniedActions: ToolLedgerAction[] = []
  let progress: ControlProgress = { kind: 'pending', diagnostic: 'not dispatched' }
  const h = startHarness({
    deniedActions,
    bindingPort: base => ({
      ...base,
      start: async (...args) => {
        const started = ok(await base.start(...args))
        const live: ToolLiveExecution = {
          ...started,
          stop: async input => {
            stops.push(input)
            progress = { kind: 'accepted', evidence: evidence('accepted-stop') }
            return succeed(progress)
          },
          inspectControl: async () => succeed(progress),
        }
        lives.set(args[0].call, live)
        return succeed(live)
      },
    }),
    bindingsPort: base => ({
      ...base,
      recover: async input => {
        const live = lives.get(input.call)
        if (live === undefined) throw new Error('missing original execution')
        return succeed({
          acknowledge: live.acknowledge,
          inspectStart: async () => succeed({ kind: 'live', execution: live }),
          inspectSuspension: async () => {
            throw new Error('not used')
          },
          stop: live.stop,
          inspectControl: live.inspectControl,
        })
      },
    }),
  })
  const access = { principal: principalA, tenant: tenantA, call: callId('controlled') }
  return {
    h,
    access,
    stops,
    deniedActions,
    setProgress: (value: ControlProgress) => {
      progress = value
    },
  }
}

describe('durable control progression', () => {
  it('commits one intent and task, recalls its operation, and only stops the original call', async () => {
    const f = fixture()
    const abort = new AbortController()
    try {
      const limits = { concurrency: 2, foregroundMs: null, backgroundAfterMs: null }
      await admitCall(f.h, 'controlled', { limits })
      await f.h.runOnce('controlled', abort.signal)
      await admitCall(f.h, 'other', { limits })
      await f.h.runOnce('other', abort.signal)
      const input = {
        ...f.access,
        operation: operationId('stop-original'),
        intent: { kind: 'stop' } as const,
      }
      const receipt = ok(await f.h.commands.control(input))
      expect(receipt.progress.kind).toBe('pending')
      expect(ok(await f.h.commands.control(input))).toEqual(receipt)
      const before = ok(await f.h.commands.loadRecovery(f.access))
      expect(before.controls).toHaveLength(1)
      expect(before.tasks.filter(task => task.kind === 'stop')).toHaveLength(1)
      expect(
        await f.h.commands.control({ ...input, intent: { kind: 'background' } }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
      await f.h.runOnce('controlled', abort.signal)
      const accepted = ok(await f.h.commands.loadRecovery(f.access))
      expect(accepted.controls[0]?.progress.kind).toBe('accepted')
      expect(accepted.state.execution.kind).toBe('live')
      expect(accepted.state.queue.kind).toBe('held')
      expect(accepted.tasks.some(task => task.kind === 'stop')).toBe(true)
      await f.h.runOnce('controlled', abort.signal)
      expect(f.stops).toHaveLength(1)
      expect(f.stops[0]?.call).toBe('controlled')
      expect(f.stops[0]?.start).toEqual(before.start)
      f.setProgress({ kind: 'stopped', evidence: evidence('stopped-confirmed') })
      await f.h.runOnce('controlled', abort.signal)
      const stopped = ok(await f.h.commands.loadRecovery(f.access))
      expect(stopped.controls[0]?.progress.kind).toBe('stopped')
      expect(stopped.tasks.some(task => task.kind === 'stop')).toBe(false)
      expect(stopped.state.queue.kind).toBe('held')
      expect((await f.h.state('other')).controls).toEqual([])
      expect((await f.h.state('other')).execution.kind).toBe('live')
      expect(f.h.binding.executions).toEqual(['controlled', 'other'])
    } finally {
      abort.abort()
    }
  })

  it('public control wakes the original call and unknown control only queries its original operation', async () => {
    const f = fixture()
    const abort = new AbortController()
    try {
      await admitCall(f.h, 'controlled')
      await f.h.runOnce('controlled', abort.signal)
      f.h.host.scheduled.splice(0)
      const control = await f.h.runtime.commands.control({
        ...f.access,
        reference: referenceFor('controlled', 'op-controlled'),
        intent: { kind: 'stop' },
      })
      expect(control.kind).toBe('committed')
      expect(f.h.host.scheduled.map(item => item.call)).toEqual(['controlled'])
      f.setProgress({ kind: 'unknown', diagnostic: 'lost response' })
      await f.h.runOnce('controlled', abort.signal)
      await f.h.runOnce('controlled', abort.signal)
      f.h.rebuildRuntime()
      f.setProgress({ kind: 'pending', diagnostic: 'source lost its current answer' })
      await f.h.runOnce('controlled', abort.signal)
      await f.h.runOnce('controlled', abort.signal)
      expect(f.stops).toEqual([])
      const recovery = ok(await f.h.commands.loadRecovery(f.access))
      expect(recovery.controls[0]?.progress.kind).toBe('unknown')
      expect(recovery.tasks.some(task => task.kind === 'stop')).toBe(true)
      expect(f.h.binding.executions).toEqual(['controlled'])
    } finally {
      abort.abort()
    }
  })

  it('recalls the same durable intention after a lost commit response', async () => {
    let lose = true
    const h = startHarness({
      store: memory => ({
        ...memory,
        commit: async input => {
          const result = await memory.commit(input)
          if (
            lose &&
            input.writes.some(
              write =>
                write.kind === 'put' &&
                write.record.kind === 'operation' &&
                write.record.operation.receipt.kind === 'control',
            )
          ) {
            lose = false
            return { kind: 'unknown', diagnostic: 'lost committed response' }
          }
          return result
        },
      }),
    })
    const abort = new AbortController()
    try {
      await admitCall(h, 'controlled')
      await h.runOnce('controlled', abort.signal)
      const access = { principal: principalA, tenant: tenantA, call: callId('controlled') }
      const input = {
        ...access,
        operation: operationId('stop-lost'),
        intent: { kind: 'stop' } as const,
      }
      expect(await h.commands.control(input)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(ok(await h.ledger.reads.operation(input)).kind).toBe('committed')
      expect(ok(await h.commands.control(input)).operation).toBe(input.operation)
      const recovery = ok(await h.commands.loadRecovery(access))
      expect(recovery.controls).toHaveLength(1)
      expect(recovery.tasks.filter(task => task.kind === 'stop')).toHaveLength(1)
    } finally {
      abort.abort()
    }
  })

  it('rechecks current control qualification and keeps the committed refusal', async () => {
    const f = fixture()
    const abort = new AbortController()
    try {
      await admitCall(f.h, 'controlled')
      await f.h.runOnce('controlled', abort.signal)
      ok(
        await f.h.commands.control({
          ...f.access,
          operation: operationId('stop'),
          intent: { kind: 'stop' },
        }),
      )
      f.deniedActions.push('control')
      await f.h.runOnce('controlled', abort.signal)
      const recovery = ok(await f.h.commands.loadRecovery(f.access))
      expect(recovery.controls[0]?.progress).toMatchObject({
        kind: 'rejected',
        reason: 'control-qualification-denied',
      })
      expect(recovery.tasks.some(task => task.kind === 'stop')).toBe(false)
      expect(f.stops).toEqual([])
      expect(recovery.state.execution.kind).toBe('live')
    } finally {
      abort.abort()
    }
  })

  it('rejects foreign tenants and stale execution confirmations without changing the successor', async () => {
    const f = fixture()
    const abort = new AbortController()
    try {
      await admitCall(f.h, 'controlled')
      await f.h.runOnce('controlled', abort.signal)
      const intent = {
        ...f.access,
        operation: operationId('stop'),
        intent: { kind: 'stop' } as const,
      }
      expect(await f.h.commands.control({ ...intent, principal: principalB })).toMatchObject({
        failure: { kind: 'denied' },
      })
      ok(await f.h.commands.control(intent))
      const original = ok(await f.h.commands.loadRecovery(f.access))
      const control = original.controls[0]
      if (control === undefined) throw new Error('missing control')
      const domain = { kind: 'call', tenant: tenantA, call: f.access.call } as const
      const read = await f.h.memory.read(domain)
      if (read.kind !== 'complete') throw new Error('unreadable fixture')
      const record = read.records.find(item => item.kind === 'call')
      if (record?.kind !== 'call' || record.call.start === null)
        throw new Error('missing original start')
      const execution = { ...record.call.start.execution, generation: 'successor' }
      await f.h.memory.commit({
        domain,
        expected: read.revision,
        revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'call',
              call: { ...record.call, execution, start: { ...record.call.start, execution } },
            },
          },
        ],
      })
      const confirmation = {
        ...f.access,
        operation: operationId('late'),
        control: control.operation,
        source: control.source,
        progress: { kind: 'stopped', evidence: evidence('old-ended') } as const,
      }
      expect(
        await f.h.commands.recordControl({ ...confirmation, principal: principalB }),
      ).toMatchObject({ failure: { kind: 'denied' } })
      expect(await f.h.commands.recordControl(confirmation)).toMatchObject({
        failure: { kind: 'invalid', reason: 'not-original-execution' },
      })
      await f.h.runOnce('controlled', abort.signal)
      const successor = ok(await f.h.commands.loadRecovery(f.access))
      expect(successor.execution?.generation).toBe('successor')
      expect(successor.controls[0]?.progress.kind).toBe('pending')
      expect(f.stops).toEqual([])
    } finally {
      abort.abort()
    }
  })

  it('retains release and delivery duties after physical completion until original release is confirmed', async () => {
    let released = false
    const releases: ReleaseRecord[] = []
    const h = startHarness({
      environmentsPort: base =>
        Object.assign(base, {
          inspectRelease: async () =>
            succeed(
              released
                ? { kind: 'released' as const, evidence: evidence('released') }
                : { kind: 'pending' as const, diagnostic: 'cleanup pending' },
            ),
          release: async (input: { release: ReleaseRecord }) => {
            releases.push(input.release)
            return succeed({ kind: 'pending' as const, diagnostic: 'cleanup pending' })
          },
        }),
    })
    const abort = new AbortController()
    const access = { principal: principalA, tenant: tenantA, call: callId('release') }
    try {
      await admitCall(h, 'release')
      await h.runOnce('release', abort.signal)
      const recovery = ok(await h.commands.loadRecovery(access))
      if (recovery.start?.kind !== 'start') throw new Error('missing start')
      const raw = ok(
        await h.custody.preserve({
          ...access,
          operation: operationId('raw'),
          codec: adoption('codec'),
          bytes: new TextEncoder().encode('done'),
          source: evidence('raw'),
        }),
      )
      await h.binding.controls.finish(recovery.start, {
        kind: 'final',
        raw,
        terminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence: evidence('effect') },
        result: {
          content: [text('answer', 'done')],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        },
      })
      for (let i = 0; i < 30; i += 1) await Promise.resolve()
      await h.runOnce('release', abort.signal)
      const pending = ok(await h.commands.loadRecovery(access))
      expect(pending.state.phase).toBe('settled')
      expect(pending.tasks.some(task => task.kind === 'release')).toBe(true)
      expect(pending.tasks.some(task => task.kind === 'deliver')).toBe(true)
      expect(releases.length).toBeGreaterThan(0)
      expect(releases.every(item => item.operation === releases[0]?.operation)).toBe(true)
      released = true
      await h.runOnce('release', abort.signal)
      const complete = ok(await h.commands.loadRecovery(access))
      expect(complete.tasks.some(task => task.kind === 'release')).toBe(false)
      expect(complete.tasks.some(task => task.kind === 'deliver')).toBe(true)
      expect(complete.state.delivery?.kind).toBe('pending')
    } finally {
      abort.abort()
    }
  })
})
