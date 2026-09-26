import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { Position } from './types.ts'
import { object, equal, exceptEqual } from './json.ts'

function mediaDerivationOnly(original: JsonValue, rewritten: JsonValue): boolean {
  if (!object(original) || !object(rewritten) || !exceptEqual(original, rewritten, ['blocks']))
    return false
  const oldBlocks = original.blocks
  const newBlocks = rewritten.blocks
  if (
    !Array.isArray(oldBlocks) ||
    !Array.isArray(newBlocks) ||
    oldBlocks.length !== newBlocks.length
  )
    return false
  return oldBlocks.every((oldBlock, index) => {
    const newBlock = newBlocks[index]
    if (!object(oldBlock) || !object(newBlock)) return false
    if (Object.hasOwn(oldBlock, 'renderings')) return equal(oldBlock, newBlock)
    return exceptEqual(oldBlock, newBlock, ['renderings', 'transcript'])
  })
}
/** S-23 value comparison only. System-converter eligibility is a runner assembly fact. */
export function rewriteChangesImmutable(
  position: Position,
  original: JsonObject,
  rewritten: JsonObject,
): boolean {
  switch (position) {
    case 'before_persist_message':
      if (!exceptEqual(original, rewritten, ['message'])) return true
      return (
        original.producer === 'model' &&
        !mediaDerivationOnly(original.message ?? null, rewritten.message ?? null)
      )
    case 'before_model_call':
      return (
        !exceptEqual(original, rewritten, ['request']) ||
        !object(original.request) ||
        !object(rewritten.request) ||
        !exceptEqual(original.request, rewritten.request, ['parameters', 'messages'])
      )
    case 'before_action':
      return (
        !exceptEqual(original, rewritten, ['call']) ||
        !object(original.call) ||
        !object(rewritten.call) ||
        !exceptEqual(original.call, rewritten.call, ['arguments'])
      )
    case 'after_action': {
      if (!exceptEqual(original, rewritten, ['result'])) return true
      if (!Object.hasOwn(rewritten, 'result')) return false
      const result = rewritten.result
      if (
        !object(result) ||
        !equal(result.callId, original.callId) ||
        !equal(result.outcome, original.outcome)
      )
        return true
      const oldResult = original.result
      return (
        object(oldResult) &&
        (!equal(oldResult.callId, result.callId) || !equal(oldResult.outcome, result.outcome))
      )
    }
    default:
      return true
  }
}
