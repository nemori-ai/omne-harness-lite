import { canonicalText } from '@omne-harness/authorization'
import type {
  GovernanceCatalogRequest,
  GovernanceCatalogPage,
  GovernanceFailure,
  GovernanceScope,
  GovernanceDefinitionBundle,
} from '@omne-harness/governance-contract'
import type { SessionPermissionAssignment } from './session-permission-material.ts'

export type SessionPermissionCatalogReader = (
  request: GovernanceCatalogRequest,
) => Promise<GovernanceCatalogPage | GovernanceFailure>
export type SessionPermissionDiscovery =
  | Readonly<{ kind: 'found'; declaration: GovernanceDefinitionBundle }>
  | Readonly<{ kind: 'unavailable' }>

export function matchingPermissions(
  declaration: GovernanceDefinitionBundle,
  change: SessionPermissionAssignment,
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
  change: SessionPermissionAssignment,
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
  change: SessionPermissionAssignment
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
