// 执行域的 schema-provider 实例与预算（R2-D80）：入口给出，行只消费。
// 预算字段都必填，schema-provider 不带默认值，数值在这里定：
// - `failureBackoffMs`、`maxAttempts`：取 schema-provider README 用法示例的值（50、3）。
// - `maxConstructDepth`、`maxConstructNodes`：取 agent-contract `check.ts` 已在用的值（40、400），环境声明的
//   Zod 形状远小于它们。
// - `maxSnapshots`：本行只常驻一个形状（环境声明），取 4 留余量，不是字节上限。
// - 声明的读取上限：一份环境声明只有三个短字符串数组，取 agent-contract 声明上限的同一量级。
import { type JsonLimits } from '@omne-harness/json-text'
import {
  close,
  createSchemaProvider,
  type SchemaBudget,
  type SchemaProvider,
} from '@omne-harness/schema-provider'

export const ENVIRONMENT_SCHEMA_BUDGET: SchemaBudget = Object.freeze({
  maxSnapshots: 4,
  maxConstructDepth: 40,
  maxConstructNodes: 400,
  failureBackoffMs: 50,
  maxAttempts: 3,
})

export const ENVIRONMENT_DECLARATION_LIMITS: JsonLimits = Object.freeze({
  maxBytes: 100_000,
  maxDepth: 20,
  maxItems: 200,
  maxMembers: 80,
  maxStringLength: 10_000,
  maxNumberLength: 100,
})

/** 一个运行建一个 provider；用 `closeEnvironmentSchemaProvider` 收场。 */
export function createEnvironmentSchemaProvider(): SchemaProvider {
  return createSchemaProvider(ENVIRONMENT_SCHEMA_BUDGET)
}

export function closeEnvironmentSchemaProvider(provider: SchemaProvider): void {
  close(provider)
}
