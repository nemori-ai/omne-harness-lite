import { describe, expect, it } from 'vitest'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { join } from 'node:path'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { judgeModelResponse } from '@omne-harness-lite/model-response/v5'
import { harness, transport, payload, deferred } from './anchored-invocation-fixture.ts'

describe('A1b noRun actual JSONL + SQL identity mapping + production invokeModel', () => {
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
          plan(input) {
            const base = t.adapter.plan(input)
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
      const declared = outcome.replyPending.responseFor('persisted')
      if (!('response' in declared)) throw new Error('response')
      expect(declared.response.route.parameters).toEqual({ temperature: 0.5 })
      expect(declared.response.route.parameterAdjustments).toEqual([
        { name: 'temperature', requested: 1, sent: 0.5 },
      ])
      expect(declared.response.route.droppedParameters).toEqual(['topP'])
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
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.writes.map(w => w.count)).toEqual([1, 1, 2])
      expect(h.released()).toBe(0)
      expect(outcome.replyPending.reply.id).toBe('anchored-message')
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
      h.wrap({
        ...h.log,
        async append() {
          return { positions: [], tail: 0 }
        },
      })
      const handle = createAnchoredModelInvocation({ ...h.input, transport: t.adapter })
      expect(await handle.outcome).toEqual({ unavailable: true })
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
                  if (kind === 'wait') {
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
      })
      expect(t.sends()).toBe(0)
      expect(h.writes.map(w => w.count)).toEqual([1, 1])
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
    })
  })
  it('one plan, dispatched before send, opened before visible, one complete [M,R], exact reopened MR5', async () => {
    await harness(async h => {
      const t = transport({
        beforeSend: async () => {
          expect(h.writes).toHaveLength(1)
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
      const candidate = outcome.replyPending.responseFor('persisted')
      if (!('response' in candidate)) throw new Error('MR5 candidate')
      expect(judgeModelResponse(candidate.response)).toEqual({ ok: true })
      expect(candidate.response.timing.firstTokenAt).toBe('2026-09-28T00:00:01Z')
      expect(candidate.response.route.servingProvider).toBe('actual-provider')
      expect(candidate.response.usage.input_tokens).toBe(503)
      expect(candidate.response.cost.cost_usd).toMatchObject({ source: '503.00' })
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
        ).toBe(candidate.response.timing.firstTokenAt)
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
              ? { ...t.adapter, plan: () => ({ rejected: 'modality_not_carried' }) }
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
  it('cancelled gate returns unavailable, close waits actual late append stop, never releases unknown', async () => {
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
      expect(await handle.outcome).toEqual({ unavailable: true })
      let closed = false
      const close = handle.close().then(result => {
        closed = true
        return result
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(h.released()).toBe(0)
      late.resolve()
      expect(await close).toEqual({ unavailable: true })
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(h.writes).toHaveLength(2)
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
        expect(await handle.outcome).toEqual({ rejected: 'invalidInput' })
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
