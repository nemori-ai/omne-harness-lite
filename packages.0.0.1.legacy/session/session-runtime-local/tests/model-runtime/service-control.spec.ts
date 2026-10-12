import { appendControlRecord } from '@omne-harness-lite/session-runtime-local'
import { UnknownAppendTracker } from '@omne-harness-lite/model-request-runtime'
import { sessionModelRequestPreparation } from '@omne-harness-lite/session-runtime-local'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSqlLogFixture } from '../../../../model/model-request-runtime-local/tests/sql-log-fixture.ts'
import {
  classifyInterrupt,
  classifyRelease,
  type ControlFacts,
} from '../../dist/model-runtime/service-control.js'
import { OwnedAppendTracker } from '../../dist/model-runtime/service-control.js'
import { OwnedReadTracker, withOwnedReads } from '@omne-harness-lite/model-request-runtime'
import {
  ControlledSettlementOwner,
  controlled,
  deferred,
} from '../../../../model/model-request-runtime-local/tests/settlement-fixture.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendResult } from '@omne-harness-lite/session-log'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'

const absent: ControlFacts = { durable: { absent: true }, localCall: false }
const unavailable: ControlFacts = { durable: { unavailable: true }, localCall: true }
const known = (
  phase: Extract<ControlFacts['durable'], { phase: unknown }>['phase'],
  intentExists = false,
): ControlFacts => ({ durable: { phase, intentExists }, localCall: true })

it('commits a Run control record with its actual attempt fence and unconditional condition', async () => {
  await controlled('run-control-fence', async ({ binding, owner, submissions }) => {
    const result = await appendControlRecord({
      binding,
      owner,
      concurrent: 2,
      run: 'controlled-run',
      attempt: 2,
      record: { kind: 'model_call_interrupt_intent', call: 'run-call', initiator: 'user' },
      retainUnknown() {
        throw new Error('known control receipt unexpectedly quarantined')
      },
    })
    expect(result).toEqual({ appended: true })
    expect(submissions.at(-1)).toMatchObject({
      fence: { kind: 'fenced', run: 'controlled-run', attempt: 2 },
      condition: { kind: 'unconditional' },
      count: 1,
    })
    const read = await binding.log.readSince(binding.session, 0)
    if ('failure' in read) throw new Error('Run control log read')
    const entry = read.entries.at(-1)
    expect(entry?.run).toBe('controlled-run')
    expect(entry?.attempt).toBe(2)
  })
})

it('close requests read stop and waits for actual stopped before releasing its owner', async () => {
  const owner = new ControlledSettlementOwner()
  const barrier = deferred<void>()
  const started = deferred<void>()
  owner.stopBarrier = barrier.promise
  const tracker = new OwnedReadTracker()
  const pending = withOwnedReads(
    owner,
    1,
    tracker,
    async registration =>
      await registration.start('read', async signal => {
        started.resolve(undefined)
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
        })
        return true
      }).completion,
  )
  await started.promise
  expect(owner.active).toBe(1)
  let closeFinished = false
  const closing = tracker.close().then(result => {
    closeFinished = true
    return result
  })
  await Promise.resolve()
  expect(closeFinished).toBe(false)
  expect(owner.active).toBe(1)
  barrier.resolve(undefined)
  expect(await closing).toEqual({ released: true })
  expect(await pending).toEqual({ unavailable: true })
  expect(owner.active).toBe(0)
  expect(await withOwnedReads(owner, 1, tracker, async () => true)).toEqual({ unavailable: true })
})

it('close retains a started append until its backend has actually stopped', async () => {
  const owner = new ControlledSettlementOwner()
  const entered = deferred<void>()
  const backend = deferred<AppendResult>()
  const stopped = deferred<void>()
  owner.stopBarrier = stopped.promise
  const parsedTenant = parseTenantId({ organization: 'control-org', account: 'control-account' })
  if (!('ok' in parsedTenant)) throw new Error('invalid fixture tenant')
  const session = unwrap(parseOpaqueIdentifier('control-session', 'SessionRef'))
  const generation = Object.freeze({})
  const appends = new OwnedAppendTracker()
  const pending = appendControlRecord({
    binding: {
      session,
      tenant: parsedTenant.ok,
      readPrefix: async () => ({ failure: 'unavailable' as const }),
      log: {
        readSince: async () => ({ failure: 'unavailable' }),
        readByKey: async () => ({ failure: 'unavailable' }),
        append: async () => {
          entered.resolve(undefined)
          return await backend.promise
        },
      },
      generation,
      currentGeneration: () => generation,
    },
    owner,
    concurrent: 1,
    record: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
    retainUnknown() {
      throw new Error('known receipt unexpectedly quarantined')
    },
    trackTask: task => appends.track(task),
  })
  await entered.promise
  expect(owner.active).toBe(1)
  let finished = false
  const closing = appends.close().then(result => {
    finished = true
    return result
  })
  await Promise.resolve()
  expect(finished).toBe(false)
  backend.resolve({ positions: [1], tail: 1 })
  await Promise.resolve()
  expect(finished).toBe(false)
  stopped.resolve(undefined)
  expect(await pending).toEqual({ appended: true })
  expect(await closing).toEqual({ released: true })
  expect(owner.active).toBe(0)
})

