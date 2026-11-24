import { Service, type Context } from '@deepseek-ai/cordis'
import type { Kept } from '@omne-harness/plugin-protocol'

/**
 * How the server stands with the plugins of each tenant, for the rows that show it to an agent.
 * @owner apps/harness-server/src/rows/plugin-server
 */
export abstract class PluginServerService extends Service {
  static readonly provide = 'pluginServer'
  constructor(ctx: Context) {
    super(ctx, PluginServerService.provide)
  }
  /** By the name of each plugin; undefined for a tenant the server has not taken up. */
  abstract readonly states: (tenant: string) => ReadonlyMap<string, Kept> | undefined
}
export const pluginServerKey = PluginServerService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginServer: PluginServerService
  }
}

class PluginServerImpl extends PluginServerService {
  readonly states: PluginServerService['states']
  constructor(ctx: Context, states: PluginServerService['states']) {
    super(ctx)
    this.states = states
  }
}

export function providePluginServer(ctx: Context, states: PluginServerService['states']) {
  return new PluginServerImpl(ctx, states)
}
