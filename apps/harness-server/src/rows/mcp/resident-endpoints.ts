import { Service, type Context } from '@deepseek-ai/cordis'
import type { Access } from '@omne-harness/legal-identity'
import type { NamedEntry } from '@omne-harness/mcp-bridge'

/** One MCP endpoint by the name of its tool, as the bridge lists it to this asker now: asked at an adoption point. */
export abstract class ResidentEndpointsService extends Service {
  static readonly provide = 'residentEndpoints'
  constructor(ctx: Context) {
    super(ctx, ResidentEndpointsService.provide)
  }
  abstract readonly named: (access: Access<unknown>, name: string) => Promise<NamedEntry>
}
export const residentEndpointsKey = ResidentEndpointsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    residentEndpoints: ResidentEndpointsService
  }
}

class ResidentEndpointsImpl extends ResidentEndpointsService {
  readonly named: ResidentEndpointsService['named']
  constructor(ctx: Context, named: ResidentEndpointsService['named']) {
    super(ctx)
    this.named = named
  }
}

export function provideResidentEndpoints(ctx: Context, named: ResidentEndpointsService['named']) {
  return new ResidentEndpointsImpl(ctx, named)
}
