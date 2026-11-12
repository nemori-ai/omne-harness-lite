import type {
  CalendarAcknowledgementResult,
  CalendarCommitResult,
  CalendarDispositionCommand,
  CalendarPersistence,
  CalendarRepository,
  CalendarReactionAcknowledgement,
} from '@omne-harness/calendar'
import type {
  CombinationRegistrationV2,
  FactCommandV2,
  SqlStorage,
} from '@omne-harness/sql-contract'
import {
  acknowledgementBinding,
  acknowledgementIdentity,
  authorityBinding,
  canonical,
  digest,
  dispositionIdentity,
  operationRef,
} from './encoding.ts'
import { repository } from './repository.ts'
import {
  observation,
  receiptResult,
  rejected,
  commitResult,
  acknowledgementResult,
} from './results.ts'
import { DOMAIN, PARTICIPANT, ackSchema, commandSchema, operationQuerySchema } from './schema.ts'

import type {
  CalendarPersistenceAuthority,
  CalendarPersistenceAuthorityRequirement,
} from './authority.ts'
export type CalendarSqlPersistenceOptions = Readonly<{
  storage: SqlStorage
  combination: CombinationRegistrationV2
  authority: CalendarPersistenceAuthority
}>
export type CalendarSqlPersistence = Readonly<{
  repository: CalendarRepository
  persistence: CalendarPersistence
}>

function guardCommand(
  options: CalendarSqlPersistenceOptions,
  binding: CalendarPersistenceAuthorityRequirement,
): FactCommandV2 {
  const command = options.authority.command(binding)
  if (command.participant !== options.authority.participant)
    throw new Error('Authority command uses a different participant')
  return command
}
async function commitDisposition(
  options: CalendarSqlPersistenceOptions,
  input: CalendarDispositionCommand,
): Promise<CalendarCommitResult> {
  const parsed = commandSchema.safeParse(input)
  if (!parsed.success) return rejected('invalid')
  const command = parsed.data
  try {
    canonical(command)
  } catch {
    return rejected('invalid')
  }
  const identity = dispositionIdentity(command.address)
  try {
    const original = await options.storage.query(identity)
    if (original.kind === 'unknown')
      return { kind: 'unknown', operationRef: operationRef(command.address) }
    if (original.kind === 'committed' || original.kind === 'rolled_back')
      return receiptResult(original, command, digest(command), true)
    const result = await options.storage.commit({
      identity,
      combinationVersion: options.combination.combinationVersion,
      manifestDigest: options.combination.manifestDigest,
      commands: [
        guardCommand(options, authorityBinding(command)),
        { participant: PARTICIPANT, facts: { action: 'disposition', command } },
      ],
    })
    return commitResult(result, command)
  } catch {
    return { kind: 'unknown', operationRef: operationRef(command.address) }
  }
}
async function acknowledge(
  options: CalendarSqlPersistenceOptions,
  input: CalendarReactionAcknowledgement,
): Promise<CalendarAcknowledgementResult> {
  const parsed = ackSchema.safeParse(input)
  if (!parsed.success) return { kind: 'rejected', reason: 'invalid' }
  const acknowledgement = parsed.data
  try {
    canonical(acknowledgement)
  } catch {
    return { kind: 'rejected', reason: 'invalid' }
  }
  try {
    const result = await options.storage.commit({
      identity: acknowledgementIdentity(acknowledgement),
      combinationVersion: options.combination.combinationVersion,
      manifestDigest: options.combination.manifestDigest,
      commands: [
        guardCommand(options, acknowledgementBinding(acknowledgement)),
        { participant: PARTICIPANT, facts: { action: 'ackReaction', acknowledgement } },
      ],
    })
    return acknowledgementResult(result, acknowledgement)
  } catch {
    return { kind: 'unknown' }
  }
}
export function createCalendarSqlPersistence(
  options: CalendarSqlPersistenceOptions,
): CalendarSqlPersistence {
  if (
    options.combination.scope.kind !== 'system' ||
    options.combination.transactionDomain !== DOMAIN ||
    !options.combination.participants.includes(PARTICIPANT) ||
    options.authority.participant === PARTICIPANT ||
    !options.combination.participants.includes(options.authority.participant) ||
    typeof options.authority.command !== 'function'
  )
    throw new Error(
      'Calendar requires a registered system.calendar combination and an authority participant',
    )
  return {
    repository: repository(options.storage),
    persistence: {
      commitDisposition: input => commitDisposition(options, input),
      async observeOperation(input) {
        const parsed = operationQuerySchema.safeParse(input)
        if (!parsed.success) return rejected('invalid')
        try {
          canonical(parsed.data.address)
        } catch {
          return rejected('invalid')
        }
        try {
          return observation(
            await options.storage.query(dispositionIdentity(parsed.data.address)),
            parsed.data,
          )
        } catch {
          return { kind: 'unknown', operationRef: operationRef(parsed.data.address) }
        }
      },
      acknowledgeReaction: input => acknowledge(options, input),
    },
  }
}
