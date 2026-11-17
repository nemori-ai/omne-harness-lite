import type { Authority, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import {
  SESSION_CURRENT_ADVANCE_HANDLER,
  SESSION_READ_PROTOCOL,
  decodeSessionCurrentAdvance,
  type SessionCurrentAdvance,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { canonical } from '../testing/canonical.ts'
import { attachmentOf, type GrantedAttachment } from './attempt-grant.ts'
import { readOutput, type Scope } from './journal-read.ts'
import type { GrantIdentity } from '../testing/session-sources.ts'

export function grantIdentityOf(current: SessionCurrentAdvance): GrantIdentity {
  // The Session-owned reader validates this original identity; Session identities are opaque strings.
  return {
    execution: current.execution,
    attempt: current.attempt as GrantIdentity['attempt'],
    grant: current.grant,
  }
}

export async function readCurrentAdvance(
  storage: SqlStorage,
  domain: DomainRef,
  scope: Scope,
): Promise<Outcome<SessionCurrentAdvance | null, Failure>> {
  const unavailable = (diagnostic: string) =>
    fail<Failure>({ kind: 'unavailable', owner: 'session-history', diagnostic })
  const read = await readOutput(storage, {
    domain,
    handler: SESSION_CURRENT_ADVANCE_HANDLER,
    protocol: SESSION_READ_PROTOCOL,
    input: scope,
  })
  if (read.kind === 'unread') return unavailable(`current advance: ${read.reason}`)
  try {
    const value = decodeSessionCurrentAdvance(read.output)
    if (value.kind === 'behind')
      return unavailable('current advance does not cover the Session tail')
    return succeed(value.kind === 'advance' ? value.value : null)
  } catch {
    return unavailable('the current advance does not decode')
  }
}

export function currentAdvanceOf(snapshot: WorkSnapshot | null): SessionCurrentAdvance | null {
  if (snapshot?.run.kind !== 'active' || snapshot.run.advance === null) return null
  const { run } = snapshot
  const original = snapshot.historyIndex?.attempts.find(
    item => item.execution === run.execution.execution && item.attempt === run.advance?.attempt,
  )
  return original?.grant === undefined
    ? null
    : {
        execution: run.execution.execution,
        attempt: original.attempt,
        grant: original.grant,
      }
}

export function holdsCurrentAdvance(
  current: SessionCurrentAdvance | null,
  attachments: readonly GrantedAttachment[],
  authority: Authority,
): boolean {
  if (current === null || current.execution !== authority.execution) return false
  const original = attachmentOf(attachments, authority)
  return original?.grant != null && canonical(original.grant) === canonical(current.grant)
}
