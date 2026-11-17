import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'

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

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'loop-extension.enabled': EnabledExtensionsView
  }
}

const text = (value: unknown): value is string => typeof value === 'string'

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null

function isMember(value: unknown): boolean {
  const member = record(value)
  if (member === null || record(member['declaration']) === null) return false
  return text(member['capability']) && text(member['assetRef']) && text(member['version'])
}

function isView(value: unknown): value is EnabledExtensionsView {
  const view = record(value)
  const basis = record(view?.['basis'])
  const members = view?.['members']
  if (basis === null || !Array.isArray(members)) return false
  return text(basis['assets']) && text(basis['settings']) && members.every(isMember)
}

export const enabledExtensionsProducer = Object.freeze({
  producer: '@omne-harness/loop-extension/enabled',
})

/** A required block: when its producer is away the reader gets a missing block, never an empty view. */
export const enabledExtensionsDescriptor = Object.freeze({
  key: ENABLED_EXTENSIONS_BLOCK,
  schema: {
    '~standard': {
      version: 1 as const,
      vendor: 'omne-harness',
      validate: (value: unknown) =>
        isView(value)
          ? { value }
          : { issues: [{ message: 'Expected the view of the enabled loop extensions' }] },
    },
  },
  consumers: Object.freeze(['coordinator'] as const),
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-request',
  kind: 'supplied',
  recovery: 'recompute',
} satisfies SuppliedBlockDescriptor<typeof ENABLED_EXTENSIONS_BLOCK, EnabledExtensionsView>)
