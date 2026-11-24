import {
  admissionPassageOf,
  nestedPositionOf,
  type Action,
  type ActionToolCall,
  type ActionQualification,
  type ActionQualificationRequest,
  type AgentActionQualification,
  type ExecutionSnapshot,
  type Failure,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from './construction.ts'
import { canonical } from './canonical.ts'
import { readBatchToolCalls } from './loop/action-source.ts'
import { freshChain } from './loop/admission-chain.ts'
import { nestedVerdict, parentWaits } from './loop/nested.ts'
import { toolConsumer } from './loop/tools.ts'

type Dependencies<P> = AgentDependencies<P, ContentBlock>
export type AgentActionQualificationSources<P> = Readonly<{
  journal: Pick<Dependencies<P>['journal'], 'load'>
  entries: Pick<Dependencies<P>['entries'], 'receivedOf'>
  materials: Pick<Dependencies<P>['materials'], 'read'>
  toolRequests?: Pick<NonNullable<Dependencies<P>['toolRequests']>, 'describe'> | undefined
}>
const unavailable = (): Outcome<never, Failure> =>
  fail({
    kind: 'unavailable',
    owner: 'agentActionQualification',
    diagnostic: 'The original action source is unavailable.',
  })
const denied = (): Outcome<never, Failure> => fail({ kind: 'denied', action: 'qualify-action' })
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)

function pendingAt<P>(action: Action, input: ActionQualificationRequest<P>): boolean {
  if (action.judgment.kind !== 'pending' && action.judgment.kind !== 'waiting') return false
  return (
    action.judgment.passage === input.passage &&
    action.effectiveArguments === input.effectiveArguments &&
    action.call === null
  )
}

/** The request names this execution as it is attached and running now. */
const live = <P>(snapshot: ExecutionSnapshot, input: ActionQualificationRequest<P>): boolean =>
  snapshot.execution === input.execution &&
  same(snapshot.executionAttachment, input.advance) &&
  ['advancing', 'reconciling', 'waiting'].includes(snapshot.state.kind)

/** AG-32: only under a waiting call of this batch, with no conclusion; a committed chain fixes its arguments. */
function nestedAction<P>(
  snapshot: ExecutionSnapshot,
  input: ActionQualificationRequest<P>,
  parent: Action['id'],
): Action | undefined {
  const { batch, passages } = snapshot.checkpoint
  if (!live(snapshot, input) || batch === null || !parentWaits(batch, parent)) return undefined
  const passage = admissionPassageOf(input.action)
  if ('failure' in passage || passage.ok !== input.passage) return undefined
  if (input.original.callId !== input.action) return undefined
  const action: Action = {
    id: input.action,
    original: { callId: input.action },
    effectiveArguments: input.effectiveArguments,
    call: null,
    judgment: { kind: 'pending', passage: input.passage },
  }
  const chain = passages.find(item => item.id === input.passage) ?? null
  if (chain === null) return action
  const asked = same(chain.input, freshChain(action, input.passage).input)
  return asked && nestedVerdict(chain) === null ? action : undefined
}

function currentAction<P>(
  snapshot: ExecutionSnapshot,
  input: ActionQualificationRequest<P>,
): Action | undefined {
  if (!live(snapshot, input)) return undefined
  const [action, ...duplicates] =
    snapshot.checkpoint.batch?.actions.filter(action => action.id === input.action) ?? []
  if (action === undefined || duplicates.length !== 0) return undefined
  return pendingAt(action, input) ? action : undefined
}

async function qualifyTool<P>(
  source: AgentActionQualificationSources<P>['toolRequests'],
  input: ActionQualificationRequest<P>,
  action: Action,
  original: ActionToolCall,
): Promise<Outcome<null, Failure>> {
  if (source === undefined) return unavailable()
  const described = await source.describe({
    ...input,
    original,
    consumer: toolConsumer(input.execution, action),
  })
  if ('failure' in described) return described
  if (described.ok.kind !== 'tool' || !same(described.ok.definition, input.definition))
    return denied()
  return succeed(null)
}

export function createAgentActionQualification<P>(
  sources: AgentActionQualificationSources<P>,
): AgentActionQualification<P> {
  return {
    async qualify(raw) {
      try {
        const {
          principal,
          tenant,
          execution,
          action,
          passage,
          advance,
          original,
          effectiveArguments,
          definition,
        } = raw
        const fixed = structuredClone({
          execution,
          action,
          passage,
          advance,
          original,
          effectiveArguments,
          definition,
        })
        const input = { ...fixed, principal, tenant }
        const loaded = await sources.journal.load(input)
        if ('failure' in loaded) return loaded
        const place = nestedPositionOf(action)
        const current =
          place === null
            ? currentAction(loaded.ok, input)
            : nestedAction(loaded.ok, input, place.parent)
        const batch = loaded.ok.checkpoint.batch
        if (current === undefined || batch === null) return denied()
        // A nested call is not in the reply of the model: its request is what the program asked.
        const restored =
          place === null
            ? await readBatchToolCalls(sources, input, execution, loaded.ok.checkpoint.step, batch)
            : succeed(new Map([[fixed.original.callId, fixed.original]]))
        if ('failure' in restored) return restored
        const call = restored.ok.get(current.original.callId)
        if (call === undefined || !same(call, fixed.original)) return denied()
        const described = await qualifyTool(sources.toolRequests, input, current, call)
        if ('failure' in described) return described
        const observation: ActionQualification = {
          version: 1,
          request: { ...fixed, tenant },
          agentDefinition: structuredClone(loaded.ok.checkpoint.definition),
          revision: loaded.ok.revision,
          history: structuredClone(loaded.ok.history),
        }
        return succeed(observation)
      } catch {
        return unavailable()
      }
    },
  }
}
