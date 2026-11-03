// Test stand-ins for the injects of the `agent-host` row, shared by the row tests of `agent-host`
// and `session-ad14`. Every service is a non-durable double of `@omne-harness/agent/testing` behind
// the abstract service of `agent-cordis-contract`; nothing here proves a real provider. The memory
// Journal is a coordinated binding that declares the four joint-commit participants, because the
// release rule of the row (R2-D93) requires `message` in `jointCommits`, and the factory refuses a
// configuration whose joint commits the Journal does not declare. The six locally required stage
// dependencies (tools, extensions, cards, action admission, materials, registered reads) come from
// the same doubles, so the Agent Loop can run up to its Tool actions. It does not import vitest.
import type { Context } from '@deepseek-ai/cordis'
import { createTestAgentDependencies, type TestAgentControls } from '@omne-harness/agent/testing'
import type { Access } from '@omne-harness/agent-contract'
import {
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
  CurrentConditionsService,
  DecisionCardsService,
  ExtensionImplementationsService,
  MessageHandoffService,
  ModelContextReaderService,
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

/** The operator values of the row in these tests: the release's joint commits, test numbers. */
export const hostConfig = {
  observerBufferBytes: 1024,
  reconciliationDelayMs: 0,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: ['message', 'context-transition', 'custody', 'processed'] as string[],
  coordination: 'coordinated',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  instanceIdleMs: 60_000,
}

/** The fourteen injects of the row, in the order of the assembly page. */
export const INJECTS = [
  'agentJournal',
  'agentJournalEntries',
  'agentMaterials',
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
// The definition classes are abstract only to TypeScript; the stand-in gives each its members.
const definitions: Readonly<Record<ServiceInject, unknown>> = {
  agentJournal: AgentJournalService,
  agentJournalEntries: AgentJournalEntriesService,
  agentMaterials: AgentMaterialsService,
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

// The stage dependencies the host takes per call (`toolRuntime` is provided as it is).
const stages = [
  [ExtensionImplementationsService, 'extensions'],
  [DecisionCardsService, 'cards'],
  [ActionAdmissionService, 'admission'],
  [RegisteredReadsService, 'reads'],
] as const

/** The host principal, a root object of the assembly entry. */
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
  /** The principal of every Journal `load`, in order. */
  loads: unknown[]
}>

/**
 * One stand-in row that provides every service key of the injects except `omit`, plus the stage
 * dependencies. The memory Journal grants every coordinated `open` and input source.
 */
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
    agentJournalEntries: {},
    agentMaterials: controls.materials.port,
    agentAccessCheck: controls.access.port,
    agentAdoptions: controls.adoptions.port,
    agentConditions: controls.conditions.port,
    agentRequests: controls.requests.port,
    agentModelSelection: controls.selection.port,
    agentModelContext: controls.modelContext.port,
    agentMessageHandoff: controls.handoff.port,
    agentAccountOutlet: {},
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
