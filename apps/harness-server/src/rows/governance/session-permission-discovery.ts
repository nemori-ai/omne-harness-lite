import { z } from 'zod'
import {
  recheckSessionPermissionLogin,
  type SessionPermissionLogin,
} from '../authorization/session-permission-write.ts'
import { canonicalText } from '@omne-harness/authorization'
import {
  GovernanceDefinitionRefSchema,
  type GovernanceCatalogRequest,
  type GovernanceCatalogPage,
  type GovernanceFailure,
  type GovernanceScope,
  type GovernanceDefinitionBundle,
} from '@omne-harness/governance-contract'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import type {
  GovernanceExternalWriteOptions,
  GovernanceExternalWriteIntent,
} from '@omne-harness/governance-local'
import type { SessionPermissionWriteContext } from './session-permission-commit.ts'
import {
  sessionPermissionMappedSourceSchema,
  type SessionPermissionSettingsResolver,
} from './session-permission-settings.ts'
import { SESSION_PERMISSION_WRITE_PROTOCOL } from './session-permission-result.ts'
import { PermissionRuleSchema } from '@omne-harness/permissions'
import {
  sessionPermissionQualificationSchema,
  type SessionPermissionQualification,
} from './session-permission-qualification.ts'

export const sessionPermissionResolvedQualificationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('clear'),
    original: sessionPermissionQualificationSchema.extend({
      change: sessionPermissionQualificationSchema.shape.change.extend({ rule: z.null() }),
    }),
  }),
  z.strictObject({
    kind: z.literal('set'),
    original: sessionPermissionQualificationSchema.extend({
      change: sessionPermissionQualificationSchema.shape.change.extend({
        rule: PermissionRuleSchema,
      }),
    }),
    definition: GovernanceDefinitionRefSchema,
    settings: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('unmapped') }),
      sessionPermissionMappedSourceSchema,
    ]),
  }),
])
export type SessionPermissionCatalogReader = (
  request: GovernanceCatalogRequest,
) => Promise<GovernanceCatalogPage | GovernanceFailure>
export type SessionPermissionDiscovery =
  | Readonly<{ kind: 'found'; declaration: GovernanceDefinitionBundle }>
  | Readonly<{ kind: 'unavailable' }>

function matchingPermissions(
  declaration: GovernanceDefinitionBundle,
  change: SessionPermissionQualification['change'],
) {
  return declaration.permissions.filter(
    permission =>
      canonicalText(permission.reference) === canonicalText(change.definition) &&
      permission.capabilityId === change.capabilityId &&
      permission.enforcementKey === change.enforcementKey,
  )
}

function sameCatalog(page: GovernanceCatalogPage, scope: GovernanceScope, snapshot: string | null) {
  return (
    page.completeness === 'complete' &&
    canonicalText(page.snapshot.scope) === canonicalText(scope) &&
    (snapshot === null || snapshot === canonicalText(page.snapshot))
  )
}

async function readCatalogItems(
  scope: GovernanceScope,
  readCatalog: SessionPermissionCatalogReader,
) {
  let cursor: string | null = null
  let snapshot: string | null = null
  const cursors = new Set<string>()
  const items: GovernanceCatalogPage['items'][number][] = []
  for (let pages = 0; pages < 128; pages++) {
    const page = await readCatalog({ scope, mode: 'management', targets: [], limit: 100, cursor })
    if (page.kind !== 'page') return undefined
    if (!sameCatalog(page, scope, snapshot)) return undefined
    snapshot = canonicalText(page.snapshot)
    items.push(...structuredClone(page.items))
    if (items.length > 128) return undefined
    if (page.nextCursor === null) return items
    if (page.items.length === 0 || cursors.has(page.nextCursor)) return undefined
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }
  return undefined
}

