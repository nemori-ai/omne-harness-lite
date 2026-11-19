import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { readToolOperation } from '@omne-harness/tool-contract/binding'
import {
  DEFAULT_RELEASE_DETAIL_POLICY as POLICY,
  defineToolOperation,
  judgeReleaseDescription,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { checkReleaseDescription } from '@omne-harness/tool-contract/testing'
import { commandsDefinition, ordinaryAuthor, ordinaryReturns, parameters } from './tool-values.ts'

const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 32768,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('not JSON')
  return read.value
}
const DETAIL = { kind: 'test.detail@1', schema: tree({ type: 'object' }) }
const ONE = [{ label: 'l', value: 'v' }]

describe('what a description may hold, judged against its declaration and the budget', () => {
  it('keeps rows of text and of lists, and a typed value only when the command declares a kind', () => {
    const rows = [
      { label: '收件人', value: '你' },
      { label: '标签', value: ['a', 'b'] },
    ]
    expect(judgeReleaseDescription({ rows }, undefined, POLICY)).toEqual({ ok: { rows } })
    expect(judgeReleaseDescription({ rows, typed: tree({ at: 1 }) }, DETAIL, POLICY)).toEqual({
      ok: { rows, typed: { kind: 'test.detail@1', value: '{"at":1}' } },
    })
  })

  it.each([
    ['a value that is no object', 'rows', 'not-an-object'],
    ['an unknown member', { rows: ONE, note: 'x' }, 'unknown-field'],
    ['no rows', { rows: [] }, 'rows'],
    ['rows that are no list', { rows: 'x' }, 'rows'],
    [
      'too many rows',
      { rows: Array.from({ length: 25 }, () => ({ label: 'l', value: 'v' })) },
      'rows',
    ],
    ['a blank label', { rows: [{ label: ' ', value: 'v' }] }, 'row'],
    ['a label over its budget', { rows: [{ label: 'l'.repeat(41), value: 'v' }] }, 'row'],
    ['a text over its budget', { rows: [{ label: 'l', value: 'v'.repeat(501) }] }, 'row'],
    ['an empty list', { rows: [{ label: 'l', value: [] }] }, 'row'],
    [
      'too many items',
      { rows: [{ label: 'l', value: Array.from({ length: 13 }, () => 'i') }] },
      'row',
    ],
    ['an item over its budget', { rows: [{ label: 'l', value: ['i'.repeat(201)] }] }, 'row'],
    ['a row with another member', { rows: [{ label: 'l', value: 'v', x: 1 }] }, 'row'],
    [
      'a typed value the command does not declare',
      { rows: ONE, typed: tree(1) },
      'typed-undeclared',
    ],
  ])('gives nothing for %s', (_name, value, reason) => {
    expect(judgeReleaseDescription(value, undefined, POLICY)).toEqual({ failure: reason })
  })

  it.each([
    ['null', null],
    ['a row that is no object', { rows: ['x'] }],
    ['a row that is null', { rows: [null] }],
    ['a label that is no text', { rows: [{ label: 5, value: 'v' }] }],
    ['one bad row among good ones', { rows: [...ONE, { label: 'l', value: '' }] }],
    ['one bad item among good ones', { rows: [{ label: 'l', value: ['i', ''] }] }],
  ])('gives nothing for %s', (_name, value) => {
    expect(judgeReleaseDescription(value, undefined, POLICY)).toHaveProperty('failure')
  })

  it('keeps every part exactly at its budget', () => {
    const rows = Array.from({ length: POLICY.maxRows }, () => ({
      label: 'l'.repeat(POLICY.maxLabel),
      value: Array.from({ length: POLICY.maxItems }, () => 'i'.repeat(POLICY.maxItem)),
    }))
    const text = [{ label: 'l', value: 'v'.repeat(POLICY.maxText) }]
    expect(judgeReleaseDescription({ rows }, undefined, POLICY)).toHaveProperty('ok')
    expect(judgeReleaseDescription({ rows: text }, undefined, POLICY)).toHaveProperty('ok')
    const typed = tree({ text: 'x'.repeat(POLICY.maxTypedBytes - 11) })
    expect(judgeReleaseDescription({ rows: ONE, typed }, DETAIL, POLICY)).toHaveProperty('ok')
  })

  it('gives nothing for a declared kind without a value, a value that is no JSON, and one too large', () => {
    expect(judgeReleaseDescription({ rows: ONE }, DETAIL, POLICY)).toEqual({
      failure: 'typed-undeclared',
    })
    expect(judgeReleaseDescription({ rows: ONE, typed: () => 1 }, DETAIL, POLICY)).toEqual({
      failure: 'typed-not-json',
    })
    const large = tree({ text: 'x'.repeat(16 * 1024) })
    expect(judgeReleaseDescription({ rows: ONE, typed: large }, DETAIL, POLICY)).toEqual({
      failure: 'typed-too-large',
    })
  })
})

