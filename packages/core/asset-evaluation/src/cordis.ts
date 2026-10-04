import { Context, Service } from '@deepseek-ai/cordis'
import type { CurrentEvaluationInputs as Operations0, EvaluationInputSupport as Operations1 } from './index.ts'

/** @contract capability.asset-evaluation */
export abstract class CurrentEvaluationInputsService extends Service implements Operations0 {
  static readonly provide = 'currentEvaluationInputs'
  constructor(ctx: Context) { super(ctx, CurrentEvaluationInputsService.provide) }
  abstract read(...args: Parameters<Operations0['read']>): ReturnType<Operations0['read']>
}
export const CURRENT_EVALUATION_INPUTS = CurrentEvaluationInputsService.provide

/** @contract capability.asset-evaluation */
export abstract class EvaluationInputSupportService extends Service implements Operations1 {
  static readonly provide = 'evaluationInputSupport'
  constructor(ctx: Context) { super(ctx, EvaluationInputSupportService.provide) }
  abstract monotonicNow(...args: Parameters<Operations1['monotonicNow']>): ReturnType<Operations1['monotonicNow']>
  abstract diagnostics(...args: Parameters<Operations1['diagnostics']>): ReturnType<Operations1['diagnostics']>
  abstract onDiagnosticFailure(...args: Parameters<Operations1['onDiagnosticFailure']>): ReturnType<Operations1['onDiagnosticFailure']>
}
export const EVALUATION_INPUT_SUPPORT = EvaluationInputSupportService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    currentEvaluationInputs: CurrentEvaluationInputsService
    evaluationInputSupport: EvaluationInputSupportService
  }
}
