import type {
  Access,
  Failure,
  PendingCall,
  ReceivedEntry,
  Waiting,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolCallContact } from '@omne-harness/tool-contract'
import type { LoopPorts } from './coordinator.ts'
import { diagnosticOf } from './diagnostic.ts'

type ModelPendingCall = Extract<PendingCall, { kind: 'model' }>
type AssociatedToolCall = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
type Unavailable = Extract<Failure, { kind: 'unavailable' }>

export type MainContact =
  | M.CallContact
  | Readonly<{ kind: 'received' }>
  | Readonly<{ kind: 'journal-failed'; failure: Failure }>
  | Readonly<{ kind: 'model-failed'; failure: M.ModelFailure }>

async function askModel<P>(
  ports: Pick<LoopPorts<P>, 'models'>,
  access: Access<P>,
  pending: ModelPendingCall,
): Promise<Outcome<M.CallContact, M.ModelFailure>> {
  try {
    return await ports.models.calls.contact({ ...access, reference: pending.reference })
  } catch (error) {
    return fail({
      kind: 'unavailable',
      dependency: 'modelRuntime',
      diagnostic: diagnosticOf(error),
    })
  }
}

export async function contactMainCall<P>(
  ports: Pick<LoopPorts<P>, 'models'>,
  access: Access<P>,
  pending: ModelPendingCall,
  received: () => Promise<Outcome<ReceivedEntry | null, Failure>>,
): Promise<MainContact> {
  const entry = await received()
  if ('failure' in entry) return { kind: 'journal-failed', failure: entry.failure }
  if (entry.ok !== null) return { kind: 'received' }
  const asked = await askModel(ports, access, pending)
  return 'failure' in asked ? { kind: 'model-failed', failure: asked.failure } : asked.ok
}

export function toolDown(diagnostic: string): Unavailable {
  return { kind: 'unavailable', owner: 'toolRuntime', diagnostic }
}

export async function askTool<P>(
  ports: Pick<LoopPorts<P>, 'tools'>,
  access: Access<P>,
  pending: AssociatedToolCall,
): Promise<Outcome<ToolCallContact['kind'], Unavailable>> {
  try {
    const answer = await ports.tools.queries.contact({ ...access, reference: pending.reference })
    return 'failure' in answer
      ? fail(toolDown(`the Tool runtime answered ${answer.failure.kind} to contact`))
      : succeed(answer.ok.kind)
  } catch (error) {
    return fail(toolDown(diagnosticOf(error)))
  }
}

function holderOf<P>(
  ports: Pick<LoopPorts<P>, 'models' | 'tools'>,
  access: Access<P>,
  wait: Waiting,
): (() => Promise<boolean>) | null {
  if (wait.kind !== 'producer') return null
  const pending = wait.pending
  if (pending.kind === 'model')
    return async () => {
      const asked = await askModel(ports, access, pending)
      return 'ok' in asked && asked.ok.kind === 'holding'
    }
  if (pending.association !== 'associated') return null
  return async () => {
    const asked = await askTool(ports, access, pending)
    return 'ok' in asked && asked.ok === 'holding'
  }
}

export async function producersHolding<P>(
  ports: Pick<LoopPorts<P>, 'models' | 'tools'>,
  access: Access<P>,
  waits: readonly Waiting[],
): Promise<boolean | null> {
  const holders = waits.map(wait => holderOf(ports, access, wait))
  if (holders.length === 0) return null
  for (const holder of holders) if (holder === null) return null
  for (const holder of holders) if (holder !== null && !(await holder())) return false
  return true
}
