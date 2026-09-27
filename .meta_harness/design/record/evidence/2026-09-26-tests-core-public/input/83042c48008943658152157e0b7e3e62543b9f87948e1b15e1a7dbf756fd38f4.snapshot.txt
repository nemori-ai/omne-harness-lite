import { createRequire } from 'node:module'
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'

const require = createRequire(import.meta.url)
/** 规范工件在 spec 目录，这里是逐字节副本；副本漂移由测试核对。 */
const schema = require('../schema/identity-values.schema.json') as {
  $id: string
  $defs: Record<string, unknown>
}

export const SCHEMA_DEF_NAMES = [
  'OpaqueIdentifier',
  'HandoffWarrant',
  'LoginIdentifier',
  'AccountId',
  'OrganizationId',
  'LoginStateId',
  'OrganizationKind',
  'TenantRole',
  'TenantId',
  'MembershipStanding',
  'MembershipStandingResult',
  'ScopeLayerIdentity',
] as const

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

// pattern 用了 (?![\s\S]) 与显式码点类，ECMA-262 语义下与 Python re 一致；ajv 默认按 'u' 编译，
// 这里保持默认以便 \uXXXX 码点在 BMP 之外也按码点匹配。
const ajv = new Ajv2020({ strict: true, allErrors: false })
ajv.addSchema(schema)

const validators = new Map<SchemaDefName, ValidateFunction>()

function validatorFor(defName: SchemaDefName): ValidateFunction {
  let fn = validators.get(defName)
  if (fn === undefined) {
    const ref = `${schema.$id}#/$defs/${defName}`
    fn = ajv.getSchema(ref)
    if (fn === undefined) throw new Error(`schema definition not found: ${defName}`)
    validators.set(defName, fn)
  }
  return fn
}

export interface SchemaValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/**
 * 按 `$defs` 名校验交换表示（S-22 一类的形状校验）。
 * 通过只说明形状合规，不表示任何条款成立（S-33）。
 */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const fn = validatorFor(defName)
  const valid = fn(value) === true
  const errors = valid
    ? []
    : (fn.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ''}`.trim())
  return { valid, errors }
}

export const schemaId: string = schema.$id
