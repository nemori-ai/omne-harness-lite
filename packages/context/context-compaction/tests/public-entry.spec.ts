import { access, adoption, ref, operation, result, request, ok, tenant } from './request-fixture.ts'
import { describe, expect, it } from 'vitest'
import {
  encodeCompactionRequest,
  decodeCompactionRequest,
  type CompactionTaskRef,
} from '@omne-harness/agent-contract'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createContextCompaction,
  compactionRequestDigest,
  type CompactionProviderOptions,
  type CompactionRecord,
  type CompactionStore,
} from '@omne-harness/context-compaction'

function memory(): CompactionStore {
  const records = new Map<string, CompactionRecord>()
  const key = (item: CompactionTaskRef) => JSON.stringify([item.authority, item.tenant, item.task])
  return {
    async read(item) {
      return succeed(records.get(key(item)) ?? null)
    },
    async change(item, decide) {
      const change = decide(records.get(key(item)) ?? null)
      if ('failure' in change) return change
      if (change.ok.record !== null) records.set(key(item), change.ok.record)
      return succeed(change.ok.value)
    },
    async pending() {
      return succeed({ refs: [], next: null })
    },
  }
}

function fixture(options: Partial<CompactionProviderOptions<string>> = {}) {
  let executions = 0
  let checks = 0
  const store = options.store ?? memory()
  const provider = createContextCompaction({
    authority: ref.authority,
    adoption,
    store,
    authorize: async () => succeed(undefined),
    custody: async () => {
      checks += 1
      return fail({ kind: 'handoff-invalid', reason: 'not retained' })
    },
    executor: {
      advance: async () => {
        executions += 1
        return succeed({ phase: 'pending', knowledge: 'accepted', physical: 'pending' })
      },
      cancel: async () => succeed('settled'),
    },
    ...options,
  })
  return { ...provider, store, counts: () => ({ executions, checks }) }
}

