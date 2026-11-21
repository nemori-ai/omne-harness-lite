import { acceptedDispatch } from '@omne-harness/dispatch/testing'
import type { Dispatch } from '@omne-harness/dispatch-contract'
import type {
  Adoption,
  ToolCallId,
  ToolOperationId,
  ToolWaitId,
  WaitRecord,
} from '@omne-harness/tool-contract'
import type { ToolRecovery, ToolTask } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { dispatchReportWait } from '../src/index.ts'

export const WAIT = 'op-c1/start/wait' as ToolWaitId
export const CALL = 'call-1' as ToolCallId
export const ACCESS = {
  principal: 'driver',
  tenant: testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
  call: CALL,
}
export const operation = (text: string) => text as ToolOperationId
export const evidence = (record: string) => ({
  owner: 'test-owner',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

export const accepted = acceptedDispatch(1)
export const reported: Dispatch = {
  ...accepted,
  state: 'reported',
  report: { text: 'the work is done', origin: 'report' },
  delivery: { kind: 'pending' },
}

type Phase = 'open' | 'responding' | 'continued' | 'cancelled' | 'terminal'

export function waitRecord(
  phase: Phase,
  contract: Adoption = dispatchReportWait.adoption,
  wait: ToolWaitId = WAIT,
): WaitRecord {
  const intent = { kind: 'ask', wait, schemas: { contract } }
  if (phase === 'open' || phase === 'responding') return { phase, intent } as never
  return { phase: 'closed', cause: phase, intent, evidence: evidence('closed') } as never
}

export type Facts = Pick<ToolRecovery, 'waits' | 'waitRequest' | 'tasks'>

export function facts(change: Partial<Facts> = {}): Facts {
  return {
    waits: [waitRecord('open')],
    waitRequest: { wait: WAIT, request: JSON.stringify({ dispatch: accepted.id }) },
    tasks: [],
    ...change,
  }
}

export function duty(text: string, action: 'ensure' | 'invalidate'): ToolTask {
  return {
    kind: 'wait-registration',
    operation: operation(text),
    wait: WAIT,
    action,
    evidence: evidence('terminal'),
  } as never
}
