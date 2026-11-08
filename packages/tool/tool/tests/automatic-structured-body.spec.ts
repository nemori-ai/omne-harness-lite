import { afterEach, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { jsonDocumentFixture, jsonLinesFixture } from './structured-body-values.ts'
import { sourceFixture, token, visible } from './tools-values.ts'
import { auditQueues } from './start-values.ts'
import { adoption, jsonLimits, ok } from './runtime-values.ts'

afterEach(auditQueues)

it.each(
  (['json-document', 'json-lines'] as const).flatMap(format =>
    [false, true].map(offloaded => ({ format, offloaded })),
  ),
)(
  'preserves program data and native references for direct $format with offloaded=$offloaded',
  async ({ format, offloaded }) => {
    const line = `{"amount":1.00,"label":"${'中文🙂'.repeat(offloaded ? 60 : 1)}"}`
    const original =
      format === 'json-document'
        ? `{"rows":[${Array(8).fill(line).join(',')}]}`
        : `${Array(8).fill(line).join('\n')}\n`
    const declaration =
      format === 'json-document' ? jsonDocumentFixture(original) : jsonLinesFixture([line])
    const data = {
      kind: 'json' as const,
      contract: adoption('program'),
      schema: { id: 'program', revision: '1', digest: 'program-v1' },
      value: { kind: 'number' as const, lexeme: '12345678901234567890.00' },
    }
    const schema = readJsonText('{"type":"number"}', jsonLimits)
    if (schema.kind !== 'ok') throw new Error('invalid program schema fixture')
    const reference = {
      storage: 'native',
      key: 'report.csv',
      mediaType: 'text/csv',
      bytes: '1000000',
      digest: 'native-digest',
    }
    const human = {
      ...visible('human', 'human-only'.repeat(2000)),
      visibility: { toModel: false, toHuman: true },
    }
    const definition = {
      ...declaration.definition,
      returns: {
        ...declaration.definition.returns,
        program: {
          kind: 'json' as const,
          contract: data.contract,
          schema: data.schema,
          maxBytes: 1024,
          definition: {
            schema: schema.value,
            vocabulary: adoption('json-schema'),
            descriptions: [],
          },
        },
        offloading: {
          inline: { kind: 'bounded' as const, maxInlineUtf8Bytes: 2048 },
          retention: { kind: 'system' as const },
        },
      },
    }
    const f = await sourceFixture(
      {
        content: [visible('direct', original), human],
        data,
        original: { kind: 'none' },
        attachments: [reference],
      },
      { contentPageBytes: 1024 },
      [],
      { ...declaration, definition },
    )
    const page = await f.f.resultPage()
    const delivered = ok(await f.f.ledger.delivery.read({ ...f.f.access, result: page.result }))
    expect(delivered.data).toEqual(data)
    expect(delivered.attachments).toEqual([reference])
    expect(delivered.content.find(block => block.id === human.id)).toEqual(human)
    expect(delivered.original.kind).toBe(offloaded ? 'offloaded' : 'none')
    if (!offloaded) {
      expect(delivered.content[0]).toEqual(visible('direct', original))
      return
    }
    const bodyReference = token(await f.tools.present(f.access), 'bodyReference')
    let after: string | null = null
    let actual = ''
    let ended = false
    for (let page = 0; page < 32; page++) {
      const answer = await f.tools.read({
        ...f.access,
        arguments: { kind: 'body', reference: bodyReference, after },
      })
      expect(token(answer, 'format')).toBe(format)
      const block = answer.content.find(block => block.id === 'Tools.body')
      if (block?.kind !== 'text') throw new Error('missing body page')
      actual += block.text
      const next = token(answer, 'next')
      if (next === 'null') {
        ended = true
        break
      }
      expect(next).not.toBe(after)
      after = next
    }
    expect(ended).toBe(true)
    expect(actual).toBe(original)
  },
)
