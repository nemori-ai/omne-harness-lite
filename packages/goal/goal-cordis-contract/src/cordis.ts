import { Service, type Context } from '@deepseek-ai/cordis'
import type { GoalChecking, GoalReconciling, Goals } from '@omne-harness/goal-contract'

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
  abstract readonly track: Goals['track']
  abstract readonly brief: Goals['brief']
  abstract readonly submit: Goals['submit']
}
export const goalsKey = GoalsService.provide

/** @owner packages/goal/goal-cordis-contract */
export abstract class GoalCheckingService extends Service implements GoalChecking {
  static readonly provide = 'goalChecking'
  constructor(ctx: Context) {
    super(ctx, GoalCheckingService.provide)
  }
  abstract readonly observe: GoalChecking['observe']
  abstract readonly reran: GoalChecking['reran']
  abstract readonly unexamined: GoalChecking['unexamined']
  abstract readonly compacted: GoalChecking['compacted']
}
export const goalCheckingKey = GoalCheckingService.provide

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
    goalChecking: GoalCheckingService
    goalReconciling: GoalReconcilingService
  }
}
