import type { PortRead } from '@omne-harness/dispatch'
import type { Dispatch, DispatchId } from '@omne-harness/dispatch-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  Reply,
  ToolFailure,
  ToolWaitId,
  WaitRecord,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolDecisionBridge,
  ToolRecovery,
} from '@omne-harness/tool-contract/provider'
import {
  DISPATCH_TOOL_OWNER,
  digestOf,
  dispatchReportWait,
  readReportWaitRequest,
  reportWaitAnswer,
} from './contract.ts'

type Access = CallAccess<unknown>
type Tenant = Access['tenant']
type Facts = Pick<ToolRecovery, 'waits' | 'waitRequest' | 'tasks'>
type Bridge = ToolDecisionBridge<unknown>

export type ReportBridgeInput = Readonly<{
  recoveryOf: (access: Access) => Reply<Facts>
  dispatchOf: (tenant: Tenant, id: DispatchId) => Promise<PortRead<Dispatch | null>>
  /** The wait of this dispatch was closed: an outcome that is there now goes to its second place. */
  waitClosed: (tenant: Tenant, id: DispatchId) => void
}>

const invalid = (field: string, reason: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'invalid', field, reason })
const UNAVAILABLE: Outcome<never, ToolFailure> = fail({
  kind: 'unavailable',
  dependency: DISPATCH_TOOL_OWNER,
  diagnostic: 'the dispatch of the wait cannot be read',
})

const evidence = (record: string, parts: readonly string[]): DurableEvidence => ({
  owner: DISPATCH_TOOL_OWNER,
  record,
  revision: '1',
  digest: digestOf(parts),
})

/** Whether a wait of a call is a report wait: its request contract is the contract of this member. */
export function isReportWait(record: WaitRecord): boolean {
  return record.intent.schemas.contract.digest === dispatchReportWait.adoption.digest
}

function dispatchIdOf(facts: Facts, wait: ToolWaitId): Outcome<DispatchId, ToolFailure> {
  const record = facts.waits.find(item => item.intent.wait === wait)
  if (record === undefined || !isReportWait(record))
    return invalid('wait', 'the wait is not a report wait of a dispatch')
  const kept = facts.waitRequest
  if (kept === null || kept.wait !== wait) return invalid('request', 'the wait request is not kept')
  const id = readReportWaitRequest(kept.request)
  return id === null ? invalid('request', 'the kept request names no dispatch') : succeed(id)
}

const closing = (access: Access, wait: ToolWaitId, terminal: DurableEvidence, cause: string) =>
  evidence(`report-wait-closed/${digestOf([access.call, wait])}`, [
    access.call,
    wait,
    terminal.digest,
    cause,
  ])

export function createReportBridge(input: ReportBridgeInput): Bridge {
  const dispatchFor = async (
    access: Access,
    facts: Facts,
    wait: ToolWaitId,
  ): Promise<Outcome<Dispatch, ToolFailure>> => {
    const id = dispatchIdOf(facts, wait)
    if ('failure' in id) return id
    const read = await input.dispatchOf(access.tenant, id.ok).catch(() => undefined)
    if (read?.kind !== 'read') return UNAVAILABLE
    if (read.value === null) return invalid('request', 'the dispatch of the wait does not exist')
    return read.value.call === access.call
      ? succeed(read.value)
      : invalid('request', 'the dispatch of the wait is not of this call')
  }

  const waited = async (access: Access, wait: ToolWaitId) => {
    const facts = await input.recoveryOf(access)
    return 'failure' in facts ? facts : dispatchFor(access, facts.ok, wait)
  }

  const registration = (access: Access, wait: ToolWaitId, dispatch: Dispatch) =>
    evidence(`report-wait/${dispatch.id}`, [dispatch.id, access.call, wait])

  /** The outcome is there from the commit that ended the dispatch, and does not change after it. */
  const decision = (dispatch: Dispatch) => {
    if (dispatch.delivery === null) return null
    const value = reportWaitAnswer(dispatch)
    return { value, evidence: evidence(`dispatch-outcome/${dispatch.id}`, [JSON.stringify(value)]) }
  }

  const tell = async (access: Access, wait: ToolWaitId): Promise<void> => {
    const facts = await input.recoveryOf(access)
    if ('failure' in facts) return
    const id = dispatchIdOf(facts.ok, wait)
    if ('ok' in id) input.waitClosed(access.tenant, id.ok)
  }

  const recall = async (request: Parameters<Bridge['inspectOperation']>[0], facts: Facts) => {
    const { operation } = request
    const unknown = (diagnostic: string) => ({ kind: 'unknown' as const, operation, diagnostic })
    const task = facts.tasks.find(
      item => item.kind === 'wait-registration' && item.operation === operation,
    )
    if (task?.kind !== 'wait-registration')
      return unknown('no wait duty of the call has the operation')
    if (task.action === 'ensure') {
      const dispatch = await dispatchFor(request, facts, task.wait)
      return 'failure' in dispatch
        ? unknown(`the registration cannot be rebuilt: ${dispatch.failure.kind}`)
        : {
            kind: 'committed' as const,
            operation,
            receipt: registration(request, task.wait, dispatch.ok),
          }
    }
    const closed = facts.waits.find(record => record.intent.wait === task.wait)
    if (closed?.phase !== 'closed' || closed.cause === 'continued')
      return unknown('the wait of the closing is not closed by a control or a terminal')
    const receipt = closing(request, task.wait, task.evidence, closed.cause)
    return { kind: 'committed' as const, operation, receipt }
  }

  return {
    ensure: async request => {
      const dispatch = await waited(request, request.wait)
      return 'failure' in dispatch
        ? dispatch
        : succeed(registration(request, request.wait, dispatch.ok))
    },
    inspect: async request => {
      const dispatch = await waited(request, request.wait)
      if ('failure' in dispatch) return dispatch
      return succeed({
        registration: registration(request, request.wait, dispatch.ok),
        decision: decision(dispatch.ok)?.evidence ?? null,
      })
    },
    resolve: async request => {
      const dispatch = await waited(request, request.wait)
      if ('failure' in dispatch) return dispatch
      const outcome = decision(dispatch.ok)
      return outcome !== null && outcome.evidence.digest === request.decision.digest
        ? succeed({ kind: 'answer', value: outcome.value })
        : invalid('decision', 'the decision is not the outcome of the dispatch of the wait')
    },
    invalidate: async request => {
      await tell(request, request.wait).catch(() => undefined)
      return succeed(closing(request, request.wait, request.terminal, request.cause))
    },
    inspectOperation: async request => {
      const facts = await input.recoveryOf(request)
      if ('ok' in facts) return succeed(await recall(request, facts.ok))
      const diagnostic = `the call cannot be read: ${facts.failure.kind}`
      return succeed({ kind: 'unknown', operation: request.operation, diagnostic })
    },
  }
}
