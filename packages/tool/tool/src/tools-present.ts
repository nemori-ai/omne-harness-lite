import type { Access } from '@omne-harness/tool-contract'
import { readJsonText } from '@omne-harness/json-text'
import { formatKeyValue, formatSuccess, formatUsage } from '@omne-harness/unix-format'
import type { ToolsAccess, ToolsOptions, ToolsReadRuntime } from './tools.ts'
import { createToolsBodyReader } from './tools-body.ts'
import { protocol, type ReadArguments } from './tools-protocol.ts'
import {
  bounded,
  budgetFailure,
  failureResult,
  message,
  section,
  type MessageResult,
} from './tools-results.ts'

export function createToolsPresenter<P>(runtime: ToolsReadRuntime<P>, options: ToolsOptions) {
  const refs = protocol(options.arguments)
  const readBody = createToolsBodyReader(runtime, options)
  const callable = (value: ReadArguments) => {
    const text = JSON.stringify(value)
    const parsed = readJsonText(text, options.arguments)
    if (parsed.kind !== 'ok' || 'failure' in refs.after(value)) return false
    return (
      'ok' in
      (value.kind === 'result'
        ? refs.readResult(value.reference)
        : value.kind === 'body'
          ? refs.readBody(value.reference)
          : refs.readAttachment(value.reference))
    )
  }
  const finish = (value: MessageResult) => bounded(value, options)
  const error = (failure: Parameters<typeof failureResult>[0]) => finish(failureResult(failure))
  async function resultPage(access: ToolsAccess<P>, after: string | null): Promise<MessageResult> {
    const response = await runtime.queries.readResult({ ...access, after })
    if ('failure' in response) return error(response.failure)
    const page = response.ok
    if (page.result !== access.result)
      return error({ kind: 'invalid', field: 'result', reason: 'another-version' })
    const reference = refs.result(access)
    const next = page.next === null ? null : refs.cursor('result', reference, page.next)
    const attachments = page.value.attachments.map((_, index) => refs.attachment(reference, index))
    const original =
      page.value.original.kind === 'none'
        ? 'none'
        : refs.body({ ...access, bodyId: page.value.original.bodyId })
    if (
      ![
        reference,
        ...attachments,
        ...(next === null ? [] : [next]),
        ...(original === 'none' ? [] : [original]),
      ].every(refs.allowed) ||
      !callable({ kind: 'result', reference, after: null }) ||
      (next !== null && !callable({ kind: 'result', reference, after: next })) ||
      attachments.some(reference => !callable({ kind: 'attachment', reference, after: null })) ||
      (original !== 'none' && !callable({ kind: 'body', reference: original, after: null }))
    )
      return error(budgetFailure())
    const state = formatKeyValue({
      reading: 'success',
      sourceTerminal: page.terminal.kind,
      sourceActualTerminal: page.actualTerminal?.kind ?? 'none',
      relation: page.relation,
      content: next === null ? 'end' : 'more',
      original: original === 'none' ? 'none' : 'offloaded; text unread',
      reference,
      next: next ?? 'null',
    })
    const instruction =
      next === null
        ? 'Content traversal ended. Read bodyReference with kind=body for offloaded text. Attachments use kind=attachment.'
        : formatUsage(
            'Tools',
            'read_result',
            JSON.stringify({ kind: 'result', reference, after: next }),
          )
    const files = attachments
      .map((attachment, index) =>
        formatKeyValue({ attachment: String(index), reference: attachment }),
      )
      .join('\n')
    return finish(
      message(
        [
          formatSuccess('result read'),
          section('Status', state),
          instruction,
          files,
          ...(original === 'none'
            ? []
            : [
                formatKeyValue({ bodyReference: original }),
                formatUsage(
                  'Tools',
                  'read_result',
                  JSON.stringify({ kind: 'body', reference: original, after: null }),
                ),
              ]),
        ]
          .filter(Boolean)
          .join('\n'),
        page.value.content,
        page.value.attachments,
      ),
    )
  }
  async function read(argumentsValue: ReadArguments, access: Access<P>): Promise<MessageResult> {
    const after = refs.after(argumentsValue)
    if ('failure' in after) return error(after.failure)
    if (argumentsValue.kind === 'body') return readBody(argumentsValue, access, after.ok)
    if (argumentsValue.kind === 'result') {
      const source = refs.readResult(argumentsValue.reference)
      return 'failure' in source
        ? error(source.failure)
        : resultPage({ ...access, ...source.ok }, after.ok)
    }
    const decoded = refs.readAttachment(argumentsValue.reference)
    if ('failure' in decoded) return error(decoded.failure)
    const { source, selector } = decoded.ok
    const first = await runtime.queries.readResult({ ...access, ...source, after: null })
    if ('failure' in first) return error(first.failure)
    if (first.ok.result !== source.result)
      return error({ kind: 'invalid', field: 'result', reason: 'another-version' })
    const attachment = first.ok.value.attachments[selector]
    if (attachment === undefined)
      return error({ kind: 'invalid', field: 'reference', reason: 'attachment-selector' })
    const response = await runtime.content.read({
      ...access,
      ...source,
      attachment,
      after: after.ok,
      maxBytes: options.contentPageBytes,
    })
    if ('failure' in response) return error(response.failure)
    const page = response.ok
    const next =
      page.next === null ? null : refs.cursor('attachment', argumentsValue.reference, page.next)
    if (next !== null && (!refs.allowed(next) || !callable({ ...argumentsValue, after: next })))
      return error(budgetFailure())
    return finish(
      message(
        [
          formatSuccess('attachment read'),
          formatKeyValue({
            reading: 'success',
            sourceTerminal: first.ok.terminal.kind,
            sourceActualTerminal: first.ok.actualTerminal?.kind ?? 'none',
            relation: first.ok.relation,
            content: 'attachment bytes',
            original: first.ok.value.original.kind,
            reference: argumentsValue.reference,
            mediaType: page.attachment.mediaType,
            offset: page.offset,
            bytes: String(page.bytes.byteLength),
            encoding: 'base64',
            base64: Buffer.from(page.bytes).toString('base64'),
            next: next ?? 'null',
          }),
          next === null
            ? 'Attachment byte traversal ended.'
            : formatUsage(
                'Tools',
                'read_result',
                JSON.stringify({ ...argumentsValue, after: next }),
              ),
        ].join('\n'),
      ),
    )
  }
  return { resultPage, read }
}