function selectDeclaration(
  items: GovernanceCatalogPage['items'],
  change: SessionPermissionQualification['change'],
): SessionPermissionDiscovery {
  let found: GovernanceDefinitionBundle | undefined
  for (const item of items) {
    const count = matchingPermissions(item.declaration, change).length
    if (count === 0) continue
    if (count !== 1 || found !== undefined || item.availability !== 'available')
      return { kind: 'unavailable' }
    found = item.declaration
  }
  return found === undefined ? { kind: 'unavailable' } : { kind: 'found', declaration: found }
}

export async function discoverSessionPermissionDeclaration(input: {
  scope: GovernanceScope
  change: SessionPermissionQualification['change']
  readCatalog: SessionPermissionCatalogReader
}): Promise<SessionPermissionDiscovery> {
  const { scope, change } = structuredClone({ scope: input.scope, change: input.change })
  try {
    const items = await readCatalogItems(scope, input.readCatalog)
    return items === undefined ? { kind: 'unavailable' } : selectDeclaration(items, change)
  } catch {
    return { kind: 'unavailable' }
  }
}

async function settingsForAssignment(
  scope: GovernanceScope,
  declaration: GovernanceDefinitionBundle,
  original: SessionPermissionQualification,
  resolve: SessionPermissionSettingsResolver | undefined,
) {
  const permission = matchingPermissions(declaration, original.change)[0]
  if (permission === undefined) return undefined
  if (permission.settings === null) return { kind: 'unmapped' as const }
  return resolve?.({ scope, declaration, permission })
}

function matchesWriteIntent(
  original: SessionPermissionQualification,
  principal: ActingForTenantPrincipal,
  scope: GovernanceScope,
  intent: GovernanceExternalWriteIntent,
): boolean {
  const expected = {
    operationId: original.operation,
    write: {
      owner: 'session',
      protocol: SESSION_PERMISSION_WRITE_PROTOCOL,
      targetRef: original.session,
      commandDigest: original.commandDigest,
      command: original.commandFacts.facts['command'],
    },
  }
  return (
    standingPrincipalRef(principal) === original.principalRef &&
    scope.tenantRef === original.tenantRef &&
    canonicalText(intent) === canonicalText(expected)
  )
}

export function createSessionPermissionWriteResolver(options: {
  scope: GovernanceScope
  login?: () => SessionPermissionLogin | undefined
  settings?: SessionPermissionSettingsResolver
  readCatalog: SessionPermissionCatalogReader
}): GovernanceExternalWriteOptions<SessionPermissionWriteContext>['resolve'] {
  const scope = structuredClone(options.scope)
  return async (principal, intent, context) => {
    const original = sessionPermissionQualificationSchema.parse(context.qualification)
    if (principal !== context.principal || !matchesWriteIntent(original, principal, scope, intent))
      return { kind: 'denied' }
    const login = await recheckSessionPermissionLogin(principal, options.login?.())
    if (login.kind !== 'current')
      return login.kind === 'denied'
        ? login
        : { kind: 'unavailable', owner: 'harness.session-permission-login' }
    if (original.change.rule === null)
      return {
        kind: 'qualified',
        required: [],
        source: null,
        qualification: sessionPermissionResolvedQualificationSchema.parse({
          kind: 'clear',
          original,
        }),
      }
    const found = await discoverSessionPermissionDeclaration({
      scope,
      change: original.change,
      readCatalog: options.readCatalog,
    })
    if (found.kind !== 'found')
      return { kind: 'unavailable', owner: 'harness.session-permission-source' }
    const settings = await settingsForAssignment(
      scope,
      found.declaration,
      original,
      options.settings,
    )
    if (settings === undefined)
      return { kind: 'unavailable', owner: 'harness.session-permission-settings-source' }
    return {
      kind: 'qualified',
      required: [],
      source: settings.kind === 'mapped' ? settings.source : null,
      qualification: sessionPermissionResolvedQualificationSchema.parse({
        kind: 'set',
        original,
        definition: found.declaration.reference,
        settings,
      }),
    }
  }
}
