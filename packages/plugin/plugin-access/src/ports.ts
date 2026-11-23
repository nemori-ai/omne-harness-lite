import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { Offered, PackageFile } from '@omne-harness/plugin-protocol'

/** Whether this login may act for a tenant now. The application answers it from identity. */
export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type SourceFile = PackageFile & Readonly<{ bytes: number }>

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

export type ClientReport = Readonly<{
  plugins: readonly LoadReport[]
  points: readonly Readonly<{ name: string; summary: string }>[]
  parts: readonly Readonly<{
    name: string
    label: string
    summary: string
    depths: readonly ('tokens' | 'style' | 'render')[]
    within: string | null
  }>[]
}>

export type ReportedClient = ClientReport & Readonly<{ client: string }>

export interface PluginReports {
  /** Keeps what a client that is there tells; of one that is not there it keeps nothing and says so. */
  record(tenant: string, client: string, report: ClientReport): 'kept' | 'absent'
  /** The client is there from now until the answer is called; when it is there no more, what it reported is dropped. */
  present(tenant: string, client: string): () => void
  reportsOf(tenant: string): readonly ReportedClient[]
}
