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

export type RunOfExecutionPorts = Readonly<{
  storage: SqlStorage | undefined
  tenantDomainLookup: TenantDomainLookup | undefined
  readWork(session: SessionId): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
}>

export type RunOfExecutionInput = Readonly<{
  tenant: TenantId
  execution: string
  action: string
  owner: string
}>

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
