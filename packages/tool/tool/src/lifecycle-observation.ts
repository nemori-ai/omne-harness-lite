import type { ToolCallId } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { LedgerCommitInput, ToolLedgerStore } from './ledger-store.ts'

type LifecyclePhase = 'result-commit' | 'offload' | 'delivery-release' | 'expire' | 'reclaim'
export type ToolLifecycleObservation = Readonly<{
  tenant: CallAccess<unknown>['tenant']
  call: ToolCallId
  items: number
  bytes?: number
}> &
  (
    | Readonly<{ phase: LifecyclePhase; failure: 'none' }>
    | Readonly<{ phase: 'failure'; failure: 'unknown' | 'conflict' | 'unavailable' }>
  )
export type ToolLifecycleObserver = (event: ToolLifecycleObservation) => void

function observations(input: LedgerCommitInput): readonly ToolLifecycleObservation[] {
  const domain = input.domain
  if (domain.kind !== 'call') return []
  const records = input.writes.flatMap(write => (write.kind === 'put' ? [write.record] : []))
  const phases = new Map<LifecyclePhase, { items: number; bytes?: number }>()
  const add = (phase: LifecyclePhase, bytes?: number) => {
    const count = phases.get(phase) ?? { items: 0 }
    count.items++
    if (bytes !== undefined) count.bytes = (count.bytes ?? 0) + bytes
    phases.set(phase, count)
  }
  for (const record of records) {
    if (record.kind === 'result' && record.result.delivery.kind !== 'released') {
      add('result-commit')
      if (record.result.value.original.kind === 'offloaded')
        add('offload', Number(record.result.value.original.body.description.bodyBytes))
    } else if (
      record.kind === 'operation' &&
      record.operation.receipt.kind === 'release-delivery'
    ) {
      add('delivery-release')
    } else if (record.kind === 'body-expiration') {
      add('expire')
    } else if (record.kind === 'material' && record.material.state.kind === 'deleted') {
      add('reclaim')
    }
  }
  return [...phases].map(([phase, counts]) => ({
    tenant: domain.tenant,
    call: domain.call,
    phase,
    failure: 'none',
    ...counts,
  }))
}

/** Observes confirmed facts; telemetry is never a receipt or a condition of committing. */
export function observeToolLedgerCommit(
  commit: ToolLedgerStore['commit'],
  observe: ToolLifecycleObserver,
): ToolLedgerStore['commit'] {
  const report = (event: ToolLifecycleObservation) => {
    try {
      observe(event)
    } catch {
      /* The original commit answer remains authoritative. */
    }
  }
  return async input => {
    const domain = input.domain
    let events: readonly ToolLifecycleObservation[] = []
    try {
      events = observations(input)
    } catch {
      /* Observation cannot prevent a business commit. */
    }
    const failure = (kind: 'unknown' | 'conflict' | 'unavailable') => {
      if (domain.kind === 'call' && events.length > 0)
        report({
          tenant: domain.tenant,
          call: domain.call,
          phase: 'failure',
          failure: kind,
          items: 1,
        })
    }
    try {
      const answer = await commit(input)
      if (answer.kind === 'committed') for (const event of events) report(event)
      else failure(answer.kind)
      return answer
    } catch (error) {
      failure('unknown')
      throw error
    }
  }
}
