import type {
  ConnectionFailure,
  LostReason,
  PeerAnswer,
  UnusableCause,
} from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import {
  CONNECTION_UNAVAILABLE,
  type CatalogMark,
  type Ensured,
  type EnsureFailure,
  type NotSent,
  type UnavailableMark,
} from './entry.ts'
import type { ConnectionTable } from './table.ts'

export type Lost = Readonly<{ reason: LostReason; mark: UnavailableMark }>

export function loseOn(
  table: Pick<ConnectionTable<unknown>, 'lose'>,
  ensured: Ensured,
  lost: Lost,
): Promise<CatalogMark | 'not-current'> {
  const losing = table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  return losing === 'not-current' ? Promise.resolve(losing) : losing.done
}

export function loseInScope(
  table: Pick<ConnectionTable<unknown>, 'lose' | 'runtime'>,
  ensured: Ensured,
  lost: Lost,
): void {
  const losing = table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  if (losing !== 'not-current') table.runtime.scope.spawn(losing.done)
}

export function loseIfLost(
  table: Pick<ConnectionTable<unknown>, 'lose' | 'runtime'>,
  ensured: Ensured,
  answer: TransportFailure | PeerAnswer,
): void {
  const lost = lostOf(answer)
  if (lost !== undefined) loseInScope(table, ensured, lost)
}

export function connectionFailureOf(failure: NotSent): ConnectionFailure {
  return failure.cause === 'authorization-required'
    ? { kind: 'authorization-required', discovery: failure.discovery }
    : CONNECTION_UNAVAILABLE
}

export function connectionFailureOfBuild(
  failure: Extract<EnsureFailure, { stage: 'connect' }>,
): ConnectionFailure {
  return failure.reason.kind === 'effect-unknown' ? CONNECTION_UNAVAILABLE : failure.reason
}

const AUTHORIZATION_REQUIRED: Lost = {
  reason: 'authorization-required',
  mark: 'authorization-required',
}

export function lostOf(answer: TransportFailure | PeerAnswer): Lost | undefined {
  switch (answer.kind) {
    case 'not-sent':
      if (answer.cause === 'authorization-required') return AUTHORIZATION_REQUIRED
      return unusableOf(answer.unusable)
    case 'no-answer':
      return unusableOf(answer.unusable)
    case 'error-answer':
    case 'answer-malformed':
    case 'result':
    case 'error':
      return undefined
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

function unusableOf(unusable: UnusableCause | undefined): Lost | undefined {
  return unusable === undefined ? undefined : { reason: unusable, mark: 'connection-unavailable' }
}
