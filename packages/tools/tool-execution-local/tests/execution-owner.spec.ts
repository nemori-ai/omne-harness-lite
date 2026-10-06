import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  createParameterJudge,
  isToolReturn,
  toolResultOf,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import type {
  AdmissionToken,
  ToolActionFacts,
  ToolActionHistoryOperations,
  ToolAdmissionOperations,
} from '@omne-harness-lite/tool-admission'
import {
  projectToolJournal,
  type DeliveryBasis,
  type ExecutionRef,
  type ExecutionSubmission,
  type ExecutionTerminal,
  type ToolExecutor,
} from '@omne-harness-lite/tool-execution-runtime'
import { createExecutionOwner } from '../src/execution-owner.ts'
import { createToolImplementationRegistry } from '../src/implementations.ts'
import { createToolInvoker } from '../src/invoker.ts'
import { createRuntimeJournal } from '../src/runtime-journal.ts'

const at = '2026-10-05T04:00:00.000Z'
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'owner-user' })),
  session: unwrap(parseOpaqueIdentifier('owner-session', 'SessionRef')),
}
const ref: ExecutionRef = {
  ...scope,
  callId: unwrap(parseOpaqueIdentifier('owner-call', 'CallId')),
}
// Authorization and admission are controlled ports here. Actual issuer/official Cordis composition is a separate obligation.
const access = Object.freeze({}) as SessionAccess
const definition: ToolDefinition = {
  name: 'echo',
  description: 'Echo a value',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { value: { type: 'string', description: 'Value to echo' } },
    required: ['value'],
    description: 'Echo input',
  },
  permissions: { execute: { default: 'auto' } },
}
const request: ExecutionSubmission = {
  access,
  scope,
  adoption: 'adopted',
  admissionToken: 'locator' as AdmissionToken,
  origin: { run: 'owner-run', attempt: 1, assistantMessage: 'reply' },
  call: {
    id: unwrap(parseOpaqueIdentifier('call-block', 'BlockId')),
    kind: 'tool_call',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    callId: ref.callId,
    tool: 'echo',
    arguments: { value: 'captured' },
  },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
function frozenDelivery(
  terminal: ExecutionTerminal,
  chain: DeliveryBasis['selectedChain'],
  pass: string,
): DeliveryBasis {
  const returned =
    terminal.outcome === 'completed'
      ? terminal.result
      : terminal.outcome === 'failed' && terminal.result !== undefined
        ? terminal.result
        : terminal.outcome
  const normalized = toolResultOf(returned, unwrap(parseOpaqueIdentifier('result-text', 'BlockId')))
  return {
    result: {
      id: unwrap(parseOpaqueIdentifier('result-block', 'BlockId')),
      kind: 'tool_result',
      callId: ref.callId,
      visibility: { toHuman: true, toModel: true },
      blocks: normalized.content,
      outcome: terminal.outcome,
      ...(terminal.outcome === 'interrupted'
        ? { reason: { code: 'user_interrupted' as const, text: terminal.reason } }
        : {}),
    } as DeliveryBasis['result'],
    pass,
    selectedChain: chain,
  }
}
/** Real JSONL/codec/projection/invoker/implementation registry. Delivery bytes and chain selection remain controlled inputs. */
async function fixture(
  executor: ToolExecutor = async () => 'actual-result',
  invalidated?: AbortSignal,
  adoptedDefinition: ToolDefinition = definition,
) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-execution-owner-'))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'owner-test', observeExit: async () => 'exited' },
  })
  const append = vi.fn<SessionLog['append']>(log.append),
    readSince = vi.fn(log.readSince)
  const implementation = vi.fn(executor),
    implementations = createToolImplementationRegistry()
  const withdraw = implementations.register({
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    definition: adoptedDefinition,
    executor: implementation,
    ...(invalidated ? { invalidated } : {}),
  })
  let authorized = true
  const authorize = vi.fn<SessionAccessOperations['authorize']>(async (_access, candidate) =>
    authorized && JSON.stringify(candidate) === JSON.stringify(scope)
      ? {
          kind: 'authorized',
          identity: {
            binding: 'controlled',
            principal: 'user',
            principalKind: 'human',
            scope,
            consumer: 'tool',
            contextKeys: [],
          },
        }
      : { kind: 'rejected', reason: 'notAuthorized' },
  )
  const history: ToolActionHistoryOperations = {
    inspect(prefix, callId) {
      const projected = projectToolJournal(prefix.scope, prefix.entries)
      if ('invalid' in projected) return { kind: 'unavailable' }
      const facts: ToolActionFacts = {
        origin: request.origin,
        latestAttempt: prefix.entries.some(entry => entry.dedupeKey === 'attempt-changed') ? 2 : 1,
        runState: prefix.entries.some(entry => entry.dedupeKey === 'run-ended') ? 'ended' : 'open',
        calls: [request.call],
        route: projected.executions.has(callId)
          ? {
              kind: 'execution',
              intentKey: projected.executions.get(callId)!.intent.entry.dedupeKey!,
            }
          : { kind: 'none' },
        adoption: {
          key: 'adopted',
          tools: [
            {
              name: 'echo',
              capability: 'tool:echo',
              asset: 'echo-asset',
              version: '1',
              definition: adoptedDefinition,
            },
          ],
          report: {
            session: scope.session,
            runId: 'owner-run',
            attempt: 1,
            computedAt: 0 as ToolActionFacts['adoption']['report']['computedAt'],
            snapshots: [],
            availability: [],
            mcpActions: [],
            endpointHoldings: [],
            effectivePermissions: {},
            skillGate: [],
          },
        },
        batch: {
          kind: 'complete',
          completion: {
            key: 'batch',
            gate: { kind: 'available' },
            items: [
              {
                callId: ref.callId,
                effectiveCall: request.call,
                conclusions: ['official'],
                decision: { kind: 'allow', conclusion: 'official' },
              },
            ],
          },
        },
      }
      return { kind: 'known', facts }
    },
  }
  const backing = {
    ownerGeneration: 'owner-generation',
    borrow: () => ({
      log: { append, readSince, readByKey: log.readByKey },
      release: async () => {},
    }),
  }
  const journal = createRuntimeJournal({ backing, history })
  const admission: ToolAdmissionOperations = {
    forPass: async () => ({ kind: 'rejected', reason: 'passUnavailable' }),
    verifyToken: async () => {
      const view = await log.readSince(scope.session, 0)
      if ('failure' in view) return { kind: 'failed', reason: 'unavailable' }
      return {
        kind: 'valid',
        checked: { scope, ownerGeneration: backing.ownerGeneration, tail: view.tail },
      }
    },
  }
  const bind = vi.fn<Parameters<typeof createExecutionOwner>[0]['context']['bind']>(async () => ({
    kind: 'bound' as const,
    reader: {
      read: async (keys: readonly string[]) => ({
        kind: 'values' as const,
        values: keys.map(key => ({ key, revision: '1', value: 'actual-context', observedAt: at })),
      }),
    },
  }))
  const prepareDelivery = vi.fn(
    async ({
      terminal,
      chain,
      pass,
    }: Parameters<Parameters<typeof createExecutionOwner>[0]['prepareDelivery']>[0]) => ({
      terminal,
      delivery: frozenDelivery(terminal, chain, pass),
    }),
  )
  const selectChain = vi.fn<Parameters<typeof createExecutionOwner>[0]['selectChain']>(
    async () => ({ chain: [], pass: 'after-action-pass' }),
  )
  const owner = createExecutionOwner({
    journal,
    authorization: { authorize },
    admission: () => admission,
    implementations,
    context: { bind },
    clock: { now: () => unwrap(instantFromRfc3339(at)) },
    attempts: 3,
    invoke: createToolInvoker({
      parameters: createParameterJudge(),
      judgeResult: value => {
        return isToolReturn(value)
          ? {
              kind: 'valid',
              result:
                typeof value === 'string'
                  ? value
                  : toolResultOf(value, unwrap(parseOpaqueIdentifier('judged-result', 'BlockId'))),
            }
          : { kind: 'invalid' }
      },
    }),
    selectChain,
    prepareDelivery,
  })
  async function observer() {
    const acquired = await owner.operations.acquire(access, ref)
    if (acquired.kind !== 'acquired') throw new Error(`fixture acquire ${acquired.reason}`)
    return acquired.observer
  }
  return {
    owner,
    journal,
    log,
    append,
    readSince,
    implementation,
    withdraw,
    authorize,
    bind,
    prepareDelivery,
    selectChain,
    observer,
    revoke() {
      authorized = false
    },
    async marker(key: string) {
      const view = await log.readSince(scope.session, 0)
      if ('failure' in view) throw new Error('fixture unavailable')
      const result = await log.append(
        scope.session,
        [
          {
            tenant: scope.tenant,
            dedupeKey: key,
            readKeys: [key],
            payload: { controlledRunMarker: key },
          },
        ],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: view.tail },
      )
      if ('failure' in result) throw new Error(`fixture marker ${result.failure}`)
      return result
    },
    async close() {
      await owner.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('concurrent identical submissions invoke one captured closure and persist terminal, account and delivery together', async () => {
  const f = await fixture()
  try {
    expect(
      await Promise.all([f.owner.operations.submit(request), f.owner.operations.submit(request)]),
    ).toEqual([
      { kind: 'recorded', execution: ref },
      { kind: 'recorded', execution: ref },
    ])
    const observer = await f.observer(),
      result = await observer.waitForEnd()
    expect(result).toMatchObject({
      kind: 'found',
      snapshot: {
        state: {
          phase: 'ended',
          terminal: { outcome: 'completed', result: 'actual-result' },
          account: {
            cost: { total_usd: 0, items: [] },
            frames: { emitted: 0 },
            wallClock: { startedAt: at, endedAt: at },
          },
        },
      },
    })
    expect(f.implementation).toHaveBeenCalledTimes(1)
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error('fixture view unavailable')
    const ending = view.executions.get(ref.callId)!.terminal!
    expect(ending.value.delivery.pass).toBe('after-action-pass')
    expect(ending.value.account.late).toBeUndefined()
    expect(
      f.append.mock.calls.filter(call =>
        call[1].some(entry => entry.dedupeKey?.includes('execution_ended')),
      ),
    ).toHaveLength(1)
    observer.release()
  } finally {
    await f.close()
  }
})
test('last observer release settles its pending wait while execution survives and another observer can reattach', async () => {
  const entered = deferred<AbortSignal>(),
    returned = deferred<string>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve(dependencies.signal)
    return returned.promise
  })
  try {
    expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
    const signal = await entered.promise,
      first = await f.observer(),
      pending = first.waitForEnd()
    first.release()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect(signal.aborted).toBe(false)
    f.withdraw()
    returned.resolve('survived-release')
    const second = await f.observer()
    expect(await second.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { result: 'survived-release' } } },
    })
    expect(f.implementation).toHaveBeenCalledTimes(1)
    second.release()
  } finally {
    returned.resolve('cleanup')
    await f.close()
  }
})
test('explicit stop commits interruption before abort and a later author result cannot replace it', async () => {
  const entered = deferred<AbortSignal>(),
    returned = deferred<string>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve(dependencies.signal)
    return returned.promise
  })
  try {
    await f.owner.operations.submit(request)
    const signal = await entered.promise
    expect(await f.owner.operations.stop(access, ref, 'requested-stop')).toBe('stopped')
    expect(signal.aborted).toBe(true)
    returned.resolve('too-late')
    await f.owner.idle()
    const observer = await f.observer()
    expect(await observer.read()).toMatchObject({
      snapshot: {
        state: {
          terminal: { outcome: 'interrupted', reason: 'requested-stop' },
          account: { stoppedAt: at },
        },
      },
    })
    expect(await f.owner.operations.stop(access, ref, 'second-stop')).toBe('alreadyEnded')
    observer.release()
  } finally {
    returned.resolve('cleanup')
    await f.close()
  }
})
test.each(['run-ended', 'attempt-changed'])(
  'terminal commit recomputes late after a competing %s append',
  async marker => {
    const f = await fixture()
    const append = f.log.append
    let inserted = false
    f.append.mockImplementation(async (...args) => {
      if (!inserted && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
        inserted = true
        await f.marker(marker)
      }
      return append(...args)
    })
    try {
      await f.owner.operations.submit(request)
      const observer = await f.observer()
      expect(await observer.waitForEnd()).toMatchObject({
        snapshot: { state: { account: { late: true } } },
      })
      expect(
        f.append.mock.calls.filter(call =>
          call[1].some(entry => entry.dedupeKey?.includes('execution_ended')),
        ),
      ).toHaveLength(2)
      observer.release()
    } finally {
      await f.close()
    }
  },
)
test('unknown intent receipt is recognized before the only invocation starts', async () => {
  const f = await fixture()
  f.append.mockImplementationOnce(async (...args) => {
    expect(await f.log.append(...args)).toHaveProperty('ok')
    return { failure: 'unavailable' }
  })
  try {
    expect(await f.owner.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(f.implementation).not.toHaveBeenCalled()
    expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
    const observer = await f.observer()
    expect(await observer.waitForEnd()).toMatchObject({ snapshot: { state: { phase: 'ended' } } })
    expect(f.implementation).toHaveBeenCalledTimes(1)
    observer.release()
  } finally {
    await f.close()
  }
})
test('successful execution context reads are durable before the executor receives them', async () => {
  let f!: Awaited<ReturnType<typeof fixture>>
  f = await fixture(async (_args, dependencies) => {
    const read = await dependencies.context.read(['workspace'])
    const view = await f.journal.read(scope, ref.callId)
    expect(view.kind).toBe('view')
    if (view.kind !== 'view') throw new Error('fixture context unavailable')
    expect(view.executions.get(ref.callId)?.contextReads).toHaveLength(1)
    expect(read).toMatchObject({ kind: 'values', values: [{ value: 'actual-context' }] })
    return 'used-context'
  })
  try {
    await f.owner.operations.submit(request)
    const observer = await f.observer()
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        adoptedContext: [{ key: 'workspace', revision: '1', value: 'actual-context' }],
        state: { terminal: { outcome: 'completed', result: 'used-context' } },
      },
    })
    observer.release()
  } finally {
    await f.close()
  }
})
test('a changed context view stays an explicit rejection and is never durably adopted', async () => {
  let f!: Awaited<ReturnType<typeof fixture>>
  f = await fixture(async (_args, dependencies) => {
    expect(await dependencies.context.read(['workspace'])).toEqual({
      kind: 'rejected',
      reason: 'viewChanged',
    })
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error('fixture context unavailable')
    expect(view.executions.get(ref.callId)?.contextReads).toHaveLength(0)
    return 'context-not-adopted'
  })
  f.bind.mockResolvedValueOnce({
    kind: 'bound',
    reader: { read: async () => ({ kind: 'rejected', reason: 'viewChanged' }) },
  })
  try {
    await f.owner.operations.submit(request)
    const observer = await f.observer()
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        adoptedContext: [],
        state: { terminal: { outcome: 'completed', result: 'context-not-adopted' } },
      },
    })
    observer.release()
  } finally {
    await f.close()
  }
})
test('revocation prevents observer reads, stop and duplicate submit before existence can escape', async () => {
  const f = await fixture()
  try {
    await f.owner.operations.submit(request)
    const observer = await f.observer()
    await observer.waitForEnd()
    f.revoke()
    const reads = f.readSince.mock.calls.length
    expect(await observer.read()).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(await f.owner.operations.stop(access, ref, 'stop')).toBe('notAuthorized')
    expect(await f.owner.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(f.readSince.mock.calls).toHaveLength(reads)
    observer.release()
  } finally {
    await f.close()
  }
})
test('owner close invalidates old observers and confirms abnormal interruption before draining execution', async () => {
  const entered = deferred<void>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve()
    await new Promise<void>(resolve =>
      dependencies.signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    return 'discarded-on-close'
  })
  try {
    await f.owner.operations.submit(request)
    await entered.promise
    const observer = await f.observer(),
      waiting = observer.waitForEnd()
    await f.owner.close()
    expect(await waiting).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect(await observer.read()).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    const view = await f.log.readSince(scope.session, 0)
    if ('failure' in view) throw new Error('fixture closed log unreadable')
    const projected = projectToolJournal(scope, view.entries)
    if ('invalid' in projected) throw new Error('fixture closed history invalid')
    expect(projected.executions.get(ref.callId)?.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    observer.release()
  } finally {
    await f.close()
  }
})

test('a lost start receipt retains the fixed implementation and reentry starts it once after recognition', async () => {
  const f = await fixture()
  let lost = false
  f.append.mockImplementation(async (...args) => {
    const result = await f.log.append(...args)
    if (!lost && args[1].some(entry => entry.dedupeKey?.includes('execution_started'))) {
      lost = true
      return { failure: 'unavailable' }
    }
    return result
  })
  try {
    expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
    await f.owner.idle()
    expect(f.implementation).not.toHaveBeenCalled()
    f.withdraw()
    expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
    const observer = await f.observer()
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { result: 'actual-result' } } },
    })
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(
      f.append.mock.calls.filter(args =>
        args[1].some(entry => entry.dedupeKey?.includes('execution_started')),
      ),
    ).toHaveLength(1)
    observer.release()
  } finally {
    await f.close()
  }
})

