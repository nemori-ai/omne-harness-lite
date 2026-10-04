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
    const item = admitConclusion(raw, current)
    if (item === undefined) return invalidInput
    const applied = applyConclusion(current, item)
    if ('invalidInput' in applied) return invalidInput
    if ('effect' in applied) return index === copied.ok.length - 1 ? applied : invalidInput
    current = applied.current
  }
  return { effect: { kind: 'proceed', subject: current.subject } }
}

function admitConclusion(raw: unknown, current: PositionedSubject): Conclusion | undefined {
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
    if (error instanceof TypeError) return undefined
    throw error
  }
  return 'ok' in admitted ? admitted.ok : undefined
}

function terminalEffect(
  item: Conclusion,
  output: NonNullable<Conclusion['output']>,
): RunnerEffect | undefined {
  if (output.kind === 'veto') return { kind: 'vetoed', by: item.extension }
  if (output.kind === 'stop') return { kind: 'stopped', by: item.extension }
  if (output.kind === 'ask') return { kind: 'asked', card: output.card, by: item.extension }
  if (output.kind === 'retry') return { kind: 'retry', plan: output.plan }
  return undefined
}

function applyConclusion(
  current: PositionedSubject,
  item: Conclusion,
):
  | { readonly current: PositionedSubject }
  | { readonly effect: RunnerEffect }
  | typeof invalidInput {
  if (item.skipped === 'unavailable' && item.unavailability === 'veto')
    return { effect: { kind: 'vetoed', by: item.extension } }
  const output = item.output
  if (output === undefined || output.kind === 'observed' || output.kind === 'inject')
    return { current }
  if (output.kind === 'rewrite') {
    const next = judgePositionedSubject({ ...current, subject: output.subject })
    return 'ok' in next ? { current: next.ok } : invalidInput
  }
  if (output.kind === 'select_model') {
    if (current.position !== 'before_model_call') return invalidInput
    const next = judgePositionedSubject({
      ...current,
      subject: { request: { ...current.subject.request, target: output.profile } },
    })
    return 'ok' in next ? { current: next.ok } : invalidInput
  }
  const effect = terminalEffect(item, output)
  return effect === undefined ? { current } : { effect }
}
