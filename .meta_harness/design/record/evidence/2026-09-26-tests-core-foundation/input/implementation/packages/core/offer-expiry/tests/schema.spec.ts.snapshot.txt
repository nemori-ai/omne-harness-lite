import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type SchemaDefName, validate } from '../src/index.ts'

const SPEC_FILE = resolve(
  import.meta.dirname,
  '../../../../.meta_harness/design/spec/data/offer-expiry/v1/offer-expiry.schema.json',
)

interface Counterexample {
  readonly value: unknown
  readonly rejectedBySchema: boolean
  readonly why: string
}

interface DefWithExamples {
  readonly examples?: readonly unknown[]
  readonly 'x-counterexamples'?: readonly Counterexample[]
}

const original = readFileSync(SPEC_FILE)
const schema = JSON.parse(original.toString('utf8')) as { $defs: Record<string, DefWithExamples> }

describe('Schema 副本', () => {
  it('与 spec 目录的规范工件逐字节相同', () => {
    const copy = readFileSync(resolve(import.meta.dirname, '../schema/offer-expiry.schema.json'))
    expect(copy.equals(original)).toBe(true)
  })
})

describe('Schema 自带的 examples 与 x-counterexamples 逐条核对', () => {
  for (const [defName, def] of Object.entries(schema.$defs)) {
    for (const example of def.examples ?? []) {
      it(`${defName} 正例 ${JSON.stringify(example)}`, () => {
        expect(validate(defName as SchemaDefName, example).valid).toBe(true)
      })
    }
    for (const counter of def['x-counterexamples'] ?? []) {
      it(`${defName} 反例 ${JSON.stringify(counter.value)} ⇒ rejectedBySchema=${counter.rejectedBySchema}`, () => {
        expect(validate(defName as SchemaDefName, counter.value).valid).toBe(
          !counter.rejectedBySchema,
        )
      })
    }
  }
})
