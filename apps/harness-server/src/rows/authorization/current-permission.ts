import type { Context } from '@deepseek-ai/cordis'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { releaseOf } from '../../entry/tool-release.ts'
import { currentToolPermissionKey } from '../governance/current-permission-service.ts'
import { publishedViewPortsOf, readPublishedView } from '../session-ad03/published-view.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import {
  createCurrentToolPermission,
  type ToolPermissionAction,
} from './current-tool-permission.ts'

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
      // The work principal names its Session. readWork independently verifies that ownership.
      session: who.session as SessionId,
    },
    sessionInquiryBinding,
  )
  return 'ok' in read ? read.ok : null
}

/** Optional per-call dependencies keep identity admission independent of runtime assembly. */
export function currentPermissionOf(ctx: Context) {
  return createCurrentToolPermission({
    release: () => releaseOf(ctx),
    source: () => ctx.get(currentToolPermissionKey),
    inquiry: input => inquiryOf(ctx, input),
  })
}
