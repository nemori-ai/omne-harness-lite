// projectModelOutputV1 (#1248 C7): the display value as a json-text tree. The samples are every
// input the encoding cases of model-output-v1.spec.ts and model-output-v1-sealed-envelope.spec.ts
// hand to encodeModelOutputV1, recorded with the answer of the start point (f8dc81652): see
// tests/fixtures/README.md. Writing the value gives the recorded bytes, and the encoding still gives
// them too.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { encodeModelOutputV1, projectModelOutputV1 } from '../src/model-output-v1.ts'

type Recorded = Readonly<{
  input: never
  hasBase: boolean
  basePhase: never
  answer: Readonly<{ ok: string }> | Readonly<{ failure: unknown }>
}>

const RECORDED: readonly Recorded[] = readFileSync(
  new URL('./fixtures/model-output-v1-encodings.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map(line => JSON.parse(line) as Recorded)

const project = (r: Recorded) =>
  r.hasBase ? projectModelOutputV1(r.input, r.basePhase) : projectModelOutputV1(r.input)
const encode = (r: Recorded) =>
  r.hasBase ? encodeModelOutputV1(r.input, r.basePhase) : encodeModelOutputV1(r.input)

describe('projectModelOutputV1', () => {
  it('covers the recorded inputs: successes, failures and deltas with a base phase', () => {
    expect(RECORDED.length).toBe(41)
    expect(RECORDED.some(r => 'failure' in r.answer)).toBe(true)
    expect(RECORDED.some(r => r.hasBase)).toBe(true)
  })

  it.each(RECORDED.map((r, i) => [i, r] as const))(
    'sample %i: the value written out is the start-point bytes, and so is the encoding',
    (_, recorded) => {
      const value = project(recorded)
      if ('failure' in recorded.answer) {
        expect(value).toEqual(recorded.answer)
        expect(encode(recorded)).toEqual(recorded.answer)
        return
      }
      if (!('ok' in value)) throw new Error('the projection failed')
      expect(writeJsonText(value.ok)).toBe(recorded.answer.ok)
      expect(encode(recorded)).toEqual(recorded.answer)
    },
  )
})
