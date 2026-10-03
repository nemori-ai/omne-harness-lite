// @module-tag slow
// Real tsc and fixed-schema generation exercise the same-depth mutation sandbox.
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { MEMBER_DIR_ENV, TEST_TIMEOUT_ENV } from '../src/mutation/stryker.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const original = join(root, 'packages/core/identity-values')
const builder = fileURLToPath(new URL('../src/mutation/sandbox-build.ts', import.meta.url))
const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})
function fixture(): string {
  const container = mkdtempSync(join(root, 'packages/.stryker-tmp-fixed-schema-test-'))
  temporaries.push(container)
  const owner = join(container, 'sandbox-owner')
  mkdirSync(owner)
  for (const path of ['package.json', 'tsconfig.build.json', 'src', 'schema'])
    cpSync(join(original, path), join(owner, path), { recursive: true })
  return owner
}
function build(owner: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', builder], {
    cwd: owner,
    encoding: 'utf8',
    env: {
      ...process.env,
      [MEMBER_DIR_ENV]: original,
      [TEST_TIMEOUT_ENV]: '60000',
    },
  })
}
function consume(owner: string) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import assert from 'node:assert/strict';
        import { readFileSync } from 'node:fs';
        import { SCHEMA_DEF_NAMES, validate } from '@omne-harness-lite/identity-values';
        import { schemaGraphs } from './dist/schema-inputs.js';
        import { fixedSchemaFingerprint } from '../../../scripts/build-fixed-schemas.mjs';
        assert.ok(SCHEMA_DEF_NAMES.length > 0);
        for (const name of SCHEMA_DEF_NAMES) assert.equal(typeof validate(name, null).valid, 'boolean');
        const manifest = JSON.parse(readFileSync('generated/manifest.json', 'utf8'));
        assert.equal(fixedSchemaFingerprint(process.cwd(), schemaGraphs).sha256, manifest.sha256);
        console.log('sandbox public entry and freshness passed');
      `,
    ],
    { cwd: owner, encoding: 'utf8' },
  )
}

it('builds and consumes a registered fixed owner in a mutation sandbox, then cleans a failed rebuild', () => {
  const owner = fixture()
  const first = build(owner)
  expect(first.status, first.stdout + first.stderr).toBe(0)
  const used = consume(owner)
  expect(used.status, used.stdout + used.stderr).toBe(0)
  const source = join(owner, 'src/validate.ts')
  const bytes = readFileSync(source)
  writeFileSync(source, Buffer.concat([bytes, Buffer.from('\nconst invalid: string = 1\n')]))
  const failed = build(owner)
  expect(failed.status).not.toBe(0)
  expect(failed.stdout + failed.stderr).toContain('TS2322')
  expect(existsSync(join(owner, 'dist'))).toBe(false)
  expect(existsSync(join(owner, 'generated'))).toBe(false)
  writeFileSync(source, bytes)
  const recovered = build(owner)
  expect(recovered.status, recovered.stdout + recovered.stderr).toBe(0)
  const reused = consume(owner)
  expect(reused.status, reused.stdout + reused.stderr).toBe(0)
})

it('rejects an unregistered package before deleting its unrelated outputs', () => {
  const owner = fixture()
  const path = join(owner, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  manifest['name'] = '@example/unregistered'
  writeFileSync(path, JSON.stringify(manifest))
  for (const directory of ['dist', 'generated']) {
    mkdirSync(join(owner, directory))
    writeFileSync(join(owner, directory, 'sentinel'), 'unrelated output')
  }
  const failed = build(owner)
  expect(failed.status).not.toBe(0)
  expect(failed.stdout + failed.stderr).toContain('fixed Schema build is not released')
  for (const directory of ['dist', 'generated'])
    expect(readFileSync(join(owner, directory, 'sentinel'), 'utf8')).toBe('unrelated output')
})
