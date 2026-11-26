import type { AccessContribution, AnswerOf, BodyOf } from '@omne-harness/access-cordis-contract'
import type {
  GoalCaller,
  GoalCommand,
  GoalRecord,
  GoalRefusal,
  Outcome,
  Proposal,
} from '@omne-harness/goal-contract'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createGoalObservation } from './observe.ts'
import type { GoalChangeFeed, GoalEntrance, GoalFace } from './ports.ts'
import { viewOf } from './view.ts'

export type GoalContributionInput = Readonly<{
  goals: () => GoalFace | undefined
  entrance: GoalEntrance
  changes: () => GoalChangeFeed | undefined
}>

type GoalProtocol = typeof goalProtocol
type Operations = GoalProtocol['operations']
type Name = keyof Operations & string
type Answer<K extends Name> = AnswerOf<Operations[K]>
type Body<K extends Name> = BodyOf<Operations[K]>
type Login = Parameters<GoalEntrance['admit']>[0]

const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NOT_FOUND = Object.freeze({ outcome: 'not-found' as const, body: {} })

const plainOf = (value: JsonValue): unknown => JSON.parse(writeJsonText(value))

export function tenantTextOf(tenant: TenantId): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

type Admitted = Readonly<{ caller: GoalCaller; by: string; goals: GoalFace }>

/** What a refusal of the domain is to a client. `shown` says which refusals this operation can meet; any other one is no basis, not a made-up answer. */
function refusalOf<K extends Name>(
  reason: GoalRefusal,
  shown: Readonly<{ invalid: boolean; state: boolean }>,
): Answer<K> {
  const answer = (() => {
    if (reason.kind === 'denied') return DENIED
    if (reason.kind === 'no-such-session') return NOT_FOUND
    if (reason.kind === 'invalid' && shown.invalid)
      return { outcome: 'invalid', body: { issues: reason.issues.map(issue => ({ ...issue })) } }
    if (reason.kind === 'state' && shown.state)
      return { outcome: 'conflict', body: { reason: reason.reason } }
    if (reason.kind === 'another-goal' && shown.state)
      return { outcome: 'conflict', body: { reason: 'another-goal' } }
    return UNAVAILABLE
  })()
  return answer as Answer<K>
}

const READS = Object.freeze({ invalid: false, state: false })
const WRITES = Object.freeze({ invalid: true, state: true })
const COMMANDS = Object.freeze({ invalid: false, state: true })

export function createGoalContribution(
  input: GoalContributionInput,
): AccessContribution<GoalProtocol> {
  async function admit(
    login: Login,
    tenant: TenantId,
  ): Promise<Admitted | typeof DENIED | typeof UNAVAILABLE> {
    const tenantText = tenantTextOf(tenant)
    if (tenantText === undefined) return UNAVAILABLE
    const entry = await Promise.resolve()
      .then(() => input.entrance.admit(login, tenant))
      .catch(() => ({ kind: 'basis-unavailable' as const }))
    if (entry.kind === 'denied') return DENIED
    if (entry.kind !== 'admitted') return UNAVAILABLE
    const goals = input.goals()
    if (goals === undefined) return UNAVAILABLE
    return { caller: { tenant: tenantText, subject: entry.subject }, by: entry.by, goals }
  }

  const read = (admitted: Admitted, session: string) =>
    Promise.resolve()
      .then(() => admitted.goals.read(admitted.caller, session))
      .catch((): Outcome<GoalRecord | null, GoalRefusal> => ({ kind: 'basis-unavailable' }))

  const proposalOf = (body: Body<'write-goal'>): Proposal =>
    body.proposal.kind === 'set'
      ? { kind: 'set', draft: plainOf(body.proposal.draft) }
      : { kind: 'revise', changes: plainOf(body.proposal.changes) }

  return {
    protocol: goalProtocol,
    operations: {
      async 'read-goal'(call, body): Promise<Answer<'read-goal'>> {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const found = await read(admitted, body.session)
        if (found.kind === 'refused') return refusalOf<'read-goal'>(found.reason, READS)
        if (found.kind !== 'done') return UNAVAILABLE
        if (found.value === null) return { outcome: 'succeeded', body: { goal: null } }
        const goal = viewOf(found.value)
        return goal === undefined ? UNAVAILABLE : { outcome: 'succeeded', body: { goal } }
      },
      async 'write-goal'(call, body): Promise<Answer<'write-goal'>> {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { session, operation, words } = body
        const write = { session, operation, proposal: proposalOf(body), words } as const
        const written = await Promise.resolve()
          .then(() =>
            admitted.goals.write(admitted.caller, {
              ...write,
              draftedBy: 'person',
              by: admitted.by,
            }),
          )
          .catch((): Outcome<GoalRecord, GoalRefusal> => ({ kind: 'unknown' }))
        if (written.kind === 'refused') return refusalOf<'write-goal'>(written.reason, WRITES)
        if (written.kind === 'basis-unavailable') return UNAVAILABLE
        if (written.kind === 'unknown') return UNKNOWN
        const goal = viewOf(written.value)
        return goal === undefined ? UNKNOWN : { outcome: 'succeeded', body: { goal } }
      },
      async 'query-write-goal'(call, body): Promise<Answer<'query-write-goal'>> {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const found = await read(admitted, body.session)
        if (found.kind === 'refused') return refusalOf<'query-write-goal'>(found.reason, READS)
        if (found.kind !== 'done') return UNAVAILABLE
        const record = found.value
        const kept = record?.history.some(
          entry => entry.via === 'direct' && entry.operation === body.operation,
        )
        if (record === null || kept !== true) return { outcome: 'not-committed', body: {} }
        const goal = viewOf(record)
        return goal === undefined ? UNAVAILABLE : { outcome: 'succeeded', body: { goal } }
      },
      async 'command-goal'(call, body): Promise<Answer<'command-goal'>> {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { session, generation } = body
        const command = body.command as GoalCommand
        const done = await Promise.resolve()
          .then(() => admitted.goals.command(admitted.caller, { session, generation, command }))
          .catch((): Outcome<GoalRecord | null, GoalRefusal> => ({ kind: 'unknown' }))
        if (done.kind === 'refused') return refusalOf<'command-goal'>(done.reason, COMMANDS)
        if (done.kind === 'basis-unavailable') return UNAVAILABLE
        if (done.kind === 'unknown') return UNKNOWN
        if (done.value === null) return { outcome: 'succeeded', body: { goal: null } }
        const goal = viewOf(done.value)
        return goal === undefined ? UNKNOWN : { outcome: 'succeeded', body: { goal } }
      },
    },
    observations: {
      'observe-goal': createGoalObservation({ entrance: input.entrance, changes: input.changes }),
    },
  }
}
