import type {
  AgentExecutionId,
  LoopExtensionImplementation,
  PassageId,
} from '@omne-harness/agent-contract'
import type { AssetLayerSource, Candidate, CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { EnabledExtensionsView } from './block.ts'

export type PackageDirectory =
  | Readonly<{ kind: 'directory'; path: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

export type RunSetting =
  | Readonly<{ kind: 'value'; value: boolean }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

/** What the assets and the settings of one tenant give this group. `body` and `basis` answer undefined when they cannot read; `changes` calls after each committed change. Unreadable is never empty. */
export type TenantExtensionSources = Readonly<{
  layers: readonly AssetLayerSource[]
  body(version: Pick<Candidate, 'asset' | 'version'>): Promise<unknown>
  run(held: Readonly<{ capability: CapabilityId; asset: string }>): Promise<RunSetting>
  locate(version: Pick<Candidate, 'asset' | 'version'>): Promise<PackageDirectory>
  basis(): Promise<EnabledExtensionsView['basis'] | undefined>
  changes: Readonly<{ subscribe(listener: () => void): () => void }>
}>

export interface ExtensionSources<P> {
  /** The sources of the tenant of this access, the same object for as long as they stay; undefined when they are away. */
  of(access: Access<P>): Promise<TenantExtensionSources | undefined>
}

export type EnabledExtensionsRead =
  | Readonly<{ kind: 'view'; view: EnabledExtensionsView }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface EnabledExtensionsViews<P> {
  read(access: Access<P>): Promise<EnabledExtensionsRead>
}

export type BuiltinExtension = LoopExtensionImplementation['invoke']

/** The builtin implementations a release registers by name. A registration is one contribution: leaving withdraws only itself. */
export interface BuiltinExtensions {
  register(name: string, invoke: BuiltinExtension): Outcome<() => void, 'taken'>
  get(name: string): BuiltinExtension | undefined
}

export type RunLocation =
  | Readonly<{ kind: 'location'; scope: ScopeRef; cwd: string }>
  | Readonly<{ kind: 'unavailable' }>

/** Where one call of a command implementation runs. The assembly answers it; this group does not know a session. */
export interface RunLocations<P> {
  of(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; passage: PassageId }>,
  ): Promise<RunLocation>
}
