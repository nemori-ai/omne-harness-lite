import { describe, expect, it } from 'vitest'
import { typeConformanceCases } from '@omne-harness/workspace/testing'
import { fakeHarness } from './world.ts'

const caseNamed = (part: string) => typeConformanceCases.find(found => found.name.includes(part))!

describe('the conformance cases hold for a type with one instance', () => {
  it.each(typeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(fakeHarness({ copies: false }))).resolves.toBeUndefined()
  })
})

describe('the conformance cases hold for a type whose resource has copies', () => {
  it.each(typeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(fakeHarness({ copies: true }))).resolves.toBeUndefined()
  })
})

describe('the conformance cases can fail', () => {
  it('a type that admits another resource fails the admission cell', async () => {
    const broken = fakeHarness({ copies: true, broken: 'admits-all' })
    await expect(caseNamed('another resource is never admitted').run(broken)).rejects.toThrow()
  })

  it('a type that follows a replaced resource fails the identity cell', async () => {
    const broken = fakeHarness({ copies: false, broken: 'follows' })
    await expect(caseNamed('same name is not followed').run(broken)).rejects.toThrow()
  })
})
