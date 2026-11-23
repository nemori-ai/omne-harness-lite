import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { Offered, PackageFile } from '@omne-harness/plugin'

/** Whether this login may act for a tenant now. The application answers it from identity. */
export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type SourceFile = PackageFile & Readonly<{ bytes: number }>

/** One plugin as a source gives it, with the text of its manifest and the size of each file. */
export type SourcePlugin = Omit<Offered, 'files'> &
  Readonly<{ manifestText: string; files: readonly SourceFile[] }>

export type FileAt = Readonly<{
  name: string
  version: string
  path: string
  offset: number
  limit: number
}>

export type SourceRead =
  | Readonly<{ kind: 'read'; part: Uint8Array; next: number | null; bytes: number }>
  | Readonly<{ kind: 'absent'; what: 'plugin' | 'file' }>
  | Readonly<{ kind: 'unavailable' }>

/** Where the plugins to load come from. What it offers may differ by the principal it is asked for. */
export interface PluginSource {
  list(
    principal: Principal,
  ): Promise<
    Readonly<{ kind: 'read'; offered: readonly SourcePlugin[] }> | Readonly<{ kind: 'unavailable' }>
  >
  read(principal: Principal, at: FileAt): Promise<SourceRead>
  /** Calls the listener when what it offers may have changed; returns the function that stops it. */
  subscribe(listener: () => void): () => void
}

export type LoadReport = Readonly<{
  name: string
  version: string
  state: 'loaded' | 'failed' | 'held'
  reason: string | null
}>

/** Where clients' reports go. A client reporting again replaces what it reported before. */
export interface PluginReports {
  record(tenant: string, client: string, reports: readonly LoadReport[]): void
  forget(tenant: string, client: string): void
}
