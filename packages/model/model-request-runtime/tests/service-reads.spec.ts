import { describe, expect, it } from 'vitest'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { interpretCallHistory } from '../src/call-history.ts'
import { createRuntimeReads } from '../src/service-reads.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { captureModelLogValue, prepareModelLogEntry } from '../src/log-codec.ts'
import type { SessionModelSelectionInput } from '../src/session-selection-types.ts'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { RuntimeConstruction, SessionRuntimeBinding } from '../src/service-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import { selectionHost, AT } from './session-selection-fixture.ts'
import { dispatched, opened } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'

function construction(
  binding: SessionRuntimeBinding,
  reads: { value: number; append: number; credential: number; transport: number },
): RuntimeConstruction<PlannedSemantics, unknown> {
  const message = parseOpaqueIdentifier('unused-reply-message', 'MessageId')
  if (!('ok' in message)) throw new Error('reply message identity')
  return {
    sessions: {
      async bind(session) {
        return session === binding.log.session ? { binding } : { failure: 'invalidInput' }
      },
    },
    calls: createCallContainerStore(),
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    transport: {
      acquire() {
        reads.transport++
        return { unavailable: true }
      },
    },
    settlementContention: {
      name: 'test',
      limits: { submissions: 1, elapsedMs: 1, retainedBytes: 1, concurrent: 1 },
      decide() {
        return { stop: true }
      },
    },
    settlementScheduler: {
      nowMonotonicMs: () => 0,
      wait() {
        throw new Error('read operation must not schedule')
      },
    },
    policy: {
      now: () => AT,
      schedule() {
        throw new Error('read operation must not schedule')
      },
      firstContentTimeoutMs: 1,
      idleContentTimeoutMs: 1,
      statusCauseTable: {},
      credentialRedaction: {
        credential_fragment_min_length: 8,
        credential_header_names: [],
        credential_patterns: [],
      },
      diagnostic() {},
    },
    identities: {
      call: () => 'unused-call',
      response: () => 'unused-response',
      message: () => message.ok,
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      failure() {
        return { unavailable: true }
      },
      run() {
        return { unavailable: true }
      },
    },
    reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 1 },
    recovery: {
      enter() {
        throw new Error('read operation must not enter recovery')
      },
    },
    diagnostic() {},
  }
}

function currentSelection(
  input: Omit<SessionModelSelectionInput, 'projection'>,
): SessionModelSelectionInput {
  return {
    ...input,
    async projection(prefix) {
      for (const entry of prefix.entries) {
        const payload = entry.payload
        if (
          payload === null ||
          typeof payload !== 'object' ||
          Array.isArray(payload) ||
          isJsonNumber(payload) ||
          !('category' in payload) ||
          payload.category !== 'record'
        )
          return { unknown: true }
      }
      return { known: [] }
    },
  }
}

