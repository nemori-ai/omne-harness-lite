import { writeJsonLossless, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import {
  createModelCallFacts,
  createModelCallContentStore,
  createCallContainerStore,
  type RuntimeConstruction,
} from '@omne-harness-lite/model-request-runtime-local'
import type {
  PlannedSemantics,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { LocalSessionIngress } from '../src/runtime-types.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { createSessionRunHistory } from '../src/run-history.ts'
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }

export function controlledTimingDeclarations(): import('@omne-harness-lite/asset-evaluation').NonConnectorEvaluationInput['root']['attributes'] {
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
  toolCalls: readonly ToolCallBlock[] = [],
) {
  const owner = selectionOwner()
  const adaptation = {
    implementation: { name: 'controlled', revision: 'one' },
    definition: { modelId: 'controlled/model', revision: 'one' },
    configuration: { revision: 'one', values: {} },
  }
  const pending = {
    route: {
      profile: { origin: 'official' as const, routeName: 'controlled/model' },
      adaptation,
      profileSnapshot: {
        adaptation,
        providers: ['controlled'],
        allowFallback: false,
        inputModalities: ['text' as const],
        outputModalities: ['text' as const],
        maxInputTokens: 100,
        maxOutputTokens: 100,
        inputConstraints: {},
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' as const },
          maxRequestBytes: { status: 'unknown' as const },
        },
        updatedAt: '2026-10-08T00:00:00Z',
      },
    },
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream' as const,
    },
    cost: { cost_usd: 0, source: 'upstream_usage' as const },
  }
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
  let responses = 0
  let messages = 0
  const trace: string[] = []
  const requests: Array<{ readonly messages: unknown }> = []
  const sentRequests: Array<{ readonly messages: unknown }> = []
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
                send: async planned => {
                  sends++
                  sentRequests.push({ messages: planned.input.messages })
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
                  for (const [offset, block] of toolCalls.entries()) {
                    const index = offset + 1
                    yield {
                      t: 'open' as const,
                      index,
                      id: block.id,
                      kind: 'tool_call' as const,
                      fill: 'append' as const,
                      visibility: block.visibility,
                      head: { tool: block.tool, callId: block.callId },
                    }
                    yield {
                      t: 'fill' as const,
                      index,
                      payload: block.unparseable
                        ? block.rawArguments
                        : writeJsonLossless(block.arguments),
                    }
                    yield { t: 'close' as const, index }
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
        response: () =>
          responses++ === 0 ? 'actual-native-response' : `actual-native-response:${responses}`,
        message: () =>
          unwrap(
            parseOpaqueIdentifier(
              messages++ === 0 ? 'actual-native-message' : `actual-native-message:${messages}`,
              'MessageId',
            ),
          ),
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
    sentRequests,
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

export function nativeModelConstruction(
  storage: AtomicStorage,
): RuntimeConstruction<PlannedSemantics, object> {
  const unavailable = { unavailable: true } as const
  const callPresence: RuntimeConstruction<PlannedSemantics, object>['callPresence'] = {
    read: async () => unavailable,
  }
  const content = createModelCallContentStore({
    storage,
    policy: { maxConcurrentWrites: 2, maxContentBytes: 65536 },
  })
  return {
    callAccess: { check: async () => unavailable },
    callPresence,
    callFacts: createModelCallFacts({ content, presence: callPresence, maxScopes: 8 }),
    calls: createCallContainerStore(),
    maxScopes: 8,
    sessions: { bind: async () => ({ failure: 'unavailable' }) },
    transport: { clearReuseScope() {}, acquire: () => unavailable },
    settlementContention: {
      name: 'explicit-binding-test',
      limits: { submissions: 1, elapsedMs: 1, retainedBytes: 65536, concurrent: 1 },
      decide: () => ({ stop: true }),
    },
    settlementScheduler: {
      nowMonotonicMs: () => 0,
      wait: () => {
        throw new Error('this test must not retry or wait')
      },
    },
    policy: {
      now: async () => '2026-10-08T00:00:00Z',
      schedule: () => {
        throw new Error('this test must not invoke model IO')
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
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    identities: {
      call: () => 'unused-call',
      response: () => 'unused-response',
      message: () => unwrap(parseOpaqueIdentifier('unused-native-message', 'MessageId')),
    },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => unavailable,
      run: () => unavailable,
    },
    recovery: {
      authorize: async () => unavailable,
      enter: async () => unavailable,
    },
    reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 1 },
    acknowledgementCleanup: { next: () => ({ stop: true }) },
    diagnostic() {},
  }
}
