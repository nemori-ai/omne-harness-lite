import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fastConfig, MUTATION_TEST_TIMEOUT_MS } from '../resources/vitest-fast.config.mts'
import { scratch } from './support.ts'

const member = (body: string) => {
  const root = scratch()
  writeFileSync(join(root, 'vitest.config.ts'), body)
  return root
}

it('fixes the fast mode and the root, and puts the mutation time limit over the member one', async () => {
  const root = member(
    'export default ({ mode }: { mode: string }) => ({ test: { include: [mode], testTimeout: 5 } })\n',
  )
  const config = await fastConfig(root, { mode: 'test', command: 'serve' })
  expect(config).toMatchObject({
    root,
    test: {
      include: ['fast'],
      testTimeout: MUTATION_TEST_TIMEOUT_MS,
      experimental: { preParse: false },
    },
  })
  expect(MUTATION_TEST_TIMEOUT_MS).toBe(60_000)
})

it('refuses a member config that cannot select the tier', async () => {
  const root = member('export default { test: {} }\n')
  await expect(fastConfig(root, { mode: 'test', command: 'serve' })).rejects.toThrow('选不了快层')
})
