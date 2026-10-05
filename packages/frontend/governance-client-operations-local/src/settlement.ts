import { randomUUID } from 'node:crypto'
import type {
  ClientLocalState,
  LocalRecord,
  LocalSnapshot,
} from '@omne-harness-lite/client-local-state'
import { defect, origin, type ReportFrame } from './report.ts'

export async function settle(
  state: ClientLocalState,
  before: LocalSnapshot,
  value: LocalRecord,
  frame: ReportFrame,
): Promise<LocalSnapshot | undefined> {
  const operationId = randomUUID()
  let outcome
  try {
    outcome = await state.compareAndReplace(before.token, value, operationId)
  } catch {
    frame.local = { status: 'defect' }
    defect(frame, 'settlement')
    return undefined
  }
  if (outcome.kind === 'installed') {
    frame.local = { status: 'installed' }
    return outcome.snapshot
  }
  if (outcome.kind === 'conflict') {
    frame.local = { status: 'conflict' }
    return outcome.current
  }
  if (outcome.kind === 'not-installed') {
    frame.local = { status: 'not-installed', reason: outcome.reason }
    return undefined
  }
  frame.local = { status: 'unconfirmed', recovery: { observation: 'unknown' } }
  try {
    const observed = await state.read()
    if (observed.kind !== 'read') return undefined
    const current = observed.snapshot
    const observation =
      current.storeId !== before.storeId
        ? 'different-store'
        : current.operationId === operationId
          ? 'visible-this-operation'
          : current.revision === before.revision
            ? 'not-seen'
            : 'visible-other-record'
    frame.local = {
      status: 'unconfirmed',
      recovery: { observation, current: { ...origin(current.value), revision: current.revision } },
    }
    return current
  } catch {
    defect(frame, 'recovery')
    return undefined
  }
}
