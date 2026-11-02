import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const files = (dir: string): string[] =>
  readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  )

describe('the ./testing subpath (C3)', () => {
  it('declares source, types and import conditions', () => {
    const exported = JSON.parse(read('package.json')).exports['./testing']
    expect(exported).toEqual({
      source: './src/testing/index.ts',
      types: './dist/testing/index.d.ts',
      import: './dist/testing/index.js',
    })
  })
  it('the built package carries dist/testing and resolves the subpath', async () => {
    expect(existsSync(new URL('../dist/testing/index.js', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../dist/testing/index.d.ts', import.meta.url))).toBe(true)
    const built = (await import(
      new URL('../dist/testing/index.js', import.meta.url).href
    )) as Record<string, unknown>
    expect(Object.keys(built).sort()).toEqual([
      'contextHolderSourcesConformance',
      'createMemoryContextHolder',
      'createScriptedRequestContextTrust',
      'requestContextTrustConformance',
    ])
    const resolved =
      (await import('@omne-harness/request-context-cordis-contract/testing')) as Record<
        string,
        unknown
      >
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(built).sort())
  })
  it('neither source nor build of the testing entry imports a provider member', () => {
    const provider =
      /from ['"]@omne-harness\/(?:request-context|request-context-cordis)(?:\/[^'"]*)?['"]/
    for (const path of [...files('src/testing'), ...files('dist/testing')].filter(p =>
      /\.(?:ts|js)$/.test(p),
    ))
      expect(read(path), path).not.toMatch(provider)
  })
  it('the root entry does not re-export testing', () => {
    expect(read('src/index.ts')).not.toMatch(/testing/)
    expect(read('src/cordis.ts')).not.toMatch(/testing/)
    expect(JSON.parse(read('package.json')).exports['.']).not.toHaveProperty('testing')
  })
  it('the root source and build carry no Cordis runtime dependency', () => {
    for (const path of [
      'src/index.ts',
      'src/trust.ts',
      'src/holder-sources.ts',
      'dist/index.js',
      'dist/trust.js',
      'dist/holder-sources.js',
    ])
      expect(read(path), path).not.toContain('@deepseek-ai/cordis')
  })
})
