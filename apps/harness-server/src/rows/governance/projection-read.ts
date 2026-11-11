// A projection read runs a list of read-only participant commands on one read connection, in one
// snapshot, and answers the response of the last command. A commit can run the same commands in
// its transaction. So one set of participant modules computes a result for a check and for the
// condition of a later commit.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  DomainRef,
  FactCommandV2,
  JsonValue,
  SqlMaterialCatalog,
  SqlStorage,
} from '@omne-harness/sql-contract'

export type ProjectionRead = Readonly<{ handler: string; protocol: string }>

type Participant = SqlMaterialCatalog['participants'][number]

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_ROWS_READ = 4096

/**
 * Builds the read handler for `members`. It reads the tables that the members declare, and it
 * requires the migrations of the participants that own those tables. `owners` is the catalog
 * that holds those owners and their migrations.
 */
export function projectionReadHandler(
  name: string,
  members: readonly Participant[],
  owners: Pick<SqlMaterialCatalog, 'participants' | 'migrations'>,
): SqlMaterialCatalog['readHandlers'][number] {
  const tables = new Set(members.flatMap(member => [...member.readTables, ...member.ownedTables]))
  const owning = new Set(
    owners.participants
      .filter(participant => participant.ownedTables.some(table => tables.has(table)))
      .map(participant => participant.participant),
  )
  const loaded = members.map(({ participant, moduleUrl, codeDigest }) => ({
    participant,
    moduleUrl,
    codeDigest,
  }))
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./projection-read-handler.${extension}`, import.meta.url)
  const protocol = `harness-projection-read/1/${canonicalDigest(loaded).slice(7)}`
  const url = new URL(file)
  url.searchParams.set('handler', name)
  url.searchParams.set('protocol', protocol)
  url.searchParams.set('members', JSON.stringify(loaded))
  return {
    handler: name,
    protocol,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ordering: 'snapshot',
    readTables: [...tables].toSorted(),
    requiresMigrations: owners.migrations
      .filter(migration => owning.has(migration.owner))
      .map(({ owner, id }) => ({ owner, id })),
    maxOutputBytes: MAX_OUTPUT_BYTES,
    maxRowsRead: MAX_ROWS_READ,
  }
}

const outputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed'), response: z.json() }),
  z.strictObject({ kind: z.literal('stopped'), participant: z.string(), reply: z.json() }),
])

export type ProjectionReadResult =
  | Readonly<{ kind: 'completed'; response: JsonValue }>
  /** A member did not participate. The read gives no result; it never means an empty result. */
  | Readonly<{ kind: 'stopped'; participant: string; reply: JsonValue }>
  | Readonly<{ kind: 'unavailable' }>

export async function readProjection(
  storage: Pick<SqlStorage, 'read'>,
  domain: DomainRef,
  handler: ProjectionRead,
  commands: readonly FactCommandV2[],
): Promise<ProjectionReadResult> {
  const read = await storage.read({
    domain,
    handler: handler.handler,
    protocol: handler.protocol,
    requestKey: randomUUID(),
    input: { commands: z.json().parse(commands) },
  })
  if (read.kind !== 'read') return { kind: 'unavailable' }
  const output = outputSchema.safeParse(read.output)
  return output.success ? output.data : { kind: 'unavailable' }
}
