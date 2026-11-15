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

const LOGIN_WORK_OWNER = 'identity-login'

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

export const principalFacts: PrincipalFacts = {
  describe(principal: Principal) {
    const acting = principal as unknown as Partial<ActingForTenantPrincipal>
    if (acting.kind !== 'acting-for-tenant' || acting.work?.owner !== LOGIN_WORK_OWNER)
      return undefined
    if (acting.tenant === undefined) return undefined
    return { tenant: acting.tenant, account: acting.tenant.account.text, login: acting.work.work }
  },
}

function instantOf(text: string | null): SessionListEntry['createdAt'] | undefined {
  if (text === null) return null
  const parsed = parseInstant(text)
  return parsed.ok ? parsed.value : undefined
}

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
