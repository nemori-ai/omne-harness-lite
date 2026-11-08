import type {
  Action,
  ActionToolCall,
  ActionQualification,
  ActionQualificationRequest,
  AgentActionQualification,
  ExecutionSnapshot,
  Failure,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from './construction.ts'
import { canonical } from './canonical.ts'
import { readBatchToolCalls } from './loop/action-source.ts'
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

function currentAction<P>(
  snapshot: ExecutionSnapshot,
  input: ActionQualificationRequest<P>,
): Action | undefined {
  if (snapshot.execution !== input.execution || !same(snapshot.executionAttachment, input.advance))
    return undefined
  if (!['advancing', 'reconciling', 'waiting'].includes(snapshot.state.kind)) return undefined
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

/** Reads original Agent facts and trusted Tool description; it neither grants nor commits permission. */
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
        const current = currentAction(loaded.ok, input)
        const batch = loaded.ok.checkpoint.batch
        if (current === undefined || batch === null) return denied()
        const restored = await readBatchToolCalls(
          sources,
          input,
          execution,
          loaded.ok.checkpoint.step,
          batch,
        )
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
