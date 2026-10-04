/**
 * Real-assembly runtime over the Cordis host of tests/session-selection-fixture.ts (SQLite
 * Storage, JSONL SessionLog), shared by the 2026-09-30 close-responsibility acceptance and the
 * R-X close-receipt regression. Only what the runtime *sees* may be disturbed here (one append
 * receipt, the moment of a host stop); verdicts are read back from the durable log.
 */
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { createModelCallContentStore } from '../src/reference-content.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import type { CallAccess, CallPresence } from '../src/reference-types.ts'
import type {
  ModelCallHost,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
  SettlementTaskKind,
} from '../src/settlement-types.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

export const messageId = unwrap(parseOpaqueIdentifier('rv3-close-message', 'MessageId'))
export const creationKey = (value: string) => unwrap(parseOpaqueIdentifier(value, 'CreationKey'))

export const within = <T>(ms: number, promise: Promise<T>, what: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}: hung ${ms}ms`)), ms)),
  ])

export function kindOf(entry: LogEntry): unknown {
  try {
    return payload(entry).kind
  } catch {
    return undefined
  }
}

/** Entries of one call: records name it as `call`, responses nest it as `call.callId`. */
export function ofCall(callId: string): (entry: LogEntry) => boolean {
  return entry => {
    let value: JsonObject
    try {
      value = payload(entry)
    } catch {
      return false
    }
    const nested = value.call
    return (
      value.call === callId ||
      (typeof nested === 'object' &&
        nested !== null &&
        'callId' in nested &&
        nested.callId === callId)
    )
  }
}

interface StartedTask {
  readonly kind: SettlementTaskKind
  readonly completion: Promise<unknown>
}
/** The fixture owner, additionally exposing every task started through it (measurement only). */
export function observedOwner(inner: ControlledSettlementOwner): {
  readonly owner: SettlementOwner
  readonly started: StartedTask[]
} {
  const started: StartedTask[] = []
  const owner: SettlementOwner = {
    name: inner.name,
    admission: inner.admission,
    opened: inner.opened,
    unresolvedWrites: inner.unresolvedWrites,
    acquire: limit => {
      const acquired = inner.acquire(limit)
      if ('unavailable' in acquired) return acquired
      const real: SettlementRegistration = acquired.registration
      const registration: SettlementRegistration = {
        start: <T>(
          kind: SettlementTaskKind,
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> => {
          const task = real.start(kind, operation)
          started.push({ kind, completion: task.completion })
          return task
        },
        release: real.release,
      }
      return { registration }
    },
  }
  return { owner, started }
}

export type Host = Awaited<ReturnType<typeof selectionHost>>

export async function entriesOf(host: Host, callId: string): Promise<JsonObject[]> {
  const log = await host.log.readSince(host.session, 0)
  if (!('entries' in log)) throw new Error('durable log unavailable')
  return log.entries.filter(ofCall(callId)).map(entry => payload(entry))
}
export const finalsOf = (entries: readonly JsonObject[]) =>
  entries.filter(value => typeof value.outcome === 'string')

/** One production runtime over the real host; only the session-log append may be wrapped. */
export async function runtimeOver(
  host: Host,
  options: {
    readonly prefix: string
    readonly owner?: SettlementOwner
    readonly wire?: ReturnType<typeof transport>
    readonly append?: (real: SessionLog['append']) => SessionLog['append']
  },
) {
  const selected = host.create(options.owner === undefined ? {} : { owner: options.owner })
  const realLog = selected.input.binding.log
  const logBinding =
    options.append === undefined
      ? selected.input.binding
      : {
          ...selected.input.binding,
          log: {
            append: options.append((...args) => realLog.append(...args)),
            readSince: (...args: Parameters<SessionLog['readSince']>) => realLog.readSince(...args),
            readByKey: (...args: Parameters<SessionLog['readByKey']>) => realLog.readByKey(...args),
          } satisfies SessionLog,
        }
  const wire = options.wire ?? transport()
  const calls = createCallContainerStore<TestPlan, object>()
  const callPresence: CallPresence = {
    async read(input, observed) {
      const local = calls.find(input.ref)?.view()
      return {
        read: await observed(
          local === undefined
            ? {
                kind: 'stopped',
                source: input.source,
                executionGeneration: null,
                sourceVersion: 'rv3-close-log-v1',
                target: null,
                unknownBatches: [],
              }
            : {
                kind: 'live',
                source: input.source,
                executionGeneration: local.executionGeneration,
                sourceVersion: 'rv3-close-log-v1',
              },
        ),
      }
    },
  }
  const content = createModelCallContentStore({
    storage: host.storage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
  })
  const callFacts = createModelCallFacts({ content, presence: callPresence, maxScopes: 4 })
  const callAccess: CallAccess = {
    async check(input, admitted) {
      const found = await callFacts.lookup({ binding: input.binding, ref: input.ref })
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
        sourceVersion: 'rv3-close-log-v1',
        revoked: new AbortController().signal,
      }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  const binding: SessionRuntimeBinding = {
    log: logBinding,
    sourceVersions: { fixture: 'rv3-close-v1' },
    selection: { ...selected.input, binding: logBinding, projection: async () => ({ known: [] }) },
    catalog: host.catalog,
    currentEvaluationInputs: host.reader,
    credentials: {
      async value() {
        return { scope: { layer: 'factory' as const }, value: new TextEncoder().encode('s3cret') }
      },
    },
    tools: {
      async lookup() {
        throw new Error('no tools requested')
      },
    },
  }
  let nextCall = 0
  let nextResponse = 0
  const diagnostics: string[] = []
  const construction: RuntimeConstruction<TestPlan, object> = {
    callAccess,
    callPresence,
    callFacts,
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
    policy: {
      ...invocationPolicy(event => diagnostics.push(event.kind)),
      schedule: () => () => {},
    },
    identities: {
      call: () => `${options.prefix}-call-${++nextCall}`,
      response: () => `${options.prefix}-response-${++nextResponse}`,
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
    diagnostic(event) {
      diagnostics.push(event.kind)
    },
  }
  const runtime = createModelRuntime(construction)
  const service = runtime.service
  let effective = await service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) {
    const chosen = await service.selectModel({
      session: host.session,
      routeName: 'example/model-a',
    })
    if (!('selected' in chosen)) throw new Error(`select: ${JSON.stringify(chosen)}`)
    effective = await service.effectiveModel({ session: host.session })
  }
  if (!('effectiveModel' in effective)) throw new Error('effective model')
  const model = effective.effectiveModel
  async function open(key: string, callHost: ModelCallHost) {
    const opened = await service.openCall({
      creationKey: creationKey(key),
      session: host.session,
      target: model.routeName,
      basis: model,
      messages: [],
      tools: [],
      host: callHost,
    })
    if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
    return opened.ref
  }
  return { runtime, service, calls, diagnostics, open }
}

export function callHost(controller = new AbortController()): ModelCallHost {
  return {
    signal: controller.signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
}
