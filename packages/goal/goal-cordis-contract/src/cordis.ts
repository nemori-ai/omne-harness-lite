import { Service, type Context } from '@deepseek-ai/cordis'
import type { GoalReconciling, Goals } from '@omne-harness/goal-contract'

/** @owner packages/goal/goal-cordis-contract */
export abstract class GoalsService extends Service implements Goals {
  static readonly provide = 'goals'
  constructor(ctx: Context) {
    super(ctx, GoalsService.provide)
  }
  abstract readonly read: Goals['read']
  abstract readonly write: Goals['write']
  abstract readonly command: Goals['command']
  abstract readonly propose: Goals['propose']
  abstract readonly confirm: Goals['confirm']
}
export const goalsKey = GoalsService.provide

/** @owner packages/goal/goal-cordis-contract */
export abstract class GoalReconcilingService extends Service implements GoalReconciling {
  static readonly provide = 'goalReconciling'
  constructor(ctx: Context) {
    super(ctx, GoalReconcilingService.provide)
  }
  abstract readonly reconcile: GoalReconciling['reconcile']
}
export const goalReconcilingKey = GoalReconcilingService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    goals: GoalsService
    goalReconciling: GoalReconcilingService
  }
}
