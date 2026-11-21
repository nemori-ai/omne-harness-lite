import type { CallContext, DispatchState, Dispatching } from '@omne-harness/dispatch-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type AgentTarget = Readonly<{ name: string; type: 'master' | 'non-master'; summary: string }>

/** One session as the directory gives it to the session of the call. */
export type SessionLine = Readonly<{
  session: string
  title: string | null
  relation: string | null
  attendance: 'attended' | 'unattended'
  definition: string
  lifecycle: string
}>
export type SessionsFilter = Readonly<{
  relation: string | null
  attendance: 'attended' | 'unattended' | null
  definition: string | null
  archived: boolean
  cursor: string | null
  limit: number
}>
export type SessionsPage = Readonly<{
  items: readonly SessionLine[]
  next: string | null
  complete: boolean
}>
export type SessionsAnswer =
  | Readonly<{ ok: SessionsPage }>
  | Readonly<{ failure: 'denied' | 'invalid' | 'unavailable' }>

export type AgentsCallSource = Readonly<{
  tenant: string
  /** The reference of this call as Tool names it: the identity of a dispatch made from it. */
  call: string
  dispatching(): Dispatching | undefined
  /** The context of the session this call runs for. Nothing of it comes from the model. */
  context(): Promise<CallContext | undefined>
  targets(): Promise<readonly AgentTarget[] | undefined>
  sessions(filter: SessionsFilter): Promise<SessionsAnswer>
}>

export type Reached = Readonly<{ dispatching: Dispatching; context: CallContext }>
export type Unreachable = Readonly<{ unreachable: 'unavailable' | 'forbidden' }>

/** The dispatch services bound to one call. */
export type BoundAgents = Readonly<{
  call: string
  reach(): Promise<Reached | Unreachable>
  targets: AgentsCallSource['targets']
  sessions: AgentsCallSource['sessions']
}>

export type ListedState = DispatchState | null

/** Binds a call. A context of another tenant is refused before any service is asked. */
export function bindAgents(source: AgentsCallSource): BoundAgents {
  return {
    call: source.call,
    async reach() {
      const dispatching = source.dispatching()
      if (dispatching === undefined) return { unreachable: 'unavailable' }
      const context = await (async () => source.context())().catch(() => undefined)
      if (context === undefined) return { unreachable: 'unavailable' }
      if (context.tenant !== source.tenant) return { unreachable: 'forbidden' }
      return { dispatching, context }
    },
    targets: () => source.targets(),
    sessions: filter => source.sessions(filter),
  }
}

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, BoundAgents>()
export function agentsOf(context: Pick<ToolExecutionContext, 'signal'>): BoundAgents | undefined {
  return attachments.get(context.signal)
}

export function attachAgents(scope: ToolExecutionScope, agents: BoundAgents): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, agents)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === agents) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
