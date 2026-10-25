// The `./testing` doubles of the first tenant path, wired as the application assembly page's
// "替身与真件" table names them: identity's in-process operations, the non-durable Session
// transaction port, the Agent test dependencies with the scripted Model provider, and the Request
// Context memory sources. Nothing here is durable or proves a real provider. `src/` never imports
// this file.
import { agentEvaluator, createAgentRuntime, type AgentRuntimeOptions } from '@omne-harness/agent'
import {
  createTestAgentDependencies,
  readyPreparation,
  testAdoption,
  testEvidence,
} from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  type Material,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { IdentityOperations } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { judgeMessage, parseRecordEntryRef, type Message } from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeResultVersion,
  type ResultPart,
} from '@omne-harness/model-contract'
import { decodeHistorySequence } from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import {
  createMemorySessionEvidenceBridge,
  createMemorySessionTransactions,
  creation,
  guard,
} from '@omne-harness/session-contract/testing'
import type { SessionEvidenceBridge } from '@omne-harness/session-contract'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import type { PathAgent, PathDependencies, PathPrincipal } from '../src/path.ts'
import type { FragmentObservation, PathReport } from '../src/path-report.ts'
import type { ContractSkeletonInputs } from '../src/run.ts'

/** The reply text the scripted Model settles every admitted call with. */
export const REPLY_TEXT = 'first reply from the scripted model'
export const AGENT_INSTANCE = 'instance-cs-1'

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

export function firstRequest(text = 'hello, first request'): Message {
  const judged = judgeMessage({
    id: `msg_${'c'.repeat(24)}`,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: `blk_${'d'.repeat(26)}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  })
  if ('rejected' in judged) throw new Error(String(judged.rejected))
  return judged.ok
}

const selected: SelectedModel = {
  recipient: { route: 'route-cs', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true } as unknown as SelectedModel['resolution'],
  parameters: [],
  tools: testEvidence('tools'),
  evidence: testEvidence('selected'),
}

function replyParts(text: string): readonly ResultPart[] {
  return [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'text',
        id: 'blk_cs_reply_0' as never,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    },
  ]
}

export type AgentDoubleOptions = Readonly<{
  /** The text the scripted Model settles with; null lets admitted calls stay unsettled. */
  reply?: string | null
}>

/** The Agent of one tenant from `createTestAgentDependencies`, with the path's bridges plugged in. */
export function agentDouble(options: AgentDoubleOptions = {}): PathDependencies['agent'] {
  const reply = options.reply === undefined ? REPLY_TEXT : options.reply
  return async ({ tenant, handoff, requests }): Promise<PathAgent> => {
    const { dependencies, controls } = createTestAgentDependencies<PathPrincipal>()
    const store = new Map<string, Material<ContentBlock>>()
    controls.materials.preserve.always(input => {
      store.set(input.identity, input.value)
      return {
        ok: {
          owner: input.consumer.owner,
          record: input.identity,
          revision: '1',
          digest: `sha256:${'a'.repeat(64)}`,
        },
      }
    })
    controls.materials.read.always(input => {
      const value = store.get(input.source.record)
      return value === undefined
        ? { failure: { kind: 'denied', action: 'materials.read' } }
        : { ok: value }
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
    const models = {
      ...dependencies.models,
      calls: {
        ...dependencies.models.calls,
        async admit(input: Parameters<typeof dependencies.models.calls.admit>[0]) {
          const admitted = await dependencies.models.calls.admit(input)
          if ('ok' in admitted && reply !== null) {
            queueMicrotask(() => {
              const call = { tenant: input.tenant, call: input.call }
              controls.models.start({
                ...call,
                dispatch: ok(decodeDispatchId('mdisp_cs_1')),
                firstContent: 'observed',
              })
              controls.models.settle({
                ...call,
                version: ok(decodeResultVersion('mrver_cs_1')),
                termination: { kind: 'completed', reason: 'stop' },
                parts: replyParts(reply),
                source: testEvidence(`settled/${input.call}`),
                pageSize: 10,
                pageTargetBytes: 65536,
              })
            })
          }
          return admitted
        },
      },
    }
    const runtimeOptions: AgentRuntimeOptions = {
      binding: {
        instance: ok(decodeAgentInstanceId(AGENT_INSTANCE)),
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
      await createAgentRuntime({ ...dependencies, models, handoff, requests }, runtimeOptions),
    )
    void decodeAgentExecutionId
    return { provider, journal: dependencies.journal, instance: AGENT_INSTANCE }
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
    return {
      seq: ok(decodeHistorySequence(String(index))),
      entry,
      message: item.message,
      bytes: String(JSON.stringify(item.message).length),
      prefixDigest: `chain:${index}`,
    }
  })
  const fixture = createAssemblyFixture({ tenant, rows: rows as never })
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

/**
 * The memory evidence bridge with the login-gate guard of `startRun`. In the target system the
 * evidence bridge derives it from the first input's origin, which the access layer marks with the
 * owner `login-entry` after a login. On this path `startRun` is reached only after H02 recognized the
 * login, so the guard is added to every `startRun`.
 */
export function loginGateEvidence(
  bridge: SessionEvidenceBridge = createMemorySessionEvidenceBridge(),
): SessionEvidenceBridge {
  return {
    async prepare(command) {
      const prepared = await bridge.prepare(command)
      if ('failure' in prepared || command.kind !== 'startRun') return prepared
      return {
        ok: [
          ...prepared.ok,
          guard('login-entry', 'login-entry', { operation: command.input.operation }),
        ],
      }
    },
  }
}

export function pathDependencies(overrides: Partial<PathDependencies> = {}): PathDependencies {
  return {
    identity: identityDouble(),
    login: { loginIdentifier: 'first@example.test', credential: 'first tenant credential' },
    session: createMemorySessionTransactions<PathPrincipal>(),
    evidence: loginGateEvidence(),
    creation: creation({ purpose: 'm2-first-path' }),
    request: firstRequest(),
    agent: agentDouble(),
    assemble: assembleWithMemorySources,
    preparationFrame: async input => ({ ok: readyPreparation(input) }),
    ...overrides,
  }
}

/** The inputs of `runContractSkeleton` with every double of the path and the scripted Model subject. */
export function skeletonInputs(
  overrides: Partial<ContractSkeletonInputs<unknown>> = {},
): ContractSkeletonInputs<unknown> {
  return {
    path: pathDependencies(),
    model: { subject: createScriptedConformanceSubject as never, waitMs: 500 },
    ...overrides,
  }
}

/** The Model obligation fragments of H06, without the connected-path fragment. */
export function modelFragments(report: PathReport): readonly FragmentObservation[] {
  return (report.hops.find(hop => hop.hopId === 'H06')?.fragments ?? []).filter(
    fragment => fragment.fragmentId !== 'H06-connected',
  )
}
