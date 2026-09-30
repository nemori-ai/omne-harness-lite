import {
  isJsonNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { MarginalMeterInput, MeterContribution } from '../input-meter.ts'
import { object } from '../json.ts'
import { measureFull, measureNew, measureReplay, type InputMeter } from '../input-meter.ts'

const terminalFrames = ['<｜Assistant｜><think>', '<｜Assistant｜></think>']
export const DEEPSEEK_BOUNDARY_REVISION = 'deepseek-reference-boundary/2'

/** Only this observed visible wire form has a reference reasoning_content projection. */
export function projectDeepSeekMeterBody(body: JsonObject): JsonObject | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const messages: JsonValue[] = []
  for (const message of body.messages) {
    if (!object(message)) return undefined
    if (!Object.hasOwn(message, 'reasoning_details')) {
      messages.push(message)
      continue
    }
    const details = message.reasoning_details
    if (
      message.role !== 'assistant' ||
      Object.hasOwn(message, 'reasoning') ||
      Object.hasOwn(message, 'reasoning_content') ||
      !Array.isArray(details) ||
      details.length !== 1
    )
      return undefined
    const detail = details[0]
    if (
      !object(detail) ||
      Object.keys(detail).length !== 4 ||
      !['type', 'text', 'format', 'index'].every(name => Object.hasOwn(detail, name)) ||
      detail.type !== 'reasoning.text' ||
      typeof detail.text !== 'string' ||
      detail.format !== 'unknown' ||
      !Object.is(detail.index, 0)
    )
      return undefined
    messages.push({
      ...Object.fromEntries(
        Object.entries(message).filter(([name]) => name !== 'reasoning_details'),
      ),
      reasoning_content: detail.text,
    })
  }
  return { ...body, messages }
}

/** The public factory methods must enforce the same history/basis guard as the planner. */
export function guardDeepSeekMeter(raw: InputMeter): InputMeter {
  return Object.freeze({
    ...raw,
    measureFull: (input: Parameters<InputMeter['measureFull']>[0]) => measureFull(raw, input),
    measureReplay: (input: Parameters<InputMeter['measureReplay']>[0]) => measureReplay(raw, input),
    measureNew: (input: Parameters<InputMeter['measureNew']>[0]) => measureNew(raw, input),
  })
}

/** Reference rendering is linear; this function never invokes a tokenizer. */
export function deepSeekBoundaries(
  units: readonly JsonValue[],
  envelope: JsonObject,
  n: number,
  replay: ReadonlySet<number>,
  render: (body: JsonObject) => string | undefined,
): { replay: JsonObject; fresh: JsonObject } | { changed: true } | undefined {
  const projected = projectDeepSeekMeterBody({ ...envelope, messages: [...units] })
  if (!projected || !Array.isArray(projected.messages)) return undefined
  const messages = projected.messages
  const previous = render({ ...envelope, messages: messages.slice(0, n) })
  const middle = render({
    ...envelope,
    messages: messages.filter((_, i) => i < n || replay.has(i)),
  })
  const current = render(projected)
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
  const body = projectDeepSeekMeterBody({ messages: [...input.units] })
  if (!body) return { kind: 'unavailable' }
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

export function deepSeekPythonJson(value: JsonValue): string {
  if (isJsonNumber(value)) return jsonNumberSource(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(deepSeekPythonJson).join(', ')}]`
  return `{${Object.entries(value)
    .map(([name, item]) => `${JSON.stringify(name)}: ${deepSeekPythonJson(item)}`)
    .join(', ')}}`
}

/** Family wire metadata accounting shared by full and signed marginal counts. */
export function createDeepSeekSupplemental(renderedContentFields: readonly string[]) {
  function omittedContent(value: JsonValue | undefined): JsonValue | undefined {
    if (!Array.isArray(value)) return undefined
    const omitted: JsonValue[] = []
    for (const part of value) {
      if (!object(part)) return undefined
      const extra = Object.fromEntries(
        Object.entries(part).filter(([name]) => !renderedContentFields.includes(name)),
      )
      if (Object.keys(extra).length) omitted.push(extra)
    }
    return omitted.length ? omitted : undefined
  }
  return function supplemental(body: JsonObject): JsonObject | undefined {
    if (!Array.isArray(body.messages)) return undefined
    const request = Object.fromEntries(
      Object.entries(body).filter(([name]) => name !== 'messages' && name !== 'tools'),
    )
    const messages: JsonValue[] = []
    for (const message of body.messages) {
      // The pinned reference does not explain private reasoning details. Counting
      // their serialized bytes cannot account for the hidden prompt contribution.
      if (!object(message) || message.reasoning_details !== undefined) return undefined
      const extra = Object.fromEntries(
        Object.entries(message).filter(
          ([name]) =>
            name !== 'role' &&
            name !== 'content' &&
            name !== 'reasoning' &&
            name !== 'reasoning_content' &&
            name !== 'tool_calls',
        ),
      )
      const contentExtra = omittedContent(message.content)
      if (contentExtra) extra.contentParts = contentExtra
      if (Array.isArray(message.tool_calls)) {
        const calls: JsonValue[] = []
        for (const call of message.tool_calls) {
          if (!object(call)) return undefined
          const extras = Object.fromEntries(
            Object.entries(call).filter(([name]) => name !== 'function'),
          )
          if (object(call.function)) {
            const functionExtra = Object.fromEntries(
              Object.entries(call.function).filter(
                ([name]) => name !== 'name' && name !== 'arguments',
              ),
            )
            if (Object.keys(functionExtra).length) extras.function = functionExtra
          }
          if (Object.keys(extras).length) calls.push(extras)
        }
        if (calls.length) extra.toolCallMetadata = calls
      }
      if (Object.keys(extra).length) messages.push(extra)
    }
    const tools: JsonValue[] = []
    if (body.tools !== undefined) {
      if (!Array.isArray(body.tools)) return undefined
      for (const tool of body.tools) {
        if (!object(tool)) return undefined
        const extra = Object.fromEntries(
          Object.entries(tool).filter(([name]) => name !== 'function'),
        )
        if (Object.keys(extra).length) tools.push(extra)
      }
    }
    return {
      request,
      ...(messages.length ? { messages } : {}),
      ...(tools.length ? { tools } : {}),
    }
  }
}
