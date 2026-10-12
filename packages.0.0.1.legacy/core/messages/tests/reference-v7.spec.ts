import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeMessage,
  judgeModelCallCreatedPayload,
  judgeModelCallCreatedPayloadText,
  judgeModelInvocationRecord,
  judgeModelReplyMessage,
  SCHEMA_DEF_NAMES,
  validate,
} from '@omne-harness-lite/messages'
import { at, text } from './helpers.ts'

function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function mutable(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(mutable)
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mutable(item)]))
  return value
}
function object(value: unknown): Record<string, JsonValue> {
  const read = readJsonStrict(writeJsonLossless(value))
  if ('failed' in read || !isObject(read.ok)) throw new Error('object fixture required')
  return Object.fromEntries(Object.entries(read.ok).map(([key, item]) => [key, mutable(item)]))
}
function parsed(source: string): JsonValue {
  const result = readJsonStrict(source)
  if ('failed' in result) throw new Error('invalid fixture')
  return result.ok
}
const rawRows = parsed(
  readFileSync(new URL('fixtures/reference-examples.json', import.meta.url), 'utf8'),
)
if (!Array.isArray(rawRows)) throw new Error('reference rows required')
const rows: readonly JsonValue[] = rawRows
function fixture(name: string): Record<string, JsonValue> {
  const row = rows.find(
    row => row !== null && typeof row === 'object' && 'name' in row && row.name === name,
  )
  return object(object(row).value)
}
function media(kind = 'image'): JsonObject {
  return kind === 'file'
    ? {
        id: 'media',
        kind,
        visibility: { toHuman: true, toModel: true },
        attachment: { storage: 'local', key: 'media', mediaType: 'video/mp4' },
      }
    : {
        id: 'media',
        kind,
        visibility: { toHuman: true, toModel: true },
        mediaType: kind === 'voice' ? 'audio/wav' : 'image/png',
        data: { inline: 'eA==' },
      }
}
function derived(block = media()): JsonObject {
  return {
    ...block,
    renderings: [{ producedBy: 'system', blocks: [text('derived')] }],
    transcript: 'description',
  }
}
function reply(blocks: readonly JsonValue[] = [media()]): Record<string, JsonValue> {
  return {
    id: 'reply',
    type: 'assistant',
    response: 'response',
    ending: 'complete',
    createdAt: at,
    blocks: [...blocks],
  }
}