test('a lost terminal receipt is recognized without invoking or preparing the original result again', async () => {
  const f = await fixture()
  let lost = false
  f.append.mockImplementation(async (...args) => {
    const result = await f.log.append(...args)
    if (!lost && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
      lost = true
      return { failure: 'unavailable' }
    }
    return result
  })
  try {
    await f.owner.operations.submit(request)
    await f.owner.idle()
    const observer = await f.observer()
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { result: 'actual-result' } } },
    })
    expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
    await f.owner.idle()
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(f.prepareDelivery).toHaveBeenCalledTimes(1)
    observer.release()
  } finally {
    await f.close()
  }
})

test('revocation during chain IO prevents the intent append and execution', async () => {
  const f = await fixture()
  f.selectChain.mockImplementation(async () => {
    f.revoke()
    return { chain: [], pass: 'after-action-pass' }
  })
  try {
    expect(await f.owner.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(f.append).not.toHaveBeenCalled()
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('unavailable chain selection refuses admission instead of freezing an empty chain', async () => {
  const f = await fixture()
  f.selectChain.mockResolvedValue('unavailable')
  try {
    expect(await f.owner.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(f.append).not.toHaveBeenCalled()
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('cross-tenant lookup and controls refuse before reading a session log', async () => {
  const f = await fixture()
  const foreign = {
    ...ref,
    tenant: unwrap(parseTenantId({ organization: 'other-org', account: 'other-user' })),
  }
  try {
    expect(await f.owner.operations.acquire(access, foreign)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await f.owner.operations.stop(access, foreign, 'stop')).toBe('notAuthorized')
    expect(f.readSince).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('actual frame reduction is observable and its measured count goes into the terminal account', async () => {
  const entered = deferred<void>(),
    returned = deferred<string>()
  const f = await fixture(async (_args, dependencies) => {
    expect(
      dependencies.frames.emit({
        t: 'open',
        index: 0,
        kind: 'text',
        fill: 'append',
        id: unwrap(parseOpaqueIdentifier('frame-text', 'BlockId')),
        visibility: { toHuman: true, toModel: false },
      }),
    ).toEqual({ kind: 'accepted' })
    expect(dependencies.frames.emit({ t: 'fill', index: 0, payload: 'streamed' })).toEqual({
      kind: 'accepted',
    })
    entered.resolve()
    await returned.promise
    expect(
      dependencies.frames.emit({
        t: 'close',
        index: 0,
        block: {
          id: unwrap(parseOpaqueIdentifier('frame-text', 'BlockId')),
          kind: 'text',
          visibility: { toHuman: true, toModel: false },
          text: 'streamed',
        },
      }),
    ).toEqual({ kind: 'accepted' })
    return 'done'
  })
  try {
    await f.owner.operations.submit(request)
    await entered.promise
    const observer = await f.observer()
    expect(await observer.frames()).toMatchObject({
      kind: 'snapshot',
      value: { blocks: [{ content: 'streamed' }] },
    })
    returned.resolve('finish')
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        state: {
          terminal: { outcome: 'completed', result: 'done' },
          account: { frames: { emitted: 3 } },
        },
      },
    })
    observer.release()
  } finally {
    returned.resolve('cleanup')
    await f.close()
  }
})

test('observer release settles an outstanding authorized read without waiting for the source IO', async () => {
  const f = await fixture(),
    entered = deferred<void>(),
    resumed = deferred<void>()
  try {
    await f.owner.operations.submit(request)
    const observer = await f.observer()
    await observer.waitForEnd()
    const original = f.authorize.getMockImplementation()!
    f.authorize.mockImplementationOnce(async (...args) => {
      entered.resolve()
      await resumed.promise
      return original(...args)
    })
    const pending = observer.read()
    await entered.promise
    observer.release()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    resumed.resolve()
    expect(f.implementation).toHaveBeenCalledTimes(1)
  } finally {
    resumed.resolve()
    await f.close()
  }
})

test('implementation resource invalidation records unavailable and aborts its owned execution without changing the result later', async () => {
  const invalidated = new AbortController(),
    entered = deferred<AbortSignal>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve(dependencies.signal)
    await new Promise<void>(resolve =>
      dependencies.signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    return 'invalidated-author-result'
  }, invalidated.signal)
  try {
    await f.owner.operations.submit(request)
    const signal = await entered.promise,
      observer = await f.observer()
    invalidated.abort('resource-unloaded')
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        state: { terminal: { outcome: 'unavailable', reason: 'implementation_invalidated' } },
      },
    })
    await f.owner.idle()
    expect(signal.aborted).toBe(true)
    expect(await observer.read()).toMatchObject({
      snapshot: { state: { terminal: { outcome: 'unavailable' } } },
    })
    observer.release()
  } finally {
    invalidated.abort('cleanup')
    await f.close()
  }
})

test.each<ToolDefinition>([
  { ...definition, needs: { attachmentStorage: 'declared-storage' } },
  { ...definition, needs: { externalServices: ['declared-service'] } },
  {
    ...definition,
    settings: {
      targetEnvironment: {
        category: 'placement_identity',
        default: { bindingLayer: 'host_machine', facilities: ['shell'] },
      },
    },
  },
])(
  'unresolved declared dependencies end unavailable without using declaration defaults',
  async adopted => {
    const f = await fixture(async () => 'must-not-run', undefined, adopted)
    try {
      expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
      const observer = await f.observer()
      expect(await observer.waitForEnd()).toMatchObject({
        snapshot: {
          state: {
            terminal: {
              outcome: 'unavailable',
              reason: 'execution_dependencies_unavailable',
            },
          },
        },
      })
      expect(f.implementation).not.toHaveBeenCalled()
      expect(f.bind).not.toHaveBeenCalled()
      observer.release()
    } finally {
      await f.close()
    }
  },
)
