import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { isStandardBase64, joinVoice } from './base64.ts'
import type { FillEvent, ReductionMode, WholeFillBlock } from './types.ts'

/** S-19. Preconditions: a legal mode and legal fills of this one block, in producer order. */
export function reduceFills(
  mode: ReductionMode,
  fills: readonly FillEvent['payload'][],
): string | WholeFillBlock | undefined {
  if (
    !['append', 'replace'].includes(mode.fill) ||
    !['text', 'thinking', 'voice', 'tool_call', 'image', 'file', 'tool_result'].includes(
      mode.kind,
    ) ||
    (mode.fill === 'append' && ['image', 'file', 'tool_result'].includes(mode.kind))
  )
    throw new TypeError('invalid reduction mode precondition')
  if (fills.length === 0) return undefined
  if (mode.kind === 'image' || mode.kind === 'file' || mode.kind === 'tool_result') {
    if (mode.fill !== 'replace') throw new TypeError('whole-block mode must replace')
    let last: WholeFillBlock | undefined
    for (const value of fills) {
      const judged = judgeContentBlock(value)
      if (
        'rejected' in judged ||
        judged.ok.kind !== mode.kind ||
        (judged.ok.kind !== 'image' &&
          judged.ok.kind !== 'file' &&
          judged.ok.kind !== 'tool_result')
      )
        throw new TypeError('fill violates whole-block reduction precondition')
      last = judged.ok
    }
    return last
  }
  const parts: string[] = []
  for (const value of fills) {
    if (
      typeof value !== 'string' ||
      (mode.kind === 'voice' && !isStandardBase64(value)) ||
      (mode.fill === 'append' && value.length === 0)
    )
      throw new TypeError('fill violates scalar reduction precondition')
    parts.push(value)
  }
  if (mode.fill === 'replace') return parts.at(-1)
  return mode.kind === 'voice' ? joinVoice(parts) : parts.join('')
}
