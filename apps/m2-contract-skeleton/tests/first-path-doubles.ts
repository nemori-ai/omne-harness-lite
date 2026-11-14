import { agentEvaluator, createAgentRuntime, type AgentRuntimeOptions } from '@omne-harness/agent'
import {
  createTestAgentDependencies,
  readyPreparation,
  testAdoption,
  testEvidence,
} from '@omne-harness/agent/testing'
import {
  decodeAgentInstanceId,
  type AgentDefinition,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import type { IdentityOperations } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeBlockIdentity, type BlockId } from '@omne-harness/content-block'
import {
  originRef,
  type Access,
  type EnvironmentBinding,
} from '@omne-harness/execution-environment-contract'
import {
  createMemoryFileSystem,
  createScriptedCommandFacility,
} from '@omne-harness/execution-environment-contract/testing'
import {
  judgeMessage,
  parseRecordEntryRef,
  type Message,
  type ReasoningStatePart,
  type ToolCallPart,
} from '@omne-harness/message'
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
  ScriptedModelError,
  type ScriptController,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { decodeHistorySequence } from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import { createMemorySessionJournal } from '@omne-harness/session-adapters/testing'
import type { SessionAccess, SessionTransactionPort } from '@omne-harness/session-contract'
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

function blockId(raw: string): BlockId {
  const judged = judgeBlockIdentity({ id: raw, visibility: { toHuman: true, toModel: true } })
  if ('rejected' in judged) throw new Error(`block id ${raw}: ${judged.rejected}`)
  return judged.ok.id
}

function textPart(text: string, ordinal = 0): ResultPart {
  return {
    kind: 'sealed',
    trims: [],
    block: {
      kind: 'text',
      id: blockId(`blk_cs_reply_${ordinal}`),
      visibility: { toHuman: true, toModel: true },
      text,
    },
  }
}

export function replyParts(text: string): readonly ResultPart[] {
  return [textPart(text)]
}

export function toolCallParts(): readonly ResultPart[] {
  const call: ToolCallPart = {
    kind: 'tool_call',
    id: blockId('blk_cs_tool_0'),
    visibility: { toHuman: true, toModel: true },
    callId: 'call-cs-read-file',
    name: 'read_file',
    arguments: {
      kind: 'object',
      entries: [{ key: 'path', value: { kind: 'string', value: 'notes.txt' } }],
    },
  }
  return [{ kind: 'sealed', trims: [], block: call }]
}

export function reasoningParts(): readonly ResultPart[] {
  return [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'thinking',
        id: blockId('blk_cs_thinking_0'),
        visibility: { toHuman: false, toModel: true },
        text: 'scripted reasoning to replay',
      },
    },
    textPart('reply after reasoning', 1),
  ]
}

export function reasoningStateParts(): readonly ResultPart[] {
  const state: ReasoningStatePart = {
    kind: 'reasoning_state',
    id: blockId('blk_cs_reasoning_state_0'),
    visibility: { toHuman: false, toModel: true },
    payload: 'scripted reasoning continuation state',
    pairs: [],
  }
  return [{ kind: 'sealed', trims: [], block: state }, textPart('reply after reasoning', 1)]
}

function scriptedParts(scenario: AgentScenario, ordinal: number): readonly ResultPart[] | null {
  switch (scenario) {
    case 'reply':
      return [textPart(REPLY_TEXTS[ordinal] ?? `reply ${ordinal + 1} from the scripted model`)]
    case 'tool-call':
      return ordinal === 0 ? toolCallParts() : [textPart('reply after the tool result', ordinal)]
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

export function executionEnvironmentDouble(access: Access<PathPrincipal>) {
  const files = createMemoryFileSystem({ files: { 'notes.txt': 'notes before the tool' } })
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'notes after the tool' }],
  }))
  const effects: string[] = []
  const origin = originRef('cs-tool')
  const binding: EnvironmentBinding = { kind: 'host_machine' }
  let sequence = 0
  const request = () => ({ requestId: `cs-tool-${++sequence}`, access, origin, binding })
  const target = () => ({ path: 'notes.txt', named: files.objectToken('notes.txt') ?? null })
  return {
    files,
    command,
    effects,
    async run(): Promise<void> {
      const before = await files.facility.read({ ...request(), ...target() })
      effects.push(`files.read:${before.kind}`)
      const version = before.kind === 'done' ? { expectedVersion: before.value.version } : {}
      const written = await files.facility.write({
        ...request(),
        ...target(),
        ...version,
        bytes: new TextEncoder().encode('notes after the tool'),
        mode: 'replace',
      })
      effects.push(`files.write:${written.kind}`)
      const started = await command.facility.start({
        ...request(),
        executable: 'cat',
        args: ['notes.txt'],
        cwd: '.',
        env: {},
        outputMode: 'separate',
      })
      effects.push(`command.start:${started.kind}`)
    },
  }
}

