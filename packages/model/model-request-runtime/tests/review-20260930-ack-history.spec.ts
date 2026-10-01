/**
 * Independent counterexamples for T29 task A (ACK history projection), review 2026-09-30.
 * Derived from RT12 S-95..S-101 and MS8 S-56..S-59, not from the author's tests.
 * Every case runs over the actual JSONL session log.
 */
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { AppendResult, OwnedLogEntry, SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  captureModelLogValue,
  encodeModelLogKey,
  interpretCallHistory,
  interpretSettlementPrefix,
  readSettlementPrefix,
  type SettlementPrefix,
  type SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import { decodeModelLogKey } from '../src/log-codec-key.ts'
import { dispatched, opened, prepare, session, tenant } from './log-codec-fixture.ts'
import { prepareV2, responseV5 } from './log-codec-v2-fixture.ts'
import { ControlledSettlementOwner } from './settlement-fixture.ts'

type Harness = {
  readonly append: (...entries: readonly OwnedLogEntry[]) => Promise<void>
  readonly submit: (...entries: readonly OwnedLogEntry[]) => Promise<AppendResult>
  readonly read: () => Promise<SettlementPrefix>
  readonly log: SessionLog
}
async function withLog(name: string, work: (h: Harness) => Promise<void>) {
  const root = fileURLToPath(
    new URL('../../../../tmp/runtime-review-20260930/history/', import.meta.url),
  )
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, `${name}-`))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: {
      current: `review-history:${process.pid}`,
      async observeExit() {
        return 'unknown'
      },
    },
  })
  const generation = Object.freeze({})
  const binding = { session, tenant, log, generation, currentGeneration: () => generation }
  const owner = new ControlledSettlementOwner()
  try {
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
        const admission = owner.acquire(1)
        if (!('registration' in admission)) throw new Error('registration')
        const owned = admission.registration
        const stopped: Promise<void>[] = []
        const registration = {
          start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
            const task = owned.start(kind, op)
            stopped.push(task.stopped)
            return task
          },
          release: owned.release,
        }
        const result = await readSettlementPrefix({ binding, registration })
        await Promise.all(stopped)
        registration.release()
        if (!('prefix' in result)) throw new Error(`read: ${result.reason}`)
        return result.prefix
      },
      log,
    })
  } finally {
    await log.close()
  }
}

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
const ack = {
  kind: 'model_call_acknowledged',
  call: 'call',
  creationKey: 'creation',
  creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'a'.repeat(64) },
  acknowledgedAt: '2026-09-27T00:00:03Z',
  releasablePayloads: [createdPayload],
  target: { kind: 'response', response: 'response' },
  terminalState: 'complete',
}
const rec = (value: unknown) => prepare('record', value, { kind: 'record' })
function witness(readyPosition: number, over: Record<string, unknown> = {}) {
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
      ...over,
    },
  }
}
const finalEntries = () => {
  // A complete no-reply-disposition-persisted response batch would need the message; use the
  // fixture batch (message + response) through the v2 fixture.
  const captured = responseV5
  return captured
}
void finalEntries

/** created, dispatched, opened, final (message+response). */
async function completeCall(h: Harness) {
  await h.append(rec(created))
  await h.append(rec(dispatched))
  await h.append(rec(opened))
  const { batchV2 } = await import('./log-codec-v2-fixture.ts')
  await h.append(...batchV2())
}
const history = async (h: Harness) =>
  interpretCallHistory({ prefix: await h.read(), callId: 'call' })
const HISTORY = { unavailable: true, reason: 'history' } as const

