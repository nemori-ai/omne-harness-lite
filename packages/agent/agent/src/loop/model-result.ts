// Consumer classification of a settled Model result. Raw partial values never become blocks or
// executable tool suggestions. Replay-bearing output needs producer metadata not yet in ResultPage.
import type { ProducedResult, Failure, LoopFacts } from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { replyMessageId } from './identities.ts'

type Message = LoopFacts['inputs'][number]
export type ModelOutcome = Readonly<{
  produced: ProducedResult
  settlement: M.Settlement
}> &
  (
    | Readonly<{ kind: 'reply'; reply: Extract<Message, { role: 'assistant' }> }>
    | Readonly<{ kind: 'partial' }>
    | Readonly<{ kind: 'no-reply' }>
  )
export type ModelResult = ModelOutcome &
  Readonly<{
    parts: readonly M.ResultPart[]
    dispatches: readonly M.DispatchRecord[]
  }>

export function consumeModelResult(
  input: Parameters<typeof replyMessageId>,
  value: Omit<ModelResult, 'kind'>,
): Outcome<ModelResult, Failure> {
  // Model SPEC requires replay scope/format even for thinking-only output. These tags are not
  // available on the ordinary result read surface. Keep producer responsibility instead of ACK.
  if (
    value.parts.some(part =>
      part.kind === 'partial'
        ? part.content === 'thinking'
        : part.block.kind === 'reasoning_state' || part.block.kind === 'thinking',
    )
  )
    return fail({ kind: 'unsupported' })
  const terminal = value.settlement.termination
  if (terminal.kind === 'interrupted') return succeed({ ...value, kind: 'partial' })
  if (terminal.kind !== 'completed' || value.parts.some(part => part.kind === 'partial'))
    return succeed({ ...value, kind: value.parts.length === 0 ? 'no-reply' : 'partial' })
  const blocks: M.ModelBlock[] = []
  for (const part of value.parts) {
    if (part.kind === 'sealed') blocks.push(part.block)
  }
  const [first, ...rest] = blocks
  if (first === undefined) return succeed({ ...value, kind: 'no-reply' })
  return succeed({
    ...value,
    kind: 'reply',
    reply: { id: replyMessageId(...input), role: 'assistant', blocks: [first, ...rest] },
  })
}
