import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { facilityDifferences, facilityFiles } from './facility-sync.ts'

// The comparison of the facility copies must be able to fail, or the check on the real members
// (facility-members.spec.ts) would stay green whatever the copies held.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'facility-sync-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function member(name: string, files: Record<string, string>): string {
  const directory = join(root, name)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true })
    writeFileSync(join(directory, path), text)
  }
  return directory
}

const same = {
  'tests/install/cli.ts': 'a',
  'tests/install/deep/x.mjs': 'b',
  'tests/fixture-runner.ts': 'c',
}

describe('facilityFiles', () => {
  it('lists the files below tests/install, nested ones included, and the fixture runner, in order', () => {
    expect(facilityFiles(member('listed', { ...same, 'tests/other.ts': 'z' }))).toEqual([
      'tests/fixture-runner.ts',
      'tests/install/cli.ts',
      'tests/install/deep/x.mjs',
    ])
  })

  it('lists nothing for a member without a facility', () => {
    expect(facilityFiles(member('bare', { 'tests/other.ts': 'z' }))).toEqual([])
  })
})

describe('facilityDifferences', () => {
  it('finds nothing between two members whose facility files are the same', () => {
    expect(facilityDifferences(member('one', same), member('two', same))).toEqual([])
  })

  it('names a file whose bytes differ, even by one byte', () => {
    const left = member('left-bytes', same)
    const right = member('right-bytes', { ...same, 'tests/install/cli.ts': 'a ' })
    expect(facilityDifferences(left, right)).toEqual(['differs: tests/install/cli.ts'])
  })

  it('names a file that only one member has, on either side', () => {
    const left = member('left-only', { ...same, 'tests/install/extra.ts': 'e' })
    const right = member('right-only', { ...same, 'tests/install/other.ts': 'o' })
    expect(facilityDifferences(left, right)).toEqual([
      `only in ${left}: tests/install/extra.ts`,
      `only in ${right}: tests/install/other.ts`,
    ])
  })

  it('names the fixture runner when one member does not have it', () => {
    const { 'tests/fixture-runner.ts': _runner, ...withoutRunner } = same
    const left = member('left-runner', same)
    const right = member('right-runner', withoutRunner)
    expect(facilityDifferences(left, right)).toEqual([`only in ${left}: tests/fixture-runner.ts`])
  })
})