describe('review 2026-09-30 / Q1 ACK key: independent kind domain (MS8 S-58)', () => {
  it('acknowledged key differs from every other key kind of the same call and round-trips', () => {
    const kinds = ['call', 'created', 'intent', 'ended', 'acknowledged'] as const
    const encoded = kinds.map(kind => {
      const value = encodeModelLogKey({ kind, call: 'call' })
      if (!('ok' in value)) throw new Error(kind)
      return value.ok
    })
    expect(new Set(encoded).size).toBe(kinds.length)
    for (const [index, key] of encoded.entries()) {
      expect(decodeModelLogKey(key)).toEqual({ ok: { kind: kinds[index], call: 'call' } })
    }
    // a CallKey whose text equals another kind name cannot collide across kinds
    for (const call of ['ended', 'acknowledged', 'a","b', 'call\u0000x']) {
      const a = encodeModelLogKey({ kind: 'acknowledged', call })
      const e = encodeModelLogKey({ kind: 'ended', call })
      if (!('ok' in a) || !('ok' in e)) continue
      expect(a.ok).not.toBe(e.ok)
    }
    expect(
      encodeModelLogKey({ kind: 'acknowledged', call: 'c', extra: 1 } as never),
    ).toHaveProperty('invalidValue')
    // not decodable if the kind carries a dispatch component
    expect(decodeModelLogKey(`mrr/3/["acknowledged","call","1e0"]`)).toEqual({ invalidKey: true })
  })

  it('the prepared ACK entry carries only its own dedupe key and never the ended/created/creation keys', () => {
    const entry = rec({ ...ack })
    const own = encodeModelLogKey({ kind: 'acknowledged', call: 'call' })
    const ended = encodeModelLogKey({ kind: 'ended', call: 'call' })
    const creation = encodeModelLogKey({ kind: 'creation', creationKey: 'creation' })
    if (!('ok' in own) || !('ok' in ended) || !('ok' in creation)) throw new Error('keys')
    expect(entry.dedupeKey).toBe(own.ok)
    expect(entry.readKeys).not.toContain(ended.ok)
    expect(entry.readKeys).not.toContain(creation.ok)
  })

  it('actual log: same-target ACK with any other value is refused; identical value is recognized', async () => {
    await withLog('q1-log', async h => {
      await completeCall(h)
      await h.append(rec(ack))
      // identical original value -> alreadyRecorded (idempotent recognition)
      expect(await h.submit(rec(ack))).toMatchObject({ failure: 'alreadyRecorded' })
      // same target, different acknowledgedAt / releasable set / digest -> must not append
      for (const changed of [
        { ...ack, acknowledgedAt: '2026-09-27T00:00:04Z' },
        { ...ack, releasablePayloads: [] },
        { ...ack, creationInput: { ...ack.creationInput, hex: 'e'.repeat(64) } },
      ]) {
        const result = await h.submit(rec(changed))
        // SessionLog dedupes on the key alone (state.ts judgeAppend), so a different value is
        // refused with the same `alreadyRecorded` as an identical replay: the log cannot tell
        // them apart. R-J's "only whole-value equality is an idempotent recognition" therefore
        // has to be enforced by the ACK writer after reading back; nothing in this build does.
        expect(result).toMatchObject({ failure: 'alreadyRecorded' })
      }
      const log = await h.log.readSince(session, 0)
      if (!('entries' in log)) throw new Error('read')
      const own = encodeModelLogKey({ kind: 'acknowledged', call: 'call' })
      if (!('ok' in own)) throw new Error('key')
      expect(log.entries.filter(entry => entry.dedupeKey === own.ok)).toHaveLength(1)
      // after the conflicts the durable history is still the one original ACK
      expect(await history(h)).toMatchObject({
        known: { acknowledged: { record: { acknowledgedAt: ack.acknowledgedAt } } },
      })
    })
  })

  it('actual log: an ACK does not occupy or collide with the ending key, and vice versa', async () => {
    await withLog('q1-ended-coexists', async h => {
      await h.append(rec(created))
      await h.append(rec(dispatched))
      await h.append(
        rec({ kind: 'model_call_ended', call: 'call', ending: 'interrupted', initiator: 'user' }),
      )
      const result = await h.submit(
        rec({
          ...ack,
          target: { kind: 'ended', ending: 'interrupted' },
          terminalState: 'interrupted',
        }),
      )
      expect(result).not.toHaveProperty('failure')
      const known = await history(h)
      expect(known).toMatchObject({
        known: { phase: 'interrupted', ending: { ending: 'interrupted' } },
      })
    })
  })

  it('a forged ACK entry wearing the ended key or without any dedupe key is history-unavailable', async () => {
    const ended = encodeModelLogKey({ kind: 'ended', call: 'call' })
    if (!('ok' in ended)) throw new Error('key')
    for (const [name, mutate] of [
      ['ended-key', (e: OwnedLogEntry) => ({ ...e, dedupeKey: ended.ok })],
      ['no-key', ({ dedupeKey: _k, ...e }: OwnedLogEntry) => e],
      ['ended-read-key', (e: OwnedLogEntry) => ({ ...e, readKeys: [...e.readKeys, ended.ok] })],
    ] as const) {
      await withLog(`q1-forged-${name}`, async h => {
        await completeCall(h)
        await h.append(mutate(rec(ack)) as OwnedLogEntry)
        expect(await history(h)).toEqual(HISTORY)
      })
    }
  })

  it('settlement prefix reading never treats an ACK as ending or settlement member', async () => {
    await withLog('q1-settlement-prefix', async h => {
      await h.append(rec(created))
      await h.append(rec(dispatched))
      await h.append(rec(opened))
      await h.append(rec(ready))
      await h.append(rec({ ...ack, ...witness(4) }))
      const prefix = await h.read()
      const interpreted = interpretSettlementPrefix({
        prefix,
        target: { call: 'call', dispatch: 1, response: 'response' },
        current: null,
      })
      if (!('facts' in interpreted)) throw new Error(JSON.stringify(interpreted))
      // ending slot is empty although an ACK exists for the call
      expect(interpreted.facts.ended).toBeNull()
      expect(interpreted.facts.members).toEqual({ absent: true })
    })
  })

  it('a foreign-writer ACK-shaped record with the acknowledged key but wrong payload kind is unknown-format/history', async () => {
    await withLog('q1-wrong-kind', async h => {
      await completeCall(h)
      const own = encodeModelLogKey({ kind: 'acknowledged', call: 'call' })
      if (!('ok' in own)) throw new Error('key')
      const other = rec({
        kind: 'model_call_ended',
        call: 'call',
        ending: 'released',
      })
      await h.append({ ...other, dedupeKey: own.ok })
      expect(await history(h)).toEqual(HISTORY)
    })
  })
})

