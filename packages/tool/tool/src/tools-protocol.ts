import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  type ToolFailure,
  type ToolBodyId,
  type ToolFixedReadArguments,
  type ToolInvocationRef,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  decodeToolInvocationRef,
  decodeToolBodyId,
  decodeToolResultVersion,
  describedAdoption,
} from '@omne-harness/tool-contract/provider'

export const toolsAdoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'Tools',
  revision: '1',
})
export type ReadArguments = ToolFixedReadArguments
export type ResultReference = Readonly<{ reference: ToolInvocationRef; result: ToolResultVersion }>
export type BodyReference = ResultReference & Readonly<{ bodyId: ToolBodyId }>
export type AttachmentReference = Readonly<{
  source: ResultReference
  reference: string
  selector: number
}>

export function protocol(limits: JsonLimits) {
  const projection = (kind: ReadArguments['kind']) =>
    kind === 'result' ? 'full' : kind === 'body' ? 'text' : 'bytes'
  const allowed = (text: string) =>
    text.length <= limits.maxStringLength && Buffer.byteLength(text) <= limits.maxBytes
  function encode(prefix: string, fields: readonly (string | number)[]): string {
    return `${prefix}.${Buffer.from(JSON.stringify(fields)).toString('base64url')}`
  }
  function decode(
    text: string,
    prefix: string,
    length: number,
  ): Outcome<readonly JsonValue[], ToolFailure> {
    const bad = () =>
      fail<ToolFailure>({ kind: 'invalid-cursor', reason: 'invalid-tools-encoding' })
    if (!allowed(text) || !text.startsWith(`${prefix}.`)) return bad()
    const body = text.slice(prefix.length + 1)
    if (!/^[A-Za-z0-9_-]+$/u.test(body)) return bad()
    const bytes = Buffer.from(body, 'base64url')
    if (bytes.toString('base64url') !== body) return bad()
    const parsed = readJsonText(bytes.toString('utf8'), limits)
    if (parsed.kind !== 'ok' || parsed.value.kind !== 'array') return bad()
    const items = parsed.value.items
    if (items.length !== length || items[0]?.kind !== 'number' || items[0].lexeme !== '1')
      return bad()
    const plain = items.map(item =>
      item.kind === 'string' ? item.value : item.kind === 'number' ? Number(item.lexeme) : null,
    )
    if (
      plain.some(item => item === null) ||
      encode(
        prefix,
        plain.filter(item => item !== null),
      ) !== text
    )
      return bad()
    return succeed(items)
  }
  function readResult(text: string): Outcome<ResultReference, ToolFailure> {
    const decoded = decode(text, 'tr1', 3)
    if ('failure' in decoded) return decoded
    const [, invocation, version] = decoded.ok
    if (invocation?.kind !== 'string' || version?.kind !== 'string')
      return fail({ kind: 'invalid', field: 'reference', reason: 'result-reference' })
    const reference = decodeToolInvocationRef(invocation.value),
      result = decodeToolResultVersion(version.value)
    if ('failure' in reference || 'failure' in result || reference.ok !== invocation.value)
      return fail({ kind: 'invalid', field: 'reference', reason: 'result-reference' })
    return succeed({ reference: reference.ok, result: result.ok })
  }
  return {
    allowed,
    result: (value: ResultReference) => encode('tr1', [1, value.reference, value.result]),
    body: (value: BodyReference) => encode('tb1', [1, value.reference, value.result, value.bodyId]),
    readBody(text: string): Outcome<BodyReference, ToolFailure> {
      const decoded = decode(text, 'tb1', 4)
      if ('failure' in decoded) return decoded
      const [, invocation, version, body] = decoded.ok
      if (invocation?.kind !== 'string' || version?.kind !== 'string' || body?.kind !== 'string')
        return fail({ kind: 'invalid', field: 'reference', reason: 'body-reference' })
      const reference = decodeToolInvocationRef(invocation.value)
      const result = decodeToolResultVersion(version.value)
      const bodyId = decodeToolBodyId(body.value)
      if (
        'failure' in reference ||
        'failure' in result ||
        'failure' in bodyId ||
        reference.ok !== invocation.value
      )
        return fail({ kind: 'invalid', field: 'reference', reason: 'body-reference' })
      return succeed({ reference: reference.ok, result: result.ok, bodyId: bodyId.ok })
    },
    attachment: (reference: string, selector: number) => encode('ta1', [1, reference, selector]),
    cursor: (kind: ReadArguments['kind'], reference: string, after: string) =>
      encode('tc1', [1, kind, reference, projection(kind), after]),
    readResult,
    readAttachment(text: string): Outcome<AttachmentReference, ToolFailure> {
      const decoded = decode(text, 'ta1', 3)
      if ('failure' in decoded) return decoded
      const [, reference, selector] = decoded.ok
      if (
        reference?.kind !== 'string' ||
        !(
          selector?.kind === 'number' &&
          /^(0|[1-9][0-9]*)$/u.test(selector.lexeme) &&
          Number.isSafeInteger(Number(selector.lexeme))
        )
      )
        return fail({ kind: 'invalid', field: 'reference', reason: 'attachment-selector' })
      const source = readResult(reference.value)
      if ('failure' in source) return source
      return succeed({
        source: source.ok,
        reference: reference.value,
        selector: Number(selector.lexeme),
      })
    },
    after(input: ReadArguments): Outcome<string | null, ToolFailure> {
      if (input.after === null) return succeed(null)
      const decoded = decode(input.after, 'tc1', 5)
      if ('failure' in decoded) return decoded
      const [, kind, reference, projection, after] = decoded.ok
      if (
        kind?.kind !== 'string' ||
        kind.value !== input.kind ||
        reference?.kind !== 'string' ||
        reference.value !== input.reference ||
        projection?.kind !== 'string' ||
        projection.value !==
          (input.kind === 'result' ? 'full' : input.kind === 'body' ? 'text' : 'bytes') ||
        after?.kind !== 'string' ||
        after.value.length === 0
      )
        return fail({ kind: 'invalid-cursor', reason: 'another-tools-read' })
      return succeed(after.value)
    },
  }
}
