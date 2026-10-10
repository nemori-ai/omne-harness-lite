import { afterEach, describe, expect, it, vi } from 'vitest'
import * as settlementCodec from '../src/log-codec-settlement.ts'
import { copyJsonValue, LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'
import { checkSourceToken, type LogEntry, type SessionLog } from '@omne-harness-lite/session-log'
import { attemptStartedPayload } from '@omne-harness-lite/session-runtime'
import {
  acknowledgedAsTerminal,
  interpretCallHistory,
  interpretRunAtPrefix,
  interpretSettlementPrefix,
  inspectSettlementPrefixEntries,
  isOwnedSettlementPrefix,
  projectCallState,
  readSettlementPrefix,
  rejectAcknowledgedHistory,
  settlementGenerationCurrent,
  type CallHistoryResult,
  type RunHistoryReader,
  type SettlementLogBinding,
  type SettlementPrefix,
  type SettlementPrefixResult,
  type SettlementRegistration,
} from '../src/index.ts'
import {
  batch,
  dispatched,
  durable,
  located,
  jsonObject,
  opened,
  prepare,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'

function record(value: unknown): LogEntry {
  const checked = judgeModelInvocationRecord(value)
  if (!('ok' in checked)) throw new Error(`record fixture: ${JSON.stringify(checked)}`)
  return located(prepare('record', value, { kind: 'record' }), 1)
}

function ordered(entries: readonly LogEntry[]): readonly LogEntry[] {
  return entries.map((entry, index) => ({ ...entry, position: index + 1 }))
}

function fixture(entries: readonly LogEntry[]) {
  const generation = Object.freeze({})
  let current: object | null = generation
  let generationFails = false
  const trace: string[] = []
  const stopped: Promise<void>[] = []
  let active = 0
  const log: SessionLog = {
    append: async () => ({ failure: 'unavailable' }),
    readByKey: async () => ({ failure: 'unavailable' }),
    readSince: async () => ({ entries, tail: entries.length }),
  }
  const binding: SettlementLogBinding = {
    session,
    tenant,
    log,
    generation,
    currentGeneration: () => {
      if (generationFails) throw new Error('generation source unavailable')
      return current
    },
    async readPrefix() {
      trace.push('read')
      const result = await log.readSince(session, 0)
      if ('failure' in result) return { failure: 'unavailable' }
      const source = checkSourceToken({
        tenant,
        session,
        journalGeneration: 'controlled-journal',
        tail: result.tail,
      })
      if (!('ok' in source)) throw new Error('source fixture')
      return { ...result, source: source.ok }
    },
  }
  const registration: SettlementRegistration = {
    start<T>(kind: string, operation: (signal: AbortSignal) => Promise<T>) {
      trace.push(`registered:${kind}`)
      const controller = new AbortController()
      active += 1
      const completion = operation(controller.signal)
      const finished = completion.then(
        () => {
          active -= 1
          trace.push('stopped')
        },
        () => {
          active -= 1
          trace.push('stopped')
        },
      )
      stopped.push(finished)
      return { completion, stopped: finished, requestStop: () => controller.abort() }
    },
    release() {
      expect(active).toBe(0)
      trace.push('release')
    },
  }
  async function read(): Promise<SettlementPrefix> {
    const result = await readSettlementPrefix({ binding, registration })
    await Promise.all(stopped)
    registration.release()
    if (!('prefix' in result)) throw new Error(`prefix fixture: ${result.reason}`)
    return result.prefix
  }
  return {
    binding,
    registration,
    read,
    trace,
    revoke: () => {
      current = null
    },
    restore: () => {
      current = generation
      generationFails = false
    },
    failGeneration: () => {
      generationFails = true
    },
  }
}

async function prefix(entries: readonly LogEntry[]): Promise<SettlementPrefix> {
  return fixture(ordered(entries)).read()
}

async function history(entries: readonly LogEntry[]): Promise<CallHistoryResult> {
  return interpretCallHistory({ prefix: await prefix(entries), callId: 'call' })
}

const createdPayload = {
  kind: 'created',
  locator: 'created',
  version: 'one',
  digest: 'a'.repeat(64),
}
const readyPayload = {
  kind: 'reply_ready',
  locator: 'ready',
  version: 'one',
  digest: 'b'.repeat(64),
}
const created: JsonObject = {
  kind: 'model_call_created',
  call: 'call',
  creationKey: 'creation',
  payload: createdPayload,
  createdAt: '2026-09-27T00:00:00Z',
}
const ready: JsonObject = {
  kind: 'model_call_reply_ready',
  call: 'call',
  dispatch: 1,
  response: 'response',
  payload: readyPayload,
  readyAt: '2026-09-27T00:00:02Z',
}
const acknowledgement: JsonObject = {
  kind: 'model_call_acknowledged',
  call: 'call',
  creationKey: 'creation',
  creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'c'.repeat(64) },
  acknowledgedAt: '2026-09-27T00:00:03Z',
  releasablePayloads: [createdPayload, readyPayload],
  target: { kind: 'response', response: 'response' },
  terminalState: 'complete',
}
const witness: JsonObject = {
  response: 'response',
  dispatch: 1,
  readyPosition: 4,
  payload: readyPayload,
  origin: { tenant: { ...tenant }, session },
  outcome: 'complete',
  usage: response.usage ?? null,
  cost: response.cost ?? null,
  credentialScope: { layer: 'factory' },
  provider: 'first',
  timing: response.timing ?? null,
}
function witnessed(extra: JsonObject = {}): JsonObject {
  return {
    ...acknowledgement,
    retainedResultDigest: {
      role: 'model-call-retained-result-semantic-sha256/v1',
      hex: 'd'.repeat(64),
    },
    accountingWitness: { ...witness, ...extra },
  }
}
const sent = record(dispatched)
const first = record(opened)
const complete = durable().prefix.entries
const readyOnly = [record(created), sent, first, record(ready)]
const target = { call: 'call', dispatch: 1, response: 'response' }

describe('fixed owned prefix interpretation', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([223, 446])('constructs once for repeated queries on %i complete entries', async size => {
    const padding: LogEntry[] = Array.from({ length: size - complete.length }, (_, index) => ({
      session,
      tenant,
      position: index + 1,
      readKeys: [],
      payload: { kind: 'fact', owner: 'another-owner', version: 'one', value: { index } },
    }))
    const value = await prefix([...padding, ...complete])
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    for (let index = 0; index < 8; index += 1) {
      expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
      expect(interpretCallHistory({ prefix: value, callId: 'call' })).toHaveProperty('known')
      expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toHaveProperty(
        'facts',
      )
    }
    expect(construct).toHaveBeenCalledTimes(1)
    expect(construct.mock.calls[0]?.[0].prefix.entries).toHaveLength(size)
  })

  it('constructs once across entry reads, nested call history and settlement queries', async () => {
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    const owner = fixture(ordered(complete))
    const value = await owner.read()
    const entries = inspectSettlementPrefixEntries({ prefix: value })
    expect(entries).toHaveProperty('ok')
    if (!('ok' in entries)) throw new Error('entry fixture')
    expect(Object.isFrozen(entries.ok)).toBe(true)
    for (let index = 0; index < 4; index += 1) {
      const repeated = inspectSettlementPrefixEntries({ prefix: value })
      if (!('ok' in repeated)) throw new Error('entry fixture')
      expect(repeated.ok).toBe(entries.ok)
      expect(interpretCallHistory({ prefix: value, callId: 'call' })).toHaveProperty('known')
      expect(interpretCallHistory({ prefix: value, callId: 'other' })).toEqual({ absent: true })
      expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toHaveProperty(
        'facts',
      )
    }
    expect(construct).toHaveBeenCalledTimes(1)
    const independent = await owner.read()
    const second = inspectSettlementPrefixEntries({ prefix: independent })
    expect(second).toEqual(entries)
    if (!('ok' in second)) throw new Error('entry fixture')
    expect(second.ok).not.toBe(entries.ok)
    expect(construct).toHaveBeenCalledTimes(2)
    expect(owner.trace.filter(event => event === 'read')).toHaveLength(2)
  })

  it('rejects copied, forged and proxied prefixes before consulting content', async () => {
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    const value = await prefix(complete)
    for (const imitation of [
      { ...value },
      Object.create(Object.getPrototypeOf(value)),
      new Proxy(value, {}),
    ]) {
      expect(
        Reflect.apply(inspectSettlementPrefixEntries, undefined, [{ prefix: imitation }]),
      ).toEqual({ unavailable: true, reason: 'prefix' })
      expect(
        Reflect.apply(interpretSettlementPrefix, undefined, [
          { prefix: imitation, target, current: null },
        ]),
      ).toEqual({ unavailable: true, reason: 'prefix' })
    }
    expect(construct).not.toHaveBeenCalled()
  })

  it('rechecks revocation after a memo hit and does not reuse a current answer', async () => {
    const owner = fixture(ordered(complete))
    const value = await owner.read()
    expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
    owner.revoke()
    expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
      unavailable: true,
      reason: 'generation',
    })
    expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toEqual({
      unavailable: true,
      reason: 'generation',
    })
    expect(interpretCallHistory({ prefix: value, callId: 'call' })).toEqual({
      unavailable: true,
      reason: 'prefix',
    })
    owner.restore()
    expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
    owner.failGeneration()
    expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
      unavailable: true,
      reason: 'generation',
    })
  })

  it('rejects changed scope and generation descriptors even when their new callback agrees', async () => {
    const replacement = {}
    for (const change of [
      { session: 'foreign' },
      { tenant: { organization: 'foreign', account: 'foreign' } },
      { generation: {} },
      { currentGeneration: () => null },
      { generation: replacement, currentGeneration: () => replacement },
    ]) {
      const owner = fixture(ordered(complete))
      const value = await owner.read()
      expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
      Object.assign(owner.binding, change)
      const reason = 'session' in change || 'tenant' in change ? 'prefix' : 'generation'
      expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
        unavailable: true,
        reason,
      })
      expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toEqual({
        unavailable: true,
        reason,
      })
      expect(interpretCallHistory({ prefix: value, callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'prefix',
      })
    }
    const owner = fixture(ordered(complete))
    const value = await owner.read()
    expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
    Object.assign(owner.binding, { currentGeneration: () => owner.binding.generation })
    expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
      unavailable: true,
      reason: 'generation',
    })
  })

  it('checks generation after first construction and does not cache unexpected exceptions', async () => {
    const original = settlementCodec.createModelLogReadInspector
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    const owner = fixture(ordered(complete))
    const value = await owner.read()
    const defect = new Error('inspector defect')
    construct.mockImplementationOnce(() => {
      throw defect
    })
    expect(() => inspectSettlementPrefixEntries({ prefix: value })).toThrow(defect)
    expect(inspectSettlementPrefixEntries({ prefix: value })).toHaveProperty('ok')
    expect(construct).toHaveBeenCalledTimes(2)
    const second = fixture(ordered(complete))
    const independent = await second.read()
    construct.mockImplementationOnce(input => {
      const result = original(input)
      second.revoke()
      return result
    })
    expect(inspectSettlementPrefixEntries({ prefix: independent })).toEqual({
      unavailable: true,
      reason: 'generation',
    })
  })

  it('keeps target and current queries separate while sharing the ordered messages', async () => {
    const value = await prefix(complete)
    const firstRead = interpretSettlementPrefix({ prefix: value, target, current: null })
    expect(firstRead).toHaveProperty('facts')
    if (!('facts' in firstRead)) throw new Error('settlement fixture')
    expect(firstRead.facts.messagePrefix.map(message => message.id)).toEqual(['winner-message'])
    expect(Object.isFrozen(firstRead.facts.messagePrefix)).toBe(true)
    const same = interpretSettlementPrefix({
      prefix: value,
      target,
      current: { messageId: 'winner-message', disposition: 'persisted' },
    })
    expect(same).toMatchObject({ facts: { members: { completeMembers: { disposition: 'same' } } } })
    const losing = interpretSettlementPrefix({
      prefix: value,
      target,
      current: { messageId: 'losing-message', disposition: { consumed: { by: 'side_query' } } },
    })
    expect(losing).toMatchObject({
      facts: { members: { completeMembers: { disposition: 'firstWinner' } } },
    })
    if (!('facts' in losing)) throw new Error('settlement fixture')
    expect(losing.facts.messagePrefix).toBe(firstRead.facts.messagePrefix)
    expect(
      interpretSettlementPrefix({
        prefix: value,
        target,
        current: { messageId: '', disposition: 'persisted' },
      }),
    ).toEqual({ unavailable: true, reason: 'members' })
    expect(
      interpretSettlementPrefix({
        prefix: value,
        target: { ...target, response: 'foreign' },
        current: null,
      }),
    ).toEqual({ unavailable: true, reason: 'members' })
  })

  it('preserves unknown format and anchor-before-members refusal ordering', async () => {
    const unknown = { ...first, payload: { ...jsonObject(first.payload), version: 'future' } }
    const value = await prefix([sent, unknown])
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    for (let index = 0; index < 2; index += 1) {
      expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
        unavailable: true,
        reason: 'unknown_format',
      })
      expect(interpretCallHistory({ prefix: value, callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'unknown_format',
      })
      expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toEqual({
        unavailable: true,
        reason: 'members',
      })
      expect(
        interpretSettlementPrefix({
          prefix: value,
          target: { ...target, call: 'missing' },
          current: null,
        }),
      ).toEqual({ unavailable: true, reason: 'anchor' })
    }
    expect(construct).toHaveBeenCalledTimes(1)
    const malformedAnchor = await prefix([{ ...sent, payload: unknown.payload }])
    expect(interpretSettlementPrefix({ prefix: malformedAnchor, target, current: null })).toEqual({
      unavailable: true,
      reason: 'anchor',
    })
    const unpaired = fixture(ordered([{ ...sent, run: 'original' }, unknown]))
    expect(await readSettlementPrefix(unpaired)).toEqual({ unavailable: true, reason: 'prefix' })
  })

  it('rejects malformed foreign envelopes before minting an owned prefix', async () => {
    const owner = fixture(
      ordered([
        ...complete,
        {
          session,
          tenant,
          position: 1,
          readKeys: [],
          payload: { owner: 'another-owner', kind: 'fact', value: null },
        },
      ]),
    )
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    expect(await readSettlementPrefix(owner)).toEqual({ unavailable: true, reason: 'prefix' })
    expect(construct).not.toHaveBeenCalled()
  })

  it('keeps malformed Model content unavailable after repeated reads', async () => {
    const value = await prefix([
      sent,
      {
        ...first,
        payload: {
          ...jsonObject(first.payload),
          value: { category: 'record', value: { kind: 'model_call_opened' } },
        },
      },
    ])
    const construct = vi.spyOn(settlementCodec, 'createModelLogReadInspector')
    for (let index = 0; index < 2; index += 1) {
      expect(inspectSettlementPrefixEntries({ prefix: value })).toEqual({
        unavailable: true,
        reason: 'members',
      })
      expect(interpretCallHistory({ prefix: value, callId: 'call' })).toEqual({
        unavailable: true,
        reason: 'history',
      })
      expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toEqual({
        unavailable: true,
        reason: 'members',
      })
    }
    expect(construct).toHaveBeenCalledTimes(1)
  })

  it('keeps the full message order and rechecks mutable structural codec inputs', async () => {
    const user = (id: string) =>
      located(
        prepare(
          'message',
          { id, type: 'user', createdAt: '2026-09-27T00:00:04Z', blocks: [] },
          { kind: 'message' },
        ),
        1,
      )
    const entries = ordered([user('before'), ...complete, user('after')])
    const value = await prefix(entries)
    const firstRead = interpretSettlementPrefix({ prefix: value, target, current: null })
    expect(firstRead).toHaveProperty('facts')
    if (!('facts' in firstRead)) throw new Error('settlement fixture')
    expect(firstRead.facts.messagePrefix.map(message => message.id)).toEqual([
      'before',
      'winner-message',
      'after',
    ])
    const structural = { session, tenant, prefix: { entries: [...entries], tail: entries.length } }
    expect(settlementCodec.inspectCurrentModelLogPrefix(structural)).toHaveProperty('ok')
    structural.prefix.entries[0] = {
      ...sent,
      position: 1,
      payload: { ...jsonObject(sent.payload), version: 'future' },
    }
    expect(settlementCodec.inspectCurrentModelLogPrefix(structural)).toEqual({
      undetermined: true,
      reason: 'unknown_format',
    })
    expect(interpretSettlementPrefix({ prefix: value, target, current: null })).toEqual(firstRead)
  })
})

