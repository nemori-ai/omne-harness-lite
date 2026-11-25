import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ToolInvocationQueries,
  ToolStreamObservation,
  ToolStreamReferences,
} from '@omne-harness/tool-contract'
import type { ToolChildren } from '@omne-harness/tool-contract/provider'

export interface ToolCallPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** The reads of one call by reference: its state and stream, its result pages, its process. */
export type ToolCallFaces = Readonly<{
  queries: Pick<ToolInvocationQueries<Principal, ContentBlock>, 'readResult' | 'readOutput'>
  instances: ToolStreamReferences<Principal>
  observation: ToolStreamObservation<Principal>
  /** The position table of a call that ran a program; absent while its records are away. */
  children: () => Pick<ToolChildren<Principal>, 'table'> | undefined
}>
