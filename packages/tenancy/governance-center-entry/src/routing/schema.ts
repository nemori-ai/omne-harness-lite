// 入口契约 Schema 的运行期校验：载荷那一步（每条路由的 `Payload_<路由>`）与矛盾清单 ①（成功返回合不合 `Result_<路由>`）。
// 规范工件在 spec 目录，`schema/` 下是逐字节副本（漂移由测试核对）；它 `$ref` identity-values 与 offer-expiry 两份 Schema，
// 取自那两个包公开的 `./schema` 入口，与它们各自的校验用同一份字节。
import { createRequire } from 'node:module'
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'

const require = createRequire(import.meta.url)

interface SchemaDocument {
  readonly document: object
  readonly id: string
}

function schemaDocument(value: unknown): SchemaDocument {
  if (typeof value === 'object' && value !== null && '$id' in value) {
    const id = value.$id
    if (typeof id === 'string') return { document: value, id }
  }
  throw new Error('governance-center-entry: a bundled JSON Schema has no $id')
}

const entrySchema = schemaDocument(require('../../schema/governance-center-entry.schema.json'))
const identityValuesSchema = schemaDocument(require('@omne-harness-lite/identity-values/schema'))
const offerExpirySchema = schemaDocument(require('@omne-harness-lite/offer-expiry/schema'))

/**
 * 保持 `unicodeRegExp` 默认开启：ajv 8 以 `u` 标志编译 `pattern`，出示物与不透明标识的 pattern 按码点求值；
 * `maxLength`／`minLength` 按码点计（取证见包 tests/basis）。
 * `strictTypes` 关掉：Schema 在 `if`／`then` 与 `allOf` 里补充 `properties` 而不重复写 `type`，那是规范工件的写法。
 * 不装 format 断言器：`Instant` 的形状由它的 pattern 保证（offer-expiry 包同一做法）。
 */
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  allErrors: false,
  validateFormats: false,
})
// 规范工件用 x-counterexamples 登记反例（注解，不参与校验）
ajv.addKeyword('x-counterexamples')
ajv.addSchema(identityValuesSchema.document)
ajv.addSchema(offerExpirySchema.document)
ajv.addSchema(entrySchema.document)

const validators = new Map<string, ValidateFunction>()

/** 入口契约 Schema 里一个定义的校验器；定义名不存在即抛出（那是本包的缺陷）。 */
export function entryValidator(defName: string): ValidateFunction {
  let validator = validators.get(defName)
  if (validator === undefined) {
    validator = ajv.getSchema(`${entrySchema.id}#/$defs/${defName}`)
    if (validator === undefined) throw new Error(`schema definition not found: ${defName}`)
    validators.set(defName, validator)
  }
  return validator
}

export function conformsTo(defName: string, value: unknown): boolean {
  return entryValidator(defName)(value) === true
}

export const ENTRY_SCHEMA_ID: string = entrySchema.id
