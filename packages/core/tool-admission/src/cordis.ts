import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ToolAdmissionOperations,
  ToolAdmissionPassSourceOperations,
  ToolActionHistoryOperations,
} from './index.ts'

/** @contract capability.tool-admission */
export abstract class ToolAdmissionService extends Service implements ToolAdmissionOperations {
  static readonly provide = 'toolAdmission'
  constructor(ctx: Context) {
    super(ctx, ToolAdmissionService.provide)
  }
  abstract forPass(
    ...args: Parameters<ToolAdmissionOperations['forPass']>
  ): ReturnType<ToolAdmissionOperations['forPass']>
  abstract verifyToken(
    ...args: Parameters<ToolAdmissionOperations['verifyToken']>
  ): ReturnType<ToolAdmissionOperations['verifyToken']>
}
export const TOOL_ADMISSION = ToolAdmissionService.provide

/** @contract capability.tool-admission */
export abstract class ToolAdmissionPassSourceService
  extends Service
  implements ToolAdmissionPassSourceOperations
{
  static readonly provide = 'toolAdmissionPassSource'
  constructor(ctx: Context) {
    super(ctx, ToolAdmissionPassSourceService.provide)
  }
  abstract read(
    ...args: Parameters<ToolAdmissionPassSourceOperations['read']>
  ): ReturnType<ToolAdmissionPassSourceOperations['read']>
}
export const TOOL_ADMISSION_PASS_SOURCE = ToolAdmissionPassSourceService.provide

/** @contract capability.tool-admission */
export abstract class ToolActionHistoryService
  extends Service
  implements ToolActionHistoryOperations
{
  static readonly provide = 'toolActionHistory'
  constructor(ctx: Context) {
    super(ctx, ToolActionHistoryService.provide)
  }
  abstract inspect(
    ...args: Parameters<ToolActionHistoryOperations['inspect']>
  ): ReturnType<ToolActionHistoryOperations['inspect']>
}
export const TOOL_ACTION_HISTORY = ToolActionHistoryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolActionHistory: ToolActionHistoryService
    toolAdmission: ToolAdmissionService
    toolAdmissionPassSource: ToolAdmissionPassSourceService
  }
}
