import { Service, type Context } from '@deepseek-ai/cordis'

/** Values the operator gives a release tool's declared settings, by tool name and item id. */
export type OperatorToolSettings = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/** @owner apps/harness-server/src/rows/tool-host */
export abstract class ToolOperatorSettingsService extends Service {
  static readonly provide = 'toolOperatorSettings'
  constructor(ctx: Context) {
    super(ctx, ToolOperatorSettingsService.provide)
  }
  /** The operator's values for one tool; an empty record when the operator gives none. */
  abstract readonly read: (tool: string) => Readonly<Record<string, unknown>>
}
export const toolOperatorSettingsKey = ToolOperatorSettingsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolOperatorSettings: ToolOperatorSettingsService
  }
}

export class ToolOperatorSettingsImpl extends ToolOperatorSettingsService {
  readonly read: (tool: string) => Readonly<Record<string, unknown>>
  constructor(ctx: Context, values: OperatorToolSettings) {
    super(ctx)
    this.read = tool => (Object.hasOwn(values, tool) ? (values[tool] ?? {}) : {})
  }
}
