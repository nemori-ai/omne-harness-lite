// The `./testing` doubles of the tenant path, wired as the application assembly page's "替身与真件"
// table names them: identity's in-process operations, a non-durable Session store, the Agent test
// dependencies with the scripted Model provider and its public pusher, and the Request Context
// memory sources. Nothing here is durable or proves a real provider. `src/` never imports this file.
import { agentEvaluator, createAgentRuntime, type AgentRuntimeOptions } from '@omne-harness/agent'
import {
  createTestAgentDependencies,
  readyPreparation,
  testAdoption,
  testEvidence,
} from '@omne-harness/agent/testing'
import { decodeAgentInstanceId, type SelectedModel } from '@omne-harness/agent-contract'
import type { IdentityOperations } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeMessage, parseRecordEntryRef, type Message } from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeModelInstanceId,
  decodeResultVersion,
  type ResultPart,
} from '@omne-harness/model-contract'
import {
  createScriptedConformanceSubject,
  createScriptedModelProvider,
  createScriptedResultPusher,
  type ScriptController,
} from '@omne-harness/model-contract/testing'
import { decodeHistorySequence } from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import { createMemorySessionJournal } from '@omne-harness/session-adapters/testing'
import type { SessionAccess } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createMemorySessionEvidenceBridge,
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  type MemoryInitializationSource,
  type MemorySessionEvidenceBridge,
  type ScriptedSessionAccessCheck,
} from '@omne-harness/session-contract/testing'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import type {
  AgentScenario,
  PathAgent,
  PathDependencies,
  PathPrincipal,
  SessionAssembly,
} from '../src/path.ts'
import { PATH_ROUNDS } from '../src/path.ts'
import type {
  FragmentObservation,
  PathReport,
  Realization,
  RealizationTable,
  RowId,
} from '../src/path-report.ts'
import type { ContractSkeletonInputs } from '../src/run.ts'

/** The reply texts the scripted Model settles the admitted calls of one Agent with, in order. */
export const REPLY_TEXTS = [
  'first reply from the scripted model',
  'second reply from the scripted model',
  'third reply from the scripted model',
] as const
export const REPLY_TEXT = REPLY_TEXTS[0]
export const AGENT_INSTANCE = 'instance-cs-1'
export const REQUEST_TEXTS = [
  'hello, first request',
  'hello, second request',
  'hello, third request',
]

function ok<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}

export function identityDouble(): IdentityOperations {
  const start = parseInstant('2026-10-25T09:00:00Z')
  const maxLifetime = parseDuration('PT43200S')
  const idlePeriod = parseDuration('PT1800S')
  if (!start.ok || !maxLifetime.ok || !idlePeriod.ok) throw new Error('fixture time')
  return inProcessIdentityOperations({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({ maxLifetime: maxLifetime.value, idlePeriod: idlePeriod.value })
      .source,
  })
}

