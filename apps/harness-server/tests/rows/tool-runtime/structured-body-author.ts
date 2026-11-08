import { readJsonText } from '@omne-harness/json-text'
import type { ToolBodyDeclaration } from '@omne-harness/tool-contract'
import { TOOL_BODY_SCHEMA_VOCABULARY } from '../../../src/entry/tool-body-schemas.ts'
import { createLargeBodyModule, largeBodyModule } from './large-body-author.ts'
import { writerResultCodec } from './writer-body-author.ts'
import { tree } from '../tool-host/support.ts'

const limits = {
  maxBytes: 65536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65536,
  maxNumberLength: 64,
}

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

export function structuredBodyAuthor(
  format: 'json-document' | 'json-lines',
  valid = true,
  delivery: 'writer' | 'direct-small' | 'direct-large' = 'writer',
) {
  const schema = {
    identity: { id: 'rows', revision: '1', digest: 'w3-structured-rows-v1' },
    definition: {
      vocabulary: TOOL_BODY_SCHEMA_VOCABULARY,
      schema: tree({
        type: 'object',
        required: ['amount', 'label'],
        properties: { amount: { type: 'number' }, label: { type: 'string' } },
        additionalProperties: false,
      }),
      descriptions: [],
    },
  }
  const body: ToolBodyDeclaration =
    format === 'json-document'
      ? { kind: format, codec: largeBodyModule.executor, document: schema }
      : { kind: format, codec: largeBodyModule.executor, record: schema }
  const rows = Array.from(
    { length: format === 'json-document' ? 1 : 12 },
    (_, i) =>
      `{"amount":${valid ? `${i + 1}.00` : '"not a number"'},"label":"${'中文🙂'.repeat(delivery === 'direct-small' ? 1 : format === 'json-document' ? 1500 : 100)}"}`,
  )
  const original = rows.join('\n') + (format === 'json-lines' ? '\n' : '')
  let executions = 0
  const module = createLargeBodyModule(
    {
      execute: async (_args, _environment, context) => {
        executions++
        if (delivery !== 'writer')
          return ok(
            writerResultCodec.decode(
              Buffer.from(
                JSON.stringify({
                  content: [
                    {
                      kind: 'text',
                      id: 'direct',
                      text: original,
                      visibility: { toModel: true, toHuman: true },
                    },
                  ],
                  data: { kind: 'none' },
                  attachments: [],
                  original: { kind: 'none' },
                }),
              ),
            ),
          )
        ok(
          await context.body.begin(
            'structured',
            format === 'json-document'
              ? { kind: format, codec: body.codec, schema: schema.identity }
              : { kind: format, codec: body.codec, recordSchema: schema.identity },
          ),
        )
        let sequence = 0
        if (format === 'json-document') {
          const characters = Array.from(original)
          for (let offset = 0; offset < characters.length; offset += 512) {
            sequence++
            ok(
              await context.body.append('structured', String(sequence), {
                kind: 'json-fragment',
                text: characters.slice(offset, offset + 512).join(''),
              }),
            )
          }
        } else
          for (const row of rows) {
            sequence++
            const read = readJsonText(row, limits)
            if (read.kind !== 'ok') throw new Error('invalid record fixture')
            ok(
              await context.body.append('structured', String(sequence), {
                kind: 'json-record',
                value: read.value,
              }),
            )
          }
        const sealed = ok(await context.body.seal('structured', String(sequence)))
        const summary = [
          {
            kind: 'text' as const,
            id: 'summary',
            text: `Structured ${format} report; use the body reader for complete values.`,
            visibility: { toModel: true, toHuman: true },
          },
        ]
        return ok(
          writerResultCodec.decode(
            Buffer.from(
              JSON.stringify({
                content: summary,
                data: { kind: 'none' },
                attachments: [],
                original: { kind: 'offloaded', source: sealed.source, summary },
              }),
            ),
          ),
        )
      },
    },
    writerResultCodec,
    body,
    delivery === 'direct-large' ? 2048 : undefined,
  )
  return { module, original, executions: () => executions }
}