describe('review 2026-09-30 / Q2 consistency of the ACK against S-95 targets and S-97 terminalState', () => {
  const okMatrix: readonly [string, (h: Harness) => Promise<void>, object][] = [
    [
      'response target on complete final',
      async h => {
        await completeCall(h)
        await h.append(rec(ack))
      },
      { phase: 'complete', acknowledged: { record: { terminalState: 'complete' } } },
    ],
    [
      'ended interrupted after user interrupt (no dispatch response)',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(
          rec({ kind: 'model_call_ended', call: 'call', ending: 'interrupted', initiator: 'user' }),
        )
        await h.append(
          rec({
            ...ack,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
      },
      { phase: 'interrupted', acknowledged: { record: { terminalState: 'interrupted' } } },
    ],
    [
      'ended released before any dispatch',
      async h => {
        await h.append(rec(created))
        await h.append(rec({ kind: 'model_call_ended', call: 'call', ending: 'released' }))
        await h.append(
          rec({
            ...ack,
            releasablePayloads: [createdPayload],
            target: { kind: 'ended', ending: 'released' },
            terminalState: 'handed_up',
          }),
        )
      },
      { phase: 'handed_up', acknowledged: { record: { terminalState: 'handed_up' } } },
    ],
    [
      'ready-only with a matching accounting witness',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(
          rec({ ...ack, releasablePayloads: [createdPayload, readyPayload], ...witness(4) }),
        )
      },
      { phase: 'reply_pending', acknowledged: { record: { terminalState: 'complete' } } },
    ],
  ]
  it.each(okMatrix)('accepts the lawful shape: %s', async (name, build, expected) => {
    await withLog(`q2-ok-${name.replace(/\W+/g, '-').slice(0, 30)}`, async h => {
      await build(h)
      expect(await history(h)).toMatchObject({ known: expected })
    })
  })

  const secondDispatch = { ...dispatched, dispatch: 2, response: 'response-2' }
  const failedFinal = (id: string, dispatch: number) => ({
    ...(({ reply: _r, replyDisposition: _d, ...rest }) => rest)(responseV5),
    id,
    dispatch,
    outcome: 'failed',
    failure: { cause: 'upstream_unavailable' },
    timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
  })

  const rejectMatrix: readonly [string, (h: Harness) => Promise<void>][] = [
    [
      'ACK targets a failed final (only terminal responses may be acknowledged)',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(prepareV2('response', failedFinal('response', 1), { kind: 'response' }))
        await h.append(rec({ ...ack, target: { kind: 'response', response: 'response' } }))
      },
    ],
    [
      'ACK targets the earlier failed response although a later dispatch completed',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(prepareV2('response', failedFinal('response', 1), { kind: 'response' }))
        await h.append(rec(secondDispatch))
        await h.append(rec({ ...opened, dispatch: 2 }))
        const { batchV2 } = await import('./log-codec-v2-fixture.ts')
        await h.append(
          ...batchV2({
            ...responseV5,
            id: 'response-2',
            dispatch: 2,
            reply: { ...(responseV5.reply as object), id: 'winner-2', response: 'response-2' },
          }),
        )
        await h.append(rec({ ...ack, target: { kind: 'response', response: 'response' } }))
      },
    ],
    [
      'ACK targets the failed response although the call ended released after it (terminalState handed_up)',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(prepareV2('response', failedFinal('response', 1), { kind: 'response' }))
        await h.append(rec({ kind: 'model_call_ended', call: 'call', ending: 'released' }))
        await h.append(
          rec({
            ...ack,
            target: { kind: 'response', response: 'response' },
            terminalState: 'handed_up',
          }),
        )
      },
    ],
    [
      'ACK before the ending record',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(
          rec({
            ...ack,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
        await h.append(
          rec({ kind: 'model_call_ended', call: 'call', ending: 'interrupted', initiator: 'user' }),
        )
      },
    ],
    [
      'ACK before the final response',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ack))
        const { batchV2 } = await import('./log-codec-v2-fixture.ts')
        await h.append(...batchV2())
      },
    ],
    [
      'releasablePayloads holds another call payload (same session, other call created)',
      async h => {
        await completeCall(h)
        const otherPayload = { ...createdPayload, locator: 'other-call-locator' }
        await h.append(
          rec({ ...created, call: 'other', creationKey: 'creation-other', payload: otherPayload }),
        )
        await h.append(rec({ ...ack, releasablePayloads: [createdPayload, otherPayload] }))
      },
    ],
    [
      'releasablePayloads holds a ready payload of a call that has no such ready',
      async h => {
        await completeCall(h)
        await h.append(rec({ ...ack, releasablePayloads: [readyPayload] }))
      },
    ],
    [
      'ready only, no accounting witness',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(rec(ack))
      },
    ],
    [
      'ready only, witness payload is not the ready marker payload',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(
          rec({ ...ack, ...witness(4, { payload: { ...readyPayload, locator: 'forged' } }) }),
        )
      },
    ],
    [
      'ready only, witness origin session differs',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(
          rec({ ...ack, ...witness(4, { origin: { tenant, session: 'another-session' } }) }),
        )
      },
    ],
    [
      'ready only, witness origin has a Run the ready did not have',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(
          rec({ ...ack, ...witness(4, { origin: { tenant, session, run: 'run', attempt: 1 } }) }),
        )
      },
    ],
    [
      'ready only, witness outcome interrupted but terminalState complete',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(
          rec({ ...ack, ...witness(4, { outcome: 'interrupted', initiator: 'user' }) }),
        )
      },
    ],
    [
      'final committed after the ACK while the ACK carries no witness',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ready))
        await h.append(rec(ack))
        const { batchV2 } = await import('./log-codec-v2-fixture.ts')
        await h.append(...batchV2())
      },
    ],
    [
      'ended target on a call whose terminal is a complete final',
      async h => {
        await completeCall(h)
        await h.append(
          rec({
            ...ack,
            target: { kind: 'ended', ending: 'released' },
            terminalState: 'handed_up',
          }),
        )
      },
    ],
    [
      'response target with terminalState interrupted on a complete final',
      async h => {
        await completeCall(h)
        await h.append(rec({ ...ack, terminalState: 'interrupted' }))
      },
    ],
    [
      'ended interrupted target while ended is released',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec({ kind: 'model_call_ended', call: 'call', ending: 'released' }))
        await h.append(
          rec({
            ...ack,
            target: { kind: 'ended', ending: 'interrupted' },
            terminalState: 'interrupted',
          }),
        )
      },
    ],
    [
      'no creation source at all (ACK of a call with only dispatch records)',
      async h => {
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        const { batchV2 } = await import('./log-codec-v2-fixture.ts')
        await h.append(...batchV2())
        await h.append(rec(ack))
      },
    ],
    [
      'ACK on a call that is still speaking',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(rec(opened))
        await h.append(rec(ack))
      },
    ],
    [
      'ACK on an open call (created only) with a response target',
      async h => {
        await h.append(rec(created))
        await h.append(rec(ack))
      },
    ],
    [
      'ACK on awaiting_decision (failed final, no ending) using an ended target',
      async h => {
        await h.append(rec(created))
        await h.append(rec(dispatched))
        await h.append(prepareV2('response', failedFinal('response', 1), { kind: 'response' }))
        await h.append(
          rec({
            ...ack,
            target: { kind: 'ended', ending: 'released' },
            terminalState: 'handed_up',
          }),
        )
      },
    ],
    [
      'ACK creationKey differs from the created record',
      async h => {
        await completeCall(h)
        await h.append(rec({ ...ack, creationKey: 'other-creation' }))
      },
    ],
    [
      'ACK shell attempt differs from creation shell (Run-owned creation, no-Run ACK)',
      async h => {
        await h.append(
          prepare('record', created, { kind: 'record' }, { tenant, run: 'run', attempt: 1 }),
        )
        await h.append(
          prepare('record', dispatched, { kind: 'record' }, { tenant, run: 'run', attempt: 1 }),
        )
        await h.append(
          prepare('record', opened, { kind: 'record' }, { tenant, run: 'run', attempt: 1 }),
        )
        await h.append(
          prepare(
            'record',
            {
              kind: 'model_call_ended',
              call: 'call',
              ending: 'interrupted',
              initiator: 'user',
            },
            { kind: 'record' },
            { tenant, run: 'run', attempt: 1 },
          ),
        )
        await h.append(
          prepare(
            'record',
            {
              ...ack,
              target: { kind: 'ended', ending: 'interrupted' },
              terminalState: 'interrupted',
            },
            { kind: 'record' },
            { tenant, run: 'run', attempt: 2 },
          ),
        )
      },
    ],
  ]
  it.each(rejectMatrix)('history-unavailable: %s', async (name, build) => {
    await withLog(`q2-bad-${name.replace(/\W+/g, '-').slice(0, 30)}`, async h => {
      await build(h)
      expect(await history(h)).toEqual(HISTORY)
    })
  })

  it('records whose shape the codec refuses to capture cannot be written; forged raw copies are history-unavailable on read', async () => {
    const w = witness(4)
    const forgeries: readonly [string, Record<string, unknown>, Record<string, unknown>][] = [
      ['digest without witness', { ...ack }, { retainedResultDigest: w.retainedResultDigest }],
      ['witness without digest', { ...ack }, { accountingWitness: w.accountingWitness }],
      [
        'witness names another response',
        { ...ack },
        { ...w, accountingWitness: { ...w.accountingWitness, response: 'response-x' } },
      ],
      [
        'ended target with contradicting terminalState',
        {
          ...ack,
          target: { kind: 'ended', ending: 'interrupted' },
          terminalState: 'interrupted',
        },
        { terminalState: 'handed_up' },
      ],
      [
        'response target carrying ending',
        { ...ack },
        { target: { kind: 'response', response: 'response', ending: 'released' } },
      ],
      [
        'ended target carrying a witness',
        {
          ...ack,
          target: { kind: 'ended', ending: 'interrupted' },
          terminalState: 'interrupted',
        },
        { ...w },
      ],
    ]
    for (const [name, base, over] of forgeries) {
      const value = { ...base, ...over }
      expect(
        captureModelLogValue({ category: 'record', input: { kind: 'value', value } }),
        name,
      ).toHaveProperty('invalidValue')
      await withLog(`q2-forged-${name.replace(/\W+/g, '-').slice(0, 24)}`, async h => {
        // Build the surrounding call: interrupted ended for the ended cases, ready otherwise.
        await h.append(rec(created))
        await h.append(rec(dispatched))
        if (base.target !== ack.target) {
          await h.append(
            rec({
              kind: 'model_call_ended',
              call: 'call',
              ending: 'interrupted',
              initiator: 'user',
            }),
          )
        } else {
          await h.append(rec(opened))
          await h.append(rec(ready))
        }
        const valid = rec(base)
        const payload = valid.payload as { value: Record<string, unknown> }
        await h.append({
          ...valid,
          payload: { ...payload, value: { ...payload.value, ...over } },
        } as OwnedLogEntry)
        expect(await history(h), name).toEqual(HISTORY)
      })
    }
  })

  it('an empty releasable list on a call that owns a created model copy is contradictory (MS8 S-58: empty only when no copy exists)', async () => {
    await withLog('q2-empty-releasable', async h => {
      await completeCall(h)
      await h.append(rec({ ...ack, releasablePayloads: [] }))
      expect(await history(h)).toEqual(HISTORY)
    })
  })

  it('characterization (contract states no completeness rule): a list omitting the witnessed ready copy is accepted today', async () => {
    await withLog('q2-partial-releasable', async h => {
      // ready payload exists (with witness) but the ACK lists only the created copy. MS8 S-58 only
      // requires every listed item to belong to the call; it does not say the list must be full,
      // so this is recorded as observed behavior, not asserted as a defect.
      await h.append(rec(created))
      await h.append(rec(dispatched))
      await h.append(rec(opened))
      await h.append(rec(ready))
      await h.append(rec({ ...ack, releasablePayloads: [createdPayload], ...witness(4) }))
      expect(await history(h)).toMatchObject({ known: { phase: 'reply_pending' } })
    })
  })

  it('a duplicated releasable payload is rejected before or at the reader', async () => {
    const value = { ...ack, releasablePayloads: [createdPayload, createdPayload] }
    expect(
      captureModelLogValue({ category: 'record', input: { kind: 'value', value } }),
    ).toHaveProperty('invalidValue')
    await withLog('q2-dup-releasable', async h => {
      await completeCall(h)
      const valid = rec(ack)
      const payload = valid.payload as { value: Record<string, unknown> }
      await h.append({
        ...valid,
        payload: {
          ...payload,
          value: { ...payload.value, releasablePayloads: [createdPayload, createdPayload] },
        },
      } as OwnedLogEntry)
      expect(await history(h)).toEqual(HISTORY)
    })
  })

  it('an ACK on a runtime_lost resumable interruption is not a terminal target', async () => {
    await withLog('q2-resumable', async h => {
      await h.append(rec(created))
      await h.append(rec(dispatched))
      const { reply: _r, replyDisposition: _d, ...base } = responseV5
      await h.append(
        prepareV2(
          'response',
          {
            ...base,
            outcome: 'interrupted',
            initiator: 'runtime_lost',
            timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
          },
          { kind: 'response' },
        ),
      )
      await h.append(rec({ ...ack, terminalState: 'interrupted' }))
      expect(await history(h)).toEqual(HISTORY)
    })
  })

  it('witness accounting values that differ from the durable final are contradictory (S-101, MS8 S-58)', async () => {
    // Contract: "费用读面按 CA4 final→ACK见证→ready 逐ResponseId选一，存在矛盾先失败" and MS8 S-58
    // "若它们已从原ready固定，final在ACK提交前先赢不使见证失效，但仍须逐值一致".
    await withLog('q2-witness-vs-final', async h => {
      await h.append(rec(created))
      await h.append(rec(dispatched))
      await h.append(rec(opened))
      await h.append(rec(ready))
      const { batchV2 } = await import('./log-codec-v2-fixture.ts')
      await h.append(...batchV2())
      await h.append(
        rec({
          ...ack,
          releasablePayloads: [createdPayload, readyPayload],
          ...witness(4, {
            usage: {
              input_tokens: 999,
              output_tokens: 5,
              cache_read_tokens: 'unknown',
              cache_write_tokens: 0,
              source: 'upstream',
            },
          }),
        }),
      )
      expect(await history(h)).toEqual(HISTORY)
    })
  })
})
