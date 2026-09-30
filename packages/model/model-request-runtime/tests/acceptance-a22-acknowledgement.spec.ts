import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  tenantIdEquals,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  createModelCallSemanticDigest,
  judgeModelCallSemanticDigest,
} from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { narrow } from '@omne-harness-lite/storage'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import type { CallAccess, CallAccessAction } from '../src/reference-types.ts'
import type {
  ModelCallHost,
  OpenCallInput,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'

const messageId = unwrap(parseOpaqueIdentifier('a22-message', 'MessageId'))
const creationKey = (value: string) => unwrap(parseOpaqueIdentifier(value, 'CreationKey'))

interface Grant {
  readonly actions: ReadonlySet<CallAccessAction>
  readonly tenant: TenantId
  readonly revoked: AbortController
}

/**
 * A22 acceptance on real SQLite and JSONL: one runtime, inline noRun calls, and a trusted
 * access provider whose current principal the test switches between independent consumers.
 */
async function acknowledgementHost() {
  const host = await selectionHost(true, true)
  const selected = host.create()
  const wire = transport()
  const calls = createCallContainerStore<TestPlan, object>()
  const ports = referencePorts(host, calls)
  const grants = new Map<string, Grant>()
  let principal = 'owner'
  const callAccess: CallAccess = {
    async check(input, admitted) {
      const grant = grants.get(principal)
      const held = await host.tenancy.holdingTenant(input.ref.session)
      if (
        grant === undefined ||
        !('tenant' in held) ||
        !tenantIdEquals(held.tenant, input.binding.tenant) ||
        !tenantIdEquals(grant.tenant, input.binding.tenant)
      )
        return { unavailable: true }
      const found = await ports.callFacts.lookup({ binding: input.binding, ref: input.ref })
      const source =
        'view' in found
          ? found.view.source
          : 'acknowledged' in found
            ? found.acknowledged.source
            : { generation: input.binding.generation, progress: 0 }
      const evidence = {
        action: input.action,
        ref: input.ref,
        source,
        sourceVersion: 'a22-log-v1',
        revoked: grant.revoked.signal,
      }
      if (!grant.actions.has(input.action)) return { denied: true, evidence }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  const callHost: ModelCallHost = {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
  const bindingWith = (
    sourceVersions: Readonly<Record<string, string>>,
  ): SessionRuntimeBinding => ({
    log: selected.input.binding,
    sourceVersions,
    selection: { ...selected.input, projection: async () => ({ known: [] }) },
    catalog: host.catalog,
    currentEvaluationInputs: host.reader,
    credentials: {
      async value() {
        return {
          scope: { layer: 'factory' as const },
          value: new TextEncoder().encode('a22-secret'),
        }
      },
    },
    tools: {
      async lookup() {
        throw new Error('no tools requested')
      },
    },
  })
  // The runtime compares binding identity: one stable object per sourceVersions value.
  const original = bindingWith({ fixture: 'a22-v1' })
  let binding = original
  let nextCall = 0
  let nextResponse = 0
  const construction: RuntimeConstruction<TestPlan, object> = {
    ...ports,
    callAccess,
    maxScopes: 4,
    sessions: { bind: async () => ({ binding }) },
    calls,
    transport: {
      clearReuseScope() {},
      acquire: () => ({
        lease: {
          binding: {
            implementation: { name: 'test', revision: '1' },
            definition: { modelId: 'example/model-a', revision: '1' },
            configuration: { revision: '1', values: {} },
          },
          transport: wire.adapter,
          signal: new AbortController().signal,
          async track<T>(completion: Promise<T>) {
            return await completion
          },
          release() {},
        },
      }),
    },
    settlementContention: settlementPolicy(),
    settlementScheduler: noWaitScheduler,
    reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
    acknowledgementCleanup: { next: () => ({ stop: true }) },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    policy: { ...invocationPolicy(), schedule: () => () => {} },
    identities: {
      call: () => `a22-call-${++nextCall}`,
      response: () => `a22-response-${++nextResponse}`,
      message: () => messageId,
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: {
      enter: async () => ({
        scope: {
          binding: { log: selected.input.binding },
          owner: new ControlledSettlementOwner(),
          originalInvocation: () => ({ unavailable: true }),
          close: async () => {},
        },
      }),
    },
    diagnostic() {},
  }
  const runtime = createModelRuntime(construction)
  const service = runtime.service
  expect(
    await service.selectModel({ session: host.session, routeName: 'example/model-a' }),
  ).toEqual({ selected: 'example/model-a' })
  const effective = await service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) throw new Error('effective model')
  const request = (key: string, extra: Partial<OpenCallInput> = {}): OpenCallInput => ({
    creationKey: creationKey(key),
    session: host.session,
    target: effective.effectiveModel.routeName,
    basis: effective.effectiveModel,
    messages: [],
    tools: [],
    host: callHost,
    ...extra,
  })
  async function entries(): Promise<readonly LogEntry[]> {
    const log = await host.log.readSince(host.session, 0)
    if (!('entries' in log)) throw new Error('durable log unavailable')
    return log.entries
  }
  async function contentRows(call: string): Promise<number> {
    return await host.storage.read(async tx => {
      const rows = await narrow<{ model_call_content: { call: string } }>(tx)
        .selectFrom('model_call_content')
        .select('call')
        .where('call', '=', call)
        .execute()
      return rows.length
    })
  }
  function grant(name: string, actions: readonly CallAccessAction[], tenant = host.tenant) {
    const revoked = new AbortController()
    grants.set(name, { actions: new Set(actions), tenant, revoked })
    return revoked
  }
  return {
    host,
    runtime,
    service,
    calls,
    wire,
    request,
    entries,
    contentRows,
    grant,
    as(name: string) {
      principal = name
    },
    /** A changed adoption basis for the same session; `restore` returns the original. */
    changeSourceVersions(next: Readonly<Record<string, string>>) {
      binding = bindingWith(next)
    },
    restoreSourceVersions() {
      binding = original
    },
  }
}

const kinds = (entries: readonly LogEntry[]) =>
  entries.map(entry => payload(entry).kind).filter(Boolean)
const acknowledgements = (entries: readonly LogEntry[], call: string) =>
  entries.filter(
    entry => payload(entry).kind === 'model_call_acknowledged' && payload(entry).call === call,
  )

describe('A22 acknowledgement acceptance on real SQLite/JSONL (inline, noRun)', () => {
  it('A22-V1/V2/V8: only current ack authority confirms; all fifteen entries then answer small', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      h.grant('reader', ['read', 'wait'])
      h.grant('revoked', ['ack']).abort()
      const foreign: TenantId = {
        ...h.host.tenant,
        organization: unwrap(parseOpaqueIdentifier('a22-foreign-organization', 'OrganizationId')),
      }
      h.grant('foreign', ['ack'], foreign)
      const parameters = {
        maxOutputTokens: 100,
        seed: new LosslessNumber('9007199254740993'),
        stopSequences: ['a', 'b'],
        extra: { a: 1, b: 2 },
      }
      const opened = await h.service.openCall(h.request('a22_create_1', { parameters }))
      expect(opened).toMatchObject({ callId: 'a22-call-1', state: 'open' })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      expect(dispatched).toHaveProperty('replyPending')
      expect(
        await h.service.settleReply({ ...ref, disposition: { vetoed: { by: 'a22-gate' } } }),
      ).toEqual({ callId: 'a22-call-1', state: 'complete' })
      const target = { kind: 'response' as const, response: 'a22-response-1' }

      // A22-V1: read/wait, revoked and cross-tenant authority never confirm.
      for (const name of ['reader', 'revoked', 'foreign']) {
        h.as(name)
        expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
          unavailable: true,
        })
      }
      // Releasing a read consumer or holding only a ref is not an implicit ACK.
      h.as('reader')
      const consumer = await h.service.acquireCall({ ref, mode: 'read' })
      expect(consumer).toHaveProperty('view')
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(0)
      h.as('owner')
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: 'a22-response-1', ending: 'released' },
        } as never),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'ended', ending: 'released' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })
      expect(
        await h.service.acknowledgeCall({
          ref: { ...ref, callId: 'a22-call-missing' },
          expectedResult: target,
        }),
      ).toEqual({ callNotFound: true })
      expect(acknowledgements(await h.entries(), 'a22-call-1')).toHaveLength(0)

      const first = await h.service.acknowledgeCall({ ref, expectedResult: target })
      expect(first).toMatchObject({ acknowledged: { ref, target, cleanup: 'released' } })
      if (!('acknowledged' in first)) throw new Error('acknowledged')
      expect(first.acknowledged).not.toHaveProperty('pendingReasons')
      expect(await h.contentRows('a22-call-1')).toBe(0)
      const confirmed = await h.entries()
      expect(acknowledgements(confirmed, 'a22-call-1')).toHaveLength(1)
      const sends = h.wire.sends()

      // A22-V2: the same target recognizes the original fact; another target is wrongPhase.
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual(first)
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'ended', ending: 'interrupted' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })

      // A22-V2/V8: every entry, for any consumer with its own current authority.
      const small = {
        ref,
        acknowledged: { ref, target, acknowledgedAt: first.acknowledged.acknowledgedAt },
        origin: { tenant: h.host.tenant, session: h.host.session },
        terminalState: 'complete',
        attempts: [
          {
            response: 'a22-response-1',
            dispatch: 1,
            outcome: 'complete',
            disposition: 'final',
            replyDisposition: { vetoed: { by: 'a22-gate' } },
          },
        ],
      }
      h.as('reader')
      const read = await h.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: small })
      if (!('view' in read)) throw new Error('view')
      for (const forbidden of ['state', 'presence', 'result', 'reply', 'route', 'raw'])
        expect(read.view).not.toHaveProperty(forbidden)
      const waited = await h.service.acquireCall({ ref, mode: 'wait' })
      expect(waited).toMatchObject({ view: small })
      expect(waited).not.toHaveProperty('consumer')
      if ('consumer' in consumer && consumer.consumer !== undefined) {
        expect(await consumer.consumer.wait({})).toMatchObject({ view: small })
        consumer.consumer.release()
      }
      h.as('owner')
      expect(await h.service.readAttempts(ref)).toMatchObject({ acknowledged: small })
      expect(await h.service.canDispatchAgain({ ...ref, plan: { provider: 'test' } })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.dispatch(ref)).toEqual({ alreadyEnded: true })
      expect(await h.service.dispatchAgain({ ...ref, plan: { provider: 'test' } })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.interrupt({ ...ref, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(await h.service.releaseCall(ref)).toEqual({ alreadyEnded: true })
      expect(
        await h.service.settleReply({ ...ref, disposition: { vetoed: { by: 'a22-gate' } } }),
      ).toEqual({ callId: 'a22-call-1', state: 'complete' })
      expect(
        await h.service.settleReply({ ...ref, disposition: { consumed: { by: 'compaction' } } }),
      ).toEqual({ alreadyEnded: true })
      const reconciled = await h.service.reconcile({ session: h.host.session })
      if (!('calls' in reconciled)) throw new Error('reconcile')
      expect(reconciled.calls.find(item => item.callId === 'a22-call-1')).toMatchObject({
        acknowledged: small,
      })
      // A22-V9 through openCall: the same creation is recognized by its semantic digest.
      expect(
        await h.service.openCall(
          h.request('a22_create_1', {
            parameters: {
              extra: { b: 2, a: 1 },
              stopSequences: ['a', 'b'],
              seed: new LosslessNumber('9007199254740993'),
              maxOutputTokens: new LosslessNumber('100.0'),
            },
          }),
        ),
      ).toMatchObject({ ref, callId: 'a22-call-1', acknowledged: small })
      for (const differing of [
        { ...parameters, maxOutputTokens: 101 },
        { ...parameters, stopSequences: ['b', 'a'] },
        { ...parameters, extra: { a: 1, b: 2, c: null } },
        { ...parameters, seed: new LosslessNumber('9007199254740992') },
      ])
        expect(
          await h.service.openCall(h.request('a22_create_1', { parameters: differing })),
        ).toEqual({ creationConflict: true })
      h.changeSourceVersions({ fixture: 'a22-v2' })
      expect(await h.service.openCall(h.request('a22_create_1', { parameters }))).toEqual({
        creationConflict: true,
      })
      h.restoreSourceVersions()
      // Selection reads are unchanged by ACK.
      expect(await h.service.legalTargets({ session: h.host.session })).toHaveProperty(
        'legalTargets',
      )
      expect(await h.service.displayList({ session: h.host.session })).toHaveProperty('displayList')
      expect(
        await h.service.selectModel({ session: h.host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })

      // Zero sends and no durable write for this call after its ACK.
      expect(h.wire.sends()).toBe(sends)
      const after = await h.entries()
      expect(
        after.slice(confirmed.length).filter(entry => payload(entry).call === 'a22-call-1'),
      ).toEqual([])
      expect(await h.runtime.close()).toEqual({ released: true })
      // RT12 S-100: host stop does not hide the durable ACK and its cleanup progress.
      expect(await h.service.acknowledgeCall({ ref, expectedResult: target })).toEqual(first)
    } finally {
      await h.host.close()
    }
  })

  it('A22-V2/V8: a ready reply ACK fixes the witness, pends on a real reader and never settles', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      expect(await h.service.openCall(h.request('a22_create_ready'))).toMatchObject({
        callId: 'a22-call-1',
      })
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const retained: PendingModelResponse = dispatched.replyPending
      const target = { kind: 'response' as const, response: retained.id }
      // A running operation holds the call's in-memory copy: cleanup must report it.
      const holder = h.calls.reserve(ref)
      if (!('reservation' in holder)) throw new Error('reservation')
      const acknowledged = await h.service.acknowledgeCall({ ref, expectedResult: target })
      expect(acknowledged).toEqual({
        acknowledged: {
          ref,
          target,
          acknowledgedAt: expect.any(String),
          cleanup: 'pending',
          pendingReasons: ['read_in_flight'],
        },
      })
      const log = await h.entries()
      const [record] = acknowledgements(log, 'a22-call-1')
      expect(payload(record as LogEntry)).toMatchObject({
        terminalState: 'complete',
        accountingWitness: { response: retained.id, dispatch: 1, outcome: 'complete' },
        retainedResultDigest: { role: 'model-call-retained-result-semantic-sha256/v1' },
      })
      // ACK is neither a disposition nor a message.
      expect(kinds(log).filter(kind => kind === 'model_call_ended')).toHaveLength(0)
      expect(log.filter(entry => payload(entry).replyDisposition !== undefined)).toHaveLength(0)
      // A22-V8: pending cleanup still hands out only the small branch.
      const pendingRead = await h.service.acquireCall({ ref, mode: 'read' })
      expect(pendingRead).toMatchObject({
        view: {
          acknowledged: { cleanup: 'pending', pendingReasons: ['read_in_flight'] },
          attempts: [{ response: retained.id, disposition: 'disposition_pending' }],
        },
      })
      expect(pendingRead).not.toHaveProperty('view.result')
      expect(await h.contentRows('a22-call-1')).toBe(2)
      holder.reservation.release()
      expect(await h.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { acknowledged: { cleanup: 'released' } },
      })
      expect(await h.contentRows('a22-call-1')).toBe(0)
      // RT12 S-99: after release the caller's own value is required and checked.
      const disposition = { vetoed: { by: 'a22-gate' } }
      expect(await h.service.settleReply({ ...ref, disposition })).toEqual({
        wrongPhase: { phase: 'complete' },
      })
      expect(
        await h.service.settleReply({
          ...ref,
          disposition,
          retainedResult: { ...retained, stopReason: 'tampered' },
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await h.service.settleReply({
          ...ref,
          disposition,
          retainedResult: { ...retained, usage: { ...retained.usage, input_tokens: 999 } },
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      // A validated new final waits for S-99⑧ durable staging: nothing is written yet.
      const before = await h.entries()
      expect(
        await h.service.settleReply({ ...ref, disposition, retainedResult: retained }),
      ).toEqual({ unavailable: true })
      expect(await h.entries()).toHaveLength(before.length)
      // A22-V1: a non-terminal call is never acknowledged.
      expect(await h.service.openCall(h.request('a22_create_open'))).toMatchObject({
        callId: 'a22-call-2',
        state: 'open',
      })
      expect(
        await h.service.acknowledgeCall({
          ref: { ...ref, callId: 'a22-call-2' },
          expectedResult: { kind: 'ended', ending: 'undispatched' },
        }),
      ).toEqual({ wrongPhase: { phase: 'open' } })
      expect(acknowledgements(await h.entries(), 'a22-call-2')).toHaveLength(0)
      expect(await h.runtime.close()).toEqual({ released: true })
    } finally {
      await h.host.close()
    }
  })

  it('A22-V9: the core semantic digest, not a byte hash or another role, identifies a creation', () => {
    const input = { messages: [], sourceVersions: { fixture: 'v1' }, n: 1 }
    const digest = createModelCallSemanticDigest('model-call-creation-semantic-sha256/v1', input)
    if (!('ok' in digest)) throw new Error('digest')
    expect(
      judgeModelCallSemanticDigest(
        'model-call-creation-semantic-sha256/v1',
        { n: new LosslessNumber('1.0'), sourceVersions: { fixture: 'v1' }, messages: [] },
        digest.ok,
      ),
    ).toEqual(digest)
    expect(
      judgeModelCallSemanticDigest('model-call-creation-semantic-sha256/v1', input, {
        role: 'model-call-creation-semantic-sha256/v1',
        hex: createHash('sha256').update(writeJsonLossless(input)).digest('hex'),
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelCallSemanticDigest('model-call-retained-result-semantic-sha256/v1', input, {
        ...digest.ok,
        role: 'model-call-retained-result-semantic-sha256/v1',
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})
