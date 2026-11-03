import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

it('counts UTF-8 request bytes before planning any native resource', async () => {
  const { manager, request, plans } = commandFixture(process.cwd())
  try {
    expect(
      await manager.facility.start({ ...request, args: ['-e', '界'.repeat(800_000)] }),
    ).toMatchObject({ kind: 'rejected', reason: 'capacity' })
    expect(plans).toEqual([])
  } finally {
    await manager.stopAll()
  }
})
