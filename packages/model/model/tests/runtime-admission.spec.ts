import { invocationReference } from './reference-input.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import { checkModelProviderConformance } from '@omne-harness/model-contract/testing'
import { fixture, identity, instance, op, proof, unbox, callId } from './memory-fixture.ts'

import { runtimeConformanceSubject } from './runtime-conformance-fixture.ts'

const configuration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 128,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
function assembled() {
  const f = fixture()
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 2,
    maxQueued: 100,
    sends: [],
  })
  const provider = createModelRuntime(assembly.dependencies, configuration)
  const drive = {
    ...f.admit,
    operation: op('claim'),
    instance: instance(),
    continuity: proof(f.admit.call),
  }
  return { ...f, ...assembly, provider, drive }
}
const signal = () => new AbortController().signal
function preparedReceipt(
  result: Awaited<ReturnType<ReturnType<typeof createModelRuntime>['driver']['drive']>>,
) {
  if ('failure' in result)
    expect(result.failure).toMatchObject({ kind: 'unavailable', dependency: 'model-send' })
}

it('rejects extra admit fields and preserves opaque identity on the closed input', async () => {
  const f = assembled()
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
  const caller = { ...f.admit, principal, onProgress: () => undefined }
  const admission: Parameters<typeof f.provider.runtime.calls.admit>[0] = caller
  expect(await f.provider.runtime.calls.admit(admission)).toEqual({
    failure: { kind: 'invalid', field: '', reason: 'unknown-field' },
  })
  expect(unbox(await f.provider.runtime.calls.admit({ ...f.admit, principal })).call).toBe(
    f.admit.call,
  )
  const inspection = { ...caller, reference: f.reference }
  const inspect: Parameters<typeof f.provider.runtime.calls.inspect>[0] = inspection
  expect(await f.provider.runtime.calls.inspect(inspect)).toMatchObject({ ok: { kind: 'found' } })
  const driving = { ...f.drive, principal, onProgress: caller.onProgress }
  const drive: Parameters<typeof f.provider.driver.drive>[0] = driving
  preparedReceipt(await f.provider.driver.drive(drive, signal()))
  const dispatches: Parameters<typeof f.provider.runtime.calls.dispatches>[0] = caller
  expect(unbox(await f.provider.runtime.calls.dispatches(dispatches))).toMatchObject([
    { send: 'prepared', materialization: null },
  ])
  const cancellation = { ...caller, operation: op('cancel') }
  const cancel: Parameters<typeof f.provider.runtime.calls.cancel>[0] = cancellation
  expect(unbox(await f.provider.runtime.calls.cancel(cancel))).toMatchObject({
    kind: 'requested',
    operation: cancellation.operation,
    propagation: 'pending',
    upstream: 'unknown',
  })
})

