import type {
  Adoption,
  Action,
  ConsumerRef,
  AgentToolQualification,
  ExecutionSnapshot,
  Failure,
  ToolQualification,
  ToolQualificationRequest,
  ToolReceptionTarget,
  ToolReceptionTargets,
} from '@omne-harness/agent-contract'
import { encodeToolInvocationRef } from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentActionQualificationSources } from './action-qualification.ts'
import { canonical } from './canonical.ts'
import { actionPositionExecution } from './loop/identities.ts'
import { fixedRequestOf, sentToolRequest } from './loop/tools.ts'

export type AgentToolQualificationSources<P> = Pick<
  AgentActionQualificationSources<P>,
  'journal' | 'materials'
> &
  Readonly<{
    targets: Pick<ToolReceptionTargets<P>, 'resolve'>
  }>

type Original = Readonly<{ association: ToolQualification['association']; definition: Adoption }>
const denied = (): Outcome<never, Failure> =>
  fail({ kind: 'denied', action: 'qualify-tool-origin' })
const unavailable = (): Outcome<never, Failure> =>
  fail({
    kind: 'unavailable',
    owner: 'agentToolQualification',
    diagnostic: 'The original Tool binding is unavailable.',
  })
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)

async function boundOriginal<P>(
  sources: AgentToolQualificationSources<P>,
  input: ToolQualificationRequest<P>,
  snapshot: ExecutionSnapshot,
  target: ToolReceptionTarget,
): Promise<Outcome<Original, Failure>> {
  if (
    target.execution !== snapshot.execution ||
    !same(target.pending.position, input.request.consumer)
  )
    return denied()
  const read = await sources.materials.read({
    principal: input.principal,
    tenant: input.tenant,
    source: target.pending.fixed,
  })
  if ('failure' in read) return read
  const saved = fixedRequestOf(read.ok)
  // Tool proves the original barrier with the full invocation. Agent's saved A0 request predates it.
  if (
    saved === null ||
    input.request.batchDecision === null ||
    !same({ ...saved, batchDecision: input.request.batchDecision }, input.request)
  )
    return denied()
  return succeed({ association: 'associated', definition: target.definition })
}

function savedIntentMatches(action: Action, consumer: ConsumerRef): boolean {
  if (
    action.judgment.kind !== 'allowed' ||
    action.call?.kind !== 'tool' ||
    action.call.association !== 'intent'
  )
    return false
  return same(action.call.position, consumer) && same(action.call.fixed, action.judgment.request)
}

async function intentOriginal<P>(
  sources: AgentToolQualificationSources<P>,
  input: ToolQualificationRequest<P>,
  snapshot: ExecutionSnapshot,
): Promise<Outcome<Original, Failure>> {
  const batch = snapshot.checkpoint.batch
  if (batch === null || batch.barrier.kind !== 'open') return denied()
  const [action, ...others] = batch.actions.filter(
    item => item.id === input.request.consumer.position,
  )
  if (action === undefined || others.length !== 0 || !batch.barrier.approved.includes(action.id))
    return denied()
  if (!savedIntentMatches(action, input.request.consumer)) return denied()
  const saved = await sentToolRequest(
    sources,
    input,
    snapshot.execution,
    action,
    batch.barrier.evidence,
  )
  if ('failure' in saved) return saved
  return same(saved.ok, input.request)
    ? succeed({ association: 'intent', definition: snapshot.checkpoint.definition })
    : denied()
}

async function originalAt<P>(
  sources: AgentToolQualificationSources<P>,
  input: ToolQualificationRequest<P>,
  snapshot: ExecutionSnapshot,
): Promise<Outcome<Original, Failure>> {
  const reference = encodeToolInvocationRef(input)
  if ('failure' in reference) return denied()
  const resolved = await sources.targets.resolve({
    access: { principal: input.principal, tenant: input.tenant },
    consumer: input.request.consumer,
    reference: reference.ok,
    execution: snapshot.execution,
  })
  if ('failure' in resolved) return resolved
  if (resolved.ok === null) return intentOriginal(sources, input, snapshot)
  if (resolved.ok.pending.reference !== reference.ok) return denied()
  return boundOriginal(sources, input, snapshot, resolved.ok)
}

/** Reads Agent-owned provenance; it neither qualifies a Tool invocation nor grants permission. */
export function createAgentToolQualification<P>(
  sources: AgentToolQualificationSources<P>,
): AgentToolQualification<P> {
  return {
    async qualify(raw) {
      try {
        const { principal, tenant } = raw
        const fixed = structuredClone({
          call: raw.call,
          admission: raw.admission,
          request: raw.request,
        })
        const input = { ...fixed, principal, tenant }
        const execution = actionPositionExecution(fixed.request.consumer)
        if (execution === null) return denied()
        const loaded = await sources.journal.load({ principal, tenant, execution })
        if ('failure' in loaded) return loaded
        if (loaded.ok.execution !== execution) return denied()
        const original = await originalAt(sources, input, loaded.ok)
        if ('failure' in original) return original
        return succeed({
          version: 1,
          request: { ...fixed, tenant },
          execution,
          association: original.ok.association,
          agentDefinition: structuredClone(original.ok.definition),
          revision: loaded.ok.revision,
          history: structuredClone(loaded.ok.history),
        })
      } catch {
        return unavailable()
      }
    },
  }
}
