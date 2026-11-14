import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { modelDiagnosticsKey, modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import {
  createServerEntry,
  type ServerEntryConfig,
  type ServerEntryDependencies,
  type ToolCallReader,
} from '@omne-harness/server-entry'
import { definitionMappingsKey, definitionResolverOf } from '@omne-harness/server-entry/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { modesInitialization } from '../../assembly/session-modes-initialization.ts'
import { createHitlEntryPrincipals } from '../../entry/hitl-entry-principals.ts'
import { defineRow, type RowHandle } from '../../row.ts'
import { HITL_LOCATION } from '../tool-hitl/host.ts'
import { serverEntryConfig, type ServerEntryRowConfig } from './config.ts'
import { hitlFacesOfCall } from './hitl.ts'
import { governanceOfCall, identityOfCall } from './identity.ts'
import { settingsOfCall } from './settings.ts'
import { entryAccess } from './access.ts'
import { entryDiagnostics } from './telemetry.ts'

const LOOPBACK = '127.0.0.1'

function sessionFaces(ctx: Context): ServerEntryDependencies['session'] {
  const intake = ctx.intercept(sessionKey, { caller: 'intake' }).session
  const reader = ctx.intercept(sessionKey, { caller: 'reader' }).session
  return {
    management: {
      ...intake.management,
      create: input =>
        intake.management.create({
          ...input,
          creation: {
            ...input.creation,
            initialization: modesInitialization(input).initialization,
          },
        }),
    },
    work: intake.work,
    history: reader.history,
  }
}

type ToolQueries = NonNullable<ServerEntryDependencies['toolQueries']>
type ToolRuntime = ToolRuntimeService<unknown, never>

const TOOL_RUNTIME_ABSENT = Object.freeze({
  kind: 'unavailable' as const,
  dependency: toolRuntimeKey,
  diagnostic: 'tool runtime is not provided by the tree',
})

function toolQueriesOfCall(ctx: Context): ToolQueries {
  const current = (): ToolRuntime['queries'] | undefined =>
    (ctx.get(toolRuntimeKey) as ToolRuntime | undefined)?.queries
  const queries: ToolCallReader<never> = {
    async lookup(input) {
      const runtime = current()
      return runtime === undefined ? fail(TOOL_RUNTIME_ABSENT) : runtime.lookup(input)
    },
    async account(input) {
      const runtime = current()
      return runtime === undefined ? fail(TOOL_RUNTIME_ABSENT) : runtime.account(input)
    },
    async readDiagnostics(input) {
      const runtime = current()
      return runtime === undefined ? fail(TOOL_RUNTIME_ABSENT) : runtime.readDiagnostics(input)
    },
  }
  return queries
}

function diagnosticPorts(
  ctx: Context,
): Pick<ServerEntryDependencies, 'agentJournal' | 'modelCalls' | 'modelDiagnostics'> {
  const runtime = ctx.modelRuntime
  return {
    agentJournal: ctx.agentJournal,
    modelCalls: {
      inspect: input => runtime.calls.inspect(input),
      dispatches: input => runtime.calls.dispatches(input),
    },
    modelDiagnostics: ctx.modelDiagnostics,
  }
}

function projectionOf(
  config: ServerEntryRowConfig,
): Pick<ServerEntryConfig, 'diagnosticsKinds' | 'maxRuns' | 'maxCallsPerRun'> {
  const { diagnosticsKinds, maxRuns, maxCallsPerRun } = config
  if (diagnosticsKinds === undefined || maxRuns === undefined || maxCallsPerRun === undefined)
    return {}
  return { diagnosticsKinds, maxRuns, maxCallsPerRun }
}

async function build(ctx: Context, raw: unknown): Promise<RowHandle> {
  const parsed = serverEntryConfig.parse(raw)
  const { diagnosticsKinds: _kinds, maxRuns: _runs, maxCallsPerRun: _calls, ...config } = parsed
  const entry = createServerEntry({
    config: {
      listenAddress: LOOPBACK,
      ...config,
      ...projectionOf(parsed),
      hitlLocationRef: HITL_LOCATION,
    },
    dependencies: {
      identity: identityOfCall(ctx),
      governance: governanceOfCall(ctx),
      issuer: ctx.principalIssuer,
      session: sessionFaces(ctx),
      resolveDefinition: definitionResolverOf(ctx.definitionMappings),
      settings: settingsOfCall(ctx),
      diagnostics: entryDiagnostics(ctx.telemetry),
      ...diagnosticPorts(ctx),
      toolQueries: toolQueriesOfCall(ctx),
      hitl: hitlFacesOfCall(ctx),
      hitlEntryPrincipals: createHitlEntryPrincipals(ctx.principalIssuer),
    },
    access: entryAccess(
      ctx,
      ctx.telemetry,
      createAccessIdentity({
        operations: identityOfCall(ctx),
        governance: governanceOfCall(ctx),
        issuer: ctx.principalIssuer,
      }),
    ),
  })
  ctx.effect(() => () => entry.stop(), 'server-entry.listener')
  return {
    async start() {
      await entry.start()
    },
    async stop() {
      await entry.stop()
      return { kind: 'settled' }
    },
  }
}

const INJECT = [
  sessionKey,
  principalIssuerKey,
  definitionMappingsKey,
  telemetryKey,
  agentJournalKey,
  modelDiagnosticsKey,
  modelRuntimeKey,
] as const

export const serverEntryRow = defineRow({
  row: 'server-entry',
  implementation: 'real',
  manifest: {
    provides: [accessRegistryKey],
    injects: [...INJECT],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'entry' },
  Config: serverEntryConfig,
  body: build,
})
