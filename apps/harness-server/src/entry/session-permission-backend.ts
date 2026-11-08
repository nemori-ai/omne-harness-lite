import type { Context } from '@deepseek-ai/cordis'
import type { EntryObjectModule } from '../types.ts'
import {
  SessionPermissionBackendService,
  sessionPermissionBackendKey,
} from '../rows/governance/session-permission-backend-service.ts'
import type { SessionPermissionBackendReader } from '../rows/governance/session-permission-commit.ts'

class SessionPermissionBackend extends SessionPermissionBackendService {
  readonly read: SessionPermissionBackendReader

  constructor(ctx: Context, select: SessionPermissionBackendReader) {
    super(ctx)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'session-permission-backend.active',
    )
    this.read = async context => {
      if (!active) return undefined
      const backend = await select(context)
      return active ? backend : undefined
    }
  }
}

/** The caller owns tenant routing and backend shutdown; this module owns only publication. */
export function sessionPermissionBackendModule(
  select: SessionPermissionBackendReader,
): EntryObjectModule {
  return {
    name: sessionPermissionBackendKey,
    implementation: 'real',
    install(scope) {
      new SessionPermissionBackend(scope, select)
    },
  }
}
