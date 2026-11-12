import { expect, it } from 'vitest'
import { AccessAssemblyError } from '@omne-harness/access-cordis-contract'

it('exports the assembly error and nothing else at run time', async () => {
  const root = (await import('@omne-harness/access-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['AccessAssemblyError'])
})

it('names the protocol that is already mounted', () => {
  const error = new AccessAssemblyError({ name: 'notes', major: 1 })
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe('AccessAssemblyError')
  expect(error.protocol).toEqual({ name: 'notes', major: 1 })
  expect(error.message).toBe('protocol notes/v1 is already mounted')
})
