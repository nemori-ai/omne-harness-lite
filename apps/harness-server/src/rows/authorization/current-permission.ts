import type { Context } from '@deepseek-ai/cordis'
import { canonicalText } from '@omne-harness/authorization'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { permissionDeclarationsOf } from '../../entry/permission-declarations.ts'
import { currentToolPermissionKey } from '../governance/current-permission-service.ts'
import { publishedViewPortsOf, readPublishedView } from '../session-ad03/published-view.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { passMemory } from './pass-memory.ts'
import {
  createCurrentToolPermission,
  type ToolPermissionAction,
} from './current-tool-permission.ts'

const tenantText = (tenant: TenantId) => {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}
// One judging pass reads the session's inquiry policy once; a new pass reads it again.
export function inquiryOncePerPass(
  read: (input: ToolPermissionAction) => Promise<SessionInquiryView | null>,
) {
  const once = passMemory<SessionInquiryView | null>()
  return (input: ToolPermissionAction) => {
    const pass = input.origin.kind === 'agent-action' ? input.origin.pass : undefined
    const who = sessionWorkOf(input.principal, input.tenant)
    const key =
      pass === undefined
        ? undefined
        : canonicalText([tenantText(input.tenant), who?.session ?? null, pass])
    return once(key, () => read(input))
  }
}

async function inquiryOf(ctx: Context, input: ToolPermissionAction) {
  const who = sessionWorkOf(input.principal, input.tenant)
  if (who === undefined) return null
  const ports = publishedViewPortsOf(ctx)
  if (ports === null) return null
  const read = await readPublishedView(
    ports,
    {
      principal: input.principal,
      tenant: input.tenant,
      session: who.session as SessionId,
    },
    sessionInquiryBinding,
  )
  return 'ok' in read ? read.ok : null
}

export function currentPermissionOf(ctx: Context) {
  return createCurrentToolPermission({
    declarations: () => permissionDeclarationsOf(ctx),
    source: () => ctx.get(currentToolPermissionKey),
    inquiry: inquiryOncePerPass(input => inquiryOf(ctx, input)),
  })
}
