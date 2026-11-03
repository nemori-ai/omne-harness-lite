// The directory source runs the contract suite of `SkillPackageSource` on real temporary
// directories, each case on a fresh tree. The source keeps no bytes by digest, so PS7 is the one
// case that must come back not applicable; every other case must pass.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runConformanceCase,
  skillPackageSourceConformance,
  type SourceFixture,
} from '@omne-harness/skill-contract/testing'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { directory, SAMPLE, scratch, writeTree } from './scratch.ts'

async function fixture(): Promise<SourceFixture> {
  const base = await scratch()
  await writeTree(join(base, 'pkg'), SAMPLE)
  await writeTree(join(base, 'escaping'), {
    files: { 'SKILL.md': '---\nname: escaping\ndescription: Leaks.\n---\n' },
    links: { 'secret.txt': '../outside.txt' },
  })
  await writeTree(base, { files: { 'outside.txt': 'not in any package\n' } })
  return {
    source: createDirectorySource(),
    present: directory(join(base, 'pkg')),
    absent: directory(join(base, 'no-such-package')),
    addressing: 'locator',
    escaping: directory(join(base, 'escaping')),
  }
}

const NOT_APPLICABLE: Readonly<Record<string, string>> = { PS7: 'content-digest addressing' }

describe('SkillPackageSource conformance: directory source on a real temporary directory', () => {
  for (const conformance of skillPackageSourceConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const handle = NOT_APPLICABLE[conformance.clause]
      expect(await runConformanceCase(conformance, await fixture())).toEqual(
        handle === undefined ? { kind: 'passed' } : { kind: 'not-applicable', handle },
      )
    })
})
