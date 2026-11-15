import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { modelDiagnosticsKey, modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type {
  DiagnosticPorts,
  DiagnosticsPrincipals,
  SessionDiagnosticsFaces,
} from '@omne-harness/session-diagnostics-access'
import { createSessionDiagnosticsAccessPlugin } from '@omne-harness/session-diagnostics-access/cordis'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { governanceOfCall, identityOfCall } from '../server-entry/identity.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

const PROJECTION_KEYS = ['diagnosticsKinds', 'maxRuns', 'maxCallsPerRun'] as const

export const sessionDiagnosticsAccessConfig = z
  .strictObject({
    maxPageBytes: positive.default(1048576),
    diagnosticsKinds: z.array(z.string().min(1)).optional(),
    maxRuns: positive.optional(),
    maxCallsPerRun: positive.optional(),
  })
  .superRefine((config, ctx) => {
    const given = PROJECTION_KEYS.filter(key => config[key] !== undefined)
    if (given.length === 0 || given.length === PROJECTION_KEYS.length) return
    for (const key of PROJECTION_KEYS)
      if (config[key] === undefined)
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'diagnosticsKinds, maxRuns and maxCallsPerRun are given together',
        })
  })

function diagnosticsPrincipals(ctx: Context): DiagnosticsPrincipals {
  const identity = createAccessIdentity({
    operations: identityOfCall(ctx),
    governance: governanceOfCall(ctx),
    issuer: ctx.principalIssuer,
  })
  return {
    async actingFor(login, tenant) {
      const issued = await identity.actFor(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

type ToolRuntime = ToolRuntimeService<unknown, never>

function present<T>(service: T | undefined, name: string): T {
  if (service === undefined) throw new Error(`${name} is not provided by the tree`)
  return service
}

function diagnosticPorts(ctx: Context): DiagnosticPorts<Principal> {
  const journal = () => present(ctx.get(agentJournalKey), 'agentJournal')
  const calls = () => present(ctx.get(modelRuntimeKey), 'modelRuntime').calls
  const attempts = () => present(ctx.get(modelDiagnosticsKey), 'modelDiagnostics')
  const tools = () =>
    present(ctx.get(toolRuntimeKey) as ToolRuntime | undefined, 'toolRuntime').queries
  return {
    agentJournal: {
      readFinish: input => present(journal().readFinish, 'agentJournal.readFinish')(input),
    },
    modelCalls: {
      inspect: input => calls().inspect(input),
      dispatches: input => calls().dispatches(input),
    },
    modelDiagnostics: { list: input => attempts().list(input) },
    toolQueries: {
      lookup: input => tools().lookup(input),
      account: input => tools().account(input),
      readDiagnostics: input => tools().readDiagnostics(input),
    },
  }
}

function facesOf(ctx: Context): SessionDiagnosticsFaces | undefined {
  const reader = ctx.intercept(sessionKey, { caller: 'reader' }).get(sessionKey)
  if (reader === undefined) return undefined
  return { history: reader.history, ports: diagnosticPorts(ctx) }
}

const plugin = createSessionDiagnosticsAccessPlugin({
  principals: diagnosticsPrincipals,
  faces: facesOf,
})

export const sessionDiagnosticsAccessRow = defineRow({
  row: 'session-diagnostics-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...plugin,
    inject: [accessRegistryKey, principalIssuerKey],
    Config: sessionDiagnosticsAccessConfig,
  },
})
