import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { DecisionCardDraft } from '@omne-harness-lite/loop-extension'
import type {
  AdmissionInput,
  AdmissionJudgment,
  AdmissionResult,
  AuthorizationContext,
} from '@omne-harness-lite/tool-admission'
import { captureBatch } from './input.ts'
import { tokenForCall } from './token.ts'

export interface AdmissionJudgmentDependencies {
  /** Omission means this assembly cannot evaluate authorization expressions. */
  readonly evaluate?: (
    call: AdmissionInput['call'],
    grants: AuthorizationContext,
  ) => Promise<'allow' | 'deny' | 'undecidable' | { readonly unavailable: true }>
}
const unavailable = Object.freeze({ kind: 'failed', reason: 'unavailable' } as const)
const options = [
  { id: 'deny', label: '不允许' },
  { id: 'allow_once', label: '这次允许' },
  { id: 'allow_session', label: '本会话内，这类情况都允许' },
  { id: 'allow_tenant', label: '将来本租户所有会话，这类情况全允许' },
] as const
function card(input: AdmissionInput): DecisionCardDraft {
  if (input.effectivePermission === 'not_in_composition') throw new Error('unheld call cannot ask')
  const tenant = input.tenantAutoWritable
    ? '选择“将来本租户所有会话，这类情况全允许”将写入租户层的工具执行权限，供本租户后续会话使用。'
    : ''
  return Object.freeze({
    about: Object.freeze({ position: 'before_action', callId: input.call.callId }),
    options: Object.freeze(
      options
        .slice(0, input.tenantAutoWritable ? 4 : 3)
        .map(option => Object.freeze({ ...option })),
    ) as DecisionCardDraft['options'],
    explanation:
      `将调用工具 ${input.call.tool}，执行参数为 ${writeJsonLossless(input.call.arguments)}。` +
      `执行权限来自 ${input.effectivePermission.from}，其值为“问一下”；已有授权不能判定此次调用，会话运行模式为 auto_permission。` +
      '选择“不允许”将拒绝此次调用；“这次允许”只放行此次调用，不保留后续授权。' +
      '选择“本会话内，这类情况都允许”将把授权记入本会话，供本会话的后续准入判断使用。' +
      tenant +
      '答复将解除本次运行的等待，但须等本批全部卡片答完；之后仍可能需要回答新一轮卡片。' +
      '放行后还须检查执行环境权限，放行不保证执行成功。',
  })
}
async function judge(
  input: AdmissionInput,
  dependencies: AdmissionJudgmentDependencies,
): Promise<AdmissionResult | typeof unavailable> {
  if (input.effectivePermission === 'not_in_composition')
    return { kind: 'deny', reason: 'not_held' }
  if (input.effectivePermission.value === 'forbid')
    return { kind: 'deny', reason: 'permission_forbidden' }
  const allow = (): AdmissionResult => ({ kind: 'allow', token: tokenForCall(input.call) })
  if (input.answer !== undefined) {
    if (input.answer === 'deny') return { kind: 'deny', reason: 'human_refused' }
    if (input.answer === 'declined') return { kind: 'deny', reason: 'human_declined' }
    return allow()
  }
  if (input.effectivePermission.value === 'auto') return allow()
  if (dependencies.evaluate === undefined) return unavailable
  const result = await dependencies.evaluate(input.call, input.grants)
  if (result === 'allow') return allow()
  if (result === 'deny') return { kind: 'deny', reason: 'authorization_denied' }
  if (result !== 'undecidable') return unavailable
  if (input.runMode === 'never') return { kind: 'deny', reason: 'run_mode_never' }
  if (input.runMode === 'bypass-permissions') return allow()
  return { kind: 'ask', card: card(input) }
}

/** Pure batch judgment. The runner owns current input provenance and durable conclusions. */
export function createAdmissionJudgment(
  dependencies: AdmissionJudgmentDependencies = {},
): AdmissionJudgment {
  const owned = Object.freeze({ ...dependencies })
  return Object.freeze({
    async admit(batch) {
      const checked = captureBatch(batch)
      if ('kind' in checked) return checked
      const results: AdmissionResult[] = []
      try {
        for (const input of checked.batch) {
          const result = await judge(input, owned)
          if (result.kind === 'failed') return result
          results.push(Object.freeze(result))
        }
      } catch {
        return unavailable
      }
      return {
        kind: 'decisions',
        results: Object.freeze(results) as readonly [AdmissionResult, ...AdmissionResult[]],
      }
    },
  } satisfies AdmissionJudgment)
}
