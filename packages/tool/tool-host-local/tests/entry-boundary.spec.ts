import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { memberPath } from './module-graph.ts'

it('exposes only the delivered Cordis factories and refuses undeclared subpaths', () => {
  const manifest: { exports: Record<string, unknown> } = JSON.parse(
    readFileSync(memberPath('package.json'), 'utf8'),
  )
  expect(manifest.exports['./cordis']).toEqual({
    source: './src/cordis.ts',
    types: './dist/cordis.d.ts',
    import: './dist/cordis.js',
  })
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { deepEqual, equal, rejects } from 'node:assert/strict'
const entry = await import('@omne-harness/tool-host-local/cordis')
deepEqual(Object.keys(entry).sort(), ['createLocalToolBindingsPlugin', 'createLocalToolHostPlugin', 'createLocalToolRuntimePlugins'])
equal(typeof entry.createLocalToolBindingsPlugin, 'function')
equal(typeof entry.createLocalToolHostPlugin, 'function')
equal(typeof entry.createLocalToolRuntimePlugins, 'function')
await rejects(import('@omne-harness/tool-host-local/undeclared'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
})`,
    ],
    { cwd: memberPath('.') },
  )
})

it('consumes the contract, Cordis definition and implementation packages through the workspace', () => {
  const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  expect(manifest.dependencies).toMatchObject({
    '@omne-harness/tool': 'workspace:*',
    '@omne-harness/tool-contract': 'workspace:*',
    '@omne-harness/tool-cordis-contract': 'workspace:*',
  })
})
