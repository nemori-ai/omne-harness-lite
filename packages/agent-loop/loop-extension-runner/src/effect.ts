import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  judgeConclusionForSubject,
  judgePositionedSubject,
  type Conclusion,
  type PositionedSubject,
  type Subject,
} from '@omne-harness-lite/loop-extension'

export type RunnerEffect =
  | { readonly kind: 'proceed'; readonly subject: Subject }
  | { readonly kind: 'vetoed'; readonly by: string }
  | { readonly kind: 'stopped'; readonly by: string }
  | {
      readonly kind: 'asked'
      readonly card: Extract<NonNullable<Conclusion['output']>, { readonly kind: 'ask' }>['card']
      readonly by: string
    }
  | {
      readonly kind: 'retry'
      readonly plan: Extract<NonNullable<Conclusion['output']>, { readonly kind: 'retry' }>['plan']
    }

const invalidInput = Object.freeze({ invalidInput: true } as const)

/** Pure reconstruction from the original subject and already-confirmed chain order. */
export function composeEffect(
  initial: PositionedSubject,
  conclusions: readonly Conclusion[],
): { readonly effect: RunnerEffect } | typeof invalidInput {
  const copied = copyJsonValue(conclusions)
  if (!('ok' in copied) || !Array.isArray(copied.ok)) return invalidInput
  const first = judgePositionedSubject(initial)
  if (!('ok' in first)) return invalidInput
  let current: PositionedSubject = first.ok
  for (const [index, raw] of copied.ok.entries()) {
    let admitted: ReturnType<typeof judgeConclusionForSubject>
    try {
      admitted = judgeConclusionForSubject(raw, {
        positionedSubject: current,
        extensionName:
          raw !== null &&
          typeof raw === 'object' &&
          !Array.isArray(raw) &&
          'extension' in raw &&
          typeof raw.extension === 'string'
            ? raw.extension
            : '',
      })
    } catch (error) {
      if (error instanceof TypeError) return invalidInput
      throw error
    }
    if (!('ok' in admitted)) return invalidInput
    const item = admitted.ok
    if (item.skipped === 'unavailable' && item.unavailability === 'veto') {
      if (index !== copied.ok.length - 1) return invalidInput
      return { effect: { kind: 'vetoed', by: item.extension } }
    }
    const output = item.output
    if (output === undefined || output.kind === 'observed' || output.kind === 'inject') continue
    if (output.kind === 'rewrite') {
      const next = judgePositionedSubject({ ...current, subject: output.subject })
      if (!('ok' in next)) return invalidInput
      current = next.ok
      continue
    }
    if (output.kind === 'select_model') {
      if (current.position !== 'before_model_call') return invalidInput
      const next = judgePositionedSubject({
        ...current,
        subject: { request: { ...current.subject.request, target: output.profile } },
      })
      if (!('ok' in next)) return invalidInput
      current = next.ok
      continue
    }
    if (index !== copied.ok.length - 1) return invalidInput
    if (output.kind === 'veto') return { effect: { kind: 'vetoed', by: item.extension } }
    if (output.kind === 'stop') return { effect: { kind: 'stopped', by: item.extension } }
    if (output.kind === 'ask')
      return { effect: { kind: 'asked', card: output.card, by: item.extension } }
    if (output.kind === 'retry') return { effect: { kind: 'retry', plan: output.plan } }
  }
  return { effect: { kind: 'proceed', subject: current.subject } }
}
