import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { schemaGraphs } from '../src/schema-inputs.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
it('loads every built fixed definition without compiling at first use', () => {
  for (const graph of schemaGraphs) {
    const generated = require(`./generated/${graph.name}.cjs`) as Record<
      string,
      (input: unknown) => unknown
    >
    expect(Object.keys(generated).sort()).toEqual(
      graph.definitions.map(definition => definition.name).sort(),
    )
    for (const definition of graph.definitions)
      expect(typeof generated[definition.name]!(null)).toBe('boolean')
  }
})

it('binds generated output to current resource, option, helper and source inputs', () => {
  const driver = new URL('../../../scripts/build-fixed-schemas.mjs', import.meta.url).href
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
