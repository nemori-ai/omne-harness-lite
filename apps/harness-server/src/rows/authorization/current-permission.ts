import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { releaseOf } from '../../entry/tool-release.ts'
import { currentToolPermissionKey } from '../governance/current-permission-service.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import {
  createCurrentToolPermission,
  type ToolPermissionAction,
} from './current-tool-permission.ts'
import { readPublishedInquiry } from './published-inquiry.ts'

async function inquiryOf(ctx: Context, input: ToolPermissionAction) {
  const who = sessionWorkOf(input.principal, input.tenant)
  if (who === undefined) return null
  const session = ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey)
  const eligibility = ctx.get(runtimeContextReaderEligibilityKey)
  const runtime = ctx
    .intercept(runtimeContextKey, { consumer: 'coordinator' })
    .get(runtimeContextKey)
  const modes = ctx.get(sessionModesInstallationKey)
  if (!session || !eligibility || !runtime || !modes) return null
  return readPublishedInquiry(
    {
      work: session.work,
      eligibility,
      runtime,
      recoverSession: input => modes.recoverSession(input),
    },
    {
      principal: input.principal,
      tenant: input.tenant,
      // The work principal names its Session. readWork independently verifies that ownership.
      session: who.session as SessionId,
    },
  )
}

/** Optional per-call dependencies keep identity admission independent of runtime assembly. */
export function currentPermissionOf(ctx: Context) {
  return createCurrentToolPermission({
    release: () => releaseOf(ctx),
    source: () => ctx.get(currentToolPermissionKey),
    request: async input => ctx.get(currentToolPermissionKey)?.request(input),
    inquiry: input => inquiryOf(ctx, input),
  })
}
