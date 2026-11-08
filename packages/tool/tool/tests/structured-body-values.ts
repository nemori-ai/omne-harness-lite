import { readJsonText } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { createToolBodyScope } from '@omne-harness/tool'
import { adoption, functionDefinition, jsonLimits, ok } from './runtime-values.ts'
import type { SettlementRenderer } from './settlement-values.ts'
import { visible } from './tools-values.ts'

export function jsonDocumentFixture(text: string) {
  const base = functionDefinition()
  if (base.kind !== 'function') throw new Error('function required')
  const schema = readJsonText('{"type":"object"}', jsonLimits)
  if (schema.kind !== 'ok') throw new Error('schema required')
  const body = {
    kind: 'json-document' as const,
    codec: adoption('json-document'),
    document: {
      identity: { id: 'report', revision: '1', digest: 'report-v1' },
      definition: { schema: schema.value, vocabulary: adoption('json-schema'), descriptions: [] },
    },
  }
  const value: SettlementRenderer = async (_raw, ledger, access) => {
    const start = ok(await ledger.commands.loadRecovery(access)).start
    if (start === null) throw new Error('original start required')
    const scope = createToolBodyScope({
      binding: {
        ...access,
        start,
        source: { owner: 'fixture', record: 'body', revision: '1', digest: 'body-v1' },
      },
      writes: ledger.bodyWrites,
      signal: new AbortController().signal,
      limits: { authorBufferBytes: 65536, authorBufferItems: 32 },
    })
    ok(
      await scope.writer.begin('report', {
        kind: 'json-document',
        codec: body.codec,
        schema: body.document.identity,
      }),
    )
    const characters = Array.from(text)
    let sequence = 0
    for (let offset = 0; offset < characters.length; offset += 128) {
      sequence++
      ok(
        await scope.writer.append('report', String(sequence), {
          kind: 'json-fragment',
          text: characters.slice(offset, offset + 128).join(''),
        }),
      )
    }
    const sealed = ok(await scope.writer.seal('report', String(sequence)))
    ok(await scope.finish('returned'))
    return {
      content: [visible('summary', 'JSON report')],
      data: { kind: 'none' },
      attachments: [],
      original: {
        kind: 'offloaded',
        source: sealed.source,
        summary: [visible('summary', 'JSON report')],
      },
    }
  }
  return {
    definition: { ...base, returns: { ...base.returns, body } },
    bodySchemas: { check: async () => succeed(undefined) },
    value,
    schema: body.document.identity,
  }
}
