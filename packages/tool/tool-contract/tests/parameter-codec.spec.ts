import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createDefaultParameterCodec,
  judgeToolArguments,
  type ToolArguments,
} from '@omne-harness/tool-contract'
import { json, limits } from './tool-values.ts'

function codec(budgets = limits) {
  const made = createDefaultParameterCodec(budgets)
  if (!('ok' in made)) throw new Error(made.failure.field)
  return made.ok
}

function args(effective: string, complete = true): ToolArguments {
  return { original: effective, effective, complete }
}

describe('parameter codec', () => {
  it('parameter codec: parses complete strict JSON into a json-text tree', () => {
    expect(codec().parse(args('{"path":"a.txt","lines":10}'))).toEqual({
      ok: json('{"path":"a.txt","lines":10}'),
    })
  })

  it('parameter codec: parses the effective arguments, not the original ones', () => {
    const input = { original: '{"path":"draft"}', effective: '{"path":"final"}', complete: true }
    expect(codec().parse(input)).toEqual({ ok: json('{"path":"final"}') })
  })

  it('parameter codec: a duplicate key gives no argument value', () => {
    expect(codec().parse(args('{"path":"a","path":"b"}'))).toEqual({
      failure: { kind: 'invalid', reason: 'duplicate-key' },
    })
  })

  it('parameter codec: complete=false gives no argument value, even for valid JSON', () => {
    expect(codec().parse(args('{"path":"a"}', false))).toEqual({
      failure: { kind: 'incomplete', reason: 'incomplete' },
    })
  })

  it('parameter codec: truncated JSON gives no argument value', () => {
    expect(codec().parse(args('{"path":"a'))).toEqual({
      failure: { kind: 'invalid', reason: 'syntax:truncated' },
    })
    expect(codec().parse(args(''))).toEqual({ failure: { kind: 'invalid', reason: 'empty' } })
  })

  it('parameter codec: arguments over a budget give no argument value', () => {
    expect(codec({ ...limits, maxBytes: 8 }).parse(args('{"path":"a.txt"}'))).toEqual({
      failure: { kind: 'invalid', reason: 'budget:bytes' },
    })
  })

  it('parameter codec: names its budgets in the adoption digest', () => {
    const rules = {
      owner: '@omne-harness/tool-contract',
      name: 'default-parameter-codec',
      revision: '1',
      limits,
    }
    const digest = createHash('sha256').update(JSON.stringify(rules)).digest('hex')
    expect(codec().adoption).toEqual({
      owner: '@omne-harness/tool-contract',
      name: 'default-parameter-codec',
      revision: '1',
      digest: `sha256:${digest}`,
    })
    expect(codec({ ...limits, maxDepth: 4 }).adoption.digest).not.toBe(codec().adoption.digest)
  })

  it('parameter codec: arguments that are not an object are invalid, not a thrown error', () => {
    for (const input of [null, undefined, 'x'])
      expect(codec().parse(input as unknown as ToolArguments)).toEqual({
        failure: { kind: 'invalid', reason: 'type' },
      })
  })

  it('parameter codec: rejects a budget that is not a positive safe integer, without throwing', () => {
    expect(createDefaultParameterCodec({ ...limits, maxItems: 0 })).toEqual({
      failure: { field: 'limits.maxItems', reason: 'range' },
    })
    expect(createDefaultParameterCodec({ ...limits, maxBytes: 1.5 })).toEqual({
      failure: { field: 'limits.maxBytes', reason: 'range' },
    })
  })
})

describe('arguments judgment', () => {
  it('arguments judgment: parses the original and the effective text in full', () => {
    const input = { original: '{"path":"draft"}', effective: '{"path":"final"}', complete: true }
    expect(judgeToolArguments(input, limits)).toEqual({
      ok: { original: json('{"path":"draft"}'), effective: json('{"path":"final"}') },
    })
  })

  it('arguments judgment: a failing original text gives no value even when the effective text parses', () => {
    const input = { original: '{"path":"a"', effective: '{"path":"final"}', complete: true }
    expect(judgeToolArguments(input, limits)).toEqual({
      failure: { kind: 'invalid', field: 'original', reason: 'syntax:truncated' },
    })
  })

  it('arguments judgment: a duplicate key in the effective text gives no value', () => {
    const input = { original: '{}', effective: '{"path":"a","path":"b"}', complete: true }
    expect(judgeToolArguments(input, limits)).toEqual({
      failure: { kind: 'invalid', field: 'effective', reason: 'duplicate-key' },
    })
  })

  it('arguments judgment: complete=false is not parsed', () => {
    const input = { original: 'not json', effective: 'not json', complete: false }
    expect(judgeToolArguments(input, limits)).toEqual({ failure: { kind: 'incomplete' } })
  })

  it('arguments judgment: a malformed input or budget is a shape rejection, not an argument failure', () => {
    const input = { original: '{}', effective: '{}', complete: 'true' }
    expect(judgeToolArguments(input, limits)).toEqual({
      failure: { kind: 'shape', field: 'complete', reason: 'type' },
    })
    expect(
      judgeToolArguments(
        { original: '{}', effective: '{}', complete: true },
        { ...limits, maxDepth: 0 },
      ),
    ).toEqual({
      failure: { kind: 'shape', field: 'limits.maxDepth', reason: 'range' },
    })
  })
})