export type AgentDoubleOptions = Readonly<{
  parts?: ((scenario: AgentScenario, ordinal: number) => readonly ResultPart[] | null) | null
  onSettleRefused?: (reason: string) => void
}>

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
      definition: {
        category: 'AgentDefinition',
        name: 'cs',
        references: [],
        attributes: [],
      } satisfies AgentDefinition,
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
          const settleOrThrow = (scripted: readonly ResultPart[]) => {
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
          const settle = (scripted: readonly ResultPart[]) => {
            try {
              settleOrThrow(scripted)
            } catch (error) {
              const refused = options.onSettleRefused
              if (refused === undefined || !(error instanceof ScriptedModelError)) throw error
              refused(error.reason)
            }
          }
          const scripted = parts === null ? null : parts(scenario, ordinal)
          if (scripted === null) held.push(() => settle(scriptedParts('reply', ordinal) ?? []))
          else queueMicrotask(() => settle(scripted))
          return reply
        },
      },
    }
    const environment = executionEnvironmentDouble({ principal, tenant })
    const tools = {
      ...dependencies.tools,
      async invoke(input: Parameters<typeof dependencies.tools.invoke>[0]) {
        toolInvocations += 1
        await environment.run()
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
        reconciliationDelaysMs: [1000],
        reconciliationBatchLimit: 8,
        denialBackoffMs: 0,
        toolConcurrency: 1,
        jointCommits: [],
        coordination: sessionLog ? 'coordinated' : 'standalone',
        loopGuardPolicy: testAdoption('loop-guard'),
        modelRetry: { maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 0 },
      },
    }
    const provider = ok(
      await createAgentRuntime(
        {
          ...dependencies,
          journal: journal?.journal ?? dependencies.journal,
          entries: journal?.entries ?? dependencies.entries,
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
      entries: journal?.entries ?? dependencies.entries,
      materials: journal?.materials ?? dependencies.materials,
      instance,
      releaseModel: scenario === 'held' ? () => held.splice(0).forEach(settle => settle()) : null,
      admitted: () => admitted,
      toolInvocations: () => toolInvocations,
      toolEffects: () => [...environment.effects],
    }
  }
}

