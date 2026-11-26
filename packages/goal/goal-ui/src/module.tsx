import { goalProtocol } from '@omne-harness/goal-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import { needProtocol, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { GoalDriver, type GoalClient } from './model/goal-driver.ts'
import { goalParts } from './parts.ts'
import { GoalPanel } from './view/goal-panel.tsx'

export const GOAL_IN_SESSION = 'goal'
export const GOAL_TAB_ORDER = 10

export type GoalUiOptions = Readonly<{
  sessionSide?: PointSink<{ readonly session: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>

/** The goal panel as a tab beside the open session. Where that is, the assembly says: this module knows no other module. */
export function createGoalUiModule(options: GoalUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'goal-ui',
    needs: { goal: needProtocol<GoalClient>(goalProtocol) },
    apply(shell, { goal: client }) {
      for (const part of goalParts) part.declare(shell)
      const drivers = new Map<string, GoalDriver>()
      const driverOf = (scope: string, session: string): GoalDriver | undefined => {
        const tenant = readTenantText(scope)
        if (tenant === undefined) return undefined
        const key = JSON.stringify([scope, session])
        const held = drivers.get(key) ?? new GoalDriver({ client, tenant, session })
        drivers.set(key, held)
        return held
      }
      options.sessionSide?.contribute(shell, {
        id: GOAL_IN_SESSION,
        order: GOAL_TAB_ORDER,
        label: '目标',
        render: ({ scope, subject }) => {
          const driver = scope === undefined ? undefined : driverOf(scope, subject.session)
          return driver === undefined ? null : <GoalPanel driver={driver} />
        },
      })
      return () => drivers.clear()
    },
  })
}
