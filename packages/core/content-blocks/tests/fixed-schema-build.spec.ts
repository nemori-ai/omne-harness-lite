import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { SCHEMA_DEF_NAMES } from '../src/index.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
it('loads every built fixed definition without compiling at first use', () => {
  const generated = require('./generated/ordinary.cjs') as Record<
    string,
    (input: unknown) => unknown
  >
  expect(Object.keys(generated).sort()).toEqual([...SCHEMA_DEF_NAMES].sort())
  for (const name of SCHEMA_DEF_NAMES) {
    const result = generated[name]!(null)
    expect(typeof result).toBe('boolean')
  }
})

it('binds generated output to current resource, option, helper and source inputs', () => {
  const driver = new URL('../../../../scripts/build-fixed-schemas.mjs', import.meta.url).href
  const inputs = new URL('../dist/schema-inputs.js', import.meta.url).href
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    const { fixedSchemaFingerprint } = await import(${JSON.stringify(driver)});
    const { schemaGraphs } = await import(${JSON.stringify(inputs)});
    const manifest = JSON.parse(readFileSync('generated/manifest.json', 'utf8'));
    assert.equal(fixedSchemaFingerprint(process.cwd(), schemaGraphs).sha256, manifest.sha256, 'stale fixed Schema output: rebuild this owner and its helper dependencies');
    console.log('current fixed Schema output');
  `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output.trim()).toBe('current fixed Schema output')
})

it('uses the published native receiver for fixed meta and standalone numeric checks', () => {
  const codegen = require('@omne-harness-lite/content-blocks/schema-codegen') as {
    generateSchemaModule(input: {
      resources: readonly unknown[]
      definitions: readonly { name: string; schema: unknown }[]
    }): string
  }
  const fixedMeta = require('./generated/meta.cjs') as { Meta(text: string): { valid: boolean } }
  expect(fixedMeta.Meta('{"minLength":1.00000000000000000001}').valid).toBe(false)
  expect(fixedMeta.Meta('{"multipleOf":1e-400}').valid).toBe(true)
  expect(() =>
    codegen.generateSchemaModule({
      resources: [{ $id: 'https://test.invalid/bad', type: 'imaginary' }],
      definitions: [],
    }),
  ).toThrow(TypeError)
  // Loading all generated exports above also resolves the actual native helper.
  const runtime = require('@omne-harness-lite/content-blocks/code-runtime') as {
    exactKeywords: object
  }
  expect(Object.keys(runtime.exactKeywords)).toHaveLength(16)
  expect(Object.isFrozen(runtime.exactKeywords)).toBe(true)
})

it('binds reserved export names instead of exposing a raw validator as the namespace prototype', () => {
  const codegen = require('@omne-harness-lite/content-blocks/schema-codegen') as {
    generateSchemaModule(input: {
      resources: readonly unknown[]
      definitions: readonly { name: string; schema: unknown }[]
    }): string
  }
  const names = ['__proto__', 'constructor', 'a/b']
  const source = codegen.generateSchemaModule({
    resources: [],
    definitions: names.map(name => ({ name, schema: { type: 'integer' } })),
  })
  const module = { exports: {} as Record<string, (text: string) => { valid: boolean }> }
  runInNewContext(source, { module, exports: module.exports, require })
  expect(Object.getPrototypeOf(module.exports)).toBeNull()
  expect(Object.keys(module.exports).sort()).toEqual([...names].sort())
  for (const name of names) {
    expect(module.exports[name]!('1.00000000000000000001').valid).toBe(false)
    expect(module.exports[name]!('9007199254740993').valid).toBe(true)
  }
})