describe('M7-V2 exact normative references and intrinsic created relation', () => {
  for (const raw of rows) {
    const row = object(raw)
    const definition = SCHEMA_DEF_NAMES.find(name => name === row.definition)
    if (definition === undefined) throw new Error('unknown reference definition')
    it(String(row.name), () => {
      expect(validate(definition, row.value).valid).toBe(row.schemaValid)
      if (definition === 'ModelCallCreatedPayload')
        expect('ok' in judgeModelCallCreatedPayload(row.value)).toBe(row.schemaValid)
      if (definition === 'ModelInvocationRecord')
        expect('ok' in judgeModelInvocationRecord(row.value)).toBe(row.schemaValid)
    })
  }
  const accepted = fixture('created-original-input')
  const negative: readonly [string, (value: Record<string, JsonValue>) => void][] = [
    [
      'missing tenant',
      value => {
        const origin = object(value.origin)
        delete origin.tenant
        value.origin = origin
      },
    ],
    [
      'run without attempt',
      value => {
        const origin = object(value.origin)
        delete origin.attempt
        value.origin = origin
      },
    ],
    [
      'attempt without run',
      value => {
        const origin = object(value.origin)
        delete origin.run
        value.origin = origin
      },
    ],
    [
      'ref session differs',
      value => {
        value.ref = { ...object(value.ref), session: 'different' }
      },
    ],
    [
      'missing adopted',
      value => {
        delete value.adopted
      },
    ],
    [
      'different adaptation',
      value => {
        const adopted = object(value.adopted)
        adopted.adaptation = {
          ...object(adopted.adaptation),
          implementation: { name: 'other', revision: 'impl-1' },
        }
        value.adopted = adopted
      },
    ],
    [
      'model differs from route',
      value => {
        const adopted = object(value.adopted)
        const adaptation = {
          ...object(adopted.adaptation),
          definition: { modelId: 'other', revision: 'model-1' },
        }
        adopted.adaptation = adaptation
        adopted.profileSnapshot = { ...object(adopted.profileSnapshot), adaptation }
        value.adopted = adopted
      },
    ],
    [
      'invalid input message',
      value => {
        value.input = { ...object(value.input), messages: [reply([text('same'), text('same')])] }
      },
    ],
    [
      'invalid adopted message',
      value => {
        value.adopted = {
          ...object(value.adopted),
          messages: [reply([text('same'), text('same')])],
        }
      },
    ],
    [
      'unknown kind',
      value => {
        value.kind = 'unknown'
      },
    ],
    [
      'source version empty',
      value => {
        value.input = { ...object(value.input), sourceVersions: {} }
      },
    ],
  ]
  for (const [name, mutate] of negative)
    it(name, () => {
      const value = object(accepted)
      mutate(value)
      const before = writeJsonLossless(value)
      expect(judgeModelCallCreatedPayload(value)).toEqual({ rejected: 'malformed' })
      expect(writeJsonLossless(value)).toBe(before)
    })
  it('accepted snapshot is not subjected to current catalog limit admission', () => {
    const value = object(accepted),
      adopted = object(value.adopted),
      profile = object(adopted.profileSnapshot)
    profile.maxInputTokens = 100000
    profile.upstreamInputLimits = {
      ...object(profile.upstreamInputLimits),
      maxInputTokens: { status: 'limited', value: 1 },
    }
    adopted.profileSnapshot = profile
    value.adopted = adopted
    expect(judgeModelCallCreatedPayload(value)).toHaveProperty('ok')
  })
  it('rejected may never carry adopted and marker payload kind/digest are closed', () => {
    const rejected = fixture('rejected-has-no-fake-binding')
    expect(
      judgeModelCallCreatedPayload({ ...rejected, adopted: object(accepted.adopted) }),
    ).toEqual({ rejected: 'malformed' })
    for (const kind of ['model_call_created', 'model_call_reply_ready']) {
      const marker =
        kind === 'model_call_created'
          ? { kind, call: 'c', creationKey: 'k', createdAt: at }
          : { kind, call: 'c', dispatch: 1, response: 'r', readyAt: at }
      for (const payload of [
        { kind: 'unknown', locator: 'l', version: 'v', digest: 'a'.repeat(64) },
        {
          kind: kind === 'model_call_created' ? 'created' : 'reply_ready',
          locator: 'l',
          version: 'v',
          digest: 'A'.repeat(64),
        },
      ])
        expect(judgeModelInvocationRecord({ ...marker, payload })).toEqual({
          rejected: 'malformed',
        })
      expect(judgeMessage(marker)).toEqual({ rejected: 'malformed' })
    }
  })
})

describe('M7-V3 exact created text and input ownership', () => {
  it('deep duplicate keys fail before shape or equality', () => {
    const source = writeJsonLossless(fixture('created-original-input')).replace(
      '"values":{}',
      '"values":{"nested":{"x":1,"x":2}}',
    )
    expect(judgeModelCallCreatedPayloadText(source)).toEqual({ rejected: 'malformed' })
  })
  it('preserves original large integers/decimals and compares complete adaptation values', () => {
    const source = writeJsonLossless(fixture('created-original-input')).replaceAll(
      '"values":{}',
      '"values":{"n":9007199254740993,"fraction":0.123456789012345678901,"items":[1,2]}',
    )
    const result = judgeModelCallCreatedPayloadText(source)
    expect(result).toHaveProperty('ok')
    if (!('ok' in result)) throw new Error('fixture rejected')
    expect(parsed(writeJsonLossless(result.ok))).toEqual(parsed(source))
    expect(
      judgeModelCallCreatedPayloadText(source.replace('9007199254740993', '9007199254740992')),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelCallCreatedPayloadText(source.replace('"items":[1,2]', '"items":[2,1]')),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelCallCreatedPayloadText(source.replace('"items":[1,2]', '"items":[1.0,2]')),
    ).toHaveProperty('ok')
    const reordered = source.replace(
      '"n":9007199254740993,"fraction":0.123456789012345678901',
      '"fraction":0.123456789012345678901,"n":9007199254740993',
    )
    expect(judgeModelCallCreatedPayloadText(reordered)).toHaveProperty('ok')
    expect(createHash('sha256').update(source).digest('hex')).not.toBe(
      createHash('sha256').update(reordered).digest('hex'),
    )
  })
  it('returned values do not retain nested input references', () => {
    const input = fixture('created-original-input'),
      before = writeJsonLossless(input),
      result = judgeModelCallCreatedPayload(input)
    if (!('ok' in result)) throw new Error('fixture rejected')
    expect(result.ok).not.toBe(input)
    const originalInput = input.input
    if (!isObject(originalInput)) throw new Error('input object required')
    const mutableInput: Record<string, JsonValue> = originalInput
    mutableInput.target = 'other'
    input.input = { ...object(input.input), sourceVersions: { context: 'other' } }
    expect(parsed(writeJsonLossless(result.ok))).toEqual(parsed(before))
  })
})

