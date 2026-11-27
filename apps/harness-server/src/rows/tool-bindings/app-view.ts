import type { Context } from '@deepseek-ai/cordis'
import { interfaceInspectionsKey } from '@omne-harness/interface-access/cordis'
import { attachAppView } from '@omne-harness/interface-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { toolMediaStoreKey } from '@omne-harness/tool-cordis-contract/cordis'
import { TOOL_PRODUCT_OWNER } from '@omne-harness/tool-host-local'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

/** A look is asked of a client of the tenant of the call; its picture is kept as a product of the call, held as the tool host holds products. */
export function bindReleaseAppView(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const holder = {
    owner: TOOL_PRODUCT_OWNER,
    work: parent.call,
    position: 'result',
    purpose: 'product',
  } as const
  return holdLiveCall(
    ctx,
    parent,
    attachAppView(scope, {
      async look(asked, signal) {
        const inspections = ctx.get(interfaceInspectionsKey)
        if (inspections === undefined || !tenant.ok) return { kind: 'unavailable', why: 'unbound' }
        return inspections.inspect(tenant.value, asked, signal)
      },
      media: {
        async put({ mediaType, bytes }) {
          const store = ctx.get(toolMediaStoreKey)
          if (store === undefined)
            return fail({
              kind: 'unavailable',
              operation: 'media.put',
              reason: 'no provider stores products on this host',
            })
          const { principal } = parent
          return store.put({ principal, tenant: parent.tenant, holder, mediaType, bytes })
        },
      },
    }),
  )
}
