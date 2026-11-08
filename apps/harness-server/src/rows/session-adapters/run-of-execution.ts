// The Run that an Agent execution belongs to, for the application rows that implement an Agent port
// whose input names an execution but no session (`agent-model-selection`, and `session-conditions`
// next). It follows the binding that `session-handoff` uses (session-adapters `message-handoff.ts`,
// `sessionOfExecution` and `runHolds`):
// 1. the tenant's transaction domain, by the trusted `tenantDomainLookup`;
// 2. the session of the execution, by the execution index of that tenant (the `session.execution`
//    read of the session log, through the trusted `storage`). The index is keyed by the tenant, so
//    an execution of another tenant is never found here;
// 3. the Session snapshot of that session, read through the `readWork` the caller gives. Session
//    authorizes this read, so a principal that may not read the session gets Session's `denied`;
// 4. the active Run of the snapshot must be the Run of the index row and must hold the execution.
//
// Every miss is a failure in the Agent's words, with a diagnostic, and nothing is guessed: no index
// row is `unavailable`, never another session; a Run that has ended is `terminal`; a Run that holds
// another execution is `denied`. The function holds no state. The caller resolves the services on
// each call, so an absent service is `unavailable` of that call.
import { randomUUID } from 'node:crypto'
import type { Failure } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { RunId, SessionFailure, SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import {
  SESSION_EXECUTION_HANDLER,
  SESSION_READ_PROTOCOL,
  decodeSessionExecution,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'

/** What one location needs. `undefined` means the service is not visible to the row now. */
export type RunOfExecutionPorts = Readonly<{
  storage: SqlStorage | undefined
  tenantDomainLookup: TenantDomainLookup | undefined
  /**
   * The snapshot of one session of the tenant, read with the principal and caller class that the
   * caller chose. `undefined` means the Session service is not available.
   */
  readWork(session: SessionId): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
}>

export type RunOfExecutionInput = Readonly<{
  tenant: TenantId
  execution: string
  /** The action that a refusal names, as the port of the caller calls it. */
  action: string
  /** The owner that an `unavailable` names. */
  owner: string
}>

/** The located Run: its session, its id and the snapshot whose active Run holds the execution. */
export type RunOfExecution = Readonly<{
  session: SessionId
  run: RunId
  snapshot: WorkSnapshot
}>

export async function runOfExecution(
  ports: RunOfExecutionPorts,
  input: RunOfExecutionInput,
): Promise<Outcome<RunOfExecution, Failure>> {
  const unavailable = (diagnostic: string): Outcome<never, Failure> =>
    fail({ kind: 'unavailable', owner: input.owner, diagnostic })

  const tenantText = tenantCodec.encode(input.tenant)
  if (!tenantText.ok) return fail({ kind: 'denied', action: input.action })
  const { storage, tenantDomainLookup } = ports
  if (tenantDomainLookup === undefined)
    return unavailable('the tenant domain lookup is not visible to this row')
  if (storage === undefined) return unavailable('the storage is not visible to this row')

  const domain = await tenantDomainLookup.lookup({ tenant: tenantText.value })
  if (domain.kind === 'unregistered') return unavailable('the tenant has no transaction domain')
  if (domain.kind !== 'ready')
    return unavailable(`the tenant domain cannot be read (${domain.diagnostic})`)

  const read = await storage.read({
    domain: domain.domain,
    handler: SESSION_EXECUTION_HANDLER,
    protocol: SESSION_READ_PROTOCOL,
    requestKey: randomUUID(),
    input: { tenant: tenantText.value, execution: input.execution },
  })
  if (read.kind !== 'read')
    return unavailable(
      `the execution index is not readable (${read.kind === 'unavailable' ? read.reason : read.kind})`,
    )
  const indexed = decodeSessionExecution(read.output)
  if (indexed === 'malformed') return unavailable('the execution index row is malformed')
  if (indexed === null)
    return unavailable('the execution is not in the execution index of the tenant')
  const session = indexed.session as SessionId

  const reading = ports.readWork(session)
  if (reading === undefined) return unavailable('the session service is not available')
  const work = await reading
  if ('failure' in work) {
    const failure = work.failure
    if (failure.kind === 'denied') return fail({ kind: 'denied', action: failure.action })
    if (failure.kind === 'invalid')
      return fail({ kind: 'invalid', field: failure.field, reason: failure.reason })
    return unavailable(`the Session snapshot cannot be read (${failure.kind})`)
  }

  const run = work.ok.run
  if (run.kind === 'terminal' && run.terminal.run === indexed.run) return fail({ kind: 'terminal' })
  if (
    run.kind !== 'active' ||
    run.run !== indexed.run ||
    run.execution.execution !== input.execution
  )
    return fail({ kind: 'denied', action: input.action })
  return succeed({ session, run: run.run, snapshot: work.ok })
}
