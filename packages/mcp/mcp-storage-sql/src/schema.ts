export const PARTICIPANT = 'mcp.store'
export const PROTOCOL = 'mcp-store/1'
export const HANDLER = 'mcp.store.read'
export const MIGRATION = { owner: PARTICIPANT, id: 'mcp-1' }
export const TABLES = ['mcp_catalogs', 'mcp_continuations', 'mcp_tasks']
export const GRANT_MIGRATION = { owner: PARTICIPANT, id: 'mcp-2' }
export const GRANT_TABLES = ['mcp_pending', 'mcp_grants', 'mcp_clients']
export const SUBSCRIPTION_MIGRATION = { owner: PARTICIPANT, id: 'mcp-3' }
export const SUBSCRIPTION_TABLES = ['mcp_subscriptions', 'mcp_occurrences']
export const OWNED_TABLES = [...TABLES, ...GRANT_TABLES, ...SUBSCRIPTION_TABLES]

/** What a catalog row holds: one kind of the peer's directory. */
export const CATALOG_KINDS = ['actions', 'events', 'skills'] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

export const SCRIPTS = [
  'writeCatalog',
  'markContinuation',
  'recordTask',
  'moveTask',
  'beginPending',
  'takePending',
  'voidPending',
  'writeGrant',
  'removeGrant',
  'register',
  'forgetHolding',
  'writeSubscription',
  'removeSubscription',
  'receiveEvents',
  'endSubscription',
  'acknowledgeEvents',
] as const
export type ScriptName = (typeof SCRIPTS)[number]

export const READS = [
  'readCatalog',
  'readTask',
  'followingTasks',
  'readGrant',
  'readClient',
  'keptHoldings',
  'listSubscriptions',
  'readSubscription',
  'readOccurrences',
] as const
export type ReadName = (typeof READS)[number]

/** The key of one catalog row; the tenant is a column of every row and of every read. */
export type CatalogRowKey = Readonly<{
  tenant: string
  account: string
  holding: string
  kind: CatalogKind
}>

/** The key of one task row; the account is a column too, so one task on two accounts is two rows. */
export type TaskRowCells = Readonly<{
  tenant: string
  principal: string
  holding: string
  task: string
}>
