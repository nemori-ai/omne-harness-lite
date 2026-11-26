import { createHash } from 'node:crypto'
import type {
  Adoption,
  DurableEvidence,
  EnabledExtension,
  ExtensionInput,
  ExtensionInvocationResult,
  LoopExtensionDeclaration,
} from '@omne-harness/agent-contract'
import type { CheckAnswer, GoalCaller, GoalChecking } from '@omne-harness/goal-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

export const GOAL_CHECK_OWNER = '@omne-harness/goal-check'
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const adoptionOf = (name: string): Adoption =>
  Object.freeze({
    owner: GOAL_CHECK_OWNER,
    name,
    revision: '1',
    digest: sha256(`${GOAL_CHECK_OWNER}:${name}/1`),
  })

const TERMINAL: LoopExtensionDeclaration = Object.freeze({
  name: 'goal_check',
  position: 'before_terminal',
  power: 'veto',
  implementation: Object.freeze({ kind: 'builtin', builtinName: 'goal_check' }),
  onError: 'treat_as_veto',
  unavailability: 'veto',
})
const COMPACTED: LoopExtensionDeclaration = Object.freeze({
  name: 'goal_after_compaction',
  position: 'after_compaction',
  power: 'rewrite',
  implementation: Object.freeze({ kind: 'builtin', builtinName: 'goal_after_compaction' }),
  unavailability: 'skip',
})

/** The two trusted system extensions of goals: the check before a round ends, and the reminder after a compaction. */
export const GOAL_CHECK_MEMBERS: readonly EnabledExtension[] = Object.freeze([
  Object.freeze({ declaration: TERMINAL, implementation: adoptionOf('goal_check') }),
  Object.freeze({ declaration: COMPACTED, implementation: adoptionOf('goal_after_compaction') }),
])

export type GoalCheckPorts<P> = Readonly<{
  /** Asked for on every call: absent while the goals are away. */
  checking(): GoalChecking | undefined
  /** The session this principal works for, or null when it works for none. `unavailable`: it cannot be told now. */
  sessionOf(principal: P, tenant: TenantId): Promise<string | null | 'unavailable'>
  /** The caller of goals this check is: the authority of goals knows it from an agent's own calls. */
  callerOf(principal: P, tenant: string): GoalCaller
}>

type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type GoalCheck<P> = Readonly<{
  members: readonly EnabledExtension[]
  invoke(
    access: Access<P>,
    member: EnabledExtension,
    input: ExtensionInput,
  ): Promise<ExtensionInvocationResult>
}>

const OBSERVED: ExtensionInvocationResult = { kind: 'output', value: { kind: 'observed' } }
const UNAVAILABLE: ExtensionInvocationResult = { kind: 'notStartedUnavailable' }

/** The basis of the check is away or its write is not known: the Agent waits and asks the same check again. */
function unresolved(input: ExtensionInput): ExtensionInvocationResult {
  const recovery: DurableEvidence = {
    owner: GOAL_CHECK_OWNER,
    record: input.passage,
    revision: '1',
    digest: sha256(`${input.execution}/${input.passage}`),
  }
  return { kind: 'invocationUnresolved', start: { kind: 'unknown' }, recovery }
}

function reminder(
  input: ExtensionInput,
  text: string,
  toHuman: boolean,
): ExtensionInvocationResult {
  const id = sha256(`${GOAL_CHECK_OWNER}/${input.execution}/${input.passage}`)
  const message = {
    id: `msg_${id.slice(0, 40)}`,
    role: 'system_reminder',
    blocks: [
      { kind: 'text', id: `blk_${id.slice(0, 32)}`, visibility: { toHuman, toModel: true }, text },
    ],
  }
  return { kind: 'output', value: { kind: 'inject', message } }
}

function answered(input: ExtensionInput, answer: CheckAnswer): ExtensionInvocationResult {
  if (answer.kind === 'pass') return OBSERVED
  if (answer.kind === 'tell') return reminder(input, answer.note, true)
  const reason = 'the goal of this session is not met yet'
  return { kind: 'output', value: { kind: 'veto', reason } }
}

export function createGoalCheck<P>(ports: GoalCheckPorts<P>): GoalCheck<P> {
  async function terminal(caller: GoalCaller, session: string, input: ExtensionInput) {
    const { subject } = input
    if (!('proposed' in subject)) return OBSERVED
    const checking = ports.checking()
    if (checking === undefined) return unresolved(input)
    const candidate = subject.proposed.kind === 'complete' ? 'complete' : 'failed'
    const call = `${input.execution}/${input.passage}`
    const outcome = await checking.observe(caller, { session, call, candidate })
    if (outcome.kind === 'done') return answered(input, outcome.value)
    if (outcome.kind !== 'refused') return unresolved(input)
    const error = `the check of the goal was refused: ${outcome.reason.kind}`
    return { kind: 'errored', error } satisfies ExtensionInvocationResult
  }

  async function compacted(caller: GoalCaller, session: string, input: ExtensionInput) {
    const outcome = await ports.checking()?.compacted(caller, session)
    if (outcome?.kind !== 'done') return UNAVAILABLE
    return outcome.value === null ? OBSERVED : reminder(input, outcome.value, false)
  }

  return {
    members: GOAL_CHECK_MEMBERS,
    async invoke(access, member, input) {
      const tenant = tenantCodec.encode(access.tenant)
      if (!tenant.ok) return OBSERVED
      const atTerminal = member.declaration.position === 'before_terminal'
      const session = await ports.sessionOf(access.principal, access.tenant)
      if (session === null) return OBSERVED
      if (session === 'unavailable') return atTerminal ? unresolved(input) : UNAVAILABLE
      const caller = ports.callerOf(access.principal, tenant.value)
      return atTerminal ? terminal(caller, session, input) : compacted(caller, session, input)
    },
  }
}