export function firstRequest(text = REQUEST_TEXTS[0], ordinal = 0): Message {
  const judged = judgeMessage({
    id: `msg_${String.fromCharCode(99 + ordinal).repeat(24)}`,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: `blk_${String.fromCharCode(100 + ordinal).repeat(26)}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  })
  if ('rejected' in judged) throw new Error(String(judged.rejected))
  return judged.ok
}

/** The external inputs of the main session, one for each round. */
export function requests(): readonly Message[] {
  return REQUEST_TEXTS.slice(0, PATH_ROUNDS).map((text, index) => firstRequest(text, index))
}

const selected: SelectedModel = {
  recipient: { route: 'route-cs', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true } as unknown as SelectedModel['resolution'],
  parameters: [],
  tools: testEvidence('tools'),
  evidence: testEvidence('selected'),
}

function textPart(text: string, ordinal = 0): ResultPart {
  return {
    kind: 'sealed',
    trims: [],
    block: {
      kind: 'text',
      id: `blk_cs_reply_${ordinal}` as never,
      visibility: { toHuman: true, toModel: true },
      text,
    },
  }
}

/** A reply that asks for the `read_file` tool of the execution environment (H10). */
export function toolCallParts(): readonly ResultPart[] {
  return [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'tool_call',
        id: 'blk_cs_tool_0' as never,
        visibility: { toHuman: true, toModel: true },
        callId: 'call-cs-read-file',
        name: 'read_file',
        arguments: {
          kind: 'object',
          entries: [{ key: 'path', value: { kind: 'string', value: 'notes.txt' } }],
        },
      } as never,
    },
  ]
}

/** A reply whose first part is reasoning the next request must replay (H12). */
export function reasoningParts(): readonly ResultPart[] {
  return [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'thinking',
        id: 'blk_cs_thinking_0' as never,
        visibility: { toHuman: false, toModel: true },
        text: 'scripted reasoning to replay',
      },
    },
    textPart('reply after reasoning', 1),
  ]
}

/** The scripted parts of the n-th admitted call of an Agent under a scenario; null holds the call. */
function scriptedParts(scenario: AgentScenario, ordinal: number): readonly ResultPart[] | null {
  switch (scenario) {
    case 'reply':
      return [textPart(REPLY_TEXTS[ordinal] ?? `reply ${ordinal + 1} from the scripted model`)]
    case 'tool-call':
      return toolCallParts()
    case 'reasoning':
      return reasoningParts()
    case 'held':
      return null
    default: {
      const exhaustive: never = scenario
      return exhaustive
    }
  }
}

export type AgentDoubleOptions = Readonly<{
  /** The parts the scripted Model settles with; null lets admitted calls stay unsettled. */
  parts?: ((scenario: AgentScenario, ordinal: number) => readonly ResultPart[] | null) | null
}>

/**
 * The Agent of one tenant from `createTestAgentDependencies`, with the path's bridges plugged in.
 * With a same-log Journal from the Session store, the Agent reads and writes that Journal; the
 * Model push then has no receiver, because the Session store exposes no reception targets
 * (GAP-SESSION-LOG-TARGETS).
 */
export function agentDouble(options: AgentDoubleOptions = {}): PathDependencies['agent'] {
  const parts = options.parts === undefined ? scriptedParts : options.parts
  return async ({
    tenant,
    principal,
    instance,
    scenario,
    journal,
    handoff,
    requests,
  }): Promise<PathAgent> => {
    const { dependencies, controls } = createTestAgentDependencies<PathPrincipal>({
      receivingPrincipal: principal,
    })
    const definition = testAdoption('definition-cs')
    controls.adoptions.define(definition, {
      definition: { category: 'AgentDefinition', name: 'cs' } as never,
      evaluator: agentEvaluator,
      extensions: [],
    })
    controls.selection.select.always(() => ({ ok: selected }))
    const conditions = {
      source: testEvidence('conditions'),
      configuration: testAdoption('configuration'),
      progression: { kind: 'evaluate-completion' as const, basis: testEvidence('progression') },
      model: testAdoption('model'),
      context: testEvidence('context'),
      bindings: [],
    }
    controls.conditions.read.always(() => ({ ok: conditions }))
    const sessionLog = journal !== null
    const ownPusher = sessionLog
      ? createScriptedResultPusher({
          scripted: createScriptedModelProvider<PathPrincipal>({
            instance: ok(decodeModelInstanceId('minst_cs-session-log')),
          }),
          principal,
          resolveReceiver: () => null,
        })
      : null
    const runtime = ownPusher?.provider.runtime ?? dependencies.models
    const controller: ScriptController<PathPrincipal> = ownPusher?.controller ?? controls.models
    let admitted = 0
    let toolInvocations = 0
    const held: (() => void)[] = []
    const models = {
      ...runtime,
      calls: {
        ...runtime.calls,
        async admit(input: Parameters<typeof runtime.calls.admit>[0]) {
          const reply = await runtime.calls.admit(input)
          if (!('ok' in reply)) return reply
          const ordinal = admitted
          admitted += 1
          const call = { tenant: input.tenant, call: reply.ok.call }
          const settle = (scripted: readonly ResultPart[]) => {
            controller.start({
              ...call,
              dispatch: ok(decodeDispatchId(`mdisp_cs_${ordinal + 1}`)),
              firstContent: 'observed',
            })
            controller.settle({
              ...call,
              version: ok(decodeResultVersion(`mrver_cs_${ordinal + 1}`)),
              termination: { kind: 'completed', reason: 'stop' },
              parts: scripted,
              source: testEvidence(`settled/${String(reply.ok.call)}`),
              pageSize: 10,
              pageTargetBytes: 65536,
            })
          }
          const scripted = parts === null ? null : parts(scenario, ordinal)
          if (scripted === null) held.push(() => settle(scriptedParts('reply', ordinal) ?? []))
          else queueMicrotask(() => settle(scripted))
          return reply
        },
      },
    }
    const tools = {
      ...dependencies.tools,
      invoke(input: Parameters<typeof dependencies.tools.invoke>[0]) {
        toolInvocations += 1
        return dependencies.tools.invoke(input)
      },
    }
    const runtimeOptions: AgentRuntimeOptions = {
      binding: {
        instance: ok(decodeAgentInstanceId(instance)),
        tenant,
        scope: testEvidence('scope'),
        definition,
      },
      configuration: {
        observerBufferBytes: 1024,
        reconciliationDelayMs: 1000,
        reconciliationBatchLimit: 8,
        denialBackoffMs: 0,
        toolConcurrency: 1,
        jointCommits: [],
        loopGuardPolicy: testAdoption('loop-guard'),
      },
    }
    const provider = ok(
      await createAgentRuntime(
        {
          ...dependencies,
          journal: journal?.journal ?? dependencies.journal,
          materials: journal?.materials ?? dependencies.materials,
          models,
          tools,
          handoff,
          requests,
        },
        runtimeOptions,
      ),
    )
    return {
      provider,
      journal: journal?.journal ?? dependencies.journal,
      materials: journal?.materials ?? dependencies.materials,
      instance,
      releaseModel: scenario === 'held' ? () => held.splice(0).forEach(settle => settle()) : null,
      admitted: () => admitted,
      toolInvocations: () => toolInvocations,
    }
  }
}

/** Request Context assembly over the given Session history, from the memory source fixture. */
export const assembleWithMemorySources: PathDependencies['assemble'] = async ({
  tenant,
  history,
}) => {
  const rows = history.map((item, index) => {
    const entry = parseRecordEntryRef(String(item.entry))
    if (entry === null) throw new Error(`Session entry ${item.entry} is not a RecordEntryRef`)
    const { message } = item
    // A history row of an assistant message also names its source call. The rounds of this path
    // assemble before each reply and the later rounds do not reach assembly (GAP-SECOND-RUN).
    if (message.role === 'assistant')
      throw new Error('an assistant history row needs its source call; not reached on this path')
    return {
      seq: ok(decodeHistorySequence(String(index))),
      entry,
      message,
      bytes: String(JSON.stringify(message).length),
    }
  })
  const fixture = createAssemblyFixture({ tenant, rows })
  const result = await fixture.operations().assemble(fixture.call)
  const calls = fixture.preparation.calls()
  return {
    result,
    lease: {
      acquired: calls.length,
      outstanding: fixture.preparation.outstanding(),
      planned: calls.reduce((sum, call) => sum + call.assembled.length, 0),
    },
  }
}

/** Offline fixture: each `create` the path commits is registered as trusted initialization facts. */
function trustedInitialization(): MemoryInitializationSource {
  const source = createMemoryInitializationSource()
  return {
    ...source,
    prepare: command => {
      if (command.kind === 'create')
        source.controls.register(
          command,
          initializationFixtureGuard(
            initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
          ),
        )
      return source.prepare(command)
    },
  }
}

/**
 * The Session access check the path injects (#680 B-1). An explicit policy: a request under a
 * tenant principal on a session or tenant target is allowed with its own evidence; a system-scope
 * read is denied. The skeleton proves the injection and the judgment order, not a product policy.
 */
export function sessionAccessCheckDouble(): ScriptedSessionAccessCheck<PathPrincipal> {
  return createPolicySessionAccessCheck<PathPrincipal>(request =>
    'scope' in request.access
      ? { kind: 'denied' }
      : {
          kind: 'allowed',
          evidence: {
            owner: 'm2-contract-skeleton',
            record: `access/${request.operation}`,
            revision: '1',
            digest: `sha256:access/${request.operation}`,
          },
        },
  )
}

export type SessionStoreKind = 'contract-memory' | 'session-log'

/**
 * The Session store of the path, built with the injected access check. `contract-memory` is the
 * session-contract memory transaction port; the Agent then keeps its own memory Journal.
 * `session-log` is the common-log provider of session-adapters (#756): one log carries the Session
 * entries and the Agent Journal, and derived Session participation is judged by the same check.
 */
export function sessionAssembly(
  kind: SessionStoreKind = 'contract-memory',
  configureEvidence: (bridge: MemorySessionEvidenceBridge) => void = () => {},
): PathDependencies['session'] {
  return ({ accessCheck }): SessionAssembly => {
    const initialization = trustedInitialization()
    const evidence = createMemorySessionEvidenceBridge({ initialization })
    configureEvidence(evidence)
    if (kind === 'contract-memory')
      return {
        transactions: createMemorySessionTransactions<PathPrincipal>({
          initialization,
          history: createMemorySessionHistorySource(),
          accessCheck,
        }),
        evidence,
        agentJournal: null,
      }
    const backend = createMemorySessionJournal<PathPrincipal>({
      initialization,
      accessCheck,
      authorize: (input: SessionAccess<PathPrincipal>) =>
        tenantCodec.encode(input.tenant).ok ? 'allowed' : 'denied',
    })
    return {
      transactions: backend.transactions,
      evidence,
      agentJournal: access => {
        const view = backend.forSession(access)
        return { journal: view.journal, materials: view.materials }
      },
    }
  }
}

/**
 * The declared realization of each plugin-tree row under the `contract-memory` store. `agent-host`
 * is `real` because the path runs `createAgentRuntime` of `@omne-harness/agent`, the production
 * Agent runtime, over its test dependencies; the `agent-host-local` host plugin that the row names
 * is not loaded.
 */
export const REALIZATION: Readonly<Record<RowId, Realization>> = {
  'server-entry': 'double',
  identity: 'double',
  authorization: 'double',
  'session-storage': 'double',
  'session-provider': 'double',
  'session-ad01': 'double',
  'session-ad02': 'absent',
  'session-ad04': 'double',
  'session-ad10': 'double',
  'session-ad14': 'double',
  'session-handoff': 'double',
  'session-conditions': 'double',
  'agent-journal': 'double',
  'agent-adoptions': 'double',
  'agent-model-selection': 'double',
  'agent-context': 'double',
  'agent-host': 'real',
  'agent-instances': 'absent',
  'model-host': 'double',
  'tool-runtime': 'double',
  'tool-executor': 'absent',
  'tool-environments': 'absent',
  'execution-environment': 'absent',
  'execution-files': 'absent',
}

/** The declared realization under the `session-log` store: the Journal rows move to #756's double. */
export const SESSION_LOG_REALIZATION: RealizationTable = {
  ...REALIZATION,
  'session-ad02': 'double',
}

export function pathDependencies(
  overrides: Partial<PathDependencies> = {},
  store: SessionStoreKind = 'contract-memory',
): PathDependencies {
  return {
    identity: identityDouble(),
    login: { loginIdentifier: 'first@example.test', credential: 'first tenant credential' },
    sessionAccessCheck: sessionAccessCheckDouble(),
    session: sessionAssembly(store),
    creation: creation({ purpose: 'm2-first-path' }),
    requests: requests(),
    agent: agentDouble(),
    assemble: assembleWithMemorySources,
    preparationFrame: async input => ({ ok: readyPreparation(input) }),
    ...overrides,
  }
}

/** The inputs of `runContractSkeleton` with every double of the path and the scripted Model subject. */
export function skeletonInputs(
  overrides: Partial<ContractSkeletonInputs<unknown>> = {},
  store: SessionStoreKind = 'contract-memory',
): ContractSkeletonInputs<unknown> {
  return {
    path: pathDependencies({}, store),
    model: { subject: createScriptedConformanceSubject as never, waitMs: 500 },
    realization: store === 'session-log' ? SESSION_LOG_REALIZATION : REALIZATION,
    ...overrides,
  }
}

/** The Model obligation fragments of H06, without the connected-path fragment. */
export function modelFragments(report: PathReport): readonly FragmentObservation[] {
  return (report.hops.find(hop => hop.hopId === 'H06')?.fragments ?? []).filter(
    fragment => fragment.fragmentId !== 'H06-connected',
  )
}
