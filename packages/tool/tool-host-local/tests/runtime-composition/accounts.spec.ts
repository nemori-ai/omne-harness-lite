import { expect, it } from 'vitest'
import { tenantA } from '../coordinator-values.ts'
import { fixture } from './fixture.ts'

it('a host that gives no usage reader policy answers unavailable and lists nothing', async () => {
  const world = await fixture()
  try {
    expect(
      await world.root.toolAccounts.list({
        principal: 'alice',
        tenant: tenantA,
        range: null,
        consumer: null,
        order: 'ascending',
        after: null,
        limit: 10,
      }),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'this host has no usage reader policy' },
    })
  } finally {
    await world.close()
  }
})
