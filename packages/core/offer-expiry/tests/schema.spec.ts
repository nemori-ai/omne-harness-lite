import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type SchemaDefName, validate } from '../src/index.ts'

const SCHEMA_FILE = resolve(import.meta.dirname, '../schema/offer-expiry.schema.json')

interface Counterexample {
  readonly value: unknown
  readonly rejectedBySchema: boolean
  readonly why: string
}

interface DefWithExamples {
  readonly examples?: readonly unknown[]
  readonly 'x-counterexamples'?: readonly Counterexample[]
}

const original = readFileSync(SCHEMA_FILE)
const schema = JSON.parse(original.toString('utf8')) as { $defs: Record<string, DefWithExamples> }

describe('Schema adopted identity', () => {
  it('retains independently fixed normative bytes', () => {
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '2fa7b9bcd5ba528ef4dafc6812cc087c839c0a45a5e0f465747ad44a7230d05b',
    )
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
