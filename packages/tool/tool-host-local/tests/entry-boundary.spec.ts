import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { memberPath } from './module-graph.ts'

it('does not expose an undelivered Cordis entry through the manifest or Node imports', () => {
  const manifest: { exports: Record<string, unknown> } = JSON.parse(
    readFileSync(memberPath('package.json'), 'utf8'),
  )
  expect(Object.keys(manifest.exports)).not.toContain('./cordis')
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { rejects } from 'node:assert/strict'
await rejects(import('@omne-harness/tool-host-local/cordis'), {
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
