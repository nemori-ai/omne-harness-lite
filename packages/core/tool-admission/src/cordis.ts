import { Context, Service } from '@deepseek-ai/cordis'
import type { ToolAdmissionOperations } from './index.ts'

/** @contract capability.tool-admission */
export abstract class ToolAdmissionService extends Service implements ToolAdmissionOperations {
  static readonly provide = 'toolAdmission'
  constructor(ctx: Context) { super(ctx, ToolAdmissionService.provide) }
  abstract forPass(...args: Parameters<ToolAdmissionOperations['forPass']>): ReturnType<ToolAdmissionOperations['forPass']>
  abstract verifyToken(...args: Parameters<ToolAdmissionOperations['verifyToken']>): ReturnType<ToolAdmissionOperations['verifyToken']>
}
export const TOOL_ADMISSION = ToolAdmissionService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolAdmission: ToolAdmissionService
  }
}
