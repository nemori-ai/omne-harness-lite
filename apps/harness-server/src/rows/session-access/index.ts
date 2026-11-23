import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  definitionMappingsKey,
  mappedDefinitionFor,
} from '../agent-adoptions/definition-mappings.ts'
import {
  openRequestJournal,
  type DefinitionResolver,
  type ListFilters,
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
  type SessionFailure,
  type SessionId,
  type SessionListFilter,
  type SessionListItem,
  type SessionListPage,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'
import { z } from 'zod'
import {
  contextInitialization,
  type ContextCreation,
} from '../../assembly/session-context-initialization.ts'
import { LOCAL_HISTORY_KINDS } from '../../local/operator-defaults.ts'
import { defineRow } from '../../row.ts'
import { accessIdentityOfCall, memberActingOfCall } from '../server-entry/identity.ts'
import { runFailureCauses } from './causes.ts'
import { modelTargets } from './model-targets.ts'
import { workspaceTargets } from './workspace-targets.ts'
import { workspaceSelections } from './workspace-selections.ts'
import { sessionPermissionModes } from './permission-modes.ts'

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
  const identity = accessIdentityOfCall(ctx)
  const actForMember = memberActingOfCall(ctx, identity)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
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
  const archivedAt = instantOf(item.archivedAt)
  if (createdAt === undefined || lastActivityAt === undefined || archivedAt === undefined)
    return undefined
  const { session, lifecycle, title, archivedBy, relation, root, depth, attendance, definition } =
    item
  return {
    session,
    createdAt,
    lastActivityAt,
    lifecycle,
    title,
    relation: relation.kind,
    parent: relation.kind === 'child' ? relation.parent : null,
    origin: relation.kind === 'handoff' ? relation.origin : null,
    root,
    depth,
    attendance,
    definition,
    archivedAt,
    archivedBy,
  }
}

/** The filters of the protocol as the directory reads them: a null one narrows nothing. */
function filterOf({ relation, parent, attendance, definition }: ListFilters): SessionListFilter {
  return {
    ...(relation === null ? {} : { kind: relation }),
    ...(parent === null ? {} : { parent: parent as SessionId }),
    ...(attendance === null ? {} : { attendance }),
    ...(definition === null ? {} : { definition }),
  }
}

// The archive times are the clock's ISO text in milliseconds, so a bound is put in that form; a
// bound finer than a millisecond is cut to it.
function boundOf(instant: Instant | null): string | null | undefined {
  if (instant === null) return null
  const millis = Date.parse(encodeInstant(instant))
  return Number.isNaN(millis) ? undefined : new Date(millis).toISOString()
}

async function pageOf(
  answer: Promise<Outcome<SessionListPage, SessionFailure>>,
): ReturnType<SessionListing['list']> {
  const result = await answer
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
}

export function sessionListingOf(directory: SessionDirectory<Principal>): SessionListing {
  return {
    list: ({ filter, ...input }) => pageOf(directory.list({ ...input, filter: filterOf(filter) })),
    listArchived: async ({ filter, ...input }) => {
      const from = boundOf(input.from)
      const to = boundOf(input.to)
      if (from === undefined || to === undefined) return { refused: 'invalid' }
      return pageOf(directory.listArchived({ ...input, from, to, filter: filterOf(filter) }))
    },
  }
}

function definitionsOf(ctx: Context): DefinitionResolver | undefined {
  const mappings = ctx.get(definitionMappingsKey)
  if (mappings === undefined) return undefined
  return (name, tenant) => mappedDefinitionFor(mappings, { tenant }, name)
}

function prepareCreation(input: SessionCreateInput): SessionCreateInput {
  const { initialization } = contextInitialization(input as unknown as ContextCreation)
  return { ...input, creation: { ...input.creation, initialization } }
}

const plugin = createSessionAccessPlugin({
  journal: (config: z.infer<typeof sessionAccessConfig>) =>
    openRequestJournal(config.requestJournalFile),
  principals: targetTenantPrincipals,
  facts: principalFacts,
  definitions: definitionsOf,
  listing: sessionListingOf,
  causes: runFailureCauses,
  modelTargets,
  workspaceTargets,
  workspaceSelections,
  permissionModes: sessionPermissionModes,
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
