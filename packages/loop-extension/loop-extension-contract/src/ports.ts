import type { LoopExtensionImplementation } from '@omne-harness/agent-contract'
import type { AssetLayerSource, Candidate, CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { EnabledExtensionsView } from './block.ts'

export type RunSetting =
  | Readonly<{ kind: 'value'; value: boolean }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

/** What the assets and the settings of one tenant give this group. An answer it cannot give is unavailable, never empty. */
export type TenantExtensionSources = Readonly<{
  layers: readonly AssetLayerSource[]
  /** The body of one exact version; undefined when it cannot be read. */
  body(version: Pick<Candidate, 'asset' | 'version'>): Promise<unknown>
  run(held: Readonly<{ capability: CapabilityId; asset: string }>): Promise<RunSetting>
  /** The revisions of the assets and the settings now; undefined when either cannot be read. */
  basis(): Promise<EnabledExtensionsView['basis'] | undefined>
  /** Calls the listener after each committed change of the assets or the settings of this tenant. */
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
