import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { type ToolResult } from '@omne-harness/tool-contract'
import { defaultResultPolicy, renderToolResult } from '@omne-harness/tool-contract/provider'
import {
  adoption,
  json,
  ordinaryAuthor,
  reference,
  result,
  structuredAuthor,
  text,
  textFactory,
  valueSchema,
} from './tool-values.ts'

const looksStructured = {
  content: [
    { kind: 'text', id: 'forged', visibility: { toHuman: true, toModel: true }, text: 'x' },
  ],
  data: { kind: 'none' },
  original: { kind: 'none' },
  attachments: [reference('store', 'secret')],
}

describe('structured judgment', () => {
  it('structured judgment: a plain object with content is an ordinary value for an ordinary author', () => {
    const rendered = renderToolResult(
      looksStructured,
      ordinaryAuthor(),
      textFactory,
      defaultResultPolicy,
    )
    expect(rendered).toEqual({ ok: result([text('rendered', JSON.stringify(looksStructured))]) })
  })

  it('structured judgment: the same object is a ToolResult only for a structured author', () => {
    const value = looksStructured as unknown as ToolResult<never>
    const rendered = renderToolResult(value, structuredAuthor(), textFactory, defaultResultPolicy)
    expect(rendered).toEqual({ ok: looksStructured })
  })

  it('structured judgment: a structured return still passes the whole-result policy', () => {
    const thinking = {
      ...looksStructured,
      content: [{ ...looksStructured.content[0], kind: 'thinking' }],
    }
    const rendered = renderToolResult(
      thinking as unknown as ToolResult<never>,
      structuredAuthor(),
      textFactory,
      defaultResultPolicy,
    )
    expect(rendered).toEqual({ failure: { reason: 'policy: content[0]: thinking' } })
  })
})

