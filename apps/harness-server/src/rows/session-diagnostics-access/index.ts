import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { modelDiagnosticsKey, modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionAdoptedRequestsKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type {
  DiagnosticPorts,
  DiagnosticsPrincipals,
  ModelRequestReader,
  SessionDiagnosticsFaces,
} from '@omne-harness/session-diagnostics-access'
import { createSessionDiagnosticsAccessPlugin } from '@omne-harness/session-diagnostics-access/cordis'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

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
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

type ToolRuntime = ToolRuntimeService<unknown, never>

function present<T>(service: T | undefined, name: string): T {
  if (service === undefined) throw new Error(`${name} is not provided by the tree`)
  return service
}

// The choices Request Context made for the request adopted for one model call, as it recorded them.
function modelRequests(ctx: Context): ModelRequestReader<Principal> {
  return {
    async readChoices({ principal, tenant, session, reference }) {
      const requests = present(ctx.get(sessionAdoptedRequestsKey), 'sessionAdoptedRequests')
      const read = await requests.readRequestChoices({
        access: { principal, tenant },
        session: session as SessionId,
        reference,
      })
      if (read.kind !== 'value') return { failure: { reason: read.kind } }
      if (read.value === null) return { failure: { reason: 'not-recorded' } }
      return { ok: read.value }
    },
  }
}

function diagnosticPorts(ctx: Context): DiagnosticPorts<Principal> {
  const calls = () => present(ctx.get(modelRuntimeKey), 'modelRuntime').calls
  const attempts = () => present(ctx.get(modelDiagnosticsKey), 'modelDiagnostics')
  const tools = () => present(ctx.get(toolRuntimeKey) as ToolRuntime | undefined, 'toolRuntime')
  return {
    modelCalls: {
      inspect: input => calls().inspect(input),
      dispatches: input => calls().dispatches(input),
    },
    modelDiagnostics: { list: input => attempts().list(input) },
    modelRequests: modelRequests(ctx),
    toolQueries: {
      current: input => tools().instances.current(input),
      account: input => tools().queries.account(input),
      readDiagnostics: input => tools().queries.readDiagnostics(input),
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
