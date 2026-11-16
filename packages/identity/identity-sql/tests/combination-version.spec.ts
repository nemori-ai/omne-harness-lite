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
  const first = await registrationOf('version-unchanged-a', [])
  const second = await registrationOf('version-unchanged-b', [])
  expect(second.combinationVersion).toBe(first.combinationVersion)
  expect(second.manifestDigest).toBe(first.manifestDigest)
})

it('changes the version when the login check SQL in support changes, with the same manifest', async () => {
  const unchanged = await registrationOf('version-base', [])
  const changed = await registrationOf('version-support', [CHECKS['support-revocation-sql']])
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
  expect(changed.combinationVersion).toBe(unchanged.combinationVersion)
})
