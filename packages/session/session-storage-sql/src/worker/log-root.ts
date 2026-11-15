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

export function logRoot(
  port: Executor,
  tenant: string,
  session: string,
  revision: string,
  upto?: bigint,
): LogRoot {
  const head =
    upto === undefined
      ? oneRow(
          port,
          'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
          [tenant, session],
        )
      : oneRow(
          port,
          'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ? AND position <= ? LIMIT 1',
          [tenant, session, upto],
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
