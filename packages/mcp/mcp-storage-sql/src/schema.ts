export const PARTICIPANT = 'mcp.store'
export const PROTOCOL = 'mcp-store/1'
export const HANDLER = 'mcp.store.read'
export const MIGRATION = { owner: PARTICIPANT, id: 'mcp-1' }
export const TABLES = ['mcp_catalogs']

/** What a catalog row holds: one kind of the peer's directory. */
export const CATALOG_KINDS = ['actions'] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

export const SCRIPTS = ['writeCatalog'] as const
export type ScriptName = (typeof SCRIPTS)[number]

export const READS = ['readCatalog'] as const
export type ReadName = (typeof READS)[number]

/** The key of one catalog row; the tenant is a column of every row and of every read. */
export type CatalogRowKey = Readonly<{
  tenant: string
  account: string
  holding: string
  kind: CatalogKind
}>
