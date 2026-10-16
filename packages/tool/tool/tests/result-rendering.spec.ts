import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/kernel-basis'
import { defaultResultPolicy, renderToolResult, type ToolResult } from '@omne-harness/tool'
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
