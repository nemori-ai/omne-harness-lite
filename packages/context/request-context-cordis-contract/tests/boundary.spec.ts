import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
it('definition and built entries do not import production implementation members', () => {
  for (const path of [
    'src/index.ts',
    'src/cordis.ts',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cordis.js',
    'dist/cordis.d.ts',
  ]) {
    const text = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    expect(text).not.toMatch(
      /from ['"]@omne-harness\/(?:request-context|request-context-cordis)['"]/,
    )
  }
  expect(readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')).not.toContain(
    '@deepseek-ai/cordis',
  )
})
it('shared export inventory agrees with source, declarations and public navigation', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'tools/dev-flow/src/package-exports/cli.ts',
      'packages/context/request-context-cordis-contract',
      '--json',
    ],
    { cwd: new URL('../../../../', import.meta.url), encoding: 'utf8' },
  )
  expect(JSON.parse(output).report.problems).toEqual([])
})