describe('owned prefix and durable call projections', () => {
  it('registers an actual read, owns a frozen copy and keeps exact positions', async () => {
    const entries = ordered([sent, first]).map(entry => ({
      ...entry,
      position: new LosslessNumber(`${entry.position}.0`),
    }))
    const owner = fixture(entries)
    const value = await owner.read()
    expect(owner.trace).toEqual(['registered:read', 'read', 'stopped', 'release'])
    expect(isOwnedSettlementPrefix(value)).toBe(true)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.entries)).toBe(true)
    expect(Object.isFrozen(value.entries[0])).toBe(true)
    expect(value.entries[0]).not.toBe(entries[0])
    expect(value.entries[0]?.position).toEqual(new LosslessNumber('1.0'))
    expect(interpretCallHistory({ prefix: value, callId: 'call' })).toMatchObject({
      known: { phase: 'speaking' },
    })
    owner.revoke()
    expect(settlementGenerationCurrent(owner.binding)).toBe(false)
    expect(interpretCallHistory({ prefix: value, callId: 'call' })).toEqual({
      unavailable: true,
      reason: 'prefix',
    })
    expect(await readSettlementPrefix(owner)).toEqual({ unavailable: true, reason: 'generation' })
  })

  it('rejects missing readers, failed tasks and revocation during a real read', async () => {
    const owner = fixture([])
    const { readPrefix: _reader, ...withoutReader } = owner.binding
    expect(
      await readSettlementPrefix({ binding: withoutReader, registration: owner.registration }),
    ).toEqual({ unavailable: true, reason: 'dependency' })
    expect(
      await readSettlementPrefix({
        binding: {
          ...owner.binding,
          readPrefix: async () => {
            throw new Error('read failure')
          },
        },
        registration: owner.registration,
      }),
    ).toEqual({ unavailable: true, reason: 'log' })
    expect(
      await readSettlementPrefix({
        binding: {
          ...owner.binding,
          readPrefix: async () => {
            owner.revoke()
            return { failure: 'unavailable' }
          },
        },
        registration: owner.registration,
      }),
    ).toEqual({ unavailable: true, reason: 'generation' })
    expect(
      settlementGenerationCurrent({
        ...owner.binding,
        currentGeneration: () => {
          throw new Error('generation')
        },
      }),
    ).toBe(false)
  })

  it('rejects inconsistent full-prefix envelopes without reading accessors', async () => {
    const owner = fixture([])
    const source = { tenant, session, journalGeneration: 'controlled-journal', tail: 0 }
    const good = { entries: [], tail: 0, source }
    let reads = 0
    const getter = Object.defineProperty({}, 'entries', {
      enumerable: true,
      get() {
        reads += 1
        return []
      },
    })
    const malformed: readonly unknown[] = [
      null,
      [],
      4,
      getter,
      { ...good, extra: true },
      { ...good, tail: -1 },
      { ...good, tail: 1 },
      { ...good, source: { ...source, tail: 1 } },
      { ...good, source: { ...source, session: 'foreign' } },
      { ...good, source: { ...source, tenant: { organization: 'foreign', account: 'foreign' } } },
      { ...good, source: { ...source, journalGeneration: '' } },
      { entries: [{ ...sent, position: 2 }], tail: 1, source: { ...source, tail: 1 } },
      { entries: [{ ...sent, session: 'foreign' }], tail: 1, source: { ...source, tail: 1 } },
      {
        entries: [{ ...sent, tenant: { organization: 'foreign', account: 'foreign' } }],
        tail: 1,
        source: { ...source, tail: 1 },
      },
      { entries: [{ ...sent, readKeys: [null] }], tail: 1, source: { ...source, tail: 1 } },
    ]
    for (const value of malformed) {
      const result: SettlementPrefixResult = await Reflect.apply(readSettlementPrefix, undefined, [
        {
          binding: { ...owner.binding, readPrefix: async () => value },
          registration: owner.registration,
        },
      ])
      expect(result).toEqual({ unavailable: true, reason: 'prefix' })
    }
    expect(reads).toBe(0)
    expect(
      await readSettlementPrefix({
        binding: { ...owner.binding, readPrefix: async () => ({ failure: 'unavailable' }) },
        registration: owner.registration,
      }),
    ).toEqual({ unavailable: true, reason: 'log' })
  })

  it('does not accept a structural imitation of an owned prefix', async () => {
    const actual = await prefix([])
    const fake = { ...actual }
    expect(isOwnedSettlementPrefix(fake)).toBe(false)
    expect(
      Reflect.apply(interpretCallHistory, undefined, [{ prefix: fake, callId: 'call' }]),
    ).toEqual({ unavailable: true, reason: 'prefix' })
    expect(
      Reflect.apply(interpretSettlementPrefix, undefined, [
        { prefix: fake, target, current: null },
      ]),
    ).toEqual({ unavailable: true, reason: 'prefix' })
  })

  it('projects volatile responsibility only at the matching durable frontier', async () => {
    const absent = await history([])
    expect(absent).toEqual({ absent: true })
    expect(projectCallState({ session, callId: 'call', history: absent })).toEqual({
      callNotFound: true,
    })
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: absent,
        local: { session, callId: 'call', phase: 'open' },
      }),
    ).toEqual({ phase: 'open', source: 'local_responsibility' })
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: absent,
        local: { session, callId: 'other', phase: 'open' },
      }),
    ).toEqual({ callNotFound: true })
    const open = await history([record(created)])
    expect(open).toMatchObject({ known: { phase: 'open' } })
    const inFlight = await history([sent])
    expect(inFlight).toMatchObject({ known: { phase: 'in_flight' } })
    const speaking = await history([sent, first])
    expect(speaking).toMatchObject({ known: { phase: 'speaking' } })
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: speaking,
        local: { session, callId: 'call', phase: 'reply_pending', responseId: 'response' },
      }),
    ).toEqual({ phase: 'reply_pending', source: 'local_responsibility' })
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: speaking,
        local: { session, callId: 'call', phase: 'reply_pending', responseId: 'other' },
      }),
    ).toEqual({ phase: 'speaking', source: 'durable' })
    const done = await history(complete)
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: done,
        local: { session, callId: 'call', phase: 'reply_pending', responseId: 'response' },
      }),
    ).toEqual({ phase: 'complete', source: 'durable' })
    expect(projectCallState({ session, callId: 'other', history: done })).toEqual({
      unavailable: true,
    })
    expect(
      projectCallState({
        session,
        callId: 'call',
        history: { unavailable: true, reason: 'history' },
      }),
    ).toEqual({ unavailable: true })
  })

  it('reads complete precise accounting and isolates unrelated calls', async () => {
    const value = await prefix(complete)
    const result = interpretCallHistory({ prefix: value, callId: 'call' })
    expect(result).toMatchObject({
      known: {
        phase: 'complete',
        dispatches: [
          {
            response: {
              value: { cost: { cost_usd: new LosslessNumber('0.0000000000000000000000000310') } },
            },
          },
        ],
      },
    })
    expect(interpretCallHistory({ prefix: value, callId: 'other' })).toEqual({ absent: true })
    const interpreted = interpretSettlementPrefix({ prefix: value, target, current: null })
    expect(interpreted).toMatchObject({
      facts: { members: { completeMembers: {} }, messagePrefix: [{ id: 'winner-message' }] },
    })
    expect(
      interpretSettlementPrefix({
        prefix: value,
        target: { ...target, call: 'other' },
        current: null,
      }),
    ).toEqual({ unavailable: true, reason: 'anchor' })
  })

  it('distinguishes failure, truncated success, user interruption and unopened runtime loss', async () => {
    const { reply: _reply, replyDisposition: _disposition, ...withoutReply } = response
    const failed: JsonObject = {
      ...withoutReply,
      outcome: 'failed',
      failure: { cause: 'interrupted_mid_reply' },
      delivered: jsonObject(response.reply).blocks ?? [],
    }
    expect(
      await history([sent, first, ...batch(failed).map(entry => located(entry, 1))]),
    ).toMatchObject({ known: { phase: 'awaiting_decision' } })
    const truncated: JsonObject = {
      ...response,
      outcome: 'truncated',
      reply: { ...jsonObject(response.reply), ending: 'truncated_at_limit' },
    }
    expect(
      await history([sent, first, ...batch(truncated).map(entry => located(entry, 1))]),
    ).toMatchObject({ known: { phase: 'complete' } })
    const interrupted: JsonObject = {
      ...response,
      outcome: 'interrupted',
      initiator: 'user',
      reply: { ...jsonObject(response.reply), ending: 'interrupted_by_user' },
    }
    expect(
      await history([sent, first, ...batch(interrupted).map(entry => located(entry, 1))]),
    ).toMatchObject({ known: { phase: 'interrupted' } })
    const lost: JsonObject = {
      ...withoutReply,
      outcome: 'interrupted',
      initiator: 'runtime_lost',
      timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
    }
    expect(await history([sent, ...batch(lost).map(entry => located(entry, 1))])).toMatchObject({
      known: { phase: 'resumable' },
    })
  })

  it('refuses orphan members, duplicate anchors and missing ordinal history', async () => {
    expect(await history([first])).toEqual({ unavailable: true, reason: 'history' })
    expect(await history(batch().map(entry => located(entry, 1)))).toEqual({
      unavailable: true,
      reason: 'history',
    })
    expect(await history([first, sent])).toEqual({ unavailable: true, reason: 'history' })
    expect(await history([sent, first, first])).toEqual({ unavailable: true, reason: 'history' })
    expect(await history([record({ ...dispatched, dispatch: 2 })])).toEqual({
      unavailable: true,
      reason: 'history',
    })
    expect(await history([record(created), record(created)])).toEqual({
      unavailable: true,
      reason: 'history',
    })
    expect(await history([record(ready)])).toEqual({ unavailable: true, reason: 'history' })
  })

  it('uses durable intent and ending without guessing a completed reply', async () => {
    const intent = record({ kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' })
    const undecided = await history([record(created), intent])
    expect(undecided).toMatchObject({ known: { phase: null } })
    expect(projectCallState({ session, callId: 'call', history: undecided })).toEqual({
      unavailable: true,
    })
    const active = await history([sent, first, intent])
    expect(projectCallState({ session, callId: 'call', history: active })).toEqual({
      unavailable: true,
    })
    expect(
      await history([
        sent,
        first,
        record({
          kind: 'model_call_ended',
          call: 'call',
          ending: 'interrupted',
          initiator: 'user',
        }),
      ]),
    ).toMatchObject({ known: { phase: 'interrupted' } })
    expect(
      await history([
        record({
          kind: 'model_call_ended',
          call: 'call',
          ending: 'undispatched',
          cause: 'withdrawn',
          payload: createdPayload,
          creationKey: 'creation',
        }),
      ]),
    ).toMatchObject({ known: { phase: 'handed_up' } })
    expect(
      await history([
        sent,
        record({
          kind: 'model_call_ended',
          call: 'call',
          ending: 'undispatched',
          cause: 'withdrawn',
          payload: createdPayload,
          creationKey: 'creation',
        }),
      ]),
    ).toEqual({ unavailable: true, reason: 'history' })
    expect(await history([sent, first, intent, intent])).toEqual({
      unavailable: true,
      reason: 'history',
    })
  })

  it('refuses unknown model formats and records from different original Runs', async () => {
    expect(
      await history([{ ...sent, payload: { ...jsonObject(sent.payload), version: 'future' } }]),
    ).toEqual({ unavailable: true, reason: 'unknown_format' })
    expect(
      await history([
        { ...sent, run: 'original', attempt: 1 },
        { ...first, run: 'foreign', attempt: 1 },
      ]),
    ).toEqual({ unavailable: true, reason: 'history' })
  })

  it('does not acknowledge a failed response as a successful terminal result', async () => {
    const { reply: _reply, replyDisposition: _disposition, ...withoutReply } = response
    const failed: JsonObject = {
      ...withoutReply,
      outcome: 'failed',
      failure: { cause: 'interrupted_mid_reply' },
      delivered: jsonObject(response.reply).blocks ?? [],
    }
    const entries = [...readyOnly, ...batch(failed).map(entry => located(entry, 1))]
    expect(await history(entries)).toMatchObject({ known: { phase: 'awaiting_decision' } })
    expect(await history([...entries, record(acknowledgement)])).toEqual({
      unavailable: true,
      reason: 'history',
    })
  })

  it('requires ready-only ACK witness and keeps ACK out of full-content projections', async () => {
    const pending = await history(readyOnly)
    expect(pending).toMatchObject({ known: { phase: 'reply_pending' } })
    expect(await history([...readyOnly, record(acknowledgement)])).toEqual({
      unavailable: true,
      reason: 'history',
    })
    const result = await history([...readyOnly, record(witnessed())])
    expect(result).toMatchObject({
      known: { phase: 'reply_pending', acknowledged: { record: { terminalState: 'complete' } } },
    })
    expect(rejectAcknowledgedHistory(result)).toEqual({ unavailable: true, reason: 'acknowledged' })
    expect(projectCallState({ session, callId: 'call', history: result })).toEqual({
      unavailable: true,
    })
    expect(acknowledgedAsTerminal(result)).toMatchObject({
      known: { phase: 'complete', acknowledged: null },
    })
  })

  it('rejects ACK source, ownership, target and ordering contradictions', async () => {
    expect(await history([...readyOnly, record(witnessed())])).toHaveProperty('known')
    for (const change of [
      { creationKey: 'other' },
      { releasablePayloads: [] },
      { releasablePayloads: [{ ...readyPayload, locator: 'foreign' }] },
      { terminalState: 'interrupted' },
    ]) {
      expect(await history([...readyOnly, record({ ...witnessed(), ...change })])).toEqual({
        unavailable: true,
        reason: 'history',
      })
    }
    expect(await history([record(witnessed()), ...readyOnly])).toEqual({
      unavailable: true,
      reason: 'history',
    })
    expect(
      await history([
        ...readyOnly,
        record(witnessed()),
        record({ ...witnessed(), acknowledgedAt: '2026-09-27T00:00:04Z' }),
      ]),
    ).toEqual({ unavailable: true, reason: 'history' })
    expect(await history([...readyOnly, record(witnessed()), record(witnessed())])).toEqual({
      unavailable: true,
      reason: 'history',
    })
  })

  it('checks original witness identity independently of a structurally valid ACK', async () => {
    for (const change of [
      { readyPosition: 3 },
      { dispatch: 2 },
      { payload: { ...readyPayload, locator: 'other' } },
      { origin: { tenant: { ...tenant }, session: 'other' } },
      { origin: { tenant: { organization: 'foreign', account: 'foreign' }, session } },
    ]) {
      expect(await history([...readyOnly, record(witnessed(change))])).toEqual({
        unavailable: true,
        reason: 'history',
      })
    }
  })

  it('recognizes an earlier durable final and rejects a contradictory retained witness', async () => {
    const entries = [
      record(created),
      sent,
      first,
      record(ready),
      ...batch().map(entry => located(entry, 1)),
    ]
    expect(await history([...entries, record(witnessed())])).toMatchObject({
      known: { phase: 'complete' },
    })
    expect(
      await history([
        ...entries,
        record(witnessed({ cost: { cost_usd: 0, source: 'upstream_usage' } })),
      ]),
    ).toEqual({ unavailable: true, reason: 'history' })
    expect(await history([...entries, record(acknowledgement)])).toMatchObject({
      known: { phase: 'complete' },
    })
  })

  it('accepts an ended ACK only after its matching durable ending', async () => {
    const ended = record({
      kind: 'model_call_ended',
      call: 'call',
      ending: 'undispatched',
      cause: 'withdrawn',
      payload: createdPayload,
      creationKey: 'creation',
    })
    const ack = {
      ...acknowledgement,
      releasablePayloads: [createdPayload],
      target: { kind: 'ended', ending: 'undispatched' },
      terminalState: 'handed_up',
    }
    expect(await history([ended, record(ack)])).toMatchObject({
      known: { acknowledged: { record: { terminalState: 'handed_up' } } },
    })
    expect(await history([record(ack), ended])).toEqual({
      unavailable: true,
      reason: 'history',
    })
    expect(
      await history([
        ended,
        record({
          ...ack,
          target: { kind: 'ended', ending: 'interrupted' },
          terminalState: 'interrupted',
        }),
      ]),
    ).toEqual({ unavailable: true, reason: 'history' })
    const interrupted = record({
      kind: 'model_call_ended',
      call: 'call',
      ending: 'interrupted',
      initiator: 'user',
    })
    const interruptedAck = { ...witnessed(), terminalState: 'interrupted' }
    expect(await history([...readyOnly, interrupted, record(interruptedAck)])).toMatchObject({
      known: { phase: 'interrupted' },
    })
    expect(await history([...readyOnly, interrupted, record(witnessed())])).toEqual({
      unavailable: true,
      reason: 'history',
    })
  })
})

