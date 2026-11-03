import type { ProducedResult, Failure, LoopFacts } from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
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
  }>

/**
 * A sealed reasoning part: an opaque `reasoning_state` or a `thinking` block. The delivery carries
 * no original scope/format for them (R2-D70), so the reply cannot carry the `replay` a
 * `reasoning_state` needs (message SPEC RS-03), and a `thinking` block whose signature is dropped is
 * not sent back. R2-D268: the reply leaves them out, as the projection rule of message SPEC (a
 * projection that removes every reasoning_state and no thinking stays has no `replay`) allows. The
 * received material keeps them unchanged.
 */
function sealedReasoning(part: M.ResultPart): boolean {
  return (
    part.kind === 'sealed' &&
    (part.block.kind === 'reasoning_state' || part.block.kind === 'thinking')
  )
}

/**
 * The interpretation of one received result. The reply is formed from the parts that are not sealed
 * reasoning (R2-D268); an unsealed thinking part is a partial part as any other. `parts` stays the
 * whole received delivery.
 */
export function consumeModelResult(
  input: Parameters<typeof replyMessageId>,
  value: Omit<ModelResult, 'kind'>,
): Outcome<ModelResult, Failure> {
  const content = value.parts.filter(part => !sealedReasoning(part))
  const terminal = value.settlement.termination
  if (terminal.kind === 'interrupted') return succeed({ ...value, kind: 'partial' })
  if (terminal.kind !== 'completed' || content.some(part => part.kind === 'partial'))
    return succeed({ ...value, kind: content.length === 0 ? 'no-reply' : 'partial' })
  const blocks: M.ModelBlock[] = []
  for (const part of content) {
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
