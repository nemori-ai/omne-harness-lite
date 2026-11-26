import type { GoalCaller, Goals } from '@omne-harness/goal-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** Who the call acts as and for which session. Nothing of it comes from the model. */
export type GoalCallContext = Readonly<{ caller: GoalCaller; session: string }>

export type GoalCallSource = Readonly<{
  tenant: string
  /** The reference of this call as Tool names it: the identity of the card a proposal of it puts up. */
  call: string
  goals(): Goals | undefined
  context(): Promise<GoalCallContext | undefined>
}>

export type Reached = Readonly<{ goals: Goals; caller: GoalCaller; session: string }>
export type Unreachable = Readonly<{ unreachable: 'unavailable' | 'forbidden' }>

/** The goal services bound to one call. */
export type BoundGoal = Readonly<{ call: string; reach(): Promise<Reached | Unreachable> }>

/** Binds a call. A context of another tenant is refused before any service is asked. */
export function bindGoal(source: GoalCallSource): BoundGoal {
  return {
    call: source.call,
    async reach() {
      const goals = source.goals()
      if (goals === undefined) return { unreachable: 'unavailable' }
      const context = await (async () => source.context())().catch(() => undefined)
      if (context === undefined) return { unreachable: 'unavailable' }
      if (context.caller.tenant !== source.tenant) return { unreachable: 'forbidden' }
      return { goals, ...context }
    },
  }
}

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, BoundGoal>()
export function goalOf(context: Pick<ToolExecutionContext, 'signal'>): BoundGoal | undefined {
  return attachments.get(context.signal)
}

export function attachGoal(scope: ToolExecutionScope, goal: BoundGoal): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, goal)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === goal) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
