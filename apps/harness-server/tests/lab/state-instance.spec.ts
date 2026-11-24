import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAB_MARKER, claimLabRoot, refusedInstance } from '../../src/state-instance.ts'

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'lab-root-')))

describe('the two kinds of instance never share a state root', () => {
  it('an absent or empty directory is claimed by a lab instance and marked; a marked one is taken again', () => {
    const absent = join(scratch(), 'state')
    expect(claimLabRoot(absent)).toEqual({ kind: 'claimed', fresh: true })
    expect(readdirSync(absent)).toEqual([LAB_MARKER])
    expect(claimLabRoot(absent)).toEqual({ kind: 'claimed', fresh: false })
    const empty = scratch()
    expect(claimLabRoot(empty)).toEqual({ kind: 'claimed', fresh: true })
  })

  it('a directory holding state of a release instance is refused by a lab instance, and left as it was', () => {
    const release = scratch()
    mkdirSync(join(release, 'storage'))
    writeFileSync(join(release, 'model-vault.json'), '{}')
    expect(claimLabRoot(release)).toMatchObject({ kind: 'refused' })
    expect(readdirSync(release).sort()).toEqual(['model-vault.json', 'storage'])
  })

  it('at start: a release instance refuses a lab root, a lab instance refuses any other', () => {
    const lab = scratch()
    claimLabRoot(lab)
    const release = scratch()
    expect(refusedInstance(lab, 'release')).toMatch(/^state-root-is-lab: /u)
    expect(refusedInstance(lab, 'lab')).toBeUndefined()
    expect(refusedInstance(release, 'release')).toBeUndefined()
    expect(refusedInstance(release, 'lab')).toMatch(/^state-root-not-lab: /u)
  })
})
