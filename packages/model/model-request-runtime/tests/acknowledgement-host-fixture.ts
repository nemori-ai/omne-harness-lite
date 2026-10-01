import { expect } from 'vitest'
import {
  parseOpaqueIdentifier,
  tenantIdEquals,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { narrow } from '@omne-harness-lite/storage'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import type { CallAccess, CallAccessAction, ModelCallContentStore } from '../src/reference-types.ts'
import type {
  AcknowledgementCleanupPolicy,
  ModelCallHost,
  OpenCallInput,
  RuntimeConstruction,
  RuntimeRecoveryScope,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import type {
  SettlementContention,
  SettlementOwner,
  SettlementScheduler,
} from '../src/settlement-types.ts'
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
export interface HostOptions {
  /** Wraps the runtime's session-log append; reads and the host's own writes stay real. */
  readonly append?: (real: SessionLog['append']) => SessionLog['append']
  /** The host recovery scope's answer about the original execution of a call. */
  readonly originalInvocation?: RuntimeRecoveryScope['originalInvocation']
  /** Wraps the real SQLite-backed content store of this runtime. */
  readonly content?: (store: ModelCallContentStore) => ModelCallContentStore
  readonly acknowledgementCleanup?: AcknowledgementCleanupPolicy
  readonly settlementScheduler?: SettlementScheduler
  readonly settlementContention?: SettlementContention
  /** The settlement owner of this runtime's selection; the host default otherwise. */
  readonly owner?: SettlementOwner
}

export async function acknowledgementHost(options: HostOptions = {}) {
  const host = await selectionHost(true, true)
  const grants = new Map<string, Grant>()
  let principal = 'owner'
  const callHost: ModelCallHost = {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
  let nextCall = 0
  let nextResponse = 0

  /**
   * One runtime instance over the shared real SQLite Storage and JSONL log: its own selection
   * owner, call store, content-store instance and access provider. A second instance stands for
   * a restarted process after the first one stopped responding.
   */
  function runtimeOver(runtimeOptions: HostOptions) {
    const selected = host.create(
      runtimeOptions.owner === undefined ? {} : { owner: runtimeOptions.owner },
    )
    const realLog = selected.input.binding.log
    const logBinding =
      runtimeOptions.append === undefined
        ? selected.input.binding
        : {
            ...selected.input.binding,
            log: {
              append: runtimeOptions.append((...args) => realLog.append(...args)),
              readSince: (...args: Parameters<SessionLog['readSince']>) =>
                realLog.readSince(...args),
              readByKey: (...args: Parameters<SessionLog['readByKey']>) =>
                realLog.readByKey(...args),
            } satisfies SessionLog,
          }
    const wire = transport()
    const calls = createCallContainerStore<TestPlan, object>()
    const ports = referencePorts(
      host,
      calls,
      runtimeOptions.content === undefined ? {} : { content: runtimeOptions.content },
    )
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
    const bindingWith = (
      sourceVersions: Readonly<Record<string, string>>,
    ): SessionRuntimeBinding => ({
      log: logBinding,
      sourceVersions,
      selection: {
        ...selected.input,
        binding: logBinding,
        projection: async () => ({ known: [] }),
      },
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
      settlementContention: runtimeOptions.settlementContention ?? settlementPolicy(),
      settlementScheduler: runtimeOptions.settlementScheduler ?? noWaitScheduler,
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
      acknowledgementCleanup: runtimeOptions.acknowledgementCleanup ?? {
        next: () => ({ stop: true }),
      },
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
            binding: { log: logBinding },
            owner: new ControlledSettlementOwner(),
            originalInvocation:
              runtimeOptions.originalInvocation ?? (() => ({ unavailable: true })),
            close: async () => {},
          },
        }),
      },
      diagnostic() {},
    }
    const runtime = createModelRuntime(construction)
    return {
      runtime,
      service: runtime.service,
      calls,
      wire,
      owner: selected.owner,
      /** A changed adoption basis for the same session; `restore` returns the original. */
      changeSourceVersions(next: Readonly<Record<string, string>>) {
        binding = bindingWith(next)
      },
      restoreSourceVersions() {
        binding = original
      },
    }
  }

  const primary = runtimeOver(options)
  const service = primary.service
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
  async function workRows(call: string): Promise<number> {
    return await host.storage.read(async tx => {
      const rows = await narrow<{ model_call_settlement_work: { call: string } }>(tx)
        .selectFrom('model_call_settlement_work')
        .select('call')
        .where('call', '=', call)
        .execute()
      return rows.length
    })
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
    runtime: primary.runtime,
    service,
    calls: primary.calls,
    wire: primary.wire,
    request,
    entries,
    contentRows,
    workRows,
    grant,
    as(name: string) {
      principal = name
    },
    changeSourceVersions: primary.changeSourceVersions,
    restoreSourceVersions: primary.restoreSourceVersions,
    /** Another runtime instance over the same Storage and log (a restarted process). */
    restarted: (restartOptions: HostOptions = {}) => runtimeOver(restartOptions),
  }
}

export const kinds = (entries: readonly LogEntry[]) =>
  entries.map(entry => payload(entry).kind).filter(Boolean)
export const acknowledgements = (entries: readonly LogEntry[], call: string) =>
  entries.filter(
    entry => payload(entry).kind === 'model_call_acknowledged' && payload(entry).call === call,
  )