it('preserves all 53 obligations with actual runtime observation and controlled upstream', async () => {
  const hookEvents: unknown[] = []
  const report = await checkModelProviderConformance({
    subject: () => runtimeConformanceSubject(event => hookEvents.push(event)),
  })
  mkdirSync('../../../tmp/issue-455/checks', { recursive: true })
  writeFileSync('../../../tmp/issue-455/checks/conformance.json', JSON.stringify(report, null, 2))
  writeFileSync(
    '../../../tmp/issue-455/checks/conformance-hooks.json',
    JSON.stringify(hookEvents, null, 2),
  )
  expect(report.results).toHaveLength(53)
  const consumption = report.results.filter(row =>
    [
      'commit-unknown-acknowledge-recovers-original',
      'cross-tenant-access-refused',
      'refusal-hides-existence',
      'revoked-principal-gets-denied',
      'mixed-partial-result-readable',
      'settled-call-keeps-termination',
      'read-before-settle-refused',
      'acknowledge-refused-before-settle',
      'forged-evidence-refused',
      'acknowledge-records-custody',
      'duplicate-acknowledge-returns-original',
      'acknowledge-conflict-on-different-input',
      'acknowledged-result-not-read-again',
      'acknowledge-and-read-serialised',
      'read-page-stable-for-same-after',
      'close-read-idempotent',
      'acknowledge-keeps-open-read-readable',
      'revoked-reader-gets-no-page',
      'cleanup-failure-keeps-acknowledgement',
    ].includes(row.obligation),
  )
  expect(consumption).toHaveLength(19)
  expect(consumption.filter(row => row.status !== 'pass')).toEqual([])
  expect(
    report.results.find(row => row.obligation === 'settled-call-keeps-termination')?.status,
  ).toBe('pass')
  const required = report.results.filter(row =>
    [
      'observation-opens-with-snapshot',
      'stopping-observation-keeps-call-running',
      'disconnect-ends-observation-as-unavailable',
      'new-observer-starts-from-snapshot',
      'growing-block-holds-accumulated-value',
      'sealed-block-takes-no-more-fill',
      'unsealed-tool-arguments-not-executable',
      'revoked-principal-observation-ends-denied',
      'withdrawn-instance-has-no-live-route',
      'directory-failure-is-unavailable',
      'replaced-instance-ends-observation-as-stale',
    ].includes(row.obligation),
  )
  expect(required).toHaveLength(11)
  expect(required.filter(row => row.status !== 'pass')).toEqual([])
  expect(report.results.slice(0, 9).every(row => row.status === 'pass')).toBe(true)
  expect(report.results.slice(-6).every(row => row.status === 'pass')).toBe(true)
})
it('prepares one dispatch with a stable claim, without sending; repeats keep the same generation', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  preparedReceipt(await f.provider.driver.drive(f.drive, signal()))
  const first = unbox(await f.dependencies.commands.loadRecovery(f.admit))
  expect(first.execution?.generation).toBe('1')
  const records = unbox(await f.provider.runtime.calls.dispatches(f.admit))
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ send: 'prepared', materialization: null })
  preparedReceipt(await f.provider.driver.drive(f.drive, signal()))
  expect(await f.dependencies.commands.loadRecovery(f.admit)).toEqual({ ok: first })
  expect(await f.provider.runtime.calls.dispatches(f.admit)).toEqual({ ok: records })
  expect(
    await f.provider.runtime.calls.inspect({
      ...f.admit,
      tenant: identity('6'),
      reference: invocationReference({
        ...f.admit,
        tenant: identity('6'),
        admission: f.admit.operation,
      }),
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  f.denied.add('recovery')
  expect(await f.provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'denied' },
  })
})
for (const effect of ['applied', 'not-applied'] as const) {
  it(`retains the complete prepare input after unknown ${effect} and rechecks current authority`, async () => {
    const f = assembled()
    const commands = f.dependencies.commands
    const writes: Parameters<typeof commands.prepareDispatch>[0][] = []
    let unknown = true
    const wrapped = {
      ...commands,
      prepareDispatch: async (input: Parameters<typeof commands.prepareDispatch>[0]) => {
        writes.push(structuredClone(input))
        if (unknown) {
          unknown = false
          f.controls.commands.injectUnknown({ ...input, method: 'prepareDispatch', effect })
        }
        return commands.prepareDispatch(input)
      },
    }
    const provider = createModelRuntime({ ...f.dependencies, commands: wrapped }, configuration)
    unbox(await provider.runtime.calls.admit(f.admit))
    expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
      failure: { kind: 'commit-unknown' },
    })
    const original = writes[0]
    if (!original) throw new Error('missing prepare')
    expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
      failure: { kind: 'commit-unknown', operation: original.operation },
    })
    expect(writes).toHaveLength(1)
    expect(
      await provider.driver.drive({ ...f.drive, instance: instance('other') }, signal()),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    f.denied.add('recovery')
    expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
      failure: { kind: 'denied' },
    })
    f.denied.delete('recovery')
    f.controls.commands.reveal({
      ...f.admit,
      operation: original.operation,
      result: effect === 'applied' ? 'committed' : 'not-committed',
    })
    preparedReceipt(await provider.driver.drive(f.drive, signal()))
    expect(writes).toHaveLength(2)
    expect(writes[1]).toEqual(original)
    expect(unbox(await commands.dispatches(f.admit))).toHaveLength(1)
  })
}
it('ends a known conflict attempt so a later drive can prepare again', async () => {
  const f = assembled()
  const commands = f.dependencies.commands
  const writes: Parameters<typeof commands.prepareDispatch>[0][] = []
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      commands: {
        ...commands,
        prepareDispatch: async input => {
          writes.push(input)
          if (writes.length === 1) {
            return {
              failure: {
                kind: 'conflict',
                operation: input.operation,
                revision: unbox(await commands.loadRecovery(f.admit)).state.revision,
              },
            }
          }
          return commands.prepareDispatch(input)
        },
      },
    },
    configuration,
  )
  unbox(await provider.runtime.calls.admit(f.admit))
  expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'conflict' },
  })
  preparedReceipt(await provider.driver.drive(f.drive, signal()))
  expect(writes).toHaveLength(2)
  expect(writes[1]?.operation).not.toBe(writes[0]?.operation)
  expect(unbox(await commands.dispatches(f.admit))).toHaveLength(1)
})
it('rejects conflicting continuity and stale claims without creating a second dispatch', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  preparedReceipt(await f.provider.driver.drive(f.drive, signal()))
  expect(
    await f.provider.driver.drive({ ...f.drive, continuity: proof('changed') }, signal()),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  unbox(
    await f.dependencies.commands.claim({
      ...f.drive,
      operation: op('successor'),
      instance: instance('successor'),
    }),
  )
  expect(await f.provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'stale-instance' },
  })
  expect(unbox(await f.provider.runtime.calls.dispatches(f.admit))).toHaveLength(1)
})
it('commits cancellation intent and leaves it pending rather than claiming upstream stopped', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  const cancel = { ...f.admit, operation: op('cancel') }
  expect(unbox(await f.provider.runtime.calls.cancel(cancel))).toMatchObject({
    kind: 'requested',
    operation: cancel.operation,
    propagation: 'pending',
    upstream: 'unknown',
  })
  preparedReceipt(await f.provider.driver.drive(f.drive, signal()))
  expect(unbox(await f.provider.runtime.calls.dispatches(f.admit))).toEqual([])
})
it('keeps committed admission despite schedule failure, snapshots inputs, and preserves opaque principal identity', async () => {
  const f = assembled()
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
  const scheduled: unknown[] = []
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: {
        ...f.dependencies.instances,
        schedule: async input => {
          scheduled.push(input)
          throw new Error('offline')
        },
      },
    },
    configuration,
  )
  const input = { ...f.admit, principal, request: structuredClone(f.admit.request) }
  const pending = provider.runtime.calls.admit(input)
  input.call = callId('mutated')
  input.tenant = identity('6')
  Object.assign(input.request.suppliers[0], { model: 'mutated' })
  expect(await pending).toMatchObject({ ok: { call: f.admit.call } })
  expect(scheduled).toEqual([{ tenant: f.tenant, call: f.admit.call }])
  expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).request).toEqual(
    f.admit.request,
  )
})
it('returns busy only after authorization, and stopping local work leaves durable responsibility', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  let resume!: () => void
  const gate = new Promise<void>(resolve => {
    resume = resolve
  })
  let entered!: () => void
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  const commands = f.dependencies.commands
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      commands: {
        ...commands,
        claim: async input => {
          entered()
          await gate
          return commands.claim(input)
        },
      },
    },
    configuration,
  )
  const abort = new AbortController()
  const first = provider.driver.drive(f.drive, abort.signal)
  await ready
  expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  f.denied.add('recovery')
  expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'denied' },
  })
  f.denied.delete('recovery')
  abort.abort()
  resume()
  unbox(await first)
  expect(unbox(await commands.loadRecovery(f.admit)).tasks).toContain('execute')
  expect(unbox(await commands.dispatches(f.admit))).toEqual([])
  preparedReceipt(await provider.driver.drive(f.drive, signal()))
  expect(unbox(await commands.dispatches(f.admit))).toHaveLength(1)
})
it('does not reuse an unresolved prepare across provider instances or claim identities', async () => {
  const f = assembled()
  let original: Parameters<typeof f.dependencies.commands.prepareDispatch>[0] | undefined
  const commands = {
    ...f.dependencies.commands,
    prepareDispatch: async (
      input: Parameters<typeof f.dependencies.commands.prepareDispatch>[0],
    ) => {
      original = input
      f.controls.commands.injectUnknown({
        ...input,
        method: 'prepareDispatch',
        effect: 'not-applied',
      })
      return f.dependencies.commands.prepareDispatch(input)
    },
  }
  const provider = createModelRuntime({ ...f.dependencies, commands }, configuration)
  unbox(await provider.runtime.calls.admit(f.admit))
  expect(await provider.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  if (!original) throw new Error('missing prepare')
  const other = createModelRuntime(f.dependencies, configuration)
  expect(await other.driver.drive(f.drive, signal())).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  for (const input of [
    { ...f.drive, operation: op('other-claim') },
    { ...f.drive, instance: instance('other') },
    { ...f.drive, continuity: proof('other') },
  ])
    expect(await provider.driver.drive(input, signal())).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))).toEqual([])
})
it('retains unknown prepare when aborted during the write and fixes drive input before awaiting', async () => {
  const f = assembled()
  const abort = new AbortController()
  let original: Parameters<typeof f.dependencies.commands.prepareDispatch>[0] | undefined
  const commands = {
    ...f.dependencies.commands,
    prepareDispatch: async (
      input: Parameters<typeof f.dependencies.commands.prepareDispatch>[0],
    ) => {
      original = input
      f.controls.commands.injectUnknown({ ...input, method: 'prepareDispatch', effect: 'applied' })
      const result = await f.dependencies.commands.prepareDispatch(input)
      abort.abort()
      return result
    },
  }
  const provider = createModelRuntime({ ...f.dependencies, commands }, configuration)
  unbox(await provider.runtime.calls.admit(f.admit))
  const input = { ...f.drive, continuity: { ...f.drive.continuity } }
  const pending = provider.driver.drive(input, abort.signal)
  input.call = callId('mutated')
  input.instance = instance('mutated')
  input.continuity.record = 'mutated'
  expect(await pending).toMatchObject({ failure: { kind: 'commit-unknown' } })
  if (!original) throw new Error('missing prepare')
  expect(original.call).toBe(f.admit.call)
  expect(original.instance).toBe(f.drive.instance)
  f.controls.commands.reveal({ ...f.admit, operation: original.operation, result: 'committed' })
  preparedReceipt(await provider.driver.drive(f.drive, signal()))
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))).toHaveLength(1)
})
