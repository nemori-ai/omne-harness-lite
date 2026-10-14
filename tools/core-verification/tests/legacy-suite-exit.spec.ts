import { readFileSync } from 'node:fs'
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

describe('legacy suite exit', () => {
  it('does not declare a workspace dependency on a legacy package', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(name => legacyPackages.includes(name))).toEqual([])
  })
})
