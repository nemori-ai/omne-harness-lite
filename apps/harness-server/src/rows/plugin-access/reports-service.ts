import { Service, type Context } from '@deepseek-ai/cordis'
import type { PluginReports, ReportedClient } from '@omne-harness/plugin-access'

/**
 * What the connected clients of each tenant last told of themselves, for the rows that show it to an agent.
 * @owner apps/harness-server/src/rows/plugin-access
 */
export abstract class PluginReportsService extends Service {
  static readonly provide = 'pluginReports'
  constructor(ctx: Context) {
    super(ctx, PluginReportsService.provide)
  }
  abstract readonly reportsOf: (tenant: string) => readonly ReportedClient[]
}
export const pluginReportsKey = PluginReportsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginReports: PluginReportsService
  }
}

class PluginReportsImpl extends PluginReportsService {
  readonly reportsOf: PluginReportsService['reportsOf']
  constructor(ctx: Context, reports: Pick<PluginReports, 'reportsOf'>) {
    super(ctx)
    this.reportsOf = tenant => reports.reportsOf(tenant)
  }
}

export function providePluginReports(ctx: Context, reports: Pick<PluginReports, 'reportsOf'>) {
  return new PluginReportsImpl(ctx, reports)
}