describe('a command declares the kind of its typed detail', () => {
  const withRelease = (release: unknown) => {
    const source = commandsDefinition()
    if (source.kind !== 'commands') throw new Error('commands')
    return {
      ...source,
      commands: source.commands.map((command, index) =>
        index === 0 ? { ...command, release } : command,
      ),
    }
  }

  it('accepts a kind with its major version and a schema object', () => {
    expect(
      judgeToolDefinition(withRelease({ gate: null, detail: DETAIL }) as never),
    ).toHaveProperty('ok')
  })

  it.each(['Test.detail@1', 'test.detail', 'test.detail@0', 'test..detail@1', 5])(
    'refuses the kind %j',
    kind => {
      expect(
        judgeToolDefinition(withRelease({ gate: null, detail: { ...DETAIL, kind } }) as never),
      ).toMatchObject({ failure: { field: 'commands[0].release.detail.kind' } })
    },
  )
})

describe('the slot of a command carries the describe function it was given', () => {
  const operation = (extra: object) => {
    const defined = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
      author: ordinaryAuthor(),
      ...extra,
    })
    if (!('ok' in defined)) throw new Error(defined.failure.field)
    return readToolOperation(defined.ok)
  }

  it('keeps the function, has none without one, and refuses one that is no function', () => {
    const describeRelease = async () => ({ rows: [] })
    expect(operation({ describeRelease })?.describeRelease).toBe(describeRelease)
    expect(operation({})?.describeRelease).toBeNull()
    expect(
      defineToolOperation({
        parameters: { kind: 'declared', value: parameters() },
        returns: ordinaryReturns,
        author: ordinaryAuthor(),
        describeRelease: 'not a function' as never,
      }),
    ).toEqual({ failure: { field: 'describeRelease', reason: 'type' } })
  })
})

describe('the conformance check of a describe function', () => {
  const input = { principal: 'p', tenant: {} as never, arguments: { title: 'T' } }

  it('passes a function that reads only, and answers the same each time', async () => {
    const state = { writes: 0 }
    const described = await checkReleaseDescription(
      async (call: { arguments: { title: string } }) => ({
        rows: [{ label: '标题', value: call.arguments.title }],
      }),
      input,
      { state: async () => ({ ...state }) },
    )
    expect(described).toEqual({ ok: { rows: [{ label: '标题', value: 'T' }] } })
  })

  it('fails a function that writes, and one that answers differently each time', async () => {
    const state = { writes: 0 }
    expect(
      await checkReleaseDescription(
        async () => {
          state.writes += 1
          return { rows: [] }
        },
        input,
        { state: async () => ({ ...state }) },
      ),
    ).toEqual({ failure: 'the description changed the domain state' })
    let calls = 0
    expect(
      await checkReleaseDescription(
        async () => ({ rows: [{ label: 'n', value: String((calls += 1)) }] }),
        input,
        { state: async () => null },
      ),
    ).toEqual({ failure: 'the same input gave different descriptions' })
  })
})