describe('RT7 S-31/S-32 control admission from owned facts', () => {
  it('distinguishes absent, unknown, and an unrecorded open call', () => {
    expect(classifyInterrupt(absent)).toEqual({ rejected: 'callNotFound' })
    expect(classifyRelease(absent)).toEqual({ rejected: 'callNotFound' })
    expect(classifyInterrupt(unavailable)).toEqual({ rejected: 'unavailable' })
    expect(classifyRelease(unavailable)).toEqual({ rejected: 'unavailable' })
    expect(classifyInterrupt({ durable: { absent: true }, localCall: true })).toEqual({
      stage: 'before_dispatch',
      intentExists: false,
    })
    expect(
      classifyInterrupt({ durable: { noDispatch: true, intentExists: true }, localCall: true }),
    ).toEqual({ stage: 'before_dispatch', intentExists: true })
    expect(
      classifyInterrupt({ durable: { noDispatch: true, intentExists: true }, localCall: false }),
    ).toEqual({ rejected: 'unavailable' })
  })

  it('returns the durable control stage and preserves an existing intent', () => {
    expect(classifyInterrupt(known('awaiting_decision'))).toEqual({
      stage: 'before_dispatch',
      intentExists: false,
    })
    expect(classifyInterrupt(known('resumable', true))).toEqual({
      stage: 'before_dispatch',
      intentExists: true,
    })
    expect(classifyInterrupt(known('in_flight', true))).toEqual({
      stage: 'in_flight',
      intentExists: true,
    })
    expect(classifyInterrupt(known('speaking'))).toEqual({
      stage: 'speaking',
      intentExists: false,
    })
  })

  it('absorbs terminal phases and a local pending reply before examining intent', () => {
    for (const phase of ['complete', 'interrupted', 'handed_up'] as const) {
      expect(classifyInterrupt(known(phase, true))).toEqual({ rejected: 'alreadyEnded' })
      expect(classifyRelease(known(phase, true))).toEqual({ rejected: 'alreadyEnded' })
    }
    const pending: ControlFacts = {
      ...known('speaking', true),
      operation: { phase: 'reply_pending' },
    }
    expect(classifyInterrupt(pending)).toEqual({ rejected: 'alreadyEnded' })
    expect(classifyRelease(pending)).toEqual({ wrongPhase: 'reply_pending' })
  })

  it('releases only awaiting_decision or resumable', () => {
    expect(classifyRelease(known('awaiting_decision'))).toEqual({ allowed: true })
    expect(classifyRelease(known('resumable'))).toEqual({ allowed: true })
    expect(classifyRelease(known('in_flight'))).toEqual({ wrongPhase: 'in_flight' })
    expect(classifyRelease(known('awaiting_decision', true))).toEqual({
      rejected: 'unavailable',
    })
    expect(classifyRelease({ durable: { absent: true }, localCall: true })).toEqual({
      wrongPhase: 'open',
    })
  })
})

