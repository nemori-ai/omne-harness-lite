import type { CanvasMovers } from '@omne-harness/canvas-contract'
import type { CallOrigin } from '../tool-bindings/live-calls.ts'

/** A call without a tool call is the person's; one with a tool call is the agent of the session that made it. */
export function canvasMovers(
  originOf: (tenantRef: string, call: string) => CallOrigin | undefined,
): CanvasMovers {
  return {
    async moverOf(ctx) {
      if (ctx.call === undefined) return { kind: 'human' }
      const origin = originOf(ctx.tenant, ctx.call)
      return origin === undefined ? null : { kind: 'agent', session: origin.session }
    },
  }
}
