import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  appendControlRecord,
  classifyInterrupt,
  classifyRelease,
  type ControlFacts,
} from '../src/service-control.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '../src/settlement-types.ts'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'

const absent: ControlFacts = { durable: { absent: true }, localCall: false }
const unavailable: ControlFacts = { durable: { unavailable: true }, localCall: true }
const known = (
  phase: Extract<ControlFacts['durable'], { phase: unknown }>['phase'],
  intentExists = false,
): ControlFacts => ({ durable: { phase, intentExists }, localCall: true })

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
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: {
        current: `control-test:${process.pid}`,
        async observeExit() {
          return 'unknown'
        },
      },
    })
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
        format: 'mrr/3',
        category: 'record',
        value: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
      })
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('retains ownership when the log committed but the receipt is unconfirmed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mrr-control-unknown-'))
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: {
        current: `control-unknown:${process.pid}`,
        async observeExit() {
          return 'unknown'
        },
      },
    })
    const parsedTenant = parseTenantId({ organization: 'control-org', account: 'control-account' })
    if (!('ok' in parsedTenant)) throw new Error('invalid fixture tenant')
    let releases = 0
    let retained:
      | {
          readonly registration: SettlementRegistration
          readonly task: SettlementTask<AppendResult>
        }
      | undefined
    const owner: SettlementOwner = {
      name: 'control-unknown',
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
      unresolvedWrites: () => (retained === undefined ? [] : [retained.task]),
    }
    const session = unwrap(parseOpaqueIdentifier('control-session', 'SessionRef'))
    const generation = Object.freeze({})
    try {
      const result = await appendControlRecord({
        binding: {
          session,
          tenant: parsedTenant.ok,
          log: {
            readSince: log.readSince.bind(log),
            readByKey: log.readByKey.bind(log),
            async append(...args) {
              const actual = await log.append(...args)
              if ('failure' in actual) return actual
              return { failure: 'unavailable' }
            },
          },
          generation,
          currentGeneration: () => generation,
        },
        owner,
        concurrent: 1,
        record: { kind: 'model_call_interrupt_intent', call: 'control-call', initiator: 'user' },
        retainUnknown(registration, task) {
          retained = { registration, task }
        },
      })
      expect(result).toEqual({ unavailable: true })
      expect(releases).toBe(0)
      expect(retained).toBeDefined()
      const read = await log.readSince(session, 0)
      if ('failure' in read) throw new Error(read.failure)
      expect(read.entries).toHaveLength(1)
      expect(read.entries[0]?.payload).toMatchObject({
        format: 'mrr/3',
        value: { kind: 'model_call_interrupt_intent', call: 'control-call' },
      })
      await retained?.task.stopped
      retained?.registration.release()
      expect(releases).toBe(1)
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
