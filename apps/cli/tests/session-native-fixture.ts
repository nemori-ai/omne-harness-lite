import {
  createModelCallFacts,
  type RuntimeConstruction,
} from '@omne-harness-lite/model-request-runtime-local'
import type {
  PlannedSemantics,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { LocalSessionIngress } from '@omne-harness-lite/session-runtime-local'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import { originalPending } from './model-result-fixture.ts'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { createSessionRunHistory } from '../src/session-run-history.ts'
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }

export function controlledTimingDeclarations() {
  return ['first_token_wait_limit', 'post_first_token_stall_limit'].map(item => ({
    item,
    kind: 'setting',
    category: 'preference',
    domain: {
      kind: 'open',
      schema: { allOf: [{ $ref: toolSchema.$id + '#/$defs/Duration' }, { pattern: '[1-9]' }] },
    },
    default: 'PT10S',
  }))
}

type Construction = RuntimeConstruction<PlannedSemantics, object>
/** Controlled selection owner. Real provider operations run and stop before registrations return. */
function selectionOwner(): SettlementOwner {
  let acquired = false
  return {
    name: 'controlled-native-selection',
    admission: () => 'open',
    opened: () => ({ confirmed: true }),
    unresolvedWrites: () => [],
    acquire: () => {
      if (acquired) return { unavailable: true }
      acquired = true
      let running = 0
      const registration: SettlementRegistration = {
        start: <T>(
          _kind: string,
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> => {
          running++
          const control = new AbortController()
          const completion = Promise.resolve().then(() => operation(control.signal))
          const stopped = completion
            .then(
              () => undefined,
              () => undefined,
            )
            .then(() => {
              running--
            })
          return { completion, stopped, requestStop: () => control.abort() }
        },
        release() {
          if (running || !acquired) throw new Error('live or duplicate registration return')
          acquired = false
        },
      }
      return { registration }
    },
  }
}
/** The stream and deployment metadata are controlled. Container, invocation, SQL content and source are real. */
export function nativeCallFixturePorts(
  scope: SessionScope,
  ingress: LocalSessionIngress,
  storage: AtomicStorage,
  sendControl?: { readonly entered: () => void; readonly wait: Promise<void> },
) {
  const owner = selectionOwner()
  const pending = originalPending()
  const row = {
    ref: pending.route.profile,
    profile: {
      ...pending.route.profileSnapshot,
      ...pending.route.profile,
      registration: 'listed' as const,
    },
  }
  const catalog = {
    readProfile: async () => row,
    listProfiles: async () => [row],
    credentialPresent: async () => ({
      present: true as const,
      scope: { layer: 'factory' as const },
    }),
  }
  let sends = 0
  const trace: string[] = []
  const requests: Array<{ readonly messages: unknown }> = []
  function configure(base: Construction): Construction {
    const presence: Construction['callPresence'] = {
      async read(input, observed) {
        const local = base.calls.find(input.ref)?.view()
        return {
          read: await observed(
            local
              ? {
                  kind: 'live',
                  source: input.source,
                  executionGeneration: local.executionGeneration,
                  sourceVersion: 'actual-run-binding',
                }
              : {
                  kind: 'stopped',
                  source: input.source,
                  executionGeneration: null,
                  sourceVersion: 'actual-run-binding',
                  target: null,
                  unknownBatches: [],
                },
          ),
        }
      },
    }
    const facts = createModelCallFacts({ content: base.callFacts.content, presence, maxScopes: 8 })
    return {
      ...base,
      callPresence: presence,
      callFacts: facts,
      settlementContention: {
        ...base.settlementContention,
        limits: { ...base.settlementContention.limits, elapsedMs: 10000 },
        decide: () => ({ proceed: { waitMs: 0 } }),
      },
      history: {
        ...base.history,
        call: (prefix, callId) => {
          const result = interpretCallHistory({ prefix, callId })
          trace.push(
            'history:' +
              ('unavailable' in result
                ? result.reason
                : 'absent' in result
                  ? 'absent'
                  : result.known.phase),
          )
          return result
        },
        run: createSessionRunHistory(scope),
      },
      callAccess: {
        async check(input, admitted) {
          trace.push('access:' + input.action)
          const holding = await ingress.tenancy.holdingTenant(input.ref.session)
          if (
            input.ref.session !== scope.session ||
            input.binding.session !== scope.session ||
            !('tenant' in holding) ||
            !tenantIdEquals(holding.tenant, scope.tenant)
          )
            return { unavailable: true }
          const found =
            input.action === 'read'
              ? undefined
              : await facts.lookup({ binding: input.binding, ref: input.ref })
          const source =
            found === undefined
              ? { generation: input.binding.generation, progress: 0 }
              : 'view' in found
                ? found.view.source
                : 'acknowledged' in found
                  ? found.acknowledged.source
                  : undefined
          if (!source) return { unavailable: true }
          const evidence = {
            action: input.action,
            ref: input.ref,
            source,
            sourceVersion: 'actual-run-binding',
            revoked: new AbortController().signal,
          }
          return { allowed: await admitted(evidence), evidence }
        },
      },
      transport: {
        clearReuseScope() {},
        acquire: () => {
          trace.push('transport.acquire')
          return {
            lease: {
              binding: pending.route.adaptation,
              signal: new AbortController().signal,
              track: async completion => await completion,
              release() {},
              transport: {
                async plan(input) {
                  trace.push('transport.plan')
                  requests.push({ messages: input.messages })
                  return {
                    planned: {
                      input,
                      parameters: input.parameters,
                      requestInput: { kind: 'unavailable', reason: 'not_retained' },
                      measurement: {
                        mode: 'full',
                        fallbackReason: 'no_observation',
                        precision: 'estimated',
                        predictedInput: 0,
                        admissionTokens: 0,
                        fullContribution: { tokens: 0, precision: 'estimated' },
                        basis: {
                          binding: input.snapshot.adaptation,
                          model: input.routeName,
                          provider: input.provider,
                          tokenizerRevision: 'controlled',
                          meterRevision: 'controlled',
                          projectionRevision: 'controlled',
                          replayRevision: 'controlled',
                          transformRevision: 'controlled',
                        },
                      },
                    },
                  }
                },
                projectOutput: () => ({ unavailable: true }),
                send: async () => {
                  sends++
                  if (sendControl) {
                    sendControl.entered()
                    await sendControl.wait
                  }
                  return { response: {} }
                },
                async *read() {
                  const id = unwrap(parseOpaqueIdentifier('actual-native-stream-text', 'BlockId'))
                  const visibility = { toHuman: true, toModel: true }
                  yield {
                    t: 'open' as const,
                    index: 0,
                    id,
                    kind: 'text' as const,
                    fill: 'append' as const,
                    visibility,
                  }
                  yield { t: 'fill' as const, index: 0, payload: 'actual native result' }
                  yield {
                    t: 'close' as const,
                    index: 0,
                    block: { id, kind: 'text' as const, text: 'actual native result', visibility },
                  }
                  return {
                    ended: 'end' as const,
                    stopReason: 'stop',
                    readFacts: {
                      usage: pending.usage,
                      cost: pending.cost,
                      observedInput: {
                        kind: 'unavailable' as const,
                        reason: 'missing_usage' as const,
                      },
                    },
                  }
                },
              },
            },
          }
        },
      },
      policy: {
        ...base.policy,
        schedule: () => () => {},
        diagnostic: event => {
          trace.push('policy:' + event.kind)
        },
      },
      identities: {
        call: () => 'model-root-call',
        response: () => 'actual-native-response',
        message: () => unwrap(parseOpaqueIdentifier('actual-native-message', 'MessageId')),
      },
    }
  }
  return {
    owner,
    catalog,
    configure,
    sends: () => sends,
    trace,
    requests,
    credentials: {
      value: async () => ({
        scope: { layer: 'factory' as const },
        value: new TextEncoder().encode('controlled-test-credential'),
      }),
    },
    retainReferencesIn: async (unit: StorageUnit) => {
      unit.assertStorage(storage)
      return 'retained' as const
    },
  }
}
