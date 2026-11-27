import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createTaskWaitBridge, MCP_TASK_WAIT_OWNER, mcpTaskWait } from '@omne-harness/mcp-bridge'
import type { CorrelationKey, Millis, TaskWatch } from '@omne-harness/mcp-contract'
import { mcpTaskWatchKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { toolCommandsKey, toolInstanceHostKey } from '@omne-harness/tool-cordis-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { mountDecisionRoute } from '../tool-runtime/decision-routes.ts'

type Wake = (tenant: TenantId, call: CorrelationKey) => void

function wakeOf(ctx: Context): Wake {
  const warn = (text: string) => ctx.logger('mcp-tasks').warn(text)
  return (tenant, call) => {
    const id = decodeToolCallId(call)
    const host = ctx.get(toolInstanceHostKey, false)
    if ('failure' in id || host === undefined || host === null) return
    void host
      .schedule({ tenant, call: id.ok })
      .then(queued => {
        if ('failure' in queued)
          warn(`a call whose task got somewhere was not woken: ${queued.failure.kind}`)
      })
      .catch(() => warn('a call whose task got somewhere was not woken: the host threw'))
  }
}

/** After a restart the watcher holds no principal: each call it still follows is woken once, and the bridge gives the principal again. */
async function wakeFollowed(ctx: Context, watch: TaskWatch<unknown>, wake: Wake): Promise<void> {
  const directory = ctx.get(tenantDomainsKey, false) as TenantDomains<unknown> | undefined
  const listed = await directory
    ?.enumerate({ principal: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY) })
    .catch(() => undefined)
  if (listed?.kind !== 'ready') return
  for (const entry of listed.entries) {
    const tenant = tenantCodec.parse(entry.tenant)
    if (!tenant.ok) continue
    const calls = await watch.following(tenant.value).catch(() => undefined)
    if (calls !== undefined && 'ok' in calls) for (const call of calls.ok) wake(tenant.value, call)
  }
}

/** The task wait of MCP in the release: its decision bridge, the wake-up of calls whose task got somewhere, and the restart. */
export function mountMcpTasks(ctx: Context, connectBound: Millis): void {
  const bridge = createTaskWaitBridge<unknown>({
    watch: () => ctx.get(mcpTaskWatchKey, false) ?? undefined,
    connectBound,
    recoveryOf: async access => {
      const commands = ctx.get(toolCommandsKey, false)
      if (commands === undefined || commands === null)
        return fail({
          kind: 'unavailable',
          dependency: MCP_TASK_WAIT_OWNER,
          diagnostic: 'tool commands are absent',
        })
      return commands.loadRecovery(access)
    },
  })
  mountDecisionRoute(ctx, { contract: mcpTaskWait.adoption, bridge: () => bridge })
  ctx.inject([mcpTaskWatchKey, toolInstanceHostKey, tenantDomainsKey], child => {
    const watch = child.get(mcpTaskWatchKey) as TaskWatch<unknown>
    const wake = wakeOf(child)
    child.effect(() => watch.subscribe(wake), 'mcp.task-wake')
    void wakeFollowed(child, watch, wake).catch(() => undefined)
  })
}
