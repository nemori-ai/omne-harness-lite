import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import { routeToolDecisions, type ToolDecisionRoute } from '@omne-harness/tool'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import { toolCommandsKey } from '@omne-harness/tool-cordis-contract/cordis'

type Route = ToolDecisionRoute<unknown>

const tables = new WeakMap<Context, Set<Route>>()

function routesOf(ctx: Context): Set<Route> {
  const root = ctx.root
  const found = tables.get(root)
  if (found !== undefined) return found
  const created = new Set<Route>()
  tables.set(root, created)
  return created
}

/** Mounts the bridge of one wait contract for as long as the scope lives. Its disposal withdraws this route only. */
export function mountDecisionRoute(ctx: Context, route: Route): void {
  const routes = routesOf(ctx)
  ctx.effect(() => {
    routes.add(route)
    return () => void routes.delete(route)
  }, 'tool-runtime.decision-route')
}

/** The decision bridge the release hands to Tool: each wait goes to the bridge mounted for its contract now. */
export function releaseToolDecisions(ctx: Context): ToolDecisionBridge<unknown> {
  const root = ctx.root
  return routeToolDecisions({
    recoveryOf: async access => {
      const commands = root.get(toolCommandsKey)
      if (commands !== undefined) return commands.loadRecovery(access)
      return fail({
        kind: 'unavailable',
        dependency: 'tool-decisions',
        diagnostic: 'tool commands are absent',
      })
    },
    routes: () => [...routesOf(root)],
  })
}
