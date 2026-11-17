import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'

/** The key of the block that supplies the extensions a tenant has enabled. Not scoped to a session; read from its producer each time. */
export const ENABLED_EXTENSIONS_BLOCK = 'loop-extension.enabled'

export type EnabledMember = Readonly<{
  capability: string
  assetRef: string
  version: string
  declaration: LoopExtensionDeclaration
}>

/** `basis` names the revisions of the facts the view was computed from. */
export type EnabledExtensionsView = Readonly<{
  members: readonly EnabledMember[]
  basis: Readonly<{ assets: string; settings: string }>
}>
