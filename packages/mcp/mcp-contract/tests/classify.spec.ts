import { describe, expect, it } from 'vitest'
import {
  classifyOutcome,
  isGeneration,
  type CallOutcome,
  type OutputCheck,
} from '@omne-harness/mcp-contract'
import { classifyOutcomeCases } from '@omne-harness/mcp-contract/testing'
import { json } from './json.ts'

function validator(answer: OutputCheck | undefined) {
  const calls: unknown[][] = []
  const check = (structured: unknown, schema: unknown): OutputCheck => {
    calls.push([structured, schema])
    if (answer === undefined) throw new Error('the output validator must not be called')
    return answer
  }
  return { calls, check }
}

describe('classifyOutcome over the exhaustive case table', () => {
  for (const sample of classifyOutcomeCases)
    it(sample.name, () => {
      const { check } = validator(sample.validatorAnswer)
      const context = {
        issuedAt: sample.issuedAt,
        checkOutput: check,
        ...(sample.outputSchema === undefined ? {} : { outputSchema: sample.outputSchema }),
      }
      expect(classifyOutcome(sample.answer, context)).toEqual(sample.expected)
    })

  it('covers all six outcome kinds', () => {
    const kinds = new Set(classifyOutcomeCases.map(sample => sample.expected.kind))
    const all: readonly CallOutcome['kind'][] = [
      'complete',
      'toolError',
      'inputRequired',
      'task',
      'protocolError',
      'unknown',
    ]
    expect([...kinds].sort()).toEqual([...all].sort())
  })

  it('covers the three output checks, isError, a missing and an unknown resultType, and error codes', () => {
    const outputs = classifyOutcomeCases.flatMap(sample =>
      sample.expected.kind === 'complete' ? [sample.expected.output.kind] : [],
    )
    expect(new Set(outputs)).toEqual(new Set(['conforms', 'violates', 'no-schema']))
    const names = classifyOutcomeCases.map(sample => sample.name).join('\n')
    expect(names).toMatch(/isError/)
    expect(names).toMatch(/without resultType/)
    expect(names).toMatch(/unknown resultType/)
    const codes = classifyOutcomeCases.flatMap(sample =>
      sample.expected.kind === 'protocolError' && sample.expected.fault.kind === 'peer-error'
        ? [sample.expected.fault.code]
        : [],
    )
    expect(new Set(codes).size).toBeGreaterThanOrEqual(3)
  })
})

describe('classifyOutcome and the injected output validator', () => {
  const issuedAt = 4
  if (!isGeneration(issuedAt)) throw new Error('bad generation')
  const schema = json({ type: 'object', required: ['n'] })
  const answer = {
    kind: 'result',
    result: json({ resultType: 'complete', content: [], structuredContent: { n: 1 } }),
  } as const

  it('passes the structured content and the declared output schema to the validator', () => {
    const { calls, check } = validator({ kind: 'conforms' })
    classifyOutcome(answer, { issuedAt, outputSchema: schema, checkOutput: check })
    expect(calls).toEqual([[json({ n: 1 }), schema]])
  })

  it('does not call the validator when the action declares no output schema', () => {
    const { calls, check } = validator({ kind: 'conforms' })
    const outcome = classifyOutcome(answer, { issuedAt, checkOutput: check })
    expect(calls).toEqual([])
    expect(outcome).toMatchObject({ kind: 'complete', output: { kind: 'no-schema' } })
  })

  it('does not call the validator for a tool error', () => {
    const { calls, check } = validator({ kind: 'conforms' })
    const failed = {
      kind: 'result',
      result: json({ resultType: 'complete', isError: true, content: [] }),
    } as const
    classifyOutcome(failed, { issuedAt, outputSchema: schema, checkOutput: check })
    expect(calls).toEqual([])
  })
})
