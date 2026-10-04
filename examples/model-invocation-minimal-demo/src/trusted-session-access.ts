import { type Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { SessionAccessService, SESSION_ACCESS_AUTHORITY } from '@omne-harness-lite/session-tenancy/cordis'
import type { AccessIdentity, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { z } from 'zod'
import { createSessionAccessOwner } from './session-access.ts'

class AccessProvider extends SessionAccessService {
  constructor(ctx: Context, private readonly operations: SessionAccessOperations) { super(ctx) }
  authorize(...args: Parameters<SessionAccessOperations['authorize']>) { return this.operations.authorize(...args) }
}

/** This factory result is private bootstrap state, never a service or plugin config. */
export function createTrustedSessionAccessPlugin() {
  let current: ReturnType<typeof createSessionAccessOwner> | undefined
  const plugin = definePlugin({
    name: 'trusted-session-access', inject: [SESSION_ACCESS_AUTHORITY], Config: z.object({}).strict(),
    apply(ctx) {
      const owner = createSessionAccessOwner(ctx.sessionAccessAuthority)
      ctx.effect(() => {
        current = owner
        return () => { owner.stop(); if (current === owner) current = undefined }
      })
      new AccessProvider(ctx, owner.operations)
    },
  })
  return Object.freeze({ plugin, currentIssuer(ingress: AccessIdentity) {
    return current ? current.issuerFor(ingress) : { unavailable: true as const }
  } })
}
