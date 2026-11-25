import type { Context } from '@deepseek-ai/cordis'
import type { GoalChecking, GoalReconciling, Goals } from '@omne-harness/goal-contract'
import {
  GoalCheckingService,
  GoalReconcilingService,
  GoalsService,
} from '@omne-harness/goal-cordis-contract/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { createGoalLocalApplication, type GoalLocalOptions } from './application.ts'

/** What the assembly gives: everything but the storage, which is injected. */
export type GoalLocalConfiguration = Omit<GoalLocalOptions, 'sql'> &
  Readonly<{ sql: Omit<GoalLocalOptions['sql'], 'storage'> }>

class LocalGoals extends GoalsService {
  readonly read: Goals['read']
  readonly write: Goals['write']
  readonly command: Goals['command']
  readonly propose: Goals['propose']
  readonly confirm: Goals['confirm']
  readonly track: Goals['track']
  constructor(ctx: Context, face: Goals) {
    super(ctx)
    this.read = face.read
    this.write = face.write
    this.command = face.command
    this.propose = face.propose
    this.confirm = face.confirm
    this.track = face.track
  }
}

class LocalChecking extends GoalCheckingService {
  readonly observe: GoalChecking['observe']
  readonly compacted: GoalChecking['compacted']
  constructor(ctx: Context, face: GoalChecking) {
    super(ctx)
    this.observe = face.observe
    this.compacted = face.compacted
  }
}

class LocalReconciling extends GoalReconcilingService {
  readonly reconcile: GoalReconciling['reconcile']
  constructor(ctx: Context, face: GoalReconciling) {
    super(ctx)
    this.reconcile = face.reconcile
  }
}

export function createGoalLocalPlugin() {
  return {
    name: 'goal-local',
    inject: [storageKey],
    async apply(ctx: Context, config: GoalLocalConfiguration) {
      const application = await createGoalLocalApplication({
        ...config,
        sql: { ...config.sql, storage: ctx.storage },
      })
      try {
        const bound = [
          ctx.plugin(LocalGoals, application.goals),
          ctx.plugin(LocalChecking, application.checking),
          ctx.plugin(LocalReconciling, application.reconciling),
        ]
        ctx.effect(() => () => application.close(), 'goal-local-drain')
        await Promise.all(bound.map(fiber => fiber.await()))
      } catch (error) {
        try {
          await application.close()
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Goal binding and cleanup failed')
        }
        throw error
      }
    },
  }
}