describe('RT7 S-31/S-68 actual control append', () => {
  it('writes one current-format intent before a caller may signal abort', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mrr-control-'))
    const log = await openSqlLogFixture({ dir: dir })
    const parsedTenant = parseTenantId({ organization: 'control-org', account: 'control-account' })
    if (!('ok' in parsedTenant)) throw new Error('invalid fixture tenant')
    let releases = 0
    const owner: SettlementOwner = {
      name: 'control-test',
      admission: () => 'open',
      acquire: () => ({
        registration: {
          start(_kind, operation) {
            const completion = Promise.resolve().then(() => operation(new AbortController().signal))
            return {
              completion,
              requestStop() {},
              stopped: completion.then(
                () => undefined,
                () => undefined,
              ),
            }
          },
          release() {
            releases++
          },
        },
      }),
      opened: () => ({ confirmed: true }),
      unresolvedWrites: () => [],
    }
    const session = unwrap(parseOpaqueIdentifier('control-session', 'SessionRef'))
    const generation = Object.freeze({})
    try {
      const result = await appendControlRecord({
        binding: {
          session,
          tenant: parsedTenant.ok,
          log,
          generation,
          currentGeneration: () => generation,
        },
        owner,
        concurrent: 1,
        record: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
        retainUnknown() {
          throw new Error('known receipt unexpectedly quarantined')
        },
      })
      expect(result).toEqual({ appended: true })
      expect(releases).toBe(1)
      const read = await log.readSince(session, 0)
      if ('failure' in read) throw new Error(read.failure)
      expect(read.entries).toHaveLength(1)
      expect(read.entries[0]?.payload).toEqual({
        kind: 'fact',
        owner: 'model-request-runtime',
        version: 'mrr/3',
        value: {
          category: 'record',
          value: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
        },
      })
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('retains ownership when the log committed but the receipt is unconfirmed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mrr-control-unknown-'))
    const log = await openSqlLogFixture({ dir: dir })
    const parsedTenant = parseTenantId({ organization: 'control-org', account: 'control-account' })
    if (!('ok' in parsedTenant)) throw new Error('invalid fixture tenant')
    let releases = 0
    let retained:
      | {
          readonly registration: SettlementRegistration
          readonly task: SettlementTask<AppendResult>
        }
      | undefined
    let active = 0
    let acquires = 0
    const kinds: string[] = []
    const owner: SettlementOwner = {
      name: 'control-unknown',
      admission: () => 'open',
      acquire: () => {
        acquires++
        if (active !== 0) return { unavailable: true }
        active++
        return {
          registration: {
            start(kind, operation) {
              kinds.push(kind)
              const completion = Promise.resolve().then(() =>
                operation(new AbortController().signal),
              )
              return {
                completion,
                requestStop() {},
                stopped: completion.then(
                  () => undefined,
                  () => undefined,
                ),
              }
            },
            release() {
              releases++
              active--
            },
          },
        }
      },
      opened: () => ({ confirmed: true }),
      unresolvedWrites: () => (retained === undefined ? [] : [retained.task]),
    }
    const session = unwrap(parseOpaqueIdentifier('control-session', 'SessionRef'))
    const generation = Object.freeze({})
    const tracker = new UnknownAppendTracker()
    let readAvailable = false
    let completeReads = 0
    const binding = {
      session,
      tenant: parsedTenant.ok,
      readPrefix(this: import('@omne-harness-lite/model-request-runtime').SettlementLogBinding) {
        return log.fixturePrefix({ session: this.session, tenant: this.tenant }, this.log)
      },
      log: {
        async readSince(...args: Parameters<typeof log.readSince>) {
          if (!readAvailable) return { failure: 'unavailable' as const }
          const result = await log.readSince(...args)
          if (!('failure' in result)) completeReads++
          return result
        },
        readByKey: log.readByKey.bind(log),
        async append(...args: Parameters<typeof log.append>) {
          const actual = await log.append(...args)
          if ('failure' in actual) return actual
          return { failure: 'unavailable' as const }
        },
      },
      generation,
      currentGeneration: () => generation,
    }
    try {
      const result = await appendControlRecord({
        binding,
        owner,
        concurrent: 1,
        record: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
        retainUnknown(registration, task) {
          retained = { registration, task }
          tracker.keep(
            { session, callId: 'control-call' },
            binding,
            owner,
            registration,
            task,
            (prefix, callId) => interpretCallHistory({ prefix, callId }),
            sessionModelRequestPreparation.readCall,
          )
        },
      })
      expect(result).toEqual({ unavailable: true })
      expect(kinds).toEqual(['controlAppend'])
      expect(releases).toBe(0)
      expect(active).toBe(1)
      expect(acquires).toBe(1)
      expect(retained).toBeDefined()
      const read = await log.readSince(session, 0)
      if ('failure' in read) throw new Error(read.failure)
      expect(read.entries).toHaveLength(1)
      expect(read.entries[0]?.payload).toMatchObject({
        kind: 'fact',
        owner: 'model-request-runtime',
        version: 'mrr/3',
        value: {
          category: 'record',
          value: { kind: 'model_call_interrupt_intent', call: 'control-call' },
        },
      })
      await retained?.task.stopped
      expect(await tracker.close()).toEqual({ unavailable: true })
      expect(releases).toBe(0)
      expect(active).toBe(1)
      expect(acquires).toBe(1)
      readAvailable = true
      expect(await tracker.close()).toEqual({ released: true })
      expect(completeReads).toBe(1)
      expect(releases).toBe(1)
      expect(active).toBe(0)
      expect(acquires).toBe(1)
      expect(kinds).toEqual(['controlAppend', 'read', 'read'])
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
