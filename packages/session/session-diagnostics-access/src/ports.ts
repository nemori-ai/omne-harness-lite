import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { SessionHistory } from '@omne-harness/session-contract'
import type { DiagnosticPorts } from './session-view/index.ts'

export interface DiagnosticsPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type SessionDiagnosticsFaces = Readonly<{
  history: Pick<SessionHistory<Principal>, 'begin' | 'next'>
  ports: DiagnosticPorts<Principal>
}>

export type SessionDiagnosticsSettings = Readonly<{
  maxPageBytes: number
  diagnosticsKinds?: readonly string[] | undefined
  maxRuns?: number | undefined
  maxCallsPerRun?: number | undefined
}>
