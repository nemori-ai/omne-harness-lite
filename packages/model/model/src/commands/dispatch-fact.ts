import {
  costLookupOf,
  dispatchSend,
  type Adoption,
  type ContextWindow,
  type DispatchEffort,
  type ModelDispatchFact,
  type Parameter,
  type Termination,
} from '@omne-harness/model-contract'
import { NO_INSTANTS } from './instants.ts'
import type { CallDocument, DispatchDocument } from './types.ts'

/** The fact of a dispatch; the profile and window are null once the call released its request. */
export type DispatchFactDraft = Omit<ModelDispatchFact, 'profile' | 'contextWindow'> &
  Readonly<{ profile: Adoption | null; contextWindow: ContextWindow | null }>

export function dispatchOutcome(terminal: Termination | null): ModelDispatchFact['outcome'] {
  if (terminal === null) return { kind: 'pending' }
  switch (terminal.kind) {
    case 'completed':
      return { kind: 'completed', reason: terminal.reason }
    case 'interrupted':
      return { kind: 'interrupted' }
    case 'failed':
      return {
        kind: 'failed',
        cause: terminal.fault.cause,
        upstreamStatus: terminal.fault.upstreamStatus,
      }
  }
}

function effortOf(parameters: readonly Parameter[]): DispatchEffort {
  const effort = parameters.find(parameter => parameter.kind === 'reasoning-effort')
  if (effort === undefined) return { value: null, basis: 'provider' }
  return { value: effort.value, basis: effort.basis === 'preference' ? 'preference' : 'selection' }
}

const effortField = (request: CallDocument['request']) =>
  request?.kind === 'llm' ? { effort: effortOf(request.parameters) } : {}

export function dispatchFactOf(call: CallDocument, dispatch: DispatchDocument): DispatchFactDraft {
  const { record } = dispatch
  return structuredClone({
    call: call.state.call,
    dispatch: record.dispatch,
    consumer: call.state.consumer,
    profile: call.request?.profile ?? null,
    supplier: record.supplier,
    contextWindow: (call.request?.kind === 'llm' ? call.request.contextWindow : undefined) ?? null,
    instants: record.instants ?? NO_INSTANTS,
    send: dispatchSend(record),
    outcome: dispatchOutcome(dispatch.logicalTerminal ?? record.terminal),
    connectRetries: record.connectRetries?.length ?? 0,
    account: record.account,
    costLookup: costLookupOf(record),
    ...effortField(call.request),
  })
}
