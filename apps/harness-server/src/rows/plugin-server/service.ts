import { Service, type Context } from '@deepseek-ai/cordis'
import type { Kept, Member } from '@omne-harness/plugin-protocol'

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
  /** The members of the version a fiber put, as its manifest wrote them; undefined for a fiber of no plugin. */
  abstract readonly members: (fiber: string) => readonly Member[] | undefined
}
export const pluginServerKey = PluginServerService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginServer: PluginServerService
  }
}

class PluginServerImpl extends PluginServerService {
  readonly states: PluginServerService['states']
  readonly members: PluginServerService['members']
  constructor(
    ctx: Context,
    states: PluginServerService['states'],
    members: PluginServerService['members'],
  ) {
    super(ctx)
    this.states = states
    this.members = members
  }
}

export function providePluginServer(
  ctx: Context,
  states: PluginServerService['states'],
  members: PluginServerService['members'] = () => undefined,
) {
  return new PluginServerImpl(ctx, states, members)
}
