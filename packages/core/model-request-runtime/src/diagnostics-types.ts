import { type DiagnosticReference } from '@omne-harness-lite/model-request-runtime'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'

export type DiagnosticScope =
  { readonly kind: 'local' } | { readonly kind: 'tenant'; readonly tenant: TenantId }

/** A call-local engineering marker. It never becomes a Run, session or request field. */
export interface DiagnosticAssociation {
  readonly executionId: string
  readonly causedBy?: DiagnosticReference
  readonly session?: string
  readonly run?: string
  readonly attempt?: JsonNumber
  readonly call?: string
  readonly dispatch?: JsonNumber
  readonly response?: string
}