describe('durable compaction task boundary', () => {
  it.each(['admit', 'inspect', 'cancel', 'acknowledge'] as const)(
    'denies a cross-tenant %s before reading or changing custody',
    async operationName => {
      const parsed = tenantCodec.parse(
        '{"organization":"org_11111111111111111111111111","account":"acc_11111111111111111111111111"}',
      )
      if (!parsed.ok) throw new Error('tenant fixture')
      const f = fixture()
      const input = request()
      ok(await f.service.admit({ ...access, request: input }))
      const before = ok(await f.store.read(input.ref))
      const foreign = { ...access, tenant: parsed.value }
      const denied =
        operationName === 'admit'
          ? await f.service.admit({ ...foreign, request: input })
          : operationName === 'inspect'
            ? await f.service.inspect({ ...foreign, ref: input.ref })
            : operationName === 'cancel'
              ? await f.service.cancel({ ...foreign, ref: input.ref, operation })
              : await f.service.acknowledge({
                  ...foreign,
                  ref: input.ref,
                  operation,
                  result,
                  handoff: { kind: 'retained', consumer: input.consumer, custody: result.evidence },
                })
      expect(denied).toHaveProperty('failure.kind', 'denied')
      expect(ok(await f.store.read(input.ref))).toEqual(before)
      expect(f.counts()).toEqual({ executions: 0, checks: 0 })
    },
  )

  it('restores a serialized request with valid tenant identity and unchanged digest', () => {
    const input = request()
    const restored = ok(decodeCompactionRequest(ok(encodeCompactionRequest(input))))
    expect(restored).toEqual(input)
    expect(tenantEquals(restored.ref.tenant, tenant)).toBe(true)
    expect(compactionRequestDigest(restored)).toBe(input.ref.requestDigest)
    expect(Object.isFrozen(restored.input.history.entries)).toBe(true)
  })

  it('rejects corrupted persisted requests instead of casting JSON into a request', () => {
    const encoded = ok(encodeCompactionRequest(request()))
    expect(
      decodeCompactionRequest(encoded.replace('"selectable":true', '"selectable":false')),
    ).toHaveProperty('failure')
    expect(
      decodeCompactionRequest(encoded.replace('"role":"user"', '"role":"invented"')),
    ).toHaveProperty('failure')
    expect(decodeCompactionRequest('{')).toHaveProperty('failure')
  })

  it('recognizes duplicate admission without driving the algorithm', async () => {
    const f = fixture()
    const input = request()
    const first = ok(await f.service.admit({ ...access, request: input }))
    expect(first).toMatchObject({ phase: 'pending', knowledge: 'accepted' })
    expect(
      ok(
        await f.service.admit({
          ...access,
          request: ok(decodeCompactionRequest(ok(encodeCompactionRequest(input)))),
        }),
      ),
    ).toEqual(first)
    expect(f.counts().executions).toBe(0)
    const restored = fixture({ store: f.store })
    expect(ok(await restored.reconcile(input.ref))).toMatchObject({ phase: 'pending' })
    expect(restored.counts().executions).toBe(1)
  })

  it('captures the exact request before authorization yields to its caller', async () => {
    const f = fixture()
    const input = request()
    const pending = f.service.admit({ ...access, request: input })
    Reflect.set(input.input.history.entries[0]!, 'sequence', '99')
    ok(await pending)
    const stored = ok(await f.store.read(input.ref))
    expect(stored?.request?.input.history.entries[0]?.sequence).toBe('7')
  })

  it('keeps an early cancellation when the original admission arrives late', async () => {
    const f = fixture()
    const input = request()
    const cancelled = ok(await f.service.cancel({ ...access, ref: input.ref, operation }))
    expect(ok(await f.service.admit({ ...access, request: input }))).toEqual(cancelled)
    expect(ok(await f.reconcile(input.ref))).toEqual(cancelled)
    expect(f.counts().executions).toBe(0)
  })

  it('locates real consumer custody even when cancellation preceded admission', async () => {
    const input = request()
    const f = fixture({
      custody: async given => {
        expect(given.consumer).toEqual(input.consumer)
        return succeed(undefined)
      },
    })
    const cancelled = ok(await f.service.cancel({ ...access, ref: input.ref, operation }))
    if (cancelled.phase !== 'terminal') throw new Error('cancelled result')
    const handoff = {
      kind: 'retained' as const,
      consumer: input.consumer,
      custody: result.evidence,
    }
    ok(
      await f.service.acknowledge({
        ...access,
        ref: input.ref,
        operation,
        result: cancelled.result,
        handoff,
      }),
    )
    expect(ok(await f.service.inspect({ ...access, ref: input.ref }))).toMatchObject({
      kind: 'found',
      state: { phase: 'handed-off' },
    })
  })

  it('rejects a handoff naming a different consumer from the admitted request', async () => {
    const f = fixture({ custody: async () => succeed(undefined) })
    const input = request()
    ok(await f.service.admit({ ...access, request: input }))
    const cancelled = ok(await f.service.cancel({ ...access, ref: input.ref, operation }))
    if (cancelled.phase !== 'terminal') throw new Error('cancelled result')
    const handoff = {
      kind: 'retained' as const,
      consumer: { ...input.consumer, work: 'another' },
      custody: result.evidence,
    }
    expect(
      await f.service.acknowledge({
        ...access,
        ref: input.ref,
        operation,
        result: cancelled.result,
        handoff,
      }),
    ).toHaveProperty('failure.kind', 'handoff-invalid')
  })

  it('settles cancellation after handoff without restarting execution', async () => {
    const f = fixture({ custody: async () => succeed(undefined) })
    const input = request()
    ok(await f.service.admit({ ...access, request: input }))
    const state = ok(await f.service.cancel({ ...access, ref: input.ref, operation }))
    if (state.phase !== 'terminal') throw new Error('expected terminal')
    ok(
      await f.service.acknowledge({
        ...access,
        ref: input.ref,
        operation,
        result: state.result,
        handoff: { kind: 'retained', consumer: request().consumer, custody: result.evidence },
      }),
    )
    expect(ok(await f.reconcile(input.ref))).toMatchObject({
      phase: 'handed-off',
      physical: 'settled',
    })
    expect(f.counts().executions).toBe(0)
  })

  it('keeps cancellation terminal when execution completes while cancellation is committing', async () => {
    const gate = Promise.withResolvers<void>()
    const f = fixture({
      executor: {
        advance: async () => {
          await gate.promise
          return succeed({
            phase: 'terminal',
            outcome: { kind: 'failed', reason: 'execution-limit', diagnostic: 'bounded' },
            physical: 'settled',
          })
        },
        cancel: async () => succeed('settled'),
      },
    })
    const input = request()
    ok(await f.service.admit({ ...access, request: input }))
    const running = f.reconcile(input.ref)
    const cancelled = ok(await f.service.cancel({ ...access, ref: input.ref, operation }))
    gate.resolve()
    expect(ok(await running)).toEqual(cancelled)
  })

  it('seals an absent task on cancellation and recovers it from the same store', async () => {
    const first = fixture()
    const cancelled = ok(await first.service.cancel({ ...access, ref, operation }))
    expect(cancelled).toMatchObject({
      phase: 'terminal',
      physical: 'settled',
      outcome: { kind: 'cancelled', operation },
    })
    const replacement = fixture({ store: first.store })
    expect(ok(await replacement.service.inspect({ ...access, ref }))).toEqual({
      kind: 'found',
      state: cancelled,
    })
    expect(ok(await replacement.service.cancel({ ...access, ref, operation }))).toEqual(cancelled)
    expect(first.counts().executions).toBe(0)
    expect(replacement.counts().executions).toBe(0)
  })

  it('does not create a task when an acknowledgment arrives before admission', async () => {
    const f = fixture()
    expect(
      await f.service.acknowledge({
        ...access,
        ref,
        operation,
        result,
        handoff: { kind: 'retained', consumer: request().consumer, custody: result.evidence },
      }),
    ).toEqual(fail({ kind: 'not-found' }))
    expect(ok(await f.service.inspect({ ...access, ref }))).toEqual({ kind: 'missing' })
  })

  it('checks current access before revealing an existing cancellation', async () => {
    let allowed = true
    const f = fixture({
      authorize: async input =>
        allowed ? succeed(undefined) : fail({ kind: 'denied', action: input.operation }),
    })
    ok(await f.service.cancel({ ...access, ref, operation }))
    allowed = false
    expect(await f.service.inspect({ ...access, ref })).toEqual(
      fail({ kind: 'denied', action: 'inspect' }),
    )
    expect(await f.service.cancel({ ...access, ref, operation })).toEqual(
      fail({ kind: 'denied', action: 'cancel' }),
    )
  })

  it('refuses the same identity with another input digest', async () => {
    const f = fixture()
    ok(await f.service.cancel({ ...access, ref, operation }))
    const changed = { ...ref, requestDigest: 'another-input' }
    expect(await f.service.inspect({ ...access, ref: changed })).toEqual(
      fail({ kind: 'conflict', ref: changed }),
    )
  })

  it('keeps a cancelled result until its receiver proves durable custody', async () => {
    const f = fixture()
    const state = ok(await f.service.cancel({ ...access, ref, operation }))
    if (state.phase !== 'terminal') throw new Error('expected terminal')
    expect(
      await f.service.acknowledge({
        ...access,
        ref,
        operation,
        result: state.result,
        handoff: { kind: 'retained', consumer: request().consumer, custody: result.evidence },
      }),
    ).toEqual(fail({ kind: 'handoff-invalid', reason: 'not retained' }))
    expect(ok(await f.service.inspect({ ...access, ref }))).toEqual({ kind: 'found', state })
    expect(f.counts().checks).toBe(1)
  })
})
