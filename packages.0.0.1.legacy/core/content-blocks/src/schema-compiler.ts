import { createRequire } from 'node:module'
import type { Ajv2020, KeywordCxt } from 'ajv/dist/2020.js'
import { exactKeywordDefinitions } from './exact-keywords.ts'
import { schemaPattern } from './schema-pattern.ts'

/** Same-domain refs for explicit owners, plus stable native refs for standalone output. */
export function installExactKeywords(ajv: Ajv2020): void {
  const require = createRequire(import.meta.url)
  const { _, strConcat } =
    require('ajv/dist/compile/codegen/index.js') as typeof import('ajv/dist/compile/codegen/index.js')
  const { default: names } =
    require('ajv/dist/compile/names.js') as typeof import('ajv/dist/compile/names.js')
  for (const definition of exactKeywordDefinitions) {
    ajv.addKeyword({
      keyword: definition.keyword,
      schemaType: definition.schemaType,
      code(context: KeywordCxt) {
        const fn = context.gen.scopeValue('func', {
          ref: definition.validate,
          code: _`require("@omne-harness-lite/content-blocks/code-runtime").exactKeywords[${definition.keyword}]`,
        })
        const invocation = context.gen.object([
          names.instancePath,
          strConcat(names.instancePath, context.it.errorPath),
        ])
        context.pass(
          _`${fn}.call(${names.this}, ${context.schemaCode}, ${context.data}, undefined, ${invocation})`,
        )
      },
    })
  }
}

/** Build-only construction; fixed meta bootstrap does not depend on generated files. */
export function createBuildCompiler(meta = false): Ajv2020 {
  const { Ajv2020: Constructor } = createRequire(import.meta.url)(
    'ajv/dist/2020.js',
  ) as typeof import('ajv/dist/2020.js')
  const ajv = new Constructor({
    ...(meta ? { meta: false } : {}),
    strict: false,
    allErrors: false,
    ownProperties: true,
    validateFormats: false,
    validateSchema: false,
    passContext: true,
    code: { source: true, regExp: schemaPattern },
  })
  installExactKeywords(ajv)
  return ajv
}