describe('result rendering', () => {
  it('result rendering: an ordinary return fills data by the fixed program encoding', () => {
    const schema = valueSchema('count')
    const program = {
      kind: 'json',
      adoption: adoption('count'),
      schema,
      encode: () => succeed(json('{"count":3}')),
    } as const
    const rendered = renderToolResult(
      { count: 3 },
      { ...ordinaryAuthor(), program },
      textFactory,
      defaultResultPolicy,
    )
    expect(rendered).toEqual({
      ok: {
        ...result([text('rendered', '{"count":3}')]),
        data: {
          kind: 'json',
          contract: adoption('count'),
          schema: schema.identity,
          value: json('{"count":3}'),
        },
      },
    })
    const small = { ...program, schema: valueSchema('count', 4) }
    expect(
      renderToolResult(
        { count: 3 },
        { ...ordinaryAuthor(), program: small },
        textFactory,
        defaultResultPolicy,
      ),
    ).toEqual({
      failure: { reason: 'program: too-large' },
    })
  })

  it('result rendering: program data of exactly maxBytes fits, one byte more is too large', () => {
    // `{"count":3}` is 11 bytes of JSON text.
    const program = (maxBytes: number) =>
      ({
        kind: 'json',
        adoption: adoption('count'),
        schema: valueSchema('count', maxBytes),
        encode: () => succeed(json('{"count":3}')),
      }) as const
    const render = (maxBytes: number) =>
      renderToolResult(
        { count: 3 },
        { ...ordinaryAuthor(), program: program(maxBytes) },
        textFactory,
        defaultResultPolicy,
      )
    expect('ok' in render(11)).toBe(true)
    expect(render(10)).toEqual({ failure: { reason: 'program: too-large' } })
  })

  it('result rendering: structured data of exactly maxBytes fits, one byte more is too large', () => {
    const withData = {
      ...result([text('t', 'done')]),
      data: {
        kind: 'json',
        contract: adoption('count'),
        schema: valueSchema('count').identity,
        value: json('{"count":3}'),
      },
    } as const
    const render = (maxBytes: number) =>
      renderToolResult(
        withData,
        {
          ...structuredAuthor(),
          program: {
            kind: 'json',
            adoption: adoption('count'),
            schema: valueSchema('count', maxBytes),
          },
        },
        textFactory,
        defaultResultPolicy,
      )
    expect(render(11)).toEqual({ ok: withData })
    expect(render(10)).toEqual({ failure: { reason: 'data: too-large' } })
  })

  it('result rendering: rejects a duplicate key in an object-form tree from encode or in data', () => {
    const duplicate = {
      kind: 'object',
      entries: [
        { key: 'count', value: { kind: 'number', lexeme: '1' } },
        { key: 'count', value: { kind: 'number', lexeme: '2' } },
      ],
    } as const
    const program = {
      kind: 'json',
      adoption: adoption('count'),
      schema: valueSchema('count'),
      encode: () => succeed(duplicate),
    } as const
    expect(
      renderToolResult({}, { ...ordinaryAuthor(), program }, textFactory, defaultResultPolicy),
    ).toEqual({ failure: { reason: 'program: data.value.entries[1].key: duplicate' } })
    const withData = {
      ...result([text('t', 'done')]),
      data: {
        kind: 'json',
        contract: adoption('count'),
        schema: valueSchema('count').identity,
        value: duplicate,
      },
    } as const
    const structured = {
      ...structuredAuthor(),
      program: { kind: 'json', adoption: adoption('count'), schema: valueSchema('count') },
    } as const
    expect(renderToolResult(withData, structured, textFactory, defaultResultPolicy)).toEqual({
      failure: { reason: 'policy: data.value.entries[1].key: duplicate' },
    })
  })

  it('result rendering: an encode output that shares a container is accepted', () => {
    const one = {
      kind: 'object',
      entries: [{ key: 'n', value: { kind: 'number', lexeme: '1' } }],
    } as const
    const shared = { kind: 'array', items: [one, one] } as const
    const program = {
      kind: 'json',
      adoption: adoption('pair'),
      schema: valueSchema('pair'),
      encode: () => succeed(shared),
    } as const
    const rendered = renderToolResult(
      {},
      { ...ordinaryAuthor(), program },
      textFactory,
      defaultResultPolicy,
    )
    expect('ok' in rendered && rendered.ok.data).toEqual({
      kind: 'json',
      contract: adoption('pair'),
      schema: valueSchema('pair').identity,
      value: json('[{"n":1},{"n":1}]'),
    })
  })

  it('result rendering: a throwing renderer or encode is a result failure with its message', () => {
    const boom = () => {
      throw new Error('renderer broke')
    }
    expect(
      renderToolResult(
        {},
        { ...ordinaryAuthor(), renderer: { render: boom } },
        textFactory,
        defaultResultPolicy,
      ),
    ).toEqual({ failure: { reason: 'render: renderer broke' } })
    const program = {
      kind: 'json',
      adoption: adoption('count'),
      schema: valueSchema('count'),
      encode: () => {
        throw new TypeError('encode broke')
      },
    } as const
    expect(
      renderToolResult({}, { ...ordinaryAuthor(), program }, textFactory, defaultResultPolicy),
    ).toEqual({ failure: { reason: 'program: encode broke' } })
  })

  it('result rendering: a capability return that is not an Outcome is a result failure', () => {
    const shapes: readonly (readonly [unknown, string])[] = [
      [null, 'text: not-an-outcome'],
      [{ ok: undefined }, 'text: ok: type'],
      [{ ok: null }, 'text: ok: type'],
      [{ failure: { reason: 3 } }, 'text: not-an-outcome'],
    ]
    for (const [returned, reason] of shapes) {
      const factory = { text: () => returned } as unknown as typeof textFactory
      expect(renderToolResult({}, ordinaryAuthor(), factory, defaultResultPolicy)).toEqual({
        failure: { reason },
      })
    }
    const renderer = { render: () => ({ ok: 7 }) } as unknown as ReturnType<
      typeof ordinaryAuthor
    >['renderer']
    expect(
      renderToolResult({}, { ...ordinaryAuthor(), renderer }, textFactory, defaultResultPolicy),
    ).toEqual({ failure: { reason: 'render: ok: type' } })
  })

  it('result rendering: an author of neither kind is a failure Outcome', () => {
    const author = { ...ordinaryAuthor(), kind: 'other' } as unknown as ReturnType<
      typeof ordinaryAuthor
    >
    expect(renderToolResult({}, author, textFactory, defaultResultPolicy)).toEqual({
      failure: { reason: 'author: kind' },
    })
  })

  it('result rendering: a renderer failure is a result failure, not a thrown error', () => {
    const author = { ...ordinaryAuthor(), renderer: { render: () => fail({ reason: 'cycle' }) } }
    expect(renderToolResult({}, author, textFactory, defaultResultPolicy)).toEqual({
      failure: { reason: 'render: cycle' },
    })
  })

  it('result rendering: a text factory may not add attachments to an ordinary return', () => {
    const factory = {
      text: (value: string) => succeed(result([text('t', value)], [reference('s', 'k')])),
    }
    expect(renderToolResult({}, ordinaryAuthor(), factory, defaultResultPolicy)).toEqual({
      failure: { reason: 'text: attachments is only for a structured return' },
    })
  })

  it('result rendering: structured data must match the program contract of the author', () => {
    const withData = {
      ...result([text('t', 'done')]),
      data: {
        kind: 'json',
        contract: adoption('count'),
        schema: valueSchema('count').identity,
        value: json('1'),
      },
    } as const
    expect(
      renderToolResult(withData, structuredAuthor(), textFactory, defaultResultPolicy),
    ).toEqual({
      failure: { reason: 'data: program-mismatch' },
    })
    const author = {
      ...structuredAuthor(),
      program: { kind: 'json', adoption: adoption('count'), schema: valueSchema('count') },
    } as const
    expect(renderToolResult(withData, author, textFactory, defaultResultPolicy)).toEqual({
      ok: withData,
    })
  })
})
