import type { JsonValue, CallId } from '@omne-harness-lite/content-blocks'
import type { ContextScope } from '@omne-harness-lite/runtime-context'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import type {
  EnvironmentDescription,
  EnvironmentReference,
  EnvironmentRequirement,
} from './execution-environments.ts'

import type { EnvironmentPermission } from '@omne-harness-lite/tool-definition'
export type { EnvironmentPermission } from '@omne-harness-lite/tool-definition'

export interface EnvironmentTool {
  readonly name: string
  readonly definition: string
}

export interface EnvironmentCall {
  readonly tool: EnvironmentTool
  /** The original execution owner's CallId, scoped by tenant/session. */
  readonly execution: CallId
}

export interface EnvironmentPlacement extends EnvironmentCall {
  readonly scope: ContextScope
  readonly requirement: EnvironmentRequirement
  readonly permission: EnvironmentPermission
  readonly revision: string
  readonly evidence: JsonValue
}

export type PlacementRead =
  | { readonly kind: 'placement'; readonly placement: EnvironmentPlacement }
  | { readonly kind: 'notApplicable' }
  | {
      readonly kind: 'rejected'
      readonly reason: 'invalidInput' | 'notAuthorized' | 'policyUnavailable' | 'unavailable'
    }

/** A single trusted contribution owns the live permission input, not the registry. */
export interface EnvironmentPlacementSource {
  readonly name: string
  readonly generation: string
  readonly read: (
    scope: ContextScope,
    authorization: SessionAccess,
    call: EnvironmentCall,
  ) => Promise<PlacementRead>
  /** Checks new effects on the adopted instance; does not select a new target. */
  readonly authorizeOperation: (
    scope: ContextScope,
    authorization: SessionAccess,
    adopted: EnvironmentPlacement,
    environment: EnvironmentDescription,
    facility: 'command' | 'files',
  ) => Promise<
    | { readonly kind: 'authorized' }
    | { readonly kind: 'rejected'; readonly reason: 'notAuthorized' | 'unavailable' }
  >
  readonly select: (
    placement: EnvironmentPlacement,
    candidates: readonly EnvironmentDescription[],
  ) => Promise<
    | { readonly kind: 'selected'; readonly reference: EnvironmentReference }
    | {
        readonly kind: 'rejected'
        readonly reason: 'policyUnavailable' | 'ambiguousEnvironment' | 'noMatchingEnvironment'
      }
  >
}

export interface EnvironmentPlacementRegistrations {
  /** At most one live source per environment owner. An old disposer cannot remove a new one. */
  readonly registerPlacementSource: (source: EnvironmentPlacementSource) => () => Promise<void>
}

export type EnvironmentBinding =
  | { readonly kind: 'host_machine' }
  | { readonly kind: 'stateless_sandbox'; readonly scope: ContextScope; readonly execution: CallId }
  | { readonly kind: 'session_sandbox'; readonly scope: ContextScope }
  | { readonly kind: 'tenant_sandbox'; readonly tenant: ContextScope['tenant'] }

export type EnvironmentContinuity =
  | { readonly kind: 'notGuaranteed' }
  | { readonly kind: 'continuous'; readonly data: string; readonly revision: string }
  | { readonly kind: 'lost'; readonly previous: string }
