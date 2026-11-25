import { createHash } from 'node:crypto'
import type { DecisionAsk, GoalDecisions } from '@omne-harness/goal'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decisionAnswersOf,
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  type Adoption,
  type ConsumerRef,
  type DecisionAnswers,
  type DecisionAsk as ModelAsk,
  type DurableEvidence,
  type ModelCallId,
  type ModelRuntime,
  type ResultPart,
  type ResultVersion,
  type Settlement,
} from '@omne-harness/model-contract'
import type { ModelDecisionPreparation } from '@omne-harness/model-contract/provider'

export const GOAL_DECISIONS_CONSUMER = '@omne-harness/goal-decisions'
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
export const GOAL_DECISIONS_SOURCE: Adoption = Object.freeze({
  owner: GOAL_DECISIONS_CONSUMER,
  name: 'judge-request',
  revision: '1',
  digest: sha256(`${GOAL_DECISIONS_CONSUMER}:judge-request/1`),
})

export type DecisionPolicy = Readonly<{
  pollMs: number
  deadlineMs: number
}>

export type DecisionPorts<P> = Readonly<{
  /** Asked for on every call: absent while Model is away. */
  model(): Pick<ModelRuntime<P>, 'calls' | 'consumption'> | undefined
  preparation(): ModelDecisionPreparation<P> | undefined
  /** The principal Model is called as for this caller of goals; undefined: this caller makes no call. */
  principalOf(subject: unknown): P | undefined
  policy: DecisionPolicy
  now(): number
  wait(ms: number): Promise<void>
}>

type Access<P> = Readonly<{ principal: P; tenant: TenantId }>

function value<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('failure' in decoded) throw new TypeError('a derived identity of a decision call is invalid')
  return decoded.ok
}

/** The identities of one decision call, derived from what it is asked for: the same asking is the same call. */
function identitiesOf(tenant: TenantId, text: string, input: DecisionAsk) {
  const key = sha256(`${text}/${input.session}/${input.identity}`).slice(0, 40)
  const call = value(decodeModelCallId(`mcall_goal_${key}`))
  const operation = (stage: string) => value(decodeModelOperationId(`mop_goal_${key}_${stage}`))
  const consumer: ConsumerRef = {
    owner: GOAL_DECISIONS_CONSUMER,
    work: input.session,
    position: input.identity,
    purpose: 'judge',
  }
  const reference = value(encodeModelInvocationRef({ tenant, call, admission: operation('admit') }))
  return { call, operation, consumer, reference, message: `msg_${key}` }
}

/** The proof that a settled decision was taken into a judging: it names the call and the version of its result. */
export function decisionCompletion(call: ModelCallId, result: ResultVersion): DurableEvidence {
  return {
    owner: GOAL_DECISIONS_CONSUMER,
    record: call,
    revision: '1',
    digest: sha256(`${call}/${result}`),
  }
}

type Handoff = Readonly<{
  call: ModelCallId
  result: ResultVersion
  consumer: ConsumerRef
  evidence: Readonly<{ kind: string; completion?: DurableEvidence }>
}>

/** Whether an acknowledgement of a decision call carries the proof this member gives for it. */
export function verifyDecisionHandoff(given: Handoff): DurableEvidence | null {
  const { completion } = given.evidence
  if (given.consumer.owner !== GOAL_DECISIONS_CONSUMER || given.evidence.kind !== 'processed')
    return null
  const expected = decisionCompletion(given.call, given.result)
  return completion !== undefined && JSON.stringify(completion) === JSON.stringify(expected)
    ? completion
    : null
}

export function createGoalDecisions<P>(ports: DecisionPorts<P>): GoalDecisions {
  type Model = NonNullable<ReturnType<DecisionPorts<P>['model']>>
  type Ids = ReturnType<typeof identitiesOf>

  async function admitted(model: Model, access: Access<P>, ids: Ids, input: DecisionAsk) {
    const preparation = ports.preparation()
    if (preparation === undefined) return false
    const ask: ModelAsk = input.request
    const prepared = await preparation.prepare({
      ...access,
      model: input.model,
      message: ids.message,
      ask,
      source: GOAL_DECISIONS_SOURCE,
    })
    if ('failure' in prepared) return false
    const admission = await model.calls.admit({
      ...access,
      call: ids.call,
      operation: ids.operation('admit'),
      request: prepared.ok,
      consumer: ids.consumer,
    })
    return 'ok' in admission
  }

  /** Looks at the call until it has settled; past the deadline it is cancelled and has no settlement. */
  async function settled(model: Model, access: Access<P>, ids: Ids, input: DecisionAsk) {
    const until = ports.now() + ports.policy.deadlineMs
    for (;;) {
      const known = await model.calls.inspect({ ...access, reference: ids.reference })
      if ('failure' in known) return null
      if (known.ok.kind === 'not-accepted') {
        if (!(await admitted(model, access, ids, input))) return null
      } else if (known.ok.state.phase === 'settled') return known.ok.state.settlement
      if (ports.now() >= until) {
        await model.calls.cancel({ ...access, call: ids.call, operation: ids.operation('cancel') })
        return null
      }
      await ports.wait(ports.policy.pollMs)
    }
  }

  async function read(model: Model, access: Access<P>, ids: Ids, settlement: Settlement) {
    const opened = await model.consumption.beginRead({
      ...access,
      reference: ids.reference,
      operation: ids.operation(`read_${String(ports.now())}`),
      result: settlement.version,
    })
    if ('failure' in opened || opened.ok.kind === 'acknowledged') return null
    const { read: lease } = opened.ok
    const parts: ResultPart[] = []
    try {
      let state = opened.ok.value
      for (let pages = 0; state.kind === 'reading' && pages < 64; pages += 1) {
        parts.push(...state.page.parts)
        if (state.page.next === null) return parts
        const after = state.page.next
        const next = await model.consumption.readNext({
          ...access,
          call: ids.call,
          read: lease,
          after,
        })
        if ('failure' in next) return null
        state = next.ok
      }
      return null
    } finally {
      await model.consumption.closeRead({ ...access, call: ids.call, read: lease })
    }
  }

  async function answersOf(model: Model, access: Access<P>, ids: Ids, settlement: Settlement) {
    const completed = settlement.termination.kind === 'completed'
    const parts = completed ? await read(model, access, ids, settlement) : null
    await model.consumption.acknowledge({
      ...access,
      call: ids.call,
      operation: ids.operation('acknowledge'),
      result: settlement.version,
      evidence: { kind: 'processed', completion: decisionCompletion(ids.call, settlement.version) },
    })
    return parts === null ? null : decisionAnswersOf(parts)
  }

  return {
    async ask(input): Promise<DecisionAnswers | null> {
      const tenant = tenantCodec.parse(input.caller.tenant)
      const model = ports.model()
      const principal = ports.principalOf(input.caller.subject)
      if (!tenant.ok || model === undefined || principal === undefined) return null
      const access = { principal, tenant: tenant.value }
      const ids = identitiesOf(tenant.value, input.caller.tenant, input)
      const settlement = await settled(model, access, ids, input)
      return settlement === null ? null : answersOf(model, access, ids, settlement)
    },
  }
}