function started(run: string, attempt: number): LogEntry {
  const checked = judgeAccountValue('AttemptId', attempt)
  if (!('ok' in checked)) throw new Error('attempt fixture')
  const payload = copyJsonValue(
    attemptStartedPayload({
      kind: 'attempt_started',
      run,
      attempt,
      reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
      at: '2026-09-27T00:00:00Z',
    }),
  )
  if (!('ok' in payload)) throw new Error('fact fixture')
  return { tenant, session, position: 1, run, attempt, readKeys: [], payload: payload.ok }
}

describe('Run facts at the same owned prefix', () => {
  it('binds the original and latest attempts to actual facts and terminal state', async () => {
    const value = await prefix([started('run', 1), started('run', 2)])
    const source: RunHistoryReader = (received, run, attempt) => {
      expect(received).toBe(value)
      expect(run).toBe('run')
      expect(attempt).toBe(1)
      return { known: { run, originalAttempt: attempt, latestAttempt: 2, terminal: 'open' } }
    }
    expect(interpretRunAtPrefix({ prefix: value, run: 'run', attempt: 1, source })).toEqual({
      known: { prefix: value, run: 'run', originalAttempt: 1, latestAttempt: 2, late: true },
    })
    const single = await prefix([started('run', 1)])
    expect(
      interpretRunAtPrefix({
        prefix: single,
        run: 'run',
        attempt: 1,
        source: () => ({
          known: { run: 'run', originalAttempt: 1, latestAttempt: 1, terminal: 'open' },
        }),
      }),
    ).toMatchObject({ known: { late: false } })
    expect(
      interpretRunAtPrefix({
        prefix: single,
        run: 'run',
        attempt: 1,
        source: () => ({
          known: { run: 'run', originalAttempt: 1, latestAttempt: 1, terminal: 'ended' },
        }),
      }),
    ).toMatchObject({ known: { late: true } })
  })

  it('refuses missing or duplicate starts and contradictory Run sources', async () => {
    const source: RunHistoryReader = () => ({
      known: { run: 'run', originalAttempt: 1, latestAttempt: 1, terminal: 'open' },
    })
    for (const entries of [
      [],
      [started('other', 1)],
      [started('run', 1), started('run', 1)],
      [started('run', 2)],
    ]) {
      expect(
        interpretRunAtPrefix({ prefix: await prefix(entries), run: 'run', attempt: 1, source }),
      ).toEqual({ unavailable: true })
    }
    const value = await prefix([started('run', 1)])
    expect(
      interpretRunAtPrefix({ prefix: value, run: 'run', attempt: 1, source: undefined }),
    ).toEqual({ unavailable: true })
    expect(
      interpretRunAtPrefix({
        prefix: value,
        run: 'run',
        attempt: 1,
        source: () => ({ unavailable: true }),
      }),
    ).toEqual({ unavailable: true })
    expect(
      interpretRunAtPrefix({
        prefix: value,
        run: 'run',
        attempt: 1,
        source: () => {
          throw new Error('Run source')
        },
      }),
    ).toEqual({ unavailable: true })
    for (const known of [
      { run: 'other', originalAttempt: 1, latestAttempt: 1, terminal: 'open' },
      { run: 'run', originalAttempt: 2, latestAttempt: 1, terminal: 'open' },
      { run: 'run', originalAttempt: 1, latestAttempt: 2, terminal: 'open' },
      { run: 'run', originalAttempt: 1, latestAttempt: 1, terminal: 'unknown' },
    ]) {
      expect(
        Reflect.apply(interpretRunAtPrefix, undefined, [
          { prefix: value, run: 'run', attempt: 1, source: () => ({ known }) },
        ]),
      ).toEqual({ unavailable: true })
    }
    const revoked = fixture(ordered([started('run', 1)]))
    const owned = await revoked.read()
    revoked.revoke()
    expect(interpretRunAtPrefix({ prefix: owned, run: 'run', attempt: 1, source })).toEqual({
      unavailable: true,
    })
  })
})
