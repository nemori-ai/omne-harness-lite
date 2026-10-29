import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolCallId, ToolOperationId } from '@omne-harness/tool-contract'

export type ToolEnvironmentDiagnosticStage =
  | 'qualify'
  | 'prepare'
  | 'retry'
  | 'inspect-preparation'
  | 'release-policy'
  | 'release'
  | 'inspect-release'

export type ToolEnvironmentDiagnostic = Readonly<{
  stage: ToolEnvironmentDiagnosticStage
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  cause: unknown
}>

/** Trusted in-memory boundary. Remove secrets, capabilities and resolvers before persistence. */
export type ToolEnvironmentDiagnostics = Readonly<{
  record(event: ToolEnvironmentDiagnostic): Promise<{ kind: 'recorded' } | { kind: 'unavailable' }>
}>

export async function environmentDiagnostic(
  diagnostics: ToolEnvironmentDiagnostics,
  event: ToolEnvironmentDiagnostic,
): Promise<string> {
  let status: 'recorded' | 'unavailable'
  try {
    status = (await diagnostics.record(event)).kind
  } catch {
    status = 'unavailable'
  }
  return `environment operation failed; stage=${event.stage}; diagnostic=${status}`
}
