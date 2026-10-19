import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findForbidden, readPolicy } from './install/closure.ts'

// Pure judgments on declared dependencies; nothing here packs, installs or spawns a process.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const policyPath = join(packageDirectory, 'tests/fixtures/install-policy.json')

describe('framework-contract policy', () => {
  const policy = readPolicy(policyPath)
  const hits = (name: string) => findForbidden([{ name, via: [name] }], policy).length

  it('allows Cordis and the domain contract, and still forbids the default Model', () => {
    expect(hits('@deepseek-ai/cordis')).toBe(0)
    expect(hits('@omne-harness/model-contract')).toBe(0)
    expect(hits('@omne-harness/model')).toBe(1)
  })
})
