import { describe, expect, it } from 'vitest'
import { judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { adoption, functionDefinition, json } from './tool-values.ts'

const published = {
  identity: { id: 'report', revision: '1', digest: 'sha256:report' },
  definition: {
    schema: json('{"type":"string"}'),
    vocabulary: adoption('json-schema'),
    descriptions: [],
  },
}
const system = { inline: { kind: 'system' }, retention: { kind: 'system' } } as const
const ordinary = {
  kind: 'ordinary',
  value: { kind: 'encoded-value', codec: adoption('output'), value: published },
  program: { kind: 'none' },
  body: { kind: 'text', codec: adoption('text') },
  offloading: system,
} as const

function judge(returns: unknown) {
  return judgeToolDefinition({ ...functionDefinition(), returns })
}

describe('published return declarations', () => {
  it('preserves the ordinary value schema, body codec and author limits', () => {
    const returns = {
      ...ordinary,
      offloading: {
        inline: { kind: 'bounded', maxInlineUtf8Bytes: 123 },
        retention: { kind: 'bounded', maxRetentionMs: 456 },
      },
    }
    expect(judge(returns)).toMatchObject({ ok: { returns } })
  })

  it('preserves structured results without declaring a model body', () => {
    const returns = {
      kind: 'structured',
      value: { kind: 'tool-result', contract: adoption('ToolResult') },
      program: { kind: 'none' },
      body: { kind: 'none' },
      offloading: system,
    }
    expect(judge(returns)).toMatchObject({ ok: { returns } })
  })

  it.each([
    { kind: 'json-document', codec: adoption('json'), document: published },
    { kind: 'json-lines', codec: adoption('json-lines'), record: published },
  ])('retains the exact schema of $kind bodies', body => {
    const returns = { ...ordinary, body }
    expect(judge(returns)).toMatchObject({ ok: { returns } })
  })

  it('rejects the old declaration that omits value, body and offloading', () => {
    expect(judge({ kind: 'ordinary', program: { kind: 'none' } })).toHaveProperty('failure')
  })

  it.each(['value', 'body', 'offloading'])('requires the %s declaration', missing => {
    const returns = Object.fromEntries(Object.entries(ordinary).filter(([key]) => key !== missing))
    expect(judge(returns)).toHaveProperty('failure')
  })

  it('rejects a value declaration for the other author kind', () => {
    expect(
      judge({ ...ordinary, value: { kind: 'tool-result', contract: adoption('result') } }),
    ).toHaveProperty('failure')
    expect(judge({ ...ordinary, kind: 'structured' })).toHaveProperty('failure')
  })

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])(
    'rejects the invalid byte or duration bound %s',
    bound => {
      expect(
        judge({
          ...ordinary,
          offloading: { ...system, inline: { kind: 'bounded', maxInlineUtf8Bytes: bound } },
        }),
      ).toHaveProperty('failure')
      expect(
        judge({
          ...ordinary,
          offloading: { ...system, retention: { kind: 'bounded', maxRetentionMs: bound } },
        }),
      ).toHaveProperty('failure')
    },
  )

  it('rejects offloading overrides when the author declares no body', () => {
    for (const offloading of [
      { ...system, inline: { kind: 'bounded', maxInlineUtf8Bytes: 1 } },
      { ...system, retention: { kind: 'bounded', maxRetentionMs: 1 } },
    ])
      expect(judge({ ...ordinary, body: { kind: 'none' }, offloading })).toHaveProperty('failure')
  })

  it('rejects missing schema identities and unknown return fields', () => {
    expect(
      judge({ ...ordinary, body: { kind: 'json-document', codec: adoption('json') } }),
    ).toHaveProperty('failure')
    expect(
      judge({
        ...ordinary,
        value: { ...ordinary.value, value: { definition: published.definition } },
      }),
    ).toHaveProperty('failure')
    expect(judge({ ...ordinary, storagePath: '/tmp/result' })).toHaveProperty('failure')
  })
})
