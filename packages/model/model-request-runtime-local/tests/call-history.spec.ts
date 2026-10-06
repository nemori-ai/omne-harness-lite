import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { AppendResult, OwnedLogEntry, SessionLog } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '../src/call-history.ts'
import { projectCallState } from '../src/call-state.ts'
import {
  readSettlementPrefix,
  type SettlementPrefix,
  type SettlementPrefixResult,
} from '../src/settlement-prefix.ts'
import { type SettlementTaskKind } from '../src/settlement-types.ts'
import { acknowledgedAsTerminal, rejectAcknowledgedHistory } from '../src/call-history.ts'
import { dispatched, opened, prepare, reply, session, tenant } from './log-codec-fixture.ts'
import { batchV2, prepareV2, responseV5 } from './log-codec-v2-fixture.ts'
import { ControlledSettlementOwner } from './settlement-fixture.ts'

async function withLog(
  name: string,
  work: (input: {
    readonly append: (...entries: readonly OwnedLogEntry[]) => Promise<void>
    readonly submit: (...entries: readonly OwnedLogEntry[]) => Promise<AppendResult>
    readonly read: () => Promise<SettlementPrefix>
    readonly readResult: (source?: SessionLog) => Promise<SettlementPrefixResult>
    readonly log: SessionLog
    readonly invalidate: () => void
  }) => Promise<void>,
) {
  const root = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/b1-history/', import.meta.url),
  )
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, `${name}-`))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: {
      current: `b1-history:${process.pid}`,
      async observeExit() {
        return 'unknown'
      },
    },
  })
  const generation = Object.freeze({})
  let currentGeneration: object | null = generation
  const binding = {
    session,
    tenant,
    log,
    generation,
    currentGeneration: () => currentGeneration,
  }
  const owner = new ControlledSettlementOwner()
  try {
    async function readResult(source: SessionLog = log): Promise<SettlementPrefixResult> {
      const admission = owner.acquire(1)
      if (!('registration' in admission)) throw new Error('registration')
      const owned = admission.registration
      if (owned === undefined) throw new Error('registration')
      const stopped: Promise<void>[] = []
      const registration = {
        start: <T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) => {
          const task = owned.start(kind, operation)
          stopped.push(task.stopped)
          return task
        },
        release: owned.release,
      }
      const result = await readSettlementPrefix({
        binding: { ...binding, log: source },
        registration,
      })
      await Promise.all(stopped)
      registration.release()
      return result
    }
    await work({
      async append(...entries) {
        const result = await log.append(
          session,
          entries,
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        if ('failure' in result) throw new Error(`append: ${result.failure}`)
      },
      async submit(...entries) {
        return await log.append(session, entries, { kind: 'unfenced' }, { kind: 'unconditional' })
      },
      async read() {
        const result = await readResult()
        if (!('prefix' in result)) throw new Error(`read: ${result.reason}`)
        return result.prefix
      },
      readResult,
      log,
      invalidate() {
        currentGeneration = null
      },
    })
  } finally {
    await log.close()
  }
}

