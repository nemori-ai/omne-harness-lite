// The three payloads of the history-cost runs: a 4 KiB text result that stays inline, a 32 KiB text
// body and a 32 KiB JSON Lines body of 32 one-KiB records, both over the 16 KiB inline threshold the
// run configures, so both are offloaded and read back in 8 KiB pages.
import { createHash } from 'node:crypto'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import { TOOL_BODY_SCHEMA_VOCABULARY } from '../../src/entry/tool-body-schemas.ts'
import { createLargeBodyModule, largeBodyModule } from '../rows/tool-runtime/large-body-author.ts'
import { tree } from '../rows/tool-host/support.ts'

const codec = createToolMessageResultCodec(8 * 1024 * 1024)

export type PayloadKind = 'inline' | 'text' | 'json-lines'

export const INLINE_THRESHOLD = 16_384
export const PAGE_BYTES = 8192

function textOf(bytes: number): string {
  const first = 'HISTORY-COST-BEGIN 中文🙂\n'
  const last = '\nHISTORY-COST-END\n'
  return first + 'x'.repeat(bytes - Buffer.byteLength(first + last)) + last
}

function jsonLines(records: number): string {
  return Array.from({ length: records }, (_, id) => {
    const text = `row-${String(id)}-中文🙂`
    const empty = JSON.stringify({ id, text })
    return `${JSON.stringify({ id, text: text + 'x'.repeat(1023 - Buffer.byteLength(empty)) })}\n`
  }).join('')
}

export function payload(kind: PayloadKind) {
  const body = kind === 'inline' ? textOf(4096) : kind === 'text' ? textOf(32_768) : jsonLines(32)
  const schema = {
    identity: { id: 'history-cost-record', revision: '1', digest: 'history-cost-id-text-v1' },
    definition: {
      vocabulary: TOOL_BODY_SCHEMA_VOCABULARY,
      schema: tree({
        type: 'object',
        required: ['id', 'text'],
        properties: { id: { type: 'integer' }, text: { type: 'string' } },
        additionalProperties: false,
      }),
      descriptions: [],
    },
  }
  let executions = 0
  const result = codec.decode(
    Buffer.from(
      JSON.stringify({
        content: [
          { kind: 'text', id: 'corpus', text: body, visibility: { toModel: true, toHuman: true } },
        ],
        original: { kind: 'none' },
        data: { kind: 'none' },
        attachments: [],
      }),
    ),
  )
  if ('failure' in result) throw new Error(result.failure.reason)
  const rendered = result.ok
  const module = createLargeBodyModule(
    {
      execute: async () => {
        executions += 1
        return rendered
      },
    },
    undefined,
    kind === 'json-lines'
      ? { kind: 'json-lines', codec: largeBodyModule.executor, record: schema }
      : { kind: 'text', codec: largeBodyModule.executor },
  )
  return {
    kind,
    body,
    bytes: Buffer.byteLength(body),
    digest: createHash('sha256').update(body).digest('hex'),
    module,
    executions: () => executions,
  }
}
