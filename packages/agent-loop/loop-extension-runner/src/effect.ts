import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  judgeConclusion,
  judgeInput,
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

function admittedInput(subject: PositionedSubject, earlier: readonly Conclusion[]) {
  return judgeInput({
    ...subject,
    earlier,
    log: 'runner-compose-log',
    environment: 'runner-compose-environment',
    ...(subject.position === 'before_persist_message'
      ? {}
      : { run: 'runner-compose-run', attempt: 1 }),
  })
}

/** Pure reconstruction from the original subject and already-confirmed chain order. */
export function composeEffect(
  initial: PositionedSubject,
  conclusions: readonly Conclusion[],
): { readonly effect: RunnerEffect } | typeof invalidInput {
  const copied = copyJsonValue(conclusions)
  if (!('ok' in copied) || !Array.isArray(copied.ok)) return invalidInput
  const first = admittedInput(initial, [])
  if (!('ok' in first)) return invalidInput
  let current: PositionedSubject = first.ok
  const earlier: Conclusion[] = []
  for (const raw of copied.ok) {
    const input = admittedInput(current, earlier)
    if (!('ok' in input)) return invalidInput
    let admitted: ReturnType<typeof judgeConclusion>
    try {
      admitted = judgeConclusion(raw, {
        input: input.ok,
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
    earlier.push(item)
    if (item.skipped === 'unavailable' && item.unavailability === 'veto') {
      if (earlier.length !== copied.ok.length) return invalidInput
      return { effect: { kind: 'vetoed', by: item.extension } }
    }
    const output = item.output
    if (output === undefined || output.kind === 'observed' || output.kind === 'inject') continue
    if (output.kind === 'rewrite') {
      const next = judgeInput({ ...current, subject: output.subject })
      if (!('ok' in next)) return invalidInput
      current = next.ok
      continue
    }
    if (output.kind === 'select_model') {
      if (current.position !== 'before_model_call') return invalidInput
      current = {
        ...current,
        subject: { request: { ...current.subject.request, target: output.profile } },
      }
      continue
    }
    if (earlier.length !== copied.ok.length) return invalidInput
    if (output.kind === 'veto') return { effect: { kind: 'vetoed', by: item.extension } }
    if (output.kind === 'stop') return { effect: { kind: 'stopped', by: item.extension } }
    if (output.kind === 'ask')
      return { effect: { kind: 'asked', card: output.card, by: item.extension } }
    if (output.kind === 'retry') return { effect: { kind: 'retry', plan: output.plan } }
  }
  const finalInput = admittedInput(current, earlier)
  return 'ok' in finalInput
    ? { effect: { kind: 'proceed', subject: finalInput.ok.subject } }
    : invalidInput
}
