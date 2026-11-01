// The manifest digest test vector of SPEC.md section 4.4. The catalog has no number, so the vector
// does not cover the RFC 8785 number form (the digest tests add that case).
import type { SqlMaterialCatalog } from '../types.ts'

export const MANIFEST_VECTOR_PARTICIPANTS = ['agent-journal', 'session'] as const

export const MANIFEST_VECTOR_DIGEST =
  'b8cb9846fa33866cea139ff67980096603ec26d41473dbed29e1a5784329e1dd'

export const MANIFEST_VECTOR_CATALOG: SqlMaterialCatalog = {
  catalogProtocol: 'sql-catalog/1',
  participants: [
    {
      participant: 'session',
      protocol: '1',
      moduleUrl: 'file:///app/dist/session-participant.js',
      codeDigest: 'b'.repeat(64),
      ownedTables: ['sl_state', 'sl_entry'],
      readTables: [],
      requiresFacts: [],
      providesFacts: [{ key: 'session.revision', protocol: '1' }],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    {
      participant: 'agent-journal',
      protocol: '1',
      moduleUrl: 'file:///app/dist/journal-participant.js',
      codeDigest: 'a'.repeat(64),
      ownedTables: ['aj_operation', 'aj_entry'],
      readTables: ['sl_state'],
      requiresFacts: [{ key: 'session.revision', protocol: '1' }],
      providesFacts: [],
      allowedFunctions: [],
      grouping: 'groupable',
    },
  ],
  migrations: [
    {
      owner: 'session',
      id: '0001-base',
      moduleUrl: 'file:///app/dist/m-session-0001.js',
      checksum: 'c'.repeat(64),
      requires: [],
    },
    {
      owner: 'agent-journal',
      id: '0001-base',
      moduleUrl: 'file:///app/dist/m-journal-0001.js',
      checksum: 'd'.repeat(64),
      requires: [{ owner: 'session', id: '0001-base' }],
    },
  ],
  readHandlers: [],
  declaredCombinations: { tenant: null, system: null },
}