describe('M7-V4 original members and permitted paired first derivation', () => {
  for (const kind of ['image', 'voice', 'file'])
    it(`allows first legal ${kind} derivation and distinct nested id`, () => {
      const original = reply([media(kind)]),
        persisted = reply([derived(media(kind))]),
        before = writeJsonLossless(persisted)
      const result = judgeModelReplyMessage(original, persisted)
      if (!('ok' in result)) throw new Error(result.rejected)
      expect(parsed(writeJsonLossless(result.ok))).toEqual(parsed(before))
      expect(result.ok).not.toBe(persisted)
      persisted.response = 'mutated'
      expect(parsed(writeJsonLossless(result.ok))).toEqual(parsed(before))
    })
  it('allows complete equality including existing derivation and lossless opaque evidence', () => {
    const value = reply([
      derived(),
      {
        ...text('thinking'),
        kind: 'thinking',
        opaque: parsed('{"n":9007199254740993,"deep":{"a":[1,2]}}'),
      },
    ])
    expect(judgeModelReplyMessage(value, value)).toHaveProperty('ok')
    const alternate = parsed(
      writeJsonLossless(value).replace('"n":9007199254740993', '"n":9007199254740992'),
    )
    expect(judgeModelReplyMessage(value, alternate)).toEqual({ rejected: 'malformed' })
  })
  for (const [name, persisted] of [
    ['remove original block', reply([])],
    ['add original block', reply([media(), text('new')])],
    ['change original id', { ...reply(), id: 'other' }],
    ['change response', { ...reply(), response: 'other' }],
    ['change ending', { ...reply(), ending: 'truncated_at_limit' }],
    ['change timestamp', { ...reply(), createdAt: '2026-09-26T00:00:00Z' }],
    ['change block id', reply([{ ...media(), id: 'other' }])],
    ['change visibility', reply([{ ...derived(), visibility: { toHuman: false, toModel: true } }])],
    ['change original bytes', reply([{ ...derived(), data: { inline: 'eQ==' } }])],
    ['third field', reply([{ ...derived(), extra: 'forbidden' }])],
    ['missing transcript', reply([{ ...media(), renderings: object(derived()).renderings ?? [] }])],
    ['missing renderings', reply([{ ...media(), transcript: 'description' }])],
    ['empty transcript', reply([{ ...derived(), transcript: '' }])],
    [
      'duplicate derived id',
      reply([
        {
          ...media(),
          renderings: [{ producedBy: 'system', blocks: [text('media')] }],
          transcript: 'description',
        },
      ]),
    ],
    [
      'derived child derivation',
      reply([
        {
          ...media(),
          renderings: [{ producedBy: 'system', blocks: [derived({ ...media(), id: 'child' })] }],
          transcript: 'description',
        },
      ]),
    ],
    [
      'same modality rendering',
      reply([
        {
          ...media(),
          renderings: [{ producedBy: 'system', blocks: [{ ...media(), id: 'child' }] }],
          transcript: 'description',
        },
      ]),
    ],
  ] as const)
    it(name, () => {
      const original = reply(),
        beforeA = writeJsonLossless(original),
        beforeB = writeJsonLossless(persisted)
      expect(judgeModelReplyMessage(original, persisted)).toHaveProperty('rejected')
      expect(writeJsonLossless(original)).toBe(beforeA)
      expect(writeJsonLossless(persisted)).toBe(beforeB)
    })
  it('uses exact JSON value equality for numbers, object keys and arrays', () => {
    const original = reply([
      {
        ...text('thinking'),
        kind: 'thinking',
        opaque: parsed('{"a":1,"b":[1,2],"large":9007199254740993}'),
      },
    ])
    const same = parsed(
      writeJsonLossless(original).replace('"a":1,"b":[1,2]', '"b":[1.0,2],"a":1.0'),
    )
    expect(judgeModelReplyMessage(original, same)).toHaveProperty('ok')
    expect(
      judgeModelReplyMessage(
        original,
        parsed(writeJsonLossless(original).replace('"b":[1,2]', '"b":[2,1]')),
      ),
    ).toEqual({ rejected: 'malformed' })
  })
  it('does not remove, modify or append to existing derivation', () => {
    const original = reply([derived()])
    for (const persisted of [
      reply(),
      reply([{ ...derived(), transcript: 'changed' }]),
      reply([{ ...derived(), renderings: [{ producedBy: 'system', blocks: [text('changed')] }] }]),
      reply([
        {
          ...derived(),
          renderings: [
            { producedBy: 'system', blocks: [text('derived')] },
            { producedBy: 'system', blocks: [text('additional')] },
          ],
        },
      ]),
    ])
      expect(judgeModelReplyMessage(original, persisted)).toEqual({ rejected: 'malformed' })
  })
  it('does not permit original block reordering or nested opaque mutation', () => {
    const first = { ...text('one'), kind: 'thinking', opaque: parsed('{"a":1}') },
      second = text('two')
    expect(judgeModelReplyMessage(reply([first, second]), reply([second, first]))).toEqual({
      rejected: 'malformed',
    })
    const original = reply([derived()])
    const changed = parsed(
      writeJsonLossless(original).replace('"text":"payload"', '"text":"changed"'),
    )
    expect(judgeModelReplyMessage(original, original)).toHaveProperty('ok')
    expect(judgeModelReplyMessage(original, changed)).toEqual({ rejected: 'malformed' })
  })
})

