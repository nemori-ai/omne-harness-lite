export const PARTICIPANT = 'workspace.persistence'
export const PROTOCOL = 'workspace-persistence/1'
export const HANDLER = 'workspace.repository'
export const MIGRATION = { owner: PARTICIPANT, id: 'workspace-1' }
export const TABLES = ['ws_workspaces', 'ws_relations', 'ws_instances', 'ws_operations']
export const SOURCES_MIGRATION = { owner: PARTICIPANT, id: 'workspace-2' }
export const SOURCES_TABLE = 'ws_source_revisions'
export const ALL_TABLES = [...TABLES, SOURCES_TABLE]

/** Workspaces belong to no single tenant, so their facts live in one domain of the system scope. */
export const DOMAIN = {
  scope: { kind: 'system' as const },
  transactionDomain: 'system.workspace',
}

/** The most rows one statement may return. More is a failure, never a shorter answer. */
export const ROW_LIMIT = 20_000

export const SCRIPTS = ['register', 'associate', 'dissociate', 'govern', 'destroy'] as const
export type ScriptName = (typeof SCRIPTS)[number]
