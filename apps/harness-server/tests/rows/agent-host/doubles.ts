import type { Context } from '@deepseek-ai/cordis'
import { createTestAgentDependencies, type TestAgentControls } from '@omne-harness/agent/testing'
import type { Access } from '@omne-harness/agent-contract'
import {
  createMemoryAgentAccountOutlet,
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import {
  ActionAdmissionService,
  AgentAccessCheckService,
  AgentAccountOutletService,
  AgentAdoptionsService,
  AgentClockService,
  AgentJournalEntriesService,
  AgentJournalService,
  AgentMaterialsService,
  AgentReceivedCommitsService,
  CurrentConditionsService,
  DecisionCardsService,
  ExtensionImplementationsService,
  MessageHandoffService,
  ModelContextReaderService,
  ModelReceptionTargetsService,
  ModelSelectionService,
  RegisteredReadsService,
  RequestPreparationService,
  agentActionAdmissionKey,
  agentDecisionCardsKey,
  agentExtensionsKey,
  agentReadsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import { ModelRuntimeService } from '@omne-harness/model-cordis-contract/cordis'
import type { RowSpec } from '../../../src/loader.ts'
import { defineRow } from '../../../src/row.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { declared } from '../session-fixtures/tree.ts'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

export const tenant = tenantOf(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
export const scope = { owner: 'session', record: 'slot-session', revision: '1', digest: 'sha256:s' }
export const definition = {
  owner: 'agents',
  name: 'planner',
  revision: '1',
  digest: 'sha256:first',
}
export const caller: Access<string> = { principal: 'caller-a', tenant }

export const hostConfig = {
  observerBufferBytes: 1024,
  reconciliationDelaysMs: [0],
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: ['message', 'context-transition', 'custody', 'processed'] as string[],
  coordination: 'coordinated',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  modelRetry: { maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 0 },
  instanceIdleMs: 60_000,
}

export const INJECTS = [
  'agentJournal',
  'agentJournalEntries',
  'agentMaterials',
  'agentReceivedCommits',
  'agentModelReceptionTargets',
  'agentAccessCheck',
  'agentAdoptions',
  'agentConditions',
  'agentRequests',
  'agentModelSelection',
  'agentModelContext',
  'agentMessageHandoff',
  'agentAccountOutlet',
  'modelRuntime',
  'agentClock',
  'agentHostPrincipal',
] as const
export type Inject = (typeof INJECTS)[number]
type ServiceInject = Exclude<Inject, 'agentHostPrincipal'>

type Constructor = new (ctx: Context) => object
const definitions: Readonly<Record<ServiceInject, unknown>> = {
  agentJournal: AgentJournalService,
  agentJournalEntries: AgentJournalEntriesService,
  agentMaterials: AgentMaterialsService,
  agentReceivedCommits: AgentReceivedCommitsService,
  agentModelReceptionTargets: ModelReceptionTargetsService,
  agentAccessCheck: AgentAccessCheckService,
  agentAdoptions: AgentAdoptionsService,
  agentConditions: CurrentConditionsService,
  agentRequests: RequestPreparationService,
  agentModelSelection: ModelSelectionService,
  agentModelContext: ModelContextReaderService,
  agentMessageHandoff: MessageHandoffService,
  agentAccountOutlet: AgentAccountOutletService,
  modelRuntime: ModelRuntimeService,
  agentClock: AgentClockService,
}

const stages = [
  [ExtensionImplementationsService, 'extensions'],
  [DecisionCardsService, 'cards'],
  [ActionAdmissionService, 'admission'],
  [RegisteredReadsService, 'reads'],
] as const

export function principalObject(): EntryObjectModule {
  return {
    name: 'agentHostPrincipal',
    implementation: 'contract-double',
    install(installScope: Context) {
      installScope.provide('agentHostPrincipal', 'agent-host-maintainer')
    },
  }
}

export type HostDoubles = Readonly<{
  spec: RowSpec
  controls: TestAgentControls<string>
  loads: unknown[]
}>

export function hostDoubles(omit: Inject | null): HostDoubles {
  const { dependencies, controls } = createTestAgentDependencies<string>({
    journal: {
      coordination: 'coordinated',
      participants: ['message', 'context-transition', 'custody', 'processed'],
      coordinator: { grant: () => true, source: () => true },
      cancellation: {
        installation: testCancellationPolicyInstallation,
        policy: createTestCancellationPolicy(),
      },
    },
    receivingPrincipal: caller.principal,
  })
  controls.access.check.always(input => ({
    kind: 'allowed',
    evidence: { ...scope, record: `access/${input.operation}` },
  }))
  const loads: unknown[] = []
  const ports: Readonly<Record<ServiceInject, object>> = {
    agentJournal: {
      ...controls.journal.port,
      load(input: Parameters<typeof controls.journal.port.load>[0]) {
        loads.push(input.principal)
        return controls.journal.port.load(input)
      },
    },
    agentJournalEntries: controls.journal.provider.entries,
    agentMaterials: controls.materials.port,
    agentReceivedCommits: controls.journal.provider.received ?? {},
    agentModelReceptionTargets: controls.journal.targets,
    agentAccessCheck: controls.access.port,
    agentAdoptions: controls.adoptions.port,
    agentConditions: controls.conditions.port,
    agentRequests: controls.requests.port,
    agentModelSelection: controls.selection.port,
    agentModelContext: controls.modelContext.port,
    agentMessageHandoff: controls.handoff.port,
    agentAccountOutlet: createMemoryAgentAccountOutlet<string>(),
    modelRuntime: dependencies.models,
    agentClock: controls.clock.port,
  }
  const keys = (Object.keys(definitions) as ServiceInject[]).filter(key => key !== omit)
  const stageKeys = [
    agentExtensionsKey,
    agentDecisionCardsKey,
    agentActionAdmissionKey,
    agentReadsKey,
    'toolRuntime',
  ]
  const spec = declared(
    defineRow({
      row: 'agent-host-doubles',
      implementation: 'contract-double',
      manifest: { provides: [...keys, ...stageKeys], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'agent-host-doubles',
        apply(ctx: Context) {
          for (const key of keys) {
            const Definition = definitions[key] as Constructor
            Object.assign(new Definition(ctx), ports[key])
          }
          for (const [Definition, name] of stages)
            Object.assign(new (Definition as unknown as Constructor)(ctx), controls[name].port)
          ctx.provide('toolRuntime', controls.tools.port)
        },
      },
    }),
  )
  return { spec, controls, loads }
}
