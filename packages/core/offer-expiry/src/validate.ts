import { createRequire } from 'node:module'
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'

const require = createRequire(import.meta.url)
const schema = require('../schema/offer-expiry.schema.json') as {
  $id: string
  $defs: Record<string, unknown>
}

export const SCHEMA_DEF_NAMES = ['Instant', 'OfferTiming', 'OfferState', 'SettledState'] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

// Schema 的 Instant 同时写了 format 与 pattern；这里不装 format 断言器，形状由 pattern 保证（契约 S-22 的说明）。
const ajv = new Ajv2020({ strict: true, allErrors: false, validateFormats: false })
// 规范工件用 x-counterexamples 登记反例（注解，不参与校验）；strict 模式下要先声明这个关键字。
ajv.addKeyword('x-counterexamples')
ajv.addSchema(schema)

const validators = new Map<SchemaDefName, ValidateFunction>()

export interface SchemaValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  let fn = validators.get(defName)
  if (fn === undefined) {
    fn = ajv.getSchema(`${schema.$id}#/$defs/${defName}`)
    if (fn === undefined) throw new Error(`schema definition not found: ${defName}`)
    validators.set(defName, fn)
  }
  const valid = fn(value) === true
  const errors = valid
    ? []
    : (fn.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ''}`.trim())
  return { valid, errors }
}

export const schemaId: string = schema.$id
