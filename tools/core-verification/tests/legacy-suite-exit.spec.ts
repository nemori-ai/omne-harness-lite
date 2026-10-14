import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const legacyPackages = [
  '@omne-harness-lite/arrival-events',
  '@omne-harness-lite/asset-evaluation',
  '@omne-harness-lite/asset-model',
  '@omne-harness-lite/call-accounts',
  '@omne-harness-lite/content-blocks',
  '@omne-harness-lite/identity-values',
  '@omne-harness-lite/kernel-basis',
  '@omne-harness-lite/loop-extension',
  '@omne-harness-lite/mcp-endpoint',
  '@omne-harness-lite/messages',
  '@omne-harness-lite/model-profile',
  '@omne-harness-lite/model-response',
  '@omne-harness-lite/offer-expiry',
  '@omne-harness-lite/skill-package',
  '@omne-harness-lite/slash-command',
  '@omne-harness-lite/storage',
  '@omne-harness-lite/storage-sql',
  '@omne-harness-lite/stream-assembly',
  '@omne-harness-lite/tool-definition',
  '@omne-harness-lite/unix-format',
  '@omne-harness-lite/xml-format',
]

const removed = [
  'src/w1-public-consumer.ts',
  'src/w6-asset-consumer.ts',
  'src/w6-packed-consumer.ts',
  'src/w6-stream-consumer.ts',
  'src/storage-fixture.ts',
  'fixtures/storage-conformance.spec.ts',
  'fixtures/packed-consumer.mjs',
]

const root = fileURLToPath(new URL('..', import.meta.url))

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return [path]
  })
}

describe('legacy suite exit', () => {
  it('does not declare a workspace dependency on a legacy package', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(name => legacyPackages.includes(name))).toEqual([])
    expect(manifest.scripts?.['verify:packed']).toBeUndefined()
  })

  it('does not keep a file that can import or launch a legacy consumer', () => {
    for (const relative of removed) expect(existsSync(join(root, relative))).toBe(false)
    const texts = filesUnder(root)
      .filter(path => /\.(?:[cm]?[jt]s|json|mjs)$/u.test(path))
      .filter(path => !path.endsWith('tests/legacy-suite-exit.spec.ts'))
      .map(path => readFileSync(path, 'utf8'))
    expect(
      texts.some(text => text.includes('@omne-harness-lite/') || text.includes('0.0.1.legacy/')),
    ).toBe(false)
  })
})
