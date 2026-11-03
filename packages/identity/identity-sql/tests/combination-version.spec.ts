// IS-01: the combination version changes whenever what the participant does changes, also when the
// change is in a module that the participant imports. The manifest holds the digest of the
// participant file only, so a change in `support` leaves the manifest digest and must still change
// the version. Each case builds copies of `dist` (`fixtures/mutants.ts`) and compares the versions
// that the copies register. The negative control takes the import closure out of the version and
// shows that the same `support` change then leaves the version as it was.
import { afterAll, expect, it } from 'vitest'
import { CHECKS, mutantBuild, type MutantBuild, type Mutation } from './fixtures/mutants.ts'

const built: MutantBuild[] = []
afterAll(() => {
  for (const mutant of built.splice(0)) mutant.remove()
})

async function registrationOf(name: string, mutations: readonly Mutation[]) {
  const mutant = await mutantBuild(name, mutations)
  built.push(mutant)
  return mutant.build.identitySqlRegistration()
}

it('gives two unchanged copies in two directories one version: the location is not in it', async () => {
  // The copies drop the source map comments, so they are compared with each other, not with `dist`.
  const first = await registrationOf('version-unchanged-a', [])
  const second = await registrationOf('version-unchanged-b', [])
  expect(second.combinationVersion).toBe(first.combinationVersion)
  expect(second.manifestDigest).toBe(first.manifestDigest)
})

it('changes the version when the login check SQL in support changes, with the same manifest', async () => {
  const unchanged = await registrationOf('version-base', [])
  const changed = await registrationOf('version-support', [CHECKS['support-revocation-sql']])
  // The participant file is the same, so the manifest digest is the same.
  expect(changed.manifestDigest).toBe(unchanged.manifestDigest)
  expect(changed.combinationVersion).not.toBe(unchanged.combinationVersion)
})

it('changes the version and the manifest digest when the participant file changes', async () => {
  const unchanged = await registrationOf('version-base-participant', [])
  const changed = await registrationOf('version-participant', [CHECKS['last-admin']])
  expect(changed.manifestDigest).not.toBe(unchanged.manifestDigest)
  expect(changed.combinationVersion).not.toBe(unchanged.combinationVersion)
})

it('negative control: without the import closure in the version, the support change is not seen', async () => {
  const closureOff = CHECKS['version-covers-closure']
  const unchanged = await registrationOf('version-control-base', [closureOff])
  const changed = await registrationOf('version-control-support', [
    closureOff,
    CHECKS['support-revocation-sql'],
  ])
  // This is the defect that the second case above finds: the same version for other behavior.
  expect(changed.combinationVersion).toBe(unchanged.combinationVersion)
})