describe('RT7 service selection and reads on real SQLite/JSONL session', () => {
  it('uses the same current evaluation and one durable selection writer across calls', async () => {
    const host = await selectionHost()
    const held = host.create()
    await held.component.close()
    const counts = { value: 0, append: 0, credential: 0, transport: 0 }
    const binding: SessionRuntimeBinding = {
      log: held.input.binding,
      selection: currentSelection(held.input),
      tools: {
        async lookup() {
          return { failure: 'unavailable' }
        },
      },
      catalog: host.catalog,
      credentials: {
        async value() {
          counts.credential++
          return { failure: 'unavailable' }
        },
      },
      currentEvaluationInputs: host.reader,
    }
    const runtime = createRuntimeReads(construction(binding, counts))
    try {
      expect(await runtime.methods.legalTargets({ session: host.session })).toEqual({
        legalTargets: ['example/model-a', 'example/model-b'],
      })
      expect(await runtime.methods.effectiveModel({ session: host.session })).toEqual({
        unavailable: true,
      })
      expect(
        await runtime.methods.selectModel({ session: host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })
      expect(
        await runtime.methods.selectModel({ session: host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })
      expect(await runtime.methods.effectiveModel({ session: host.session })).toMatchObject({
        effectiveModel: {
          selected: 'example/model-a',
          routeName: 'example/model-a',
          selectedBy: 'session',
        },
      })
      expect(await runtime.methods.displayList({ session: host.session })).toMatchObject({
        displayList: [
          { routeName: 'example/model-a', selected: true },
          { routeName: 'example/model-b', selected: false },
        ],
      })
      const log = await host.log.readSince(host.session, 0)
      if ('failure' in log) throw new Error('real log unreadable')
      expect(log.entries).toHaveLength(1)
      expect(counts.transport).toBe(0)
      expect(counts.credential).toBe(0)
    } finally {
      expect(await runtime.close()).toEqual({ released: true })
      await host.close()
    }
  })

  it('reads complete empty prefix without acquiring credentials, transport, or append', async () => {
    const host = await selectionHost()
    const held = host.create()
    await held.component.close()
    const counts = { value: 0, append: 0, credential: 0, transport: 0 }
    let unreadable = false
    const binding: SessionRuntimeBinding = {
      log: {
        ...held.input.binding,
        log: {
          readByKey: host.log.readByKey.bind(host.log),
          async readSince(...args: Parameters<SessionLog['readSince']>) {
            counts.value++
            if (unreadable) return { failure: 'unavailable' }
            return await host.log.readSince(...args)
          },
          async append(...args: Parameters<SessionLog['append']>) {
            counts.append++
            return await host.log.append(...args)
          },
        },
      },
      selection: currentSelection(held.input),
      tools: {
        async lookup() {
          throw new Error('read must not resolve tool')
        },
      },
      catalog: host.catalog,
      credentials: {
        async value() {
          counts.credential++
          return { failure: 'unavailable' }
        },
      },
      currentEvaluationInputs: host.reader,
    }
    const runtime = createRuntimeReads(construction(binding, counts))
    try {
      expect(
        await runtime.methods.readAttempts({ session: host.session, callId: 'missing-call' }),
      ).toEqual({
        callNotFound: true,
      })
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'missing-call',
          plan: { provider: 'test' },
        }),
      ).toEqual({ callNotFound: true })
      expect(counts).toEqual({ value: 2, append: 0, credential: 0, transport: 0 })
      unreadable = true
      expect(
        await runtime.methods.readAttempts({ session: host.session, callId: 'missing-call' }),
      ).toEqual({
        unavailable: true,
      })
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'missing-call',
          plan: { provider: 'test' },
        }),
      ).toEqual({ unavailable: true })
      expect(counts).toEqual({ value: 4, append: 0, credential: 0, transport: 0 })
    } finally {
      expect(await runtime.close()).toEqual({ released: true })
      await host.close()
    }
  })

  it('uses the same durable guard: wrong phase before opened, already spoke before wrong phase', async () => {
    const host = await selectionHost()
    const held = host.create()
    await held.component.close()
    let serviceAppends = 0
    let credentialReads = 0
    let transports = 0
    const binding: SessionRuntimeBinding = {
      log: {
        ...held.input.binding,
        log: {
          readSince: host.log.readSince.bind(host.log),
          readByKey: host.log.readByKey.bind(host.log),
          async append(...args: Parameters<SessionLog['append']>) {
            serviceAppends++
            return await host.log.append(...args)
          },
        },
      },
      selection: currentSelection(held.input),
      tools: {
        async lookup() {
          throw new Error('read must not resolve tools')
        },
      },
      catalog: host.catalog,
      credentials: {
        async value() {
          credentialReads++
          return { failure: 'unavailable' }
        },
      },
      currentEvaluationInputs: host.reader,
    }
    const counts = { value: 0, append: 0, credential: 0, transport: 0 }
    const base = construction(binding, counts)
    const runtime = createRuntimeReads({
      ...base,
      transport: {
        acquire() {
          transports++
          return { unavailable: true }
        },
      },
    })
    async function appendRecord(value: unknown) {
      const captured = captureModelLogValue({ category: 'record', input: { kind: 'value', value } })
      if (!('ok' in captured)) throw new Error(`record rejected: ${captured.reason}`)
      const prepared = prepareModelLogEntry({
        session: host.session,
        shell: { tenant: host.tenant },
        captured: captured.ok,
        purpose: { kind: 'record' },
        messagePrefix: null,
      })
      if (!('ok' in prepared)) throw new Error(`record entry rejected: ${prepared.reason}`)
      const submitted = await host.log.append(
        host.session,
        [prepared.ok],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in submitted) throw new Error(`record append failed: ${submitted.failure}`)
    }
    try {
      await appendRecord(dispatched)
      expect(
        await runtime.methods.readAttempts({ session: host.session, callId: 'call' }),
      ).toMatchObject({
        state: 'in_flight',
        dispatches: [
          { record: { call: 'call', dispatch: expect.anything() }, opened: null, response: null },
        ],
      })
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'call',
          plan: { provider: 'second' },
        }),
      ).toEqual({ wrongPhase: { phase: 'in_flight' } })
      await appendRecord(opened)
      expect(
        await runtime.methods.readAttempts({ session: host.session, callId: 'call' }),
      ).toMatchObject({
        state: 'speaking',
        dispatches: [{ record: { call: 'call' }, opened: expect.anything(), response: null }],
      })
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'call',
          plan: { provider: 'second' },
        }),
      ).toEqual({ refused: { why: 'already_spoke' } })
      expect({ serviceAppends, credentialReads, transports }).toEqual({
        serviceAppends: 0,
        credentialReads: 0,
        transports: 0,
      })
    } finally {
      expect(await runtime.close()).toEqual({ released: true })
      await host.close()
    }
  })

  it('never returns a partial failed history and rejects an old codec fact in the same prefix', async () => {
    const host = await selectionHost()
    const held = host.create()
    await held.component.close()
    const binding: SessionRuntimeBinding = {
      log: held.input.binding,
      selection: currentSelection(held.input),
      tools: {
        async lookup() {
          throw new Error('read must not resolve tools')
        },
      },
      catalog: host.catalog,
      credentials: {
        async value() {
          throw new Error('read must not fetch credentials')
        },
      },
      currentEvaluationInputs: host.reader,
    }
    const counts = { value: 0, append: 0, credential: 0, transport: 0 }
    const runtime = createRuntimeReads(construction(binding, counts))
    async function appendCurrent(category: 'record' | 'response', value: unknown) {
      const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
      if (!('ok' in captured)) throw new Error(`current value rejected: ${captured.reason}`)
      const prepared = prepareModelLogEntry({
        session: host.session,
        shell: { tenant: host.tenant },
        captured: captured.ok,
        purpose: { kind: category },
        messagePrefix: [],
      })
      if (!('ok' in prepared)) throw new Error(`current entry rejected: ${prepared.reason}`)
      const submitted = await host.log.append(
        host.session,
        [prepared.ok],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in submitted) throw new Error(`actual append failed: ${submitted.failure}`)
      return prepared.ok
    }
    try {
      await appendCurrent('record', dispatched)
      const { reply: _reply, replyDisposition: _disposition, timing: _timing, ...body } = responseV5
      await appendCurrent('response', {
        ...body,
        outcome: 'failed',
        failure: { cause: 'upstream_unavailable' },
        timing: { sentAt: AT, endedAt: AT },
      })
      // The complete failed response exists, but runner conclusions are not readable.
      expect(await runtime.methods.readAttempts({ session: host.session, callId: 'call' })).toEqual(
        {
          unavailable: true,
        },
      )
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'call',
          plan: { provider: 'second' },
        }),
      ).toEqual({ allowed: true })
      const current = await appendCurrent('record', {
        kind: 'model_selection_changed',
        routeName: 'example/model-a',
        at: AT,
      })
      const payload = current.payload
      if (
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        isJsonNumber(payload) ||
        !('format' in payload)
      )
        throw new Error('current codec entry payload missing')
      const stale = { ...current, payload: { ...payload, format: 'mrr/2' } }
      const submitted = await host.log.append(
        host.session,
        [stale],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in submitted) throw new Error(`old fact append failed: ${submitted.failure}`)
      expect(await runtime.methods.readAttempts({ session: host.session, callId: 'call' })).toEqual(
        {
          unavailable: true,
        },
      )
      expect(
        await runtime.methods.canDispatchAgain({
          session: host.session,
          callId: 'call',
          plan: { provider: 'second' },
        }),
      ).toEqual({ unavailable: true })
      expect(counts.transport).toBe(0)
      expect(counts.credential).toBe(0)
    } finally {
      expect(await runtime.close()).toEqual({ released: true })
      await host.close()
    }
  })
})
