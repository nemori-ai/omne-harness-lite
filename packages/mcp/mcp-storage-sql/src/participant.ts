import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { loadCatalog, saveCatalog, type SqlPort } from './rows.ts'
import { PARTICIPANT, PROTOCOL, SCRIPTS, type CatalogRowKey, type ScriptName } from './schema.ts'

type WriteCatalog = Readonly<{
  key: CatalogRowKey
  revision: number
  record: JsonValue
  expected: number | 'absent'
}>

/** The commands come from this member's own store, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (port: SqlPort, command: never) => unknown> = {
  // Written whole, only at the expected revision.
  writeCatalog(port, input: WriteCatalog) {
    const current = loadCatalog(port, input.key)?.revision ?? 'absent'
    if (current !== input.expected) return { failure: 'revision-conflict' }
    saveCatalog(port, input.key, input.revision, input.record)
    return { ok: 'written' }
  },
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script'] as ScriptName
    if (!SCRIPTS.includes(script)) return { kind: 'failed', diagnostic: 'unknown_mcp_script' }
    return {
      kind: 'participated',
      response: RUN[script](port, facts['command'] as never) as JsonValue,
    }
  },
} satisfies ParticipantModule