describe('M7-V5 original-first refusal priority', () => {
  it('original error wins even if persisted has a different earlier-side error', () => {
    expect(judgeModelReplyMessage({ type: 'unknown' }, reply([{ kind: 'unknown' }]))).toEqual({
      rejected: 'type_unknown',
    })
    expect(
      judgeModelReplyMessage(reply([{ id: 'x', kind: 'unknown' }]), { type: 'unknown' }),
    ).toEqual({ rejected: 'kind_unknown' })
  })
  it('legal nonassistant original fails without evaluating persisted', () => {
    expect(
      judgeModelReplyMessage(
        { ...reply([text('t')]), type: 'user', response: undefined, ending: undefined },
        { type: 'unknown' },
      ),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelReplyMessage(
        { id: 'u', type: 'user', createdAt: at, blocks: [text('t')] },
        { type: 'unknown' },
      ),
    ).toEqual({ rejected: 'malformed' })
  })
  it('never evaluates persisted when the original side already fails', () => {
    const persisted = Object.defineProperty({}, 'blocks', {
      enumerable: true,
      get() {
        throw new Error('persisted was inspected')
      },
    })
    expect(judgeModelReplyMessage({ type: 'unknown' }, persisted)).toEqual({
      rejected: 'type_unknown',
    })
    expect(
      judgeModelReplyMessage(
        { id: 'u', type: 'user', createdAt: at, blocks: [text('t')] },
        persisted,
      ),
    ).toEqual({ rejected: 'malformed' })
  })
  it('persisted error is preserved and each side keeps existing multi-defect order', () => {
    expect(judgeModelReplyMessage(reply(), { type: 'unknown' })).toEqual({
      rejected: 'type_unknown',
    })
    const multiple = reply([
      { id: 'dup', kind: 'text', text: 'a' },
      { id: 'dup', kind: 'unknown' },
    ])
    expect(judgeModelReplyMessage(multiple, reply())).toEqual({ rejected: 'kind_unknown' })
    expect(judgeModelReplyMessage(reply(), multiple)).toEqual({ rejected: 'kind_unknown' })
  })
})
