// The `server-entry` row: the loopback HTTP entry of the two public locations, carried by the row
// body in the `entry` phase. The body builds the member's server from the tree and returns a
// handle: `start` listens (the assembly calls it after every row is ACTIVE) and `stop` closes the
// entry first in the planned stop. Nothing listens before `start`. The member's diagnostics leave
// through the injected `telemetry` service (D04: required, so a tree without it does not serve).
//
// The session diagnostics projection (#1140 A5, RFC-0013 A line) reads four ports. Three are
// injected, as the assembly page lists them: `agentJournal` (the finish read), `modelRuntime`
// (only `calls.inspect` and `calls.dispatches`) and `modelDiagnostics`. `toolRuntime` is a local
// dependency, read on every call: absent, the tool reads of the projection answer `unavailable`,
// which the member writes as a gap, and the entry serves the rest.
import type { Context } from '@deepseek-ai/cordis'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
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
import { defineRow, type RowHandle } from '../../row.ts'
import { serverEntryConfig, type ServerEntryRowConfig } from './config.ts'
import { governanceOfCall, identityOfCall } from './identity.ts'
import { modelCredentialsOfCall } from './model-credentials.ts'
import { entryDiagnostics } from './telemetry.ts'

const LOOPBACK = '127.0.0.1'

/**
 * The Session faces by caller class. The assembly page names two classes for this row: `intake`
 * for the management and work operations, `reader` for the history. A plugin has one `inject`
 * entry per service, so the two classes come from two intercept contexts of the row fiber.
 */
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

/**
 * The tool reads of the projection, taken from the tree on every call. The assembly page lists
 * `toolRuntime` as a local dependency of this row: a reloaded Tool runtime is seen by the next
 * request, and a missing one makes only the tool reads answer `unavailable`.
 */
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

/** The three injected ports of the projection, each narrowed to what the member reads. */
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

/** The projection fields, present together or absent together (the schema refines that). */
function projectionOf(
  config: ServerEntryRowConfig,
): Pick<ServerEntryConfig, 'diagnosticsKinds' | 'maxRuns' | 'maxCallsPerRun'> {
  const { diagnosticsKinds, maxRuns, maxCallsPerRun } = config
  if (diagnosticsKinds === undefined || maxRuns === undefined || maxCallsPerRun === undefined)
    return {}
  return { diagnosticsKinds, maxRuns, maxCallsPerRun }
}

async function build(ctx: Context, raw: unknown): Promise<RowHandle> {
  // `defineRow` hands over the output of `Config`; parsing it again only narrows the type.
  const parsed = serverEntryConfig.parse(raw)
  const { diagnosticsKinds: _kinds, maxRuns: _runs, maxCallsPerRun: _calls, ...config } = parsed
  const entry = createServerEntry({
    config: { listenAddress: LOOPBACK, ...config, ...projectionOf(parsed) },
    dependencies: {
      identity: identityOfCall(ctx),
      governance: governanceOfCall(ctx),
      issuer: ctx.principalIssuer,
      session: sessionFaces(ctx),
      resolveDefinition: definitionResolverOf(ctx.definitionMappings),
      modelCredentials: modelCredentialsOfCall(ctx),
      diagnostics: entryDiagnostics(ctx.telemetry),
      ...diagnosticPorts(ctx),
      toolQueries: toolQueriesOfCall(ctx),
    },
  })
  // A fiber that unloads while the tree runs (a provider change) closes the listener too.
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
    provides: [],
    injects: [...INJECT],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'entry' },
  Config: serverEntryConfig,
  body: build,
})
