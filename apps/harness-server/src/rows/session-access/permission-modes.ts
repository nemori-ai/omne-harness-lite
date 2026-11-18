import type { Context } from '@deepseek-ai/cordis'
import type { SessionPermissionModes } from '@omne-harness/session-access'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'

// Computed for the login as Session publishes it for authorization, so a person reads what is judged.
export function sessionPermissionModes(ctx: Context): SessionPermissionModes {
  return {
    async read(access) {
      const installation = ctx.get(sessionModesInstallationKey)
      if (installation === undefined) return { kind: 'unavailable' }
      return installation.readPermissionMode(access)
    },
  }
}
