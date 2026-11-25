import type { AgentProvider } from '@omne-harness/agent'
import type {
  Access,
  AgentAccessOperation,
  AgentAccessTarget,
  AgentExecutionRecovery,
  AgentInstanceId,
  AgentJournal,
  DurableEvidence,
  Failure,
  Reply,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'

type Contact = Extract<
  Awaited<ReturnType<AgentExecutionRecovery<unknown>['contact']>>,
  { ok: unknown }
>['ok']

/** What the recovery entry of a host needs: the checked call into the Journal and the runtimes it holds. */
export type RecoveryEntryInput = Readonly<{
  through: <T>(
    request: Access<unknown>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
    call: () => Reply<T>,
  ) => Reply<T>
  qualify(
    access: Access<unknown>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
  ): Promise<Failure | undefined>
  live(tenant: TenantId, instance: AgentInstanceId): AgentProvider<unknown> | null
  journal: AgentJournal<unknown>
  lostContact: ((instance: AgentInstanceId) => DurableEvidence | null) | undefined
  unavailable(diagnostic: string): Failure
}>

/** The recovery entry of a host: Journal reads, a detach that takes over a live runtime only when allowed, a handover asked of the runtime that holds the attachment. */
export function recoveryEntry(input: RecoveryEntryInput): AgentExecutionRecovery<unknown> {
  const { through, qualify, live, journal } = input
  const on = (execution: Parameters<AgentJournal<unknown>['load']>[0]['execution']) =>
    ({ kind: 'execution', execution }) as const
  return {
    query: request =>
      through(request, 'query', on(request.execution), () => journal.query(request)),
    load: request => through(request, 'load', on(request.execution), () => journal.load(request)),
    reconcile: request =>
      through(request, 'reconcile', on(request.execution), async () =>
        fail(
          input.unavailable(
            'reconcile through the recovery entry is not implemented yet (#502 stage 5)',
          ),
        ),
      ),
    detach: request =>
      through(request, 'detach', on(request.execution), async () => {
        if (live(request.tenant, request.authority.instance) !== null) {
          const refused = await qualify(request, 'takeover', on(request.execution))
          if (refused !== undefined) return fail(refused)
        }
        return journal.detach(request)
      }),
    handOver: request =>
      through(request, 'detach', on(request.execution), async () => {
        const runtime = live(request.tenant, request.authority.instance)
        if (runtime === null)
          return fail(input.unavailable('no runtime here holds the attachment to hand over'))
        return runtime.control.handOver(request)
      }),
    contact: request =>
      through<Contact>(request, 'load', on(request.execution), async () => {
        const { instance } = request.authority
        if (live(request.tenant, instance) !== null) return succeed({ kind: 'live' })
        const evidence = input.lostContact?.(instance) ?? null
        return succeed(evidence === null ? { kind: 'unknown' } : { kind: 'lost', evidence })
      }),
  }
}
