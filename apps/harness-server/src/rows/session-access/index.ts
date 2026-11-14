// The `session-access` row: the access plugin of `session/v1` (RFC-0015 §5, §7, §8), from
// `@omne-harness/session-access/cordis`. Loading this row opens `session/v1` at the entry's new
// address; leaving it out keeps the protocol closed (RFC-0015 I-15). The row injects
// `accessRegistry`, which the `server-entry` row provides, and the trusted `principalIssuer`.
// Everything else is taken at each call: Session (`intake` for management and work, `reader` for
// the history), `sessionObservation`, the deployment's `definitionMappings` and identity's
// operations. A call while one of them is off the tree answers `basis-unavailable` and the
// protocol stays mounted.
//
// The member asks for two principal ports, and the row answers both from identity. A target
// tenant's principal comes from identity's own `AccessIdentity` (`createAccessIdentity`), built
// here the way the `server-entry` row builds its own; the port keeps no state to share but one
// cached system principal. `PrincipalFacts` reads the acting-for-tenant principal identity issues
// for a login: its tenant, and the login as its work.
//
// The session list reaches the member through its `SessionListing` port. The row adapts the
// session list face of Session (`directory`, read as `reader`) to it: a failure of Session is the
// port's refusal of the same name (`invalid`, `denied`; any other failure is `basis-unavailable`),
// and a time text that is not an instant makes the page `basis-unavailable`, because the list
// would otherwise show a time it cannot vouch for as none.
//
// A creation passes the assembly's modes initialization on to Session, as the entry's session
// location does.
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { definitionMappingsKey, definitionResolverOf } from '@omne-harness/server-entry/cordis'
import {
  openRequestJournal,
  type PrincipalFacts,
  type SessionListEntry,
  type SessionListing,
  type TargetTenantPrincipals,
} from '@omne-harness/session-access'
import {
  createSessionAccessPlugin,
  type SessionCreateInput,
} from '@omne-harness/session-access/cordis'
import {
  DEFAULT_SESSION_INTAKE_LIMITS,
  type SessionDirectory,
  type SessionListItem,
} from '@omne-harness/session-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { z } from 'zod'
import {
  modesInitialization,
  type ModesCreation,
} from '../../assembly/session-modes-initialization.ts'
import { LOCAL_HISTORY_KINDS } from '../../local/operator-defaults.ts'
import { defineRow } from '../../row.ts'
import { governanceOfCall, identityOfCall } from '../server-entry/identity.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/**
 * The row configuration. `defaultDefinition` is the definition a `create-session` without a name
 * uses; without it such a call is `invalid`. The page bound and the history kinds take the values
 * of the entry's session location. A `list-sessions` without `limit` takes `defaultListLimit`; a
 * larger `limit` than `maxListLimit` is `invalid` (RFC-0015 §8, initial value 50 for both).
 */
export const sessionAccessConfig = z
  .strictObject({
    defaultDefinition: z.string().min(1).optional(),
    maxPageBytes: positive.default(1048576),
    historyKinds: z.array(z.string().min(1)).default(() => [...LOCAL_HISTORY_KINDS]),
    defaultListLimit: positive.default(50),
    maxListLimit: positive.default(50),
    requestJournalFile: z
      .string()
      .refine(isAbsolute, 'requestJournalFile must be an absolute path'),
    requestQueueLimit: positive.default(DEFAULT_SESSION_INTAKE_LIMITS.maxPendingInputs),
    requestRetryDelaysMs: z
      .array(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))
      .min(1)
      .default(() => [100, 300, 1000, 3000]),
  })
  .refine(config => config.defaultListLimit <= config.maxListLimit, {
    message: 'defaultListLimit must not exceed maxListLimit',
    path: ['defaultListLimit'],
  })

/** The work owner of a principal identity issues for a login (identity's login steps). */
const LOGIN_WORK_OWNER = 'identity-login'

/** `TargetTenantPrincipals` over identity's `actFor`. */
function targetTenantPrincipals(ctx: Context): TargetTenantPrincipals {
  const identity = createAccessIdentity({
    operations: identityOfCall(ctx),
    governance: governanceOfCall(ctx),
    issuer: ctx.principalIssuer,
  })
  return {
    async actingFor(login, tenant) {
      const issued = await identity.actFor(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
    async resume(tenant, login) {
      const issued = identity.resume(tenant, login)
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

/** A time of the session list as the wire writes it; `null` stays `null`, bad text is `undefined`. */
function instantOf(text: string | null): SessionListEntry['createdAt'] | undefined {
  if (text === null) return null
  const parsed = parseInstant(text)
  return parsed.ok ? parsed.value : undefined
}

/** One row of the list as the port says it; `undefined` when a time text is no instant. */
function entryOf(item: SessionListItem): SessionListEntry | undefined {
  const createdAt = instantOf(item.createdAt)
  const lastActivityAt = instantOf(item.lastActivityAt)
  if (createdAt === undefined || lastActivityAt === undefined) return undefined
  return {
    session: item.session,
    createdAt,
    lastActivityAt,
    lifecycle: item.lifecycle,
    title: item.title,
  }
}

/** `SessionListing` over the session list face of Session. */
export function sessionListingOf(directory: SessionDirectory<Principal>): SessionListing {
  return {
    async list(input) {
      const result = await directory.list(input)
      if ('failure' in result) {
        const { kind } = result.failure
        return { refused: kind === 'invalid' || kind === 'denied' ? kind : 'basis-unavailable' }
      }
      const items: SessionListEntry[] = []
      for (const item of result.ok.items) {
        const entry = entryOf(item)
        if (entry === undefined) return { refused: 'basis-unavailable' }
        items.push(entry)
      }
      return { ok: { items, next: result.ok.next, completeness: result.ok.completeness } }
    },
  }
}

function definitionsOf(ctx: Context) {
  const mappings = ctx.get(definitionMappingsKey)
  return mappings === undefined ? undefined : definitionResolverOf(mappings)
}

function prepareCreation(input: SessionCreateInput): SessionCreateInput {
  const { initialization } = modesInitialization(input as unknown as ModesCreation)
  return { ...input, creation: { ...input.creation, initialization } }
}

const plugin = createSessionAccessPlugin({
  journal: (config: z.infer<typeof sessionAccessConfig>) =>
    openRequestJournal(config.requestJournalFile),
  principals: targetTenantPrincipals,
  facts: principalFacts,
  definitions: definitionsOf,
  listing: sessionListingOf,
  prepareCreation,
})

export const sessionAccessRow = defineRow({
  row: 'session-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...plugin,
    inject: [accessRegistryKey, principalIssuerKey],
    Config: sessionAccessConfig,
  },
})
