// The common log root of one session (FR-01): the Session position, the last entry position of the
// Session log, plus the publication count of the Agent records, so a publication of either side
// moves it forward. The participant inside a commit and the root read handler build it with this
// one function, from rows of one transaction or one snapshot.
import type { DurableEvidence } from '@omne-harness/session-contract'
import { canonicalText, sha256 } from '../codec.ts'
import { big, oneRow, type Executor } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'

export type LogRoot = Readonly<{
  position: string
  sessionPosition: string
  published: string
  source: DurableEvidence
}>

/** `revision` is the Session revision the root is read at; the source covers it and both parts. */
export function logRoot(
  port: Executor,
  tenant: string,
  session: string,
  revision: string,
): LogRoot {
  const head = oneRow(
    port,
    'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  const sessionPosition = big(head?.['p'] ?? 0n)
  const published = root === undefined ? 0n : big(root['published'])
  const parts = [tenant, session, String(sessionPosition), String(published), revision]
  return {
    position: String(sessionPosition + published),
    sessionPosition: String(sessionPosition),
    published: String(published),
    source: {
      owner: OWNER,
      record: `${tenant}/${session}/root`,
      revision,
      digest: `sha256:${sha256(canonicalText(parts))}`,
    },
  }
}