export const assembleWithMemorySources: PathDependencies['assemble'] = async ({
  tenant,
  history,
}) => {
  const rows = history.map((item, index) => {
    const entry = parseRecordEntryRef(String(item.entry))
    if (entry === null) throw new Error(`Session entry ${item.entry} is not a RecordEntryRef`)
    const { message } = item
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

export function sessionAssembly(
  kind: SessionStoreKind = 'contract-memory',
  configure: Readonly<{
    evidence?: (bridge: MemorySessionEvidenceBridge) => void
    transactions?: (
      port: SessionTransactionPort<PathPrincipal>,
    ) => SessionTransactionPort<PathPrincipal>
  }> = {},
): PathDependencies['session'] {
  return ({ accessCheck }): SessionAssembly => {
    const initialization = trustedInitialization()
    const evidence = createMemorySessionEvidenceBridge({ initialization })
    configure.evidence?.(evidence)
    if (kind === 'contract-memory') {
      const port = createMemorySessionTransactions<PathPrincipal>({
        initialization,
        history: createMemorySessionHistorySource(),
        accessCheck,
      })
      return {
        transactions: configure.transactions?.(port) ?? port,
        evidence,
        agentJournal: null,
      }
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
        return { journal: view.journal, entries: view.entries, materials: view.materials }
      },
    }
  }
}

export const REALIZATION: Readonly<Record<RowId, Realization>> = {
  'server-entry': 'double',
  identity: 'double',
  authorization: 'double',
  'session-storage': 'double',
  'session-provider': 'double',
  'session-ad01': 'absent',
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
  'agent-host': 'double',
  'agent-instances': 'absent',
  'model-host': 'double',
  'tool-runtime': 'double',
  'tool-executor': 'absent',
  'tool-environments': 'absent',
  'execution-environment': 'absent',
  'execution-files': 'double',
  'request-context': 'double',
}

export const SESSION_LOG_REALIZATION: RealizationTable = {
  ...REALIZATION,
  'session-ad01': 'double',
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

export function skeletonInputs(
  overrides: Partial<ContractSkeletonInputs<ScriptedPrincipal>> = {},
  store: SessionStoreKind = 'contract-memory',
): ContractSkeletonInputs<ScriptedPrincipal> {
  return {
    path: pathDependencies({}, store),
    model: { subject: createScriptedConformanceSubject, waitMs: 500 },
    realization: store === 'session-log' ? SESSION_LOG_REALIZATION : REALIZATION,
    ...overrides,
  }
}

export function modelFragments(report: PathReport): readonly FragmentObservation[] {
  return (report.hops.find(hop => hop.hopId === 'H06')?.fragments ?? []).filter(
    fragment => fragment.fragmentId !== 'H06-connected',
  )
}

function fixtureEvidence(record: string) {
  return { owner: 'm2-contract-skeleton', record, revision: '1', digest: `sha256:${record}` }
}

export function wrappedSession(
  wrap: (assembly: SessionAssembly) => SessionAssembly['transactions'],
  kind: SessionStoreKind = 'contract-memory',
): PathDependencies['session'] {
  const build = sessionAssembly(kind)
  return input => {
    const assembly = build(input)
    return { ...assembly, transactions: wrap(assembly) }
  }
}

export function closingRuns({
  transactions,
  evidence,
}: SessionAssembly): SessionAssembly['transactions'] {
  let closes = 0
  return {
    ...transactions,
    commit: (async (input: Parameters<typeof transactions.commit>[0]) => {
      if (input.command.kind === 'accept') {
        const work = await transactions.readWork(input.access)
        if ('ok' in work && work.ok.run.kind === 'active') {
          closes += 1
          const command = {
            kind: 'finishRun' as const,
            input: {
              tenant: input.access.tenant,
              session: input.access.session,
              operation: `sop_cs-close-${closes}` as never,
              run: work.ok.run.run,
              expected: work.ok.run.revision,
              bounded: {
                kind: 'admission-rejected' as const,
                input: work.ok.run.first,
                rejection: fixtureEvidence(`close/${closes}`),
              },
            },
          }
          const guards = await evidence.prepare(command)
          if ('failure' in guards) throw new Error(JSON.stringify(guards.failure))
          const closed = await transactions.commit({
            access: input.access,
            command,
            guards: guards.ok,
          })
          if ('failure' in closed) throw new Error(JSON.stringify(closed.failure))
        }
      }
      return transactions.commit(input)
    }) as typeof transactions.commit,
  }
}

export const sessionClosingRuns = (): PathDependencies['session'] => wrappedSession(closingRuns)

export const assembleWithoutAssistantRows: PathDependencies['assemble'] = input =>
  assembleWithMemorySources({
    ...input,
    history: input.history.filter(item => item.message.role !== 'assistant'),
  })

export function sessionWithEarlierInput(session: string): PathDependencies['session'] {
  let injected = false
  return wrappedSession(({ transactions, evidence }) => ({
    ...transactions,
    commit: (async (input: Parameters<typeof transactions.commit>[0]) => {
      if (
        input.command.kind === 'accept' &&
        String(input.access.session) === session &&
        !injected
      ) {
        injected = true
        const command = {
          kind: 'accept' as const,
          input: {
            tenant: input.access.tenant,
            session: input.access.session,
            operation: 'sop_cs-earlier-input' as never,
            value: {
              kind: 'ordinary' as const,
              input: 'input-cs-earlier' as never,
              message: firstRequest('an earlier request', 5),
              origin: { ...fixtureEvidence('login-entry/input-cs-earlier'), owner: 'login-entry' },
            },
          },
        }
        const guards = await evidence.prepare(command)
        if ('failure' in guards) throw new Error(JSON.stringify(guards.failure))
        const accepted = await transactions.commit({
          access: input.access,
          command,
          guards: guards.ok,
        })
        if ('failure' in accepted) throw new Error(JSON.stringify(accepted.failure))
      }
      return transactions.commit(input)
    }) as typeof transactions.commit,
  }))
}

export function agentWithoutAdmission(
  original: PathDependencies['agent'],
  scenario?: AgentScenario,
): PathDependencies['agent'] {
  return async input => {
    const agent = await original(input)
    if (scenario !== undefined && input.scenario !== scenario) return agent
    const { provider } = agent
    return {
      ...agent,
      provider: {
        ...provider,
        runtime: {
          ...provider.runtime,
          invoke: async () => ({ ok: {} }) as unknown as ReturnType<typeof provider.runtime.invoke>,
        },
      },
    }
  }
}
