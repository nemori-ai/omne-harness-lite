import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { MarginalMeterInput, MeterContribution } from '../input-meter.ts'
import { object } from '../json.ts'

const terminalFrames = ['<｜Assistant｜><think>', '<｜Assistant｜></think>']
export const DEEPSEEK_BOUNDARY_REVISION = 'deepseek-reference-boundary/1'

/** Reference rendering is linear; this function never invokes a tokenizer. */
export function deepSeekBoundaries(
  units: readonly JsonValue[],
  envelope: JsonObject,
  n: number,
  replay: ReadonlySet<number>,
  render: (body: JsonObject) => string | undefined,
): { replay: JsonObject; fresh: JsonObject } | { changed: true } | undefined {
  // JSON/ciphertext size does not explain private reasoning replay semantics.
  if (units.some(unit => !object(unit) || unit.reasoning_details !== undefined)) return undefined
  const previous = render({ ...envelope, messages: units.slice(0, n) })
  const middle = render({ ...envelope, messages: units.filter((_, i) => i < n || replay.has(i)) })
  const current = render({ ...envelope, messages: [...units] })
  if (previous === undefined || middle === undefined || current === undefined) return undefined
  const terminal = terminalFrames.find(frame => previous.endsWith(frame)) ?? ''
  const stable = terminal ? previous.slice(0, -terminal.length) : previous
  // A rewrite inside substantive old input is not a marginal correction.
  if (!middle.startsWith(stable) || !current.startsWith(stable)) return { changed: true }
  // With N present, only δ may own a terminal rewrite. If G alone already
  // rewrites that terminal, this decomposition is not supported; use full.
  const hasFresh = units.some((_, index) => index >= n && !replay.has(index))
  if (hasFresh && !middle.startsWith(previous)) return undefined
  const oldTail = previous.slice(stable.length)
  const replayTail = middle.slice(stable.length)
  const finalTail = current.slice(stable.length)
  const boundary = (removed: string, added: string): JsonObject =>
    Object.freeze({
      revision: DEEPSEEK_BOUNDARY_REVISION,
      removed,
      added,
    })
  return { replay: boundary(oldTail, replayTail), fresh: boundary(replayTail, finalTail) }
}

/** Only the prepared suffixes (including the finite old framing) reach the tokenizer.
 * Independent suffix encoding and private serving differences remain estimated.
 */
export function measureDeepSeekBoundary(
  input: MarginalMeterInput,
  encode: (text: string) => number,
  supplemental: (body: JsonObject) => JsonObject | undefined,
  images: (body: JsonObject) => number | undefined = () => 0,
): MeterContribution {
  const b = input.boundary
  if (
    !b ||
    b.revision !== DEEPSEEK_BOUNDARY_REVISION ||
    typeof b.removed !== 'string' ||
    typeof b.added !== 'string' ||
    Object.keys(b).some(key => !['revision', 'removed', 'added'].includes(key))
  )
    return { kind: 'unavailable' }
  const body = { messages: [...input.units] }
  const extra = supplemental(body),
    empty = supplemental({ messages: [] })
  const imageTokens = images(body)
  if (!extra || !empty || imageTokens === undefined) return { kind: 'unavailable' }
  try {
    return {
      kind: 'estimated',
      tokens:
        encode(b.added) -
        encode(b.removed) +
        encode(writeJsonLossless(extra)) -
        encode(writeJsonLossless(empty)) +
        imageTokens,
    }
  } catch {
    return { kind: 'unavailable' }
  }
}
