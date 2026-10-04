import { describe, expect, it } from 'vitest'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { join } from 'node:path'
import type { PlanFailure } from '@omne-harness-lite/model-request-runtime-local'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { DiagnosticEvent } from '../src/diagnostics-types.ts'
import type { AnchoredInvocationInput } from '../src/anchored-invocation-types.ts'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { captureModelLogValue, prepareModelLogEntry } from '../src/log-codec.ts'
import { appendControlRecord } from '../src/service-control.ts'
import { judgePendingModelResponse } from '@omne-harness-lite/model-response'
import {
  harness,
  transport,
  payload,
  deferred,
  type TestPlan,
} from './anchored-invocation-fixture.ts'

describe('A1b noRun actual JSONL + SQL identity mapping + production invokeModel', () => {
  it('projects only confirmed exact durable positions when reply handoff is reached', async () => {
    await harness(async h => {
      const events: DiagnosticEvent[] = []
      let factories = 0
      let closes = 0
      const handle = createAnchoredModelInvocation({
        ...h.input,
        diagnosticEmitterFactory() {
          factories++
          return {
            record(event) {
              events.push(event)
              return { recorded: { collectorId: 'test', sequence: String(events.length) } }
            },
            close() {
              closes++
            },
          }
        },
      })
      expect(await handle.outcome).toHaveProperty('replyPending')
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('durable log unreadable')
      const anchorRecords = read.entries.filter(entry =>
        ['model_call_dispatched', 'model_call_opened'].includes(String(payload(entry).kind)),
      )
      expect(anchorRecords).toHaveLength(2)
      const dispatchedEntry = anchorRecords[0]
      const openedEntry = anchorRecords[1]
      if (dispatchedEntry === undefined || openedEntry === undefined)
        throw new Error('durable anchors absent')
      expect(
        events.filter(
          event =>
            event.stage === 'reply_handoff' &&
            event.facts.kind === 'progress' &&
            event.facts.anchor !== undefined,
        ),
      ).toEqual([
        {
          source: 'runtime',
          stage: 'reply_handoff',
          outcome: 'started',
          facts: {
            kind: 'progress',
            anchor: 'dispatched',
            anchorId: ExactDecimal.from(dispatchedEntry.position).toString(),
          },
        },
        {
          source: 'runtime',
          stage: 'reply_handoff',
          outcome: 'started',
          facts: {
            kind: 'progress',
            anchor: 'opened',
            anchorId: ExactDecimal.from(openedEntry.position).toString(),
          },
        },
      ])
      expect(factories).toBe(1)
      expect(closes).toBe(1)
      await handle.close()
    })
  })

  it('borrows the original owner slot for a durable intent during a live stream', async () => {
    await harness(async h => {
      const entered = deferred<void>()
      const resume = deferred<void>()
      const wire = transport({
        afterContent: async () => {
          entered.resolve()
          await resume.promise
        },
      })
      const contention = h.input.settlement.settlementContention
      if (contention === undefined) throw new Error('test settlement policy absent')
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: wire.adapter,
        settlement: {
          ...h.input.settlement,
          settlementContention: {
            ...contention,
            limits: { ...contention.limits, concurrent: 1 },
          },
        },
      })
      try {
        await entered.promise
        expect(h.owner.active).toBe(1)
        expect(h.owner.acquire(1)).toEqual({ unavailable: true })
        const borrowed = handle.borrowControl()
        if (!('owner' in borrowed)) throw new Error('original registration unavailable')
        const read = borrowed.owner.acquire(1)
        if (!('registration' in read)) throw new Error('borrowed read unavailable')
        const readTask = read.registration.start('read', () =>
          h.log.readSince(h.input.settlement.binding.session, 0),
        )
        const prefix = await readTask.completion
        expect(prefix).toHaveProperty('entries')
        await readTask.stopped
        read.registration.release()
        const beforeIntent = h.owner.starts.length
        expect(
          await appendControlRecord({
            binding: h.input.settlement.binding,
            owner: borrowed.owner,
            concurrent: 1,
            record: {
              kind: 'model_call_interrupt_intent',
              call: h.input.planInput.target.callId,
              initiator: 'user',
            },
            retainUnknown() {
              throw new Error('actual JSONL intent receipt became unknown')
            },
          }),
        ).toEqual({ appended: true })
        expect(h.owner.starts.slice(beforeIntent)).toEqual(['controlAppend'])
        const recorded = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in recorded)) throw new Error('actual log unreadable')
        expect(recorded.entries.map(payload)).toContainEqual({
          kind: 'model_call_interrupt_intent',
          call: h.input.planInput.target.callId,
          initiator: 'user',
        })
        borrowed.release()
        handle.interrupt('user')
      } finally {
        resume.resolve()
      }
      const outcome = await handle.outcome
      if ('replyPending' in outcome) {
        expect(outcome.replyPending).toMatchObject({
          outcome: 'interrupted',
          initiator: 'user',
          reply: { ending: 'interrupted_by_user' },
        })
        expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      } else {
        expect(outcome).toHaveProperty('settled')
      }
      const closed = await handle.close()
      expect({ outcome, closed, active: h.owner.active }).toMatchObject({
        closed: { released: true },
        active: 0,
      })
      expect(h.owner.active).toBe(0)
    })
  })
  it('keeps the original owner registration until a borrowed control task actually stops', async () => {
    await harness(async h => {
      const entered = deferred<void>()
      const resume = deferred<void>()
      const readStopped = deferred<void>()
      const held = deferred<void>()
      const wire = transport({
        afterContent: async () => {
          entered.resolve()
          await resume.promise
        },
        stop: async () => readStopped.resolve(),
      })
      const handle = createAnchoredModelInvocation({ ...h.input, transport: wire.adapter })
      await entered.promise
      const borrow = handle.borrowControl()
      if (!('owner' in borrow)) throw new Error('original owner unavailable')
      const acquired = borrow.owner.acquire(1)
      if (!('registration' in acquired)) throw new Error('control task unavailable')
      const task = acquired.registration.start('read', async () => {
        await held.promise
        return true
      })
      borrow.release()
      let finished = false
      const outcome = handle.outcome.then(result => {
        finished = true
        return result
      })
      handle.abort()
      resume.resolve()
      await readStopped.promise
      await Promise.resolve()
      expect(finished).toBe(false)
      expect(h.owner.active).toBe(1)
      held.resolve()
      await task.stopped
      acquired.registration.release()
      await outcome
      expect(await handle.close()).toEqual({ released: true })
      expect(h.owner.active).toBe(0)
    })
  })
  it('retains an unknown intent writer and permits an owned read to recognize its actual log fact', async () => {
    await harness(async h => {
      const entered = deferred<void>()
      const resume = deferred<void>()
      const readStopped = deferred<void>()
      const wire = transport({
        afterContent: async () => {
          entered.resolve()
          await resume.promise
        },
        stop: async () => readStopped.resolve(),
      })
      let appends = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          const result = await h.log.append(...args)
          return ++appends === 3 ? { failure: 'unavailable' } : result
        },
      })
      const handle = createAnchoredModelInvocation({ ...h.input, transport: wire.adapter })
      await entered.promise
      const borrow = handle.borrowControl()
      if (!('owner' in borrow)) throw new Error('original owner unavailable')
      let unknown: { readonly release: () => void } | undefined
      expect(
        await appendControlRecord({
          binding: h.input.settlement.binding,
          owner: borrow.owner,
          concurrent: 1,
          record: {
            kind: 'model_call_interrupt_intent',
            call: h.input.planInput.target.callId,
            initiator: 'user',
          },
          retainUnknown(registration) {
            unknown = registration
          },
        }),
      ).toEqual({ unavailable: true })
      expect(unknown).toBeDefined()
      borrow.release()
      let finished = false
      const outcome = handle.outcome.then(result => {
        finished = true
        return result
      })
      resume.resolve()
      await readStopped.promise
      await Promise.resolve()
      expect(finished).toBe(false)
      expect(h.owner.active).toBe(1)
      const failedRead = borrow.owner.acquire(1)
      if (!('registration' in failedRead)) throw new Error('retained control read unavailable')
      const failedTask = failedRead.registration.start('read', async () => ({
        failure: 'unavailable' as const,
      }))
      expect(await failedTask.completion).toEqual({ failure: 'unavailable' })
      await failedTask.stopped
      failedRead.registration.release()
      expect(finished).toBe(false)
      expect(h.owner.active).toBe(1)
      const acquired = borrow.owner.acquire(1)
      if (!('registration' in acquired)) throw new Error('unknown writer blocked recognition')
      const read = acquired.registration.start('read', () =>
        h.log.readSince(h.input.settlement.binding.session, 0),
      )
      const prefix = await read.completion
      if (!('entries' in prefix)) throw new Error('authoritative prefix unavailable')
      expect(prefix.entries.map(payload)).toContainEqual({
        kind: 'model_call_interrupt_intent',
        call: h.input.planInput.target.callId,
        initiator: 'user',
      })
      await read.stopped
      acquired.registration.release()
      if (unknown === undefined) throw new Error('unknown writer registration was lost')
      unknown.release()
      const result = await outcome
      if ('replyPending' in result)
        expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      expect(await handle.close()).toEqual({ released: true })
      expect(h.owner.active).toBe(0)
    })
  })
  it('accepts positive fractional durations at the anchored boundary without rounding them', async () => {
    await harness(async h => {
      const scheduled: number[] = []
      const handle = createAnchoredModelInvocation({
        ...h.input,
        policy: {
          ...h.input.policy,
          firstContentTimeoutMs: 0.1,
          idleContentTimeoutMs: 0.25,
          schedule(milliseconds) {
            scheduled.push(milliseconds)
            return () => {}
          },
        },
      })
      expect(await handle.outcome).toHaveProperty('replyPending')
      expect(scheduled).toContain(0.1)
      expect(scheduled).toContain(0.25)
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it.each([
    { rejected: 'invalidInput', reason: 'input_limit_missing', metrics: ['maxInputTokens'] },
    { rejected: 'invalidInput', reason: 'input_size_unavailable', metrics: ['maxRequestBytes'] },
    {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxImages',
      actual: 3,
      limit: 2,
    },
    {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
      estimatedTokens: 9,
      admissionTokens: 12,
      limit: 11,
    },
  ] satisfies PlanFailure[])(
    'preserves the complete anchored refusal without a log write: $reason',
    async failure => {
      await harness(async h => {
        const t = transport()
        const handle = createAnchoredModelInvocation({
          ...h.input,
          transport: { ...t.adapter, plan: async () => failure },
        })
        expect(await handle.outcome).toEqual(failure)
        expect(t.sends()).toBe(0)
        expect(h.writes).toHaveLength(0)
        expect(await handle.close()).toEqual({ released: true })
      })
    },
  )
  it('rejects a missing current cap before durable dispatched anchor or HTTP', async () => {
    await harness(async h => {
      const { maxInputTokens: _missing, ...snapshot } = h.input.planInput.snapshot
      const t = transport()
      const handle = Reflect.apply(createAnchoredModelInvocation, undefined, [
        { ...h.input, planInput: { ...h.input.planInput, snapshot }, transport: t.adapter },
      ])
      expect(await handle.outcome).toEqual({
        rejected: 'invalidInput',
        reason: 'input_limit_missing',
        metrics: ['maxInputTokens'],
      })
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(0)
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it('actual log tenant shell mismatch refuses dispatched before HTTP', async () => {
    await harness(async h => {
      const other = parseTenantId({ organization: 'other-org', account: 'other-account' })
      if (!('ok' in other)) throw new Error('tenant')
      expect(
        await h.log.append(
          h.input.settlement.binding.session,
          [{ tenant: other.ok, payload: null, readKeys: [] }],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      const t = transport()
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(t.sends()).toBe(0)
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it('generation revoked while confirmed dispatched returns closes HTTP admission and retains unsettled responsibility', async () => {
    await harness(async h => {
      h.wrap({
        ...h.log,
        async append(...args) {
          const result = await h.log.append(...args)
          h.revoke()
          return result
        },
      })
      const t = transport()
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(1)
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
    })
  })
  it('another-session read cannot settle the current complete candidate', async () => {
    await harness(async h => {
      h.wrap({
        ...h.log,
        async readSince(...args) {
          const read = await h.log.readSince(...args)
          if ('failure' in read) return read
          // Actual read values, with a deliberate JS host routing defect in the returned shell.
          for (const entry of read.entries) {
            const changed = { ...entry }
            Reflect.set(changed, 'session', 'other-session')
            return { ...read, entries: [changed, ...read.entries.slice(1)] }
          }
          return read
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      expect(await handle.outcome).toHaveProperty('replyPending')
      expect(await handle.settleReply('persisted')).toHaveProperty('unavailable')
      expect(h.writes).toHaveLength(2)
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
    })
  })
  for (const [name, raw] of [
    ['null', null],
    ['undefined', undefined],
    ['empty', {}],
    ['unknownFailure', { failure: 'fabricated' }],
    ['falseFailure', { failure: false }],
  ] as const)
    for (const stage of ['dispatched', 'opened'] as const)
      it(`JS ${stage} receipt ${name} stays unknown with no candidate/release`, async () => {
        await harness(async h => {
          const port = { ...h.log }
          let count = 0
          expect(
            Reflect.set(port, 'append', async (...args: Parameters<typeof h.log.append>) => {
              if (++count === (stage === 'dispatched' ? 1 : 2)) return raw
              return h.log.append(...args)
            }),
          ).toBe(true)
          h.wrap(port)
          const t = transport()
          const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
          expect(await handle.outcome).toEqual({ unavailable: true })
          expect(t.sends()).toBe(stage === 'dispatched' ? 0 : 1)
          expect(handle.snapshot().firstContentAt).toBeUndefined()
          expect(await handle.close()).toEqual({ unavailable: true })
          expect(h.released()).toBe(0)
        })
      })
  it('original owner unresolved opened blocks a new dispatch even after that IO actually stopped', async () => {
    await harness(async h => {
      h.owner.openedState = {
        unknown: {
          completion: Promise.resolve(null),
          stopped: Promise.resolve(),
          requestStop() {},
        },
      }
      const t = transport()
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(0)
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
    })
  })
  it('requested parameters and same-plan sent adjustments remain distinct in actual anchors/MR5', async () => {
    await harness(async h => {
      const t = transport()
      const handle = createAnchoredModelInvocation({
        ...h.input,
        planInput: { ...h.input.planInput, parameters: { temperature: 1, topP: 1 } },
        transport: {
          ...t.adapter,
          async plan(input, execution) {
            const base = await t.adapter.plan(input, execution)
            if ('rejected' in base) return base
            return {
              planned: {
                ...base.planned,
                parameters: { temperature: 0.5 },
                parameterAdjustments: [{ name: 'temperature', requested: 1, sent: 0.5 }],
                droppedParameters: ['topP'],
              },
            }
          },
          async send() {
            return { response: {} }
          },
        },
      })
      const outcome = await handle.outcome
      if (!('replyPending' in outcome)) throw new Error('reply')
      const declared = outcome.replyPending
      expect(declared.route.parameters).toEqual({ temperature: 0.5 })
      expect(declared.route.parameterAdjustments).toEqual([
        { name: 'temperature', requested: 1, sent: 0.5 },
      ])
      expect(declared.route.droppedParameters).toEqual(['topP'])
      expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read) || !read.entries[0]) throw new Error('dispatched')
      expect(payload(read.entries[0]).parameters).toEqual({ temperature: 1, topP: 1 })
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it('real duplicate dispatched dedupe permits exactly one HTTP handoff across two local handles', async () => {
    await harness(async h => {
      const t = transport(),
        other = transport()
      const first = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      const second = createAnchoredModelInvocation({ ...h.input, transport: other.adapter })
      const results = await Promise.all([first.outcome, second.outcome])
      expect(t.sends() + other.sends()).toBe(1)
      expect(results.filter(value => 'replyPending' in value)).toHaveLength(1)
      expect(results.filter(value => 'unavailable' in value)).toHaveLength(1)
      for (const handle of [first, second]) {
        const result = await handle.outcome
        if ('replyPending' in result)
          expect(await handle.settleReply('persisted')).toHaveProperty('settled')
        await handle.close()
      }
    })
  })
  it('unknown settlement retains original pending candidate and prevents release/reappend', async () => {
    await harness(async h => {
      let number = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          if (++number === 3) return { failure: 'unavailable' }
          return h.log.append(...args)
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      const outcome = await handle.outcome
      if (!('replyPending' in outcome)) throw new Error('reply')
      expect(await handle.settleReply('persisted')).toHaveProperty('unavailable')
      // The stopped writer with an unknown receipt keeps its coordinator registration.
      expect(h.owner.active).toBe(1)
      // The first close resolves that original from the full prefix: proven absent, no write.
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.writes.map(w => w.count)).toEqual([1, 1, 2])
      expect(h.owner.active).toBe(0)
      expect(h.released()).toBe(0)
      // RT11 S-86 / v20: only then is the same original [M,R] batch resent. Close never
      // substitutes its own no-reply candidate for the retained persisted request.
      expect(await handle.close()).toEqual({ released: true })
      expect(h.writes.map(w => w.count)).toEqual([1, 1, 2, 2])
      expect(h.writes[3]?.entries).toEqual(h.writes[2]?.entries)
      expect(h.released()).toBe(1)
      expect(outcome.replyPending.reply.id).toBe('anchored-message')
    })
  })
  it('shares a pending close, then retries after transient settlement read failure and releases once', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        resume = deferred<void>()
      let reads = 0
      h.wrap({
        ...h.log,
        async readSince(...args) {
          if (++reads === 1) {
            entered.resolve()
            await resume.promise
            return { failure: 'unavailable' }
          }
          return h.log.readSince(...args)
        },
      })
      const t = transport()
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await handle.outcome).toHaveProperty('replyPending')
      const first = handle.close()
      const concurrent = handle.close()
      expect(concurrent).toBe(first)
      await entered.promise
      expect(h.released()).toBe(0)
      resume.resolve()
      expect(await first).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
      expect(t.stopped()).toBe(1)
      expect(h.owner.active).toBe(0)
      expect(h.writes.map(w => w.count)).toEqual([1, 1])
      const retry = handle.close()
      expect(retry).not.toBe(first)
      expect(await retry).toEqual({ released: true })
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
      expect(t.sends()).toBe(1)
      expect(h.writes.map(w => w.count)).toEqual([1, 1, 1])
    })
  })
  it('system close of unhandled reply settles no-reply interrupted delivered facts through A1a [R]', async () => {
    await harness(async h => {
      const handle = createAnchoredModelInvocation(h.input)
      expect(await handle.outcome).toHaveProperty('replyPending')
      expect(await handle.close()).toEqual({ released: true })
      expect(h.writes.map(w => w.count)).toEqual([1, 1, 1])
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read) || !read.entries[2]) throw new Error('response')
      const response = payload(read.entries[2])
      expect(response).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
      expect(response).toHaveProperty('delivered')
      expect(response).not.toHaveProperty('reply')
    })
  })
  it('malformed successful anchor receipt is unknown and never authorizes HTTP/release', async () => {
    await harness(async h => {
      const t = transport()
      const events: DiagnosticEvent[] = []
      let closed = 0
      h.wrap({
        ...h.log,
        async append() {
          return { positions: [], tail: 0 }
        },
      })
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: t.adapter,
        diagnosticEmitterFactory: () => ({
          record(event) {
            events.push(event)
            return { recorded: { collectorId: 'test', sequence: String(events.length) } }
          },
          close() {
            closed++
          },
        }),
      })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(events.some(event => event.facts.kind === 'progress' && 'anchor' in event.facts)).toBe(
        false,
      )
      expect(closed).toBe(1)
      expect(t.sends()).toBe(0)
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
    })
  })
  it('owns credential/config/IDs/callbacks before a delayed dispatched append', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        continuation = deferred<void>()
      let number = 0,
        usedCredential = '',
        originalObservations = 0,
        replacementReleases = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          if (++number === 1) {
            entered.resolve()
            await continuation.promise
          }
          return h.log.append(...args)
        },
      })
      const t = transport()
      const sourceConfig = {
        ...h.input.policy.credentialRedaction,
        credential_header_names: [...h.input.policy.credentialRedaction.credential_header_names],
        credential_patterns: h.input.policy.credentialRedaction.credential_patterns.map(
          pattern => ({ ...pattern }),
        ),
      }
      const supplied = {
        ...h.input,
        policy: { ...h.input.policy, credentialRedaction: sourceConfig },
        onAccepted() {
          originalObservations++
        },
        transport: {
          ...t.adapter,
          async send(...args: Parameters<typeof t.adapter.send>) {
            usedCredential = args[1]
            return t.adapter.send(...args)
          },
        },
      }
      const handle = createAnchoredModelInvocation(supplied)
      await entered.promise
      Reflect.set(supplied, 'credential', 'later-credential')
      Reflect.set(supplied, 'messageId', 'later-message')
      Reflect.set(supplied, 'onAccepted', () => {
        throw new Error('later-observer')
      })
      Reflect.set(supplied, 'releaseBorrowed', async () => {
        replacementReleases++
      })
      Reflect.set(sourceConfig, 'credential_fragment_min_length', -1)
      sourceConfig.credential_header_names.splice(0)
      sourceConfig.credential_patterns.splice(0)
      continuation.resolve()
      const outcome = await handle.outcome
      if (!('replyPending' in outcome)) throw new Error('reply')
      expect(outcome.replyPending.reply.id).toBe('anchored-message')
      expect(usedCredential).toBe('503')
      expect(originalObservations).toBeGreaterThan(0)
      expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
      expect(replacementReleases).toBe(0)
    })
  })
  it('confirmed dispatched then cancellation before registered wait starts still commits S36 [R]', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        continuation = deferred<void>()
      const sourceOwner = h.owner
      const owner = {
        name: sourceOwner.name,
        admission: sourceOwner.admission,
        opened: sourceOwner.opened,
        unresolvedWrites: sourceOwner.unresolvedWrites,
        acquire(limit: Parameters<typeof sourceOwner.acquire>[0]) {
          const acquired = sourceOwner.acquire(limit)
          if ('unavailable' in acquired) return acquired
          const registration = acquired.registration
          return {
            registration: {
              release: registration.release,
              start: <T>(
                kind: Parameters<typeof registration.start>[0],
                operation: (signal: AbortSignal) => Promise<T>,
              ) =>
                registration.start(kind, async signal => {
                  if (kind === 'wait' && h.writes.length > 0) {
                    entered.resolve()
                    await continuation.promise
                  }
                  return operation(signal)
                }),
            },
          }
        },
      }
      const t = transport()
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: t.adapter,
        settlement: { ...h.input.settlement, owner },
      })
      await entered.promise
      h.controller.abort()
      continuation.resolve()
      const outcome = await handle.outcome
      if (!('settled' in outcome)) throw new Error('settled S36')
      expect(outcome.settled.settled.response.value).toMatchObject({
        outcome: 'interrupted',
        initiator: 'run_cancelled',
        timing: { sentAt: null },
      })
      expect(t.sends()).toBe(0)
      expect(h.writes.map(w => w.count)).toEqual([1, 1])
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
    })
  })
  it.each(['scheduler', 'clock'] as const)(
    'a %s stop after durable dispatch records interrupted with null sentAt and zero HTTP sends',
    async boundary => {
      await harness(async h => {
        const t = transport()
        let triggered = false
        const handle = createAnchoredModelInvocation({
          ...h.input,
          transport: t.adapter,
          policy: {
            ...h.input.policy,
            schedule(milliseconds, callback) {
              if (boundary === 'scheduler' && !triggered) {
                triggered = true
                h.controller.abort()
              }
              return h.input.policy.schedule(milliseconds, callback)
            },
            now() {
              if (boundary === 'clock' && !triggered) {
                triggered = true
                h.controller.abort()
              }
              return h.input.policy.now()
            },
          },
        })
        const outcome = await handle.outcome
        expect(triggered).toBe(true)
        if (!('settled' in outcome)) throw new Error('missing settled interruption')
        expect(outcome.settled.settled.response.value).toMatchObject({
          outcome: 'interrupted',
          initiator: 'run_cancelled',
          timing: { sentAt: null },
        })
        expect(t.sends()).toBe(0)
        const read = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in read)) throw new Error('actual JSONL read')
        expect(read.entries).toHaveLength(2)
        const [dispatch, response] = read.entries
        if (!dispatch || !response) throw new Error('missing JSONL records')
        expect(payload(dispatch)).toHaveProperty('kind', 'model_call_dispatched')
        expect(payload(response)).toMatchObject({
          outcome: 'interrupted',
          timing: { sentAt: null },
        })
        expect(await handle.close()).toEqual({ released: true })
      })
    },
  )
  it('N-5: a work that ends before send without a caller abort is asked to stop before it is awaited', async () => {
    await harness(async h => {
      const sourceOwner = h.owner
      // The owner's admission closes after the durable dispatch, without any caller abort: the
      // invocation work ends as cancelledBeforeSend while none of its tasks was asked to stop.
      let closed = false
      // Every task of this owner certifies its actual stop only after a stop request.
      const owner = {
        name: sourceOwner.name,
        admission: () => (closed ? ('closed' as const) : sourceOwner.admission()),
        opened: sourceOwner.opened,
        unresolvedWrites: sourceOwner.unresolvedWrites,
        acquire(limit: Parameters<typeof sourceOwner.acquire>[0]) {
          const acquired = sourceOwner.acquire(limit)
          if ('unavailable' in acquired) return acquired
          const registration = acquired.registration
          return {
            registration: {
              release: registration.release,
              start: <T>(
                kind: Parameters<typeof registration.start>[0],
                operation: (signal: AbortSignal) => Promise<T>,
              ) => {
                const task = registration.start(kind, operation)
                let ask = () => {}
                const asked = new Promise<void>(resolve => {
                  ask = resolve
                })
                return {
                  completion: task.completion,
                  requestStop: () => {
                    ask()
                    task.requestStop()
                  },
                  stopped: Promise.all([task.stopped, asked]).then(() => undefined),
                }
              },
            },
          }
        },
      }
      const t = transport()
      let triggered = false
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: t.adapter,
        settlement: { ...h.input.settlement, owner },
        policy: {
          ...h.input.policy,
          schedule(milliseconds, callback) {
            if (!triggered) {
              triggered = true
              closed = true
            }
            return h.input.policy.schedule(milliseconds, callback)
          },
        },
      })
      const outcome = await Promise.race([
        handle.outcome,
        new Promise(resolve => setTimeout(() => resolve('hung'), 5_000)),
      ])
      expect(triggered).toBe(true)
      if (outcome === 'hung' || !(typeof outcome === 'object' && outcome !== null))
        throw new Error('the cancelled-before-send path waited on a task it never asked to stop')
      expect(t.sends()).toBe(0)
      // With the owner's admission closed nothing may be settled here: the honest answer.
      expect(outcome).toEqual({ unavailable: true })
      closed = false
      const closing = await Promise.race([
        handle.close(),
        new Promise(resolve => setTimeout(() => resolve('hung'), 5_000)),
      ])
      expect(closing).not.toBe('hung')
    })
  })
  it('one plan, dispatched before send, opened before visible, one complete [M,R], exact reopened MR5', async () => {
    await harness(async h => {
      let appendNumber = 0,
        confirmedOpened = false
      h.wrap({
        ...h.log,
        async append(...args) {
          const number = ++appendNumber
          const result = await h.log.append(...args)
          if (number === 2 && 'positions' in result) confirmedOpened = true
          return result
        },
      })
      const t = transport({
        beforeSend: async () => {
          expect(h.writes).toHaveLength(1)
          const actual = await h.log.readSince(h.input.settlement.binding.session, 0)
          if (!('entries' in actual)) throw new Error('actual dispatched read')
          expect(actual.entries.map(payload).map(record => record.kind)).toEqual([
            'model_call_dispatched',
          ])
        },
      })
      let tick = 0,
        visible = 0
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: t.adapter,
        policy: { ...h.input.policy, now: () => `2026-09-28T00:00:0${tick++}Z` },
        onAccepted(_event, snapshot) {
          if (snapshot.firstContentAt !== undefined) {
            expect(h.writes).toHaveLength(2)
            expect(confirmedOpened).toBe(true)
            visible++
          }
        },
      })
      const outcome = await handle.outcome
      expect(t.plans()).toBe(1)
      expect(t.sends()).toBe(1)
      expect(t.stopped()).toBe(1)
      expect(visible).toBeGreaterThan(0)
      if (!('replyPending' in outcome)) throw new Error('reply pending')
      expect(h.writes.map(x => x.count)).toEqual([1, 1])
      const candidate = outcome.replyPending
      expect(judgePendingModelResponse(candidate)).toEqual({ ok: true })
      expect(candidate).not.toHaveProperty('replyDisposition')
      expect(candidate).not.toHaveProperty('late')
      expect(candidate.timing.firstTokenAt).toBe('2026-09-28T00:00:01Z')
      expect(candidate.route.servingProvider).toBe('actual-provider')
      expect(candidate.usage.input_tokens).toBe(503)
      expect(candidate.cost.cost_usd).toMatchObject({ source: '503.00' })
      expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      expect(h.writes.map(x => x.count)).toEqual([1, 1, 2])
      expect(
        h.writes.every(
          x =>
            JSON.stringify(x.fence) === '{"kind":"unfenced"}' &&
            JSON.stringify(x.condition) === '{"kind":"unconditional"}',
        ),
      ).toBe(true)
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
      await h.log.close()
      const reopened = await openJsonlSessionLog({
        dir: join(h.dir, 'log'),
        processOwnership: {
          current: `anchored-reopen:${process.pid}`,
          async observeExit() {
            return 'unknown'
          },
        },
      })
      try {
        const read = await reopened.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in read)) throw new Error('actual reopen')
        expect(read.entries).toHaveLength(4)
        expect(
          payload(
            read.entries[1] ??
              (() => {
                throw new Error('opened')
              })(),
          ).firstTokenAt,
        ).toBe(candidate.timing.firstTokenAt)
        const response = payload(
          read.entries[3] ??
            (() => {
              throw new Error('response')
            })(),
        )
        expect(response).toMatchObject({
          id: 'anchored-response',
          call: { callId: 'policy-call' },
          route: {
            upstreamRequestId: 'actual-id',
            adaptation: h.input.planInput.snapshot.adaptation,
          },
        })
      } finally {
        await reopened.close()
      }
    })
  })
  for (const result of [
    'reject',
    'dispatchedNotCommitted',
    'dispatchedUnknown',
    'dispatchedCollision',
  ] as const)
    it(`${result}: zero send and zero candidate`, async () => {
      await harness(async h => {
        const t = transport()
        if (result !== 'reject')
          h.wrap({
            ...h.log,
            async append() {
              if (result === 'dispatchedNotCommitted') return { failure: 'invalidInput' }
              if (result === 'dispatchedUnknown') return { failure: 'unavailable' }
              return { failure: 'alreadyRecorded', keys: ['collision'] }
            },
          })
        const handle = createAnchoredModelInvocation({
          ...h.input,
          transport:
            result === 'reject'
              ? { ...t.adapter, plan: async () => ({ rejected: 'modality_not_carried' }) }
              : t.adapter,
        })
        expect(await handle.outcome).toEqual(
          result === 'reject' ? { rejected: 'modality_not_carried' } : { unavailable: true },
        )
        expect(t.sends()).toBe(0)
        expect(await handle.settleReply('persisted')).toHaveProperty('unavailable')
        expect(await handle.close()).toEqual(
          result === 'dispatchedUnknown' || result === 'dispatchedCollision'
            ? { unavailable: true }
            : { released: true },
        )
      })
    })
  it('opened committed lost ack isolates all complete responses and observers', async () => {
    await harness(async h => {
      let number = 0,
        visible = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          const result = await h.log.append(...args)
          return ++number === 2 ? { failure: 'unavailable' } : result
        },
      })
      const t = transport()
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: t.adapter,
        onAccepted(_e, s) {
          if (s.firstContentAt !== undefined) visible++
        },
      })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(visible).toBe(0)
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(await handle.settleReply('persisted')).toHaveProperty('unavailable')
      expect(h.writes).toHaveLength(2)
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.released()).toBe(0)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('read')
      expect(read.entries.map(payload).map(v => v.kind)).toEqual([
        'model_call_dispatched',
        'model_call_opened',
      ])
    })
  })
  it('cancelled gate waits the late opened receipt; a landed anchor settles the no-reply final and close releases', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        late = deferred<void>()
      let number = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          if (++number === 2) {
            entered.resolve()
            await late.promise
          }
          return h.log.append(...args)
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      await entered.promise
      handle.abort()
      // The invocation ended first; the outcome is bounded by the append, never guessed.
      let finished = false
      const outcome = handle.outcome.then(result => {
        finished = true
        return result
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(finished).toBe(false)
      expect(h.released()).toBe(0)
      late.resolve()
      const result = await outcome
      if (!('settled' in result)) throw new Error('settled interrupted')
      expect(result.settled.settled.response.value).toMatchObject({
        outcome: 'interrupted',
        initiator: 'run_cancelled',
      })
      expect(result.settled.settled.response.value).not.toHaveProperty('reply')
      expect(result.settled.settled.response.value).toHaveProperty(['timing', 'firstTokenAt'])
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
      expect(h.writes).toHaveLength(3)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('read')
      expect(read.entries.map(payload).map(v => v.kind)).toEqual([
        'model_call_dispatched',
        'model_call_opened',
        undefined,
      ])
    })
  })
  it('cancelled gate whose late opened receipt is unknown stays unavailable, close waits the actual append stop and never releases', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        late = deferred<void>()
      let number = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          if (++number === 2) {
            entered.resolve()
            await late.promise
            await h.log.append(...args)
            return { failure: 'unavailable' }
          }
          return h.log.append(...args)
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      await entered.promise
      handle.abort()
      let closed = false
      const close = handle.close().then(result => {
        closed = true
        return result
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(closed).toBe(false)
      expect(h.released()).toBe(0)
      late.resolve()
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(await close).toEqual({ unavailable: true })
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(h.released()).toBe(0)
      expect(h.owner.active).toBe(1)
      expect(h.writes).toHaveLength(2)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('read')
      expect(read.entries.map(payload).map(v => v.kind)).toEqual([
        'model_call_dispatched',
        'model_call_opened',
      ])
    })
  })
  it('cancelled gate whose late opened receipt proves absence (tailChanged) settles the unopened no-reply final', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        late = deferred<void>()
      let number = 0
      h.wrap({
        ...h.log,
        async append(session, ...rest) {
          if (++number === 2) {
            entered.resolve()
            await late.promise
            const read = await h.log.readSince(session, 0)
            if (!('tail' in read)) throw new Error('read')
            return { failure: 'tailChanged', tail: read.tail }
          }
          return h.log.append(session, ...rest)
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      await entered.promise
      handle.abort()
      late.resolve()
      const result = await handle.outcome
      if (!('settled' in result)) throw new Error('settled interrupted')
      expect(result.settled.settled.response.value).toMatchObject({
        outcome: 'interrupted',
        initiator: 'run_cancelled',
      })
      expect(result.settled.settled.response.value).not.toHaveProperty('reply')
      expect(result.settled.settled.response.value).not.toHaveProperty('delivered')
      expect(result.settled.settled.response.value).not.toHaveProperty(['timing', 'firstTokenAt'])
      expect(await handle.close()).toEqual({ released: true })
      expect(h.writes).toHaveLength(3)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('read')
      expect(read.entries.map(payload).map(v => v.kind)).toEqual([
        'model_call_dispatched',
        undefined,
      ])
    })
  })
  it('definitively refused opened produces legal unopened failed [R], retains multi-value H', async () => {
    await harness(async h => {
      let number = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          return ++number === 2 ? { failure: 'invalidInput' } : h.log.append(...args)
        },
      })
      const headers = Object.freeze({ 'x-many': Object.freeze(['second', '', 'second', 'first']) })
      const t = transport({ sent: { response: {}, rawHeaders: headers } })
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      const outcome = await handle.outcome
      if (!('settled' in outcome)) throw new Error('settled refusal')
      expect(outcome.settled.settled.response.value).toMatchObject({
        outcome: 'failed',
        failure: { cause: 'unrecognized', localError: 'before_first_content' },
        raw: { headers },
      })
      expect(outcome.settled.settled.response.value).not.toHaveProperty('reply')
      expect(h.writes.map(x => x.count)).toEqual([1, 1, 1])
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  for (const kind of [
    'midReplyFailure',
    'truncated',
    'stopBeforeContent',
    'stopAfterContent',
  ] as const)
    it(`${kind}: legal actual [R] or caller-owned reply shape`, async () => {
      await harness(async h => {
        const t = transport({
          ...(kind === 'midReplyFailure'
            ? { end: { failed: { source: 'stream_broken' } } as const }
            : {}),
          ...(kind === 'truncated' ? { end: { ended: 'max_tokens' } as const } : {}),
          ...(kind === 'stopBeforeContent'
            ? {
                beforeSend: async () => {
                  h.controller.abort()
                },
              }
            : {}),
          ...(kind === 'stopAfterContent'
            ? {
                afterContent: async () => {
                  h.controller.abort()
                },
              }
            : {}),
        })
        const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
        const result = await handle.outcome
        if (
          kind === 'midReplyFailure' ||
          kind === 'stopBeforeContent' ||
          kind === 'stopAfterContent'
        ) {
          if (!('settled' in result)) throw new Error('settled')
          expect(result.settled.settled.response.value).toMatchObject({
            outcome: kind === 'midReplyFailure' ? 'failed' : 'interrupted',
          })
          expect(result.settled.settled.response.value).not.toHaveProperty('reply')
          if (kind === 'midReplyFailure' || kind === 'stopAfterContent')
            expect(result.settled.settled.response.value).toHaveProperty('delivered')
        } else {
          if (!('replyPending' in result)) throw new Error('reply')
          expect(result.replyPending.reply.ending).toBe('truncated_at_limit')
          expect(await handle.settleReply({ consumed: { by: 'side_query' } })).toHaveProperty(
            'settled',
          )
          expect(h.writes.map(x => x.count)).toEqual([1, 1, 1])
        }
        expect(await handle.close()).toEqual({ released: true })
      })
    })
  it('close waits actual stream cleanup before returning borrowed references', async () => {
    await harness(async h => {
      const entered = deferred<void>(),
        actualStop = deferred<void>()
      const t = transport({
        stop: async () => {
          entered.resolve()
          await actualStop.promise
        },
      })
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      await entered.promise
      let closed = false
      const closing = handle.close().then(v => {
        closed = true
        return v
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(h.released()).toBe(0)
      actualStop.resolve()
      expect(await closing).toEqual({ released: true })
      expect(h.released()).toBe(1)
    })
  })
  it('sink failure cannot replace successful reply or settlement', async () => {
    await harness(async h => {
      const handle = createAnchoredModelInvocation({
        ...h.input,
        onAccepted() {
          throw new Error('sink')
        },
        policy: {
          ...h.input.policy,
          diagnostic() {
            throw new Error('diagnostic sink')
          },
        },
      })
      expect(await handle.outcome).toHaveProperty('replyPending')
      expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it('route, credential tenant, config, generation mismatches reject before append/send', async () => {
    await harness(async h => {
      const t = transport()
      const tenant = parseTenantId({ organization: 'another', account: 'other' })
      if (!('ok' in tenant)) throw new Error('tenant')
      for (const change of [
        { profile: { origin: 'official', routeName: 'wrong/model' } as const },
        { credentialScope: { layer: 'tenant', tenant: tenant.ok } as const },
        {
          policy: {
            ...h.input.policy,
            credentialRedaction: {
              ...h.input.policy.credentialRedaction,
              credential_fragment_min_length: -1,
            },
          },
        },
      ]) {
        const handle = createAnchoredModelInvocation({
          ...h.input,
          transport: t.adapter,
          ...change,
        })
        expect(await handle.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
        await handle.close()
      }
      h.revoke()
      const revoked = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await revoked.outcome).toEqual({ unavailable: true })
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(0)
    })
  })
})

describe('v17 conditional Run anchored invocation', () => {
  const run = 'anchored-run'
  const attempt = 1
  async function appendStarted(h: Parameters<Parameters<typeof harness>[0]>[0]) {
    const binding = h.input.settlement.binding
    const event = captureModelLogValue({
      category: 'message',
      input: {
        kind: 'value',
        value: {
          id: 'anchored-attempt-start',
          type: 'system_reminder',
          nature: 'event',
          source: {
            kind: 'attempt_started',
            attempt,
            reason: 'first',
            at: '2026-09-29T00:00:00Z',
          },
          blocks: [],
          createdAt: '2026-09-29T00:00:00Z',
        },
      },
    })
    if (!('ok' in event)) throw new Error('Run attempt message')
    const started = prepareModelLogEntry({
      session: binding.session,
      shell: { tenant: binding.tenant, run, attempt },
      captured: event.ok,
      purpose: { kind: 'message' },
      messagePrefix: [],
    })
    if (!('ok' in started)) throw new Error('Run attempt entry')
    const initial = await h.log.append(
      binding.session,
      [started.ok],
      { kind: 'fenced', run, attempt },
      { kind: 'unconditional' },
    )
    if ('failure' in initial) throw new Error('Run attempt append')
  }
  function runReader(
    h: Parameters<Parameters<typeof harness>[0]>[0],
  ): AnchoredInvocationInput<TestPlan, object>['settlement'] {
    return {
      ...h.input.settlement,
      run(prefix, originalRun, originalAttempt) {
        expect(prefix.binding.session).toBe(h.input.settlement.binding.session)
        return {
          known: {
            run: originalRun,
            originalAttempt,
            latestAttempt: attempt,
            terminal: 'open' as const,
          },
        }
      },
    }
  }
  it('uses the original attempt fence for both anchors and tailEquals for the complete response', async () => {
    await harness(async h => {
      const binding = h.input.settlement.binding
      await appendStarted(h)
      const handle = createAnchoredModelInvocation({
        ...h.input,
        run,
        attempt,
        settlement: runReader(h),
      })
      const result = await handle.outcome
      if (!('replyPending' in result)) throw new Error('Run reply not handed off')
      expect(result.replyPending.call.runId).toBe(run)
      expect(result.replyPending.attemptId).toBe(attempt)
      const settled = await handle.settleReply({ consumed: { by: 'compaction' } })
      expect(settled).toHaveProperty('settled')
      expect(h.writes.map(item => [item.fence, item.condition])).toEqual([
        [{ kind: 'fenced', run, attempt }, { kind: 'unconditional' }],
        [{ kind: 'fenced', run, attempt }, { kind: 'unconditional' }],
        [{ kind: 'unfenced' }, { kind: 'tailEquals', tail: 3 }],
      ])
      const raw = await h.log.readSince(binding.session, 0)
      if ('failure' in raw) throw new Error('Run invocation log')
      expect(raw.entries).toHaveLength(4)
      expect(raw.entries.at(-1)?.run).toBe(run)
      expect(raw.entries.at(-1)?.attempt).toBe(attempt)
      expect(await handle.close()).toEqual({ released: true })
    })
  })
  it('retains a lost opened acknowledgement and never emits a response or opens a second request', async () => {
    await harness(async h => {
      await appendStarted(h)
      let appendCount = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          const receipt = await h.log.append(...args)
          return ++appendCount === 2 ? { failure: 'unavailable' } : receipt
        },
      })
      const wire = transport()
      const handle = createAnchoredModelInvocation({
        ...h.input,
        run,
        attempt,
        transport: wire.adapter,
        settlement: runReader(h),
      })
      expect(await handle.outcome).toEqual({ unavailable: true })
      expect(wire.sends()).toBe(1)
      expect(await handle.settleReply('persisted')).toMatchObject({ unavailable: true })
      expect(await handle.close()).toEqual({ unavailable: true })
      // The stopped opened writer's receipt is unknown; only S-33 recovery may resolve it, so
      // its registration stays owned instead of being released as if the write were settled.
      expect(h.owner.active).toBe(1)
      expect(h.released()).toBe(0)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('Run prefix unreadable')
      expect(read.entries.map(payload).map(value => value.kind)).toEqual([
        undefined,
        'model_call_dispatched',
        'model_call_opened',
      ])
      expect(h.writes).toHaveLength(2)
    })
  })
  it('waits for a delayed opened receipt before a cancelled Run owner settles and closes', async () => {
    await harness(async h => {
      await appendStarted(h)
      const entered = deferred<void>()
      const finish = deferred<void>()
      let appendCount = 0
      h.wrap({
        ...h.log,
        async append(...args) {
          if (++appendCount === 2) {
            entered.resolve()
            await finish.promise
          }
          return h.log.append(...args)
        },
      })
      const wire = transport()
      const handle = createAnchoredModelInvocation({
        ...h.input,
        run,
        attempt,
        transport: wire.adapter,
        settlement: runReader(h),
      })
      await entered.promise
      handle.abort()
      let finished = false
      const outcome = handle.outcome.then(result => {
        finished = true
        return result
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(finished).toBe(false)
      expect(h.owner.active).toBe(1)
      expect(h.released()).toBe(0)
      finish.resolve()
      const result = await outcome
      if (!('settled' in result)) throw new Error('settled interrupted')
      expect(result.settled.settled.response.value).toMatchObject({
        outcome: 'interrupted',
        initiator: 'run_cancelled',
        call: { runId: run },
        attemptId: attempt,
      })
      expect(result.settled.settled.response.value).not.toHaveProperty('reply')
      expect(await handle.close()).toEqual({ released: true })
      expect(h.owner.active).toBe(0)
      expect(h.released()).toBe(1)
      expect(wire.sends()).toBe(1)
      expect(h.writes).toHaveLength(3)
      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read)) throw new Error('Run prefix unreadable')
      expect(read.entries).toHaveLength(4)
      expect(read.entries.map(payload).map(value => value.kind)).toEqual([
        undefined,
        'model_call_dispatched',
        'model_call_opened',
        undefined,
      ])
      expect(read.entries.at(-2)).toMatchObject({ run, attempt })
      expect(read.entries.at(-1)).toMatchObject({ run, attempt })
    })
  })
})