describe('RT5 S-6/S-8/S-34 one no-Run history interpretation over actual JSONL', () => {
  it('separates volatile open/reply_pending from durable anchors and complete MR5 batch', async () => {
    await withLog('frontier', async ({ append, submit, read }) => {
      const empty = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(empty).toEqual({ absent: true })
      expect(projectCallState({ session, callId: 'call', history: empty })).toEqual({
        callNotFound: true,
      })
      expect(
        projectCallState({
          session,
          callId: 'call',
          history: empty,
          local: { session, callId: 'call', phase: 'open' },
        }),
      ).toEqual({ phase: 'open', source: 'local_responsibility' })

      await append(prepare('record', dispatched, { kind: 'record' }))
      const sent = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(sent).toMatchObject({
        known: { phase: 'in_flight', dispatches: [{ response: null }] },
      })
      await append(prepare('record', opened, { kind: 'record' }))
      const speaking = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(speaking).toMatchObject({ known: { phase: 'speaking' } })
      expect(
        projectCallState({
          session,
          callId: 'call',
          history: speaking,
          local: { session, callId: 'call', phase: 'reply_pending', responseId: 'response' },
        }),
      ).toEqual({ phase: 'reply_pending', source: 'local_responsibility' })

      const committed = batchV2()
      await append(...committed)
      const complete = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(complete).toMatchObject({
        known: {
          phase: 'complete',
          dispatches: [{ response: { projection: { id: 'response' } } }],
        },
      })
      expect(
        projectCallState({
          session,
          callId: 'call',
          history: complete,
          local: { session, callId: 'call', phase: 'reply_pending', responseId: 'response' },
        }),
      ).toEqual({ phase: 'complete', source: 'durable' })
      expect(projectCallState({ session, callId: 'different-call', history: complete })).toEqual({
        unavailable: true,
      })
      const duplicate = await submit(...committed)
      expect(duplicate).toMatchObject({ failure: 'alreadyRecorded' })
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toMatchObject({
        known: {
          phase: 'complete',
          dispatches: [{ response: { projection: { id: 'response' } } }],
        },
      })
    })
  })

  it('rejects a fabricated empty prefix and a prefix from a revoked provider generation', async () => {
    await withLog('prefix-ownership', async ({ read, invalidate }) => {
      const real = await read()
      const fabricated = { binding: real.binding, entries: [], tail: 0 }
      expect(
        Reflect.apply(interpretCallHistory, undefined, [{ prefix: fabricated, callId: 'call' }]),
      ).toEqual({ unavailable: true, reason: 'prefix' })
      invalidate()
      expect(interpretCallHistory({ prefix: real, callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'prefix',
      })
    })
  })

  it('a lost append receipt cannot erase a complete batch already in the real log', async () => {
    await withLog('receipt-lost', async ({ append, submit, read }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      const write = await submit(...batchV2())
      if ('failure' in write) throw new Error('actual append failed')
      // The host sees an unavailable receipt even though the actual provider committed.
      const observed: AppendResult = { failure: 'unavailable' }
      expect(observed).toEqual({ failure: 'unavailable' })
      const history = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(history).toMatchObject({ known: { phase: 'complete' } })
    })
  })

  it('recognizes complete members when the provider returns equivalent lossless positions', async () => {
    await withLog('lossless-positions', async ({ append, readResult, log }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      await append(...batchV2())
      const losslessPositions: SessionLog = {
        ...log,
        async readSince(...args) {
          const actual = await log.readSince(...args)
          if ('failure' in actual) return actual
          return {
            entries: actual.entries.map((entry, index) => ({
              ...entry,
              position: new LosslessNumber(String(index + 1)),
            })),
            tail: new LosslessNumber(String(actual.entries.length)),
          }
        },
      }
      const result = await readResult(losslessPositions)
      if (!('prefix' in result)) throw new Error(`lossless read: ${result.reason}`)
      expect(interpretCallHistory({ prefix: result.prefix, callId: 'call' })).toMatchObject({
        known: { phase: 'complete' },
      })
    })
  })

  it('isolates a later call from an earlier complete reply in the same session', async () => {
    await withLog('two-calls', async ({ append, read }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      await append(...batchV2())
      const secondDispatch = { ...dispatched, call: 'call-b', response: 'response-b' }
      const secondOpened = { ...opened, call: 'call-b' }
      const secondReply = { ...reply, id: 'message-b', response: 'response-b' }
      const secondResponse = {
        ...responseV5,
        id: 'response-b',
        call: { callId: 'call-b' },
        reply: secondReply,
      }
      await append(prepare('record', secondDispatch, { kind: 'record' }))
      await append(prepare('record', secondOpened, { kind: 'record' }))
      await append(...batchV2(secondResponse))
      const prefix = await read()
      expect(interpretCallHistory({ prefix, callId: 'call-b' })).toMatchObject({
        known: {
          phase: 'complete',
          dispatches: [{ response: { projection: { id: 'response-b' } } }],
        },
      })
      expect(interpretCallHistory({ prefix, callId: 'never-opened' })).toEqual({ absent: true })
    })
  })

  it('the owned-prefix reader rejects a gapped provider read before state interpretation', async () => {
    await withLog('prefix-gap', async ({ append, readResult, log }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      const gapped: SessionLog = {
        ...log,
        async readSince(...args) {
          const actual = await log.readSince(...args)
          if ('failure' in actual) return actual
          return { entries: actual.entries.slice(1), tail: actual.tail }
        },
      }
      expect(await readResult(gapped)).toEqual({ unavailable: true, reason: 'prefix' })
    })
  })

  it('preserves resumable only for a fully settled pre-open runtime loss', async () => {
    await withLog('resumable', async ({ append, read }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      const { reply: _reply, replyDisposition: _disposition, ...base } = responseV5
      const lost = {
        ...base,
        outcome: 'interrupted',
        initiator: 'runtime_lost',
        timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
      }
      await append(prepareV2('response', lost, { kind: 'response' }))
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toMatchObject({
        known: {
          phase: 'resumable',
          dispatches: [{ opened: null, response: { projection: { outcome: 'interrupted' } } }],
        },
      })
    })
  })

  it('cannot turn an orphan persisted response into a settled terminal', async () => {
    await withLog('orphan', async ({ append, read }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      // The persisted reply requires [message,response] in one complete batch.
      await append(prepareV2('response', responseV5, { kind: 'response' }))
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'history',
      })
    })
  })

  it('does not call an orphan persisted reply for this call absent', async () => {
    await withLog('orphan-message', async ({ append, read }) => {
      const message = batchV2()[0]
      if (message === undefined) throw new Error('fixture message')
      await append(message)
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'history',
      })
    })
  })

  it('does not accept a persisted reply whose declared call read key is missing', async () => {
    await withLog('message-missing-call-key', async ({ append, read }) => {
      await append(prepare('record', dispatched, { kind: 'record' }))
      await append(prepare('record', opened, { kind: 'record' }))
      const [message, response] = batchV2()
      if (message === undefined || response === undefined) throw new Error('fixture batch')
      const callKey = encodeModelLogKey({ kind: 'call', call: 'call' })
      if (!('ok' in callKey)) throw new Error('fixture key')
      await append(
        { ...message, readKeys: message.readKeys.filter(key => key !== callKey.ok) },
        response,
      )
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'history',
      })
    })
  })

  it('does not infer absence from a future model log format', async () => {
    await withLog('unknown-format', async ({ append, read }) => {
      const known = prepare('record', dispatched, { kind: 'record' })
      if (
        known.payload === null ||
        typeof known.payload !== 'object' ||
        Array.isArray(known.payload)
      )
        throw new Error('fixture wrapper')
      await append({ ...known, payload: { ...known.payload, format: 'mrr/4' } })
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'unknown_format',
      })
    })
  })

  it('uses the shared reserved-key recognizer for foreign-format model entries', async () => {
    await withLog('foreign-reserved', async ({ append, read }) => {
      const known = prepare('record', dispatched, { kind: 'record' })
      if (
        known.payload === null ||
        typeof known.payload !== 'object' ||
        Array.isArray(known.payload)
      )
        throw new Error('fixture wrapper')
      const allKey = encodeModelLogKey({ kind: 'all' })
      if (!('ok' in allKey)) throw new Error('fixture all key')
      const { dedupeKey: _dedupe, ...withoutDedupe } = known
      await append({
        ...withoutDedupe,
        readKeys: [allKey.ok],
        payload: { ...known.payload, format: 'alien/1' },
      })
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'unknown_format',
      })
    })
  })

  it('does not treat an unknown mrr/2 category without a call key as absent', async () => {
    await withLog('unknown-category', async ({ append, read }) => {
      const known = prepare('record', dispatched, { kind: 'record' })
      if (
        known.payload === null ||
        typeof known.payload !== 'object' ||
        Array.isArray(known.payload)
      )
        throw new Error('fixture wrapper')
      const allKey = encodeModelLogKey({ kind: 'all' })
      if (!('ok' in allKey)) throw new Error('fixture all key')
      const { dedupeKey: _dedupe, ...withoutDedupe } = known
      await append({
        ...withoutDedupe,
        readKeys: [allKey.ok],
        payload: { ...known.payload, format: 'mrr/2', category: 'future' },
      })
      expect(interpretCallHistory({ prefix: await read(), callId: 'never-opened' })).toMatchObject({
        unavailable: true,
      })
    })
  })

  it('retains an intent-only call for reconciliation without claiming a durable open', async () => {
    await withLog('intent-only', async ({ append, read }) => {
      await append(
        prepare(
          'record',
          { kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' },
          { kind: 'record' },
        ),
      )
      const history = interpretCallHistory({ prefix: await read(), callId: 'call' })
      expect(history).toMatchObject({
        known: { phase: null, intent: { initiator: 'user' }, dispatches: [] },
      })
      expect(projectCallState({ session, callId: 'call', history })).toEqual({ unavailable: true })
    })
  })

  describe('RT12 S-95/S-97 acknowledged history projection', () => {
    const createdPayload = {
      kind: 'created',
      locator: 'created-locator',
      version: '1',
      digest: 'c'.repeat(64),
    } as const
    const readyPayload = {
      kind: 'reply_ready',
      locator: 'ready-locator',
      version: '1',
      digest: 'd'.repeat(64),
    } as const
    const created = {
      kind: 'model_call_created',
      call: 'call',
      creationKey: 'creation',
      payload: createdPayload,
      createdAt: '2026-09-27T00:00:00Z',
    }
    const ready = {
      kind: 'model_call_reply_ready',
      call: 'call',
      dispatch: 1,
      response: 'response',
      payload: readyPayload,
      readyAt: '2026-09-27T00:00:02Z',
    }
    const acknowledgement = {
      kind: 'model_call_acknowledged',
      call: 'call',
      creationKey: 'creation',
      creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'a'.repeat(64) },
      acknowledgedAt: '2026-09-27T00:00:03Z',
      releasablePayloads: [createdPayload],
      target: { kind: 'response', response: 'response' },
      terminalState: 'complete',
    }
    const record = (value: unknown) => prepare('record', value, { kind: 'record' })
    function witness(readyPosition: number) {
      return {
        retainedResultDigest: {
          role: 'model-call-retained-result-semantic-sha256/v1',
          hex: 'b'.repeat(64),
        },
        accountingWitness: {
          response: 'response',
          dispatch: 1,
          readyPosition,
          payload: readyPayload,
          origin: { tenant, session },
          outcome: 'complete',
          usage: {
            input_tokens: 11,
            output_tokens: 5,
            cache_read_tokens: 'unknown',
            cache_write_tokens: 0,
            source: 'upstream',
          },
          cost: {
            cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
            source: 'upstream_usage',
          },
          credentialScope: { layer: 'factory' },
          provider: 'first',
          timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
        },
      }
    }

    it('exposes one acknowledged complete call and every pre-ACK consumer fails closed', async () => {
      await withLog('ack-complete', async ({ append, submit, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(...batchV2())
        await append(record(acknowledgement))
        const history = interpretCallHistory({ prefix: await read(), callId: 'call' })
        expect(history).toMatchObject({
          known: {
            phase: 'complete',
            acknowledged: {
              record: { target: acknowledgement.target },
              // The ACK entry shell is the original creation shell.
              entry: { tenant, session, position: 6 },
            },
          },
        })
        expect(rejectAcknowledgedHistory(history)).toEqual({
          unavailable: true,
          reason: 'acknowledged',
        })
        expect(projectCallState({ session, callId: 'call', history })).toEqual({
          unavailable: true,
        })
        // MS8 S-58: the ACK has its own stable key; a different target is one conflicting fact.
        const conflicting = await submit(
          record({
            ...acknowledgement,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
        expect(conflicting).toHaveProperty('failure')
        expect(await submit(record(acknowledgement))).toMatchObject({ failure: 'alreadyRecorded' })
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toMatchObject({
          known: { acknowledged: { record: { acknowledgedAt: acknowledgement.acknowledgedAt } } },
        })
        const unacknowledged = interpretCallHistory({ prefix: await read(), callId: 'other' })
        expect(rejectAcknowledgedHistory(unacknowledged)).toEqual({ absent: true })
      })
    })

    it('accepts a ready-only terminal ACK only with its original accounting witness', async () => {
      await withLog('ack-ready-witness', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(record(ready))
        await append(record({ ...acknowledgement, ...witness(4) }))
        const history = interpretCallHistory({ prefix: await read(), callId: 'call' })
        expect(history).toMatchObject({
          known: {
            phase: 'reply_pending',
            acknowledged: { record: { accountingWitness: { dispatch: 1 } } },
          },
        })
        expect(rejectAcknowledgedHistory(history)).toEqual({
          unavailable: true,
          reason: 'acknowledged',
        })
        // RT12 S-100: control/new-work paths see the ACK's real terminal state.
        expect(acknowledgedAsTerminal(history)).toMatchObject({
          known: { phase: 'complete', acknowledged: null },
        })
      })
      await withLog('ack-ready-no-witness', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(record(ready))
        await append(record(acknowledgement))
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-ready-wrong-position', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(record(ready))
        await append(record({ ...acknowledgement, ...witness(3) }))
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
    })

    it('treats an ACK without its matching terminal source as history contradiction', async () => {
      await withLog('ack-not-terminal', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(record(acknowledgement))
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-open', async ({ append, read }) => {
        await append(record(created))
        await append(
          record({
            ...acknowledgement,
            target: { kind: 'ended', ending: 'released' },
            terminalState: 'handed_up',
          }),
        )
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-before-ending', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(
          record({
            ...acknowledgement,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
        await append(
          record({
            kind: 'model_call_ended',
            call: 'call',
            ending: 'interrupted',
            initiator: 'user',
          }),
        )
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-ended-interrupted', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(
          record({
            kind: 'model_call_ended',
            call: 'call',
            ending: 'interrupted',
            initiator: 'user',
          }),
        )
        await append(
          record({
            ...acknowledgement,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
        const history = interpretCallHistory({ prefix: await read(), callId: 'call' })
        expect(history).toMatchObject({
          known: {
            phase: 'interrupted',
            acknowledged: { record: { terminalState: 'interrupted' } },
          },
        })
      })
    })

    it('rejects an ACK whose creation source or releasable payloads are not this call', async () => {
      await withLog('ack-creation-key', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(...batchV2())
        await append(record({ ...acknowledgement, creationKey: 'another-creation' }))
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-foreign-payload', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(...batchV2())
        await append(
          record({
            ...acknowledgement,
            releasablePayloads: [{ ...createdPayload, locator: 'another-call-content' }],
          }),
        )
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
      await withLog('ack-other-run', async ({ append, read }) => {
        await append(record(created))
        await append(record(dispatched))
        await append(record(opened))
        await append(...batchV2())
        await append(
          prepare(
            'record',
            acknowledgement,
            { kind: 'record' },
            { tenant, run: 'run', attempt: 1 },
          ),
        )
        expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toEqual({
          unavailable: true,
          reason: 'history',
        })
      })
    })
  })

  it('keeps a Run-owned dispatched anchor as original history without guessing terminal facts', async () => {
    await withLog('run-unknown', async ({ append, read }) => {
      await append(
        prepare('record', dispatched, { kind: 'record' }, { tenant, run: 'run', attempt: 1 }),
      )
      expect(interpretCallHistory({ prefix: await read(), callId: 'call' })).toMatchObject({
        known: { callId: 'call', dispatches: [{ opened: null }] },
      })
    })
  })
})
