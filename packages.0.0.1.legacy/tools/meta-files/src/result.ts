import {
  contentBlockFromRepresentation,
  type AttachmentRef,
} from '@omne-harness-lite/content-blocks'
import type { ToolResult } from '@omne-harness-lite/tool-definition'
import type {
  FileBatchResult,
  FileBatchRecognition,
  FacilityFailure,
} from '@omne-harness-lite/execution-environments'
import {
  formatError,
  formatSuccess,
  formatHold,
  formatKeyValue,
  formatBulletList,
} from '@omne-harness-lite/unix-format'

/** Escape display labels only. The actual path and file bytes stay unchanged. */
export function label(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}
export function reply(text: string, isError = false): ToolResult {
  const block = contentBlockFromRepresentation({
    id: 'files-result',
    kind: 'text',
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (block.kind !== 'text') throw new TypeError('Invalid Files text result')
  return { content: [block], ...(isError ? { isError: true } : {}) }
}
export function rejected(reason: string, detail = ''): ToolResult {
  return reply([formatError(reason), detail].filter(Boolean).join('\n'), true)
}
export function facilityFailure(value: FacilityFailure): ToolResult {
  return rejected(`facility:${value.reason}`)
}
export function success(
  message: string,
  metadata: Readonly<Record<string, string>> = {},
  detail = '',
): ToolResult {
  return reply(
    [formatSuccess(message), formatKeyValue(metadata), detail].filter(Boolean).join('\n'),
  )
}
export function batchReply(value: FileBatchResult, diff: string): ToolResult {
  const confirmed = value.kind === 'committed'
  return reply(
    [
      confirmed
        ? formatSuccess('Batch commit confirmed.')
        : formatHold('Commit result unknown. Some targets can have changed.'),
      formatKeyValue({
        batch_id: label(value.batch.id),
        generation: label(value.batch.generation),
        status: value.kind,
        ...('reason' in value ? { reason: value.reason } : {}),
      }),
      'ACKNOWLEDGED PUBLICATION:',
      formatBulletList(value.published.map(label)) || '(none)',
      diff
        ? `${confirmed ? 'CONFIRMED DIFF' : 'PLANNED DIFF (not proof of committed targets)'}:\n${diff}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    !confirmed,
  )
}
export function recognitionReply(value: FileBatchRecognition): ToolResult {
  return reply(
    [
      value.state === 'complete'
        ? formatSuccess('Original batch recognition complete.')
        : formatHold('Original batch recognition requires attention.'),
      formatKeyValue({
        batch_id: label(value.batch.id),
        generation: label(value.batch.generation),
        state: value.state,
      }),
      'ACKNOWLEDGED PUBLICATION:',
      formatBulletList(value.published.map(label)) || '(none)',
      'CURRENTLY MATCHING PREPARED BYTES:',
      formatBulletList(value.matchingPrepared.map(label)) || '(none)',
      'CONFLICTING TARGETS:',
      formatBulletList(value.conflicting.map(label)) || '(none)',
      'Recognition did not write, replay, finish, or undo target changes.',
    ].join('\n'),
    value.state !== 'complete',
  )
}
export function imageReply(
  reference: AttachmentRef,
  mediaType: string,
  path: string,
  width: number,
  height: number,
): ToolResult {
  const text = success('Image attachment confirmed.', {
    path: label(path),
    media_type: mediaType,
    width: String(width),
    height: String(height),
  })
  const image = contentBlockFromRepresentation({
    id: 'files-image',
    kind: 'image',
    visibility: { toHuman: true, toModel: true },
    mediaType,
    data: reference,
  })
  if (image.kind !== 'image') throw new TypeError('Invalid Files image result')
  return { ...text, content: [...text.content, image], attachments: [reference] }
}
