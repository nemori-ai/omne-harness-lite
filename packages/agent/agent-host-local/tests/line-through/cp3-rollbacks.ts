import type { SeenCommit } from './world.ts'

export const INPUT_NOT_PENDING = 'the input is not pending'

export const SESSION_ORDINARY_BASIS = 'session-ordinary-basis'

export function sessionOnlyRollbackExplained(
  commits: readonly SeenCommit[],
  position: number,
  readThroughOf: (execution: string) => string | null,
): boolean {
  const seen = commits[position]
  if (seen === undefined || seen.result.kind !== 'rolled_back') return false
  if (
    seen.participants.some(
      participant => participant !== 'session' && participant !== SESSION_ORDINARY_BASIS,
    )
  )
    return false
  const { responses } = seen.result
  const basis = responses.filter(response => response.participant === SESSION_ORDINARY_BASIS)
  if (!basis.every(response => response.reply.kind === 'participated')) return false
  const session = responses.filter(response => response.participant !== SESSION_ORDINARY_BASIS)
  if (session.length === 0) return false
  if (JSON.stringify(session).includes(INPUT_NOT_PENDING)) return true
  if (!session.every(response => TRANSIENT.has(failureKindOf(response.reply) ?? ''))) return false
  const log = seen.log
  if (log === null || log.sequence === null) return false
  const { execution, sequence } = log
  const committedAgain = commits
    .slice(position + 1)
    .some(
      later =>
        later.result.kind === 'committed' &&
        later.log?.execution === execution &&
        later.log.sequence === sequence,
    )
  if (committedAgain) return true
  const readThrough = readThroughOf(execution)
  return readThrough !== null && BigInt(readThrough) >= BigInt(sequence)
}

const TRANSIENT = new Set(['changed', 'unavailable'])

function failureKindOf(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) return null
  const { kind, basis } = reply as { kind?: unknown; basis?: unknown }
  if (kind !== 'conflict' || typeof basis !== 'object' || basis === null) return null
  const failure = (basis as { failure?: unknown }).failure
  if (typeof failure !== 'object' || failure === null) return null
  const failureKind = (failure as { kind?: unknown }).kind
  return typeof failureKind === 'string' ? failureKind : null
}
