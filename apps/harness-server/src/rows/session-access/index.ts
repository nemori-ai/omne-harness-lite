// The `session-access` row: the access plugin of `session/v1` (RFC-0015 §5, §7, §8), from
// `@omne-harness/session-access/cordis`. Loading this row opens `session/v1` at the entry's new
// address; leaving it out keeps the protocol closed (RFC-0015 I-15). The row injects only
// `accessRegistry`, which the `server-entry` row provides. Everything else is taken at each call:
// Session (`intake` for management and work, `reader` for the history), `sessionObservation` and
// the deployment's `definitionMappings`. A call while one of them is off the tree answers
// `basis-unavailable` and the protocol stays mounted.
//
// The row adapts the member's two principal ports from the entry's identity port (`AccessIdentity`):
// `TargetTenantPrincipals` is `actFor`, and `PrincipalFacts` reads the acting-for-tenant principal
// identity issues for a login (its tenant, and the login as its work). The identity port is one
// object shared with the `server-entry` row; `createSessionAccessRow` takes it. The release row
// `sessionAccessRow` has the same port the entry has today, which identity does not offer yet.
//
// A creation passes the assembly's modes initialization on to Session, as the entry's session
// location does.
import type { Context } from '@deepseek-ai/cordis'
import type { AccessIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { definitionMappingsKey, definitionResolverOf } from '@omne-harness/server-entry/cordis'
import {
  createSessionAccessPlugin,
  type SessionCreateInput,
} from '@omne-harness/session-access/cordis'
import type { PrincipalFacts, TargetTenantPrincipals } from '@omne-harness/session-access'
import { z } from 'zod'
import {
  modesInitialization,
  type ModesCreation,
} from '../../assembly/session-modes-initialization.ts'
import { LOCAL_HISTORY_KINDS } from '../../local/operator-defaults.ts'
import { defineRow } from '../../row.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/**
 * The row configuration. `defaultDefinition` is the definition a `create-session` without a name
 * uses; without it such a call is `invalid`. The page bound and the history kinds take the values
 * of the entry's session location.
 */
export const sessionAccessConfig = z.strictObject({
  defaultDefinition: z.string().min(1).optional(),
  maxPageBytes: positive.default(1048576),
  historyKinds: z.array(z.string().min(1)).default(() => [...LOCAL_HISTORY_KINDS]),
})

/** The login work of a principal identity issues for a login (identity's login steps). */
const LOGIN_WORK_OWNER = 'identity-login'

/** `TargetTenantPrincipals` from the entry's identity port. */
export function targetTenantPrincipals(identity: AccessIdentity): TargetTenantPrincipals {
  return {
    async actingFor(login, tenant) {
      const issued = await identity.actFor(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

/** `PrincipalFacts` over the acting-for-tenant principal that identity issues for a login. */
export const principalFacts: PrincipalFacts = {
  describe(principal: Principal) {
    const acting = principal as unknown as Partial<ActingForTenantPrincipal>
    if (acting.kind !== 'acting-for-tenant' || acting.work?.owner !== LOGIN_WORK_OWNER)
      return undefined
    if (acting.tenant === undefined) return undefined
    return { tenant: acting.tenant, account: acting.tenant.account.text, login: acting.work.work }
  },
}

function definitionsOf(ctx: Context) {
  const mappings = ctx.get(definitionMappingsKey)
  return mappings === undefined ? undefined : definitionResolverOf(mappings)
}

function prepareCreation(input: SessionCreateInput): SessionCreateInput {
  const { initialization } = modesInitialization(input as unknown as ModesCreation)
  return { ...input, creation: { ...input.creation, initialization } }
}

/** The row over `identity`, the same identity port object the `server-entry` row gives its entry. */
export function createSessionAccessRow(identity: AccessIdentity) {
  const plugin = createSessionAccessPlugin({
    principals: targetTenantPrincipals(identity),
    facts: principalFacts,
    definitions: definitionsOf,
    prepareCreation,
  })
  return defineRow({
    row: 'session-access',
    implementation: 'real',
    manifest: { provides: [], injects: [accessRegistryKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: { ...plugin, Config: sessionAccessConfig },
  })
}

/**
 * The identity port of the release until the coordinator gives this row the entry's port: the same
 * answers as the entry's `IDENTITY_NOT_OFFERED`, so every call that needs a principal for a target
 * tenant is refused with `basis-unavailable`.
 */
const IDENTITY_NOT_OFFERED: AccessIdentity = {
  identifyLogin: async () => ({ outcome: 'basis-unavailable' }),
  actFor: async () => ({ outcome: 'basis-unavailable' }),
  reportAccess: async () => {},
}

export const sessionAccessRow = createSessionAccessRow(IDENTITY_NOT_OFFERED)
