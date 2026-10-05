import type { AssemblyCloseReport } from '@omne-harness-lite/assembly-lifecycle'
import type { ReadFailure } from '@omne-harness-lite/client-local-state'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type { Diagnostic } from './diagnostic.ts'

export interface ClientAssemblyOptions {
  readonly directory: string
  readonly timeoutMs?: number
}
export interface ClientAssembly {
  readonly ready: Promise<GovernanceClientOperations>
  requestStop(): void
  readonly clientStopped: Promise<void>
  releasePresentation(): void
  readonly closed: Promise<AssemblyCloseReport>
}
export type ClientAssemblyFactory = (options: ClientAssemblyOptions) => ClientAssembly

export class ClientAssemblyStateFailure extends Error {
  override readonly name = 'ClientAssemblyStateFailure'
  constructor(readonly reason: ReadFailure | 'unsafe-path' | 'invalid-directory') {
    super('Client state could not be opened')
  }
}
export class ClientAssemblyStopped extends Error {
  override readonly name = 'ClientAssemblyStopped'
  constructor() {
    super('Client assembly has stopped')
  }
}

/** Setup failures are reported through ready. This observes the distinct release failures. */
export function assemblyCloseDiagnostics(report: AssemblyCloseReport): readonly Diagnostic[] {
  const diagnostics = new Set<Diagnostic>()
  if (report.assemblyErrors.length) diagnostics.add('internal-defect')
  for (const row of report.rows) {
    if (row.result.kind === 'failed' && row.result.codes.includes('close'))
      diagnostics.add(row.id === 'localState' ? 'state-close-failed' : 'internal-defect')
  }
  return [...diagnostics]
}
