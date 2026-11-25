import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { CallContext, CanvasChangeFeed, CanvasOperations } from '@omne-harness/canvas-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface CanvasPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  /** The call context of the person the tenant is. */
  contextOf(principal: Principal, tenant: string): CallContext
}

/** Taken at each call; absent while the canvas row is not there. */
export type CanvasFace = CanvasOperations

/** Taken when an observation opens; absent while the canvas row is not there. */
export type CanvasChanges = CanvasChangeFeed
