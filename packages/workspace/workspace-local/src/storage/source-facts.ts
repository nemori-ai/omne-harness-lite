import type {
  AdoptionRecord,
  ReadingRecord,
  StoredAdoption,
  WorkspaceTxn,
} from '@omne-harness/workspace'
import type { InstanceId, SourcePackage } from '@omne-harness/workspace-contract'
import type { QueryRows } from '@omne-harness/sql-contract/worker'
import { count, select, text, type SqlPort } from './sql-port.ts'
import { ADOPTIONS_TABLE, READINGS_TABLE } from './schema.ts'

type Row = QueryRows['rows'][number]
type SourceFacts = Pick<
  WorkspaceTxn,
  'latestReading' | 'reading' | 'insertReading' | 'adoption' | 'insertAdoption'
>

const READING = `SELECT workspace, tenant, revision, instance, packages FROM ${READINGS_TABLE}`
const ADOPTION = `SELECT workspace, tenant, key, instance, revision, fresh, reason FROM ${ADOPTIONS_TABLE}`

const readingOf = (row: Row): ReadingRecord => ({
  workspace: text(row[0]),
  tenant: text(row[1]),
  revision: count(row[2]),
  instance: text(row[3]) as InstanceId,
  packages: JSON.parse(text(row[4])) as SourcePackage[],
})

const adoptionOf = (row: Row): AdoptionRecord => ({
  workspace: text(row[0]),
  tenant: text(row[1]),
  key: text(row[2]),
  instance: text(row[3]) as InstanceId,
  revision: count(row[4]),
  fresh: count(row[5]) === 1,
  reason: row[6] === null ? null : text(row[6]),
})

const first = <T>(rows: QueryRows['rows'], read: (row: Row) => T): T | null =>
  rows[0] === undefined ? null : read(rows[0])

/** The readings and adoptions of the transaction: point lookups and inserts, no scans. */
export function sourceFacts(port: SqlPort): SourceFacts {
  return {
    latestReading: (workspace, tenant) =>
      first(
        port.execute(
          `${READING} WHERE workspace = ? AND tenant = ? ORDER BY revision DESC LIMIT 1`,
          [workspace, tenant],
        ).rows,
        readingOf,
      ),
    reading: (workspace, tenant, revision) =>
      first(
        select(port, `${READING} WHERE workspace = ? AND tenant = ? AND revision = ?`, [
          workspace,
          tenant,
          revision,
        ]),
        readingOf,
      ),
    insertReading: ({ workspace, tenant, revision, instance, packages }) =>
      void port.execute(
        `INSERT INTO ${READINGS_TABLE} (workspace, tenant, revision, instance, packages) VALUES (?, ?, ?, ?, ?)`,
        [workspace, tenant, revision, instance, JSON.stringify(packages)],
      ),
    adoption: (tenant, key) =>
      first(select(port, `${ADOPTION} WHERE tenant = ? AND key = ?`, [tenant, key]), adoptionOf),
    insertAdoption: ({ workspace, tenant, key, instance, revision, fresh, reason }) =>
      void port.execute(
        `INSERT INTO ${ADOPTIONS_TABLE} (workspace, tenant, key, instance, revision, fresh, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [workspace, tenant, key, instance, revision, fresh ? 1 : 0, reason],
      ),
  }
}

/** An adoption of a key and the reading it points at, for the read handler. */
export function storedAdoption(port: SqlPort, tenant: string, key: string): StoredAdoption | null {
  const facts = sourceFacts(port)
  const adoption = facts.adoption(tenant, key)
  if (adoption === null) return null
  const { workspace, revision } = adoption
  const reading = revision === 0 ? null : facts.reading(workspace, tenant, revision)
  return { adoption, reading }
}
